
import re
import time
import random
import threading
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from psycopg import sql
from psycopg.types.json import Jsonb
from pipeline_runtime import RAW_COLUMNS, PipelineError, log, names, run_cli, stage_session
from listing_payload import public_metadata

import requests
from bs4 import BeautifulSoup


# ============================================================
# CONFIGURATION
# ============================================================

BASE_URL = "https://999.md"

MAX_WORKERS = 6

# One shared minimum gap between request starts across all workers.
# Random jitter prevents synchronized bursts.
REQUEST_MIN_INTERVAL = 0.20
REQUEST_JITTER = 0.15

# Separate connection/read timeouts.
HTTP_CONNECT_TIMEOUT = 8
HTTP_READ_TIMEOUT = 20

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 2.0
MAX_BACKOFF_SECONDS = 30.0

DB_BATCH_SIZE = 25

# If this many recent requests fail, pause rather than continuing to send
# traffic into a possibly unhealthy connection.
FAILURE_WINDOW = 30
FAILURE_LIMIT = 10
FAILURE_PAUSE_SECONDS = 300

# Do not estimate ETA from the first few requests.
ETA_WARMUP = 50
ETA_WINDOW = 250

# Do not scrape category/search pages in this script.
# Listing IDs and outcomes are durable database checkpoints.


# ============================================================
# REQUEST CONTROL / HEALTH
# ============================================================

class RequestController:
    """Small shared controller for pacing and failure-based backoff."""

    def __init__(self):
        self.lock = threading.Lock()
        self.next_request_at = 0.0
        self.interval = REQUEST_MIN_INTERVAL
        self.recent_failures = deque(maxlen=FAILURE_WINDOW)
        self.pause_until = 0.0
        self.stopped = threading.Event()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            target = max(now, self.next_request_at, self.pause_until)

            delay = target - now

            # Reserve the next slot while holding the lock so all workers
            # share one global request-start schedule. Add a small random
            # jitter so workers do not produce perfectly regular bursts.
            gap = self.interval + random.uniform(0.0, REQUEST_JITTER)
            self.next_request_at = target + gap

        if self.stopped.wait(max(0, delay)):
            raise RuntimeError("Scrape stopped")

    def success(self):
        with self.lock:
            self.recent_failures.append(False)
            self.interval = max(
                REQUEST_MIN_INTERVAL,
                self.interval * 0.995,
            )

    def failure(self, severe=False):
        with self.lock:
            self.recent_failures.append(True)

            multiplier = 1.5 if severe else 1.2
            self.interval = min(
                1.0,
                max(REQUEST_MIN_INTERVAL, self.interval * multiplier),
            )

    def should_pause(self):
        with self.lock:
            return (
                len(self.recent_failures) == FAILURE_WINDOW
                and sum(self.recent_failures) >= FAILURE_LIMIT
            )

    def pause(self, seconds):
        with self.lock:
            self.pause_until = max(
                self.pause_until,
                time.monotonic() + seconds,
            )
            self.interval = min(
                1.0,
                max(self.interval, REQUEST_MIN_INTERVAL * 2),
            )

    def failure_count(self):
        with self.lock:
            return sum(self.recent_failures)

    def current_interval(self):
        with self.lock:
            return self.interval


REQUESTS_CONTROL = RequestController()

def parse_retry_after(response):
    value = response.headers.get("Retry-After")
    if not value:
        return None

    try:
        seconds = float(value)
        return max(0.0, min(seconds, MAX_BACKOFF_SECONDS))
    except ValueError:
        return None


# ============================================================
# HTTP SESSION PER WORKER
# ============================================================

_thread_local = threading.local()


def get_session():
    session = getattr(_thread_local, "session", None)

    if session is None:
        session = requests.Session()

        session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 "
                    "(KHTML, like Gecko) "
                    "Chrome/151.0.0.0 Safari/537.36"
                ),
                "Accept": (
                    "text/html,application/xhtml+xml,"
                    "application/xml;q=0.9,image/avif,image/webp,"
                    "image/apng,*/*;q=0.8"
                ),
                "Accept-Language": (
                    "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
                ),
                "Referer": "https://999.md/ro/list/transport/cars",
                "Connection": "keep-alive",
            }
        )

        adapter = requests.adapters.HTTPAdapter(
            pool_connections=1,
            pool_maxsize=2,
            pool_block=True,
            max_retries=0,
        )
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        _thread_local.session = session

    return session


# ============================================================
# HTML EXTRACTION
# ============================================================

FEATURE_NAMES = {
    "brand": "Marcă",
    "model": "Model",
    "generation": "Generație",
    "registration_country": "Înmatriculare",
    "state": "Stare",
    "year": "An de fabricație",
    "seats": "Număr de locuri",
    "body_type": "Tip caroserie",
    "doors": "Număr uși",
    "mileage": "Rulaj",
    "engine": "Motor",
    "horsepower": "Putere",
    "fuel_type": "Tip combustibil",
    "gearbox": "Cutie de viteze",
    "drivetrain": "Tip tracțiune",
}


def has_class_fragment(tag, fragment):
    """Match CSS-module classes containing a stable fragment."""
    return any(
        fragment in cls
        for cls in tag.get("class", [])
    )


def extract_feature_map(soup):
    """
    Parse the actual visible feature rows from 999.md.

    The current HTML uses CSS-module classes such as:
      ...__group__feature
      ...__group__key
      ...__group__link
      ...__group__value

    We deliberately match the stable suffixes rather than the
    generated CSS-module prefix.
    """
    result = {}

    for li in soup.find_all("li"):
        if not has_class_fragment(li, "__group__feature"):
            continue

        key_tag = None

        for tag in li.find_all("span"):
            if has_class_fragment(tag, "__group__key"):
                key_tag = tag
                break

        if key_tag is None:
            continue

        key = key_tag.get_text(" ", strip=True)

        value_tag = None

        # Prefer the actual value/link, not the dotted-line span.
        for tag in li.find_all(["a", "span"]):
            if tag is key_tag:
                continue

            if has_class_fragment(tag, "__group__link") or \
               has_class_fragment(tag, "__group__value"):
                text = tag.get_text(" ", strip=True)

                if text:
                    value_tag = tag
                    break

        if value_tag is None:
            continue

        result[key] = value_tag.get_text(" ", strip=True)

    return result


def get_meta(soup, property_name):
    tag = soup.find(
        "meta",
        attrs={"property": property_name},
    )

    if tag is None:
        return None

    value = tag.get("content")

    return value.strip() if value else None


def parse_decimal(value):
    if value is None:
        return None

    cleaned = (
        value.replace("\xa0", "")
        .replace(" ", "")
        .replace(",", ".")
    )

    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_integer(value):
    if value is None:
        return None

    match = re.search(r"\d[\d\s.,]*", value)

    if not match:
        return None

    cleaned = (
        match.group(0)
        .replace(" ", "")
        .replace("\xa0", "")
        .replace(".", "")
        .replace(",", "")
    )

    try:
        return int(cleaned)
    except ValueError:
        return None


def parse_year(value):
    if value is None:
        return None

    match = re.search(r"\b(?:19|20)\d{2}\b", value)

    return int(match.group(0)) if match else None


def parse_mileage(value):
    if value is None:
        return None

    # 999 currently renders e.g. "64000 km".
    match = re.search(
        r"(\d[\d\s.,]*)\s*(?:km|км)\b",
        value,
        flags=re.IGNORECASE,
    )

    if match is None:
        return parse_integer(value)

    return parse_integer(match.group(1))


def parse_horsepower(value):
    if value is None:
        return None

    # 999 renders e.g. "215 CP".
    match = re.search(
        r"(\d[\d\s.,]*)\s*(?:CP|c\.p\.|HP|hp)\b",
        value,
        flags=re.IGNORECASE,
    )

    if match is None:
        return parse_integer(value)

    return parse_integer(match.group(1))



def extract_offer_type(soup, html):
    """
    Extract 999's 'Tip ofertă'.

    It is NOT part of the normal feature <li> rows used by
    extract_feature_map(). On the supplied page it appears in a separate
    advert-info block, while the embedded Next.js adView also stores it
    under offerType.value.translated. Use the visible block first, then
    the embedded object as a fallback.
    """
    # Primary source: dedicated visible block.
    for tag in soup.find_all(["div", "li"]):
        classes = tag.get("class", [])
        if isinstance(classes, str):
            classes = [classes]

        if "__advert__info__item" not in " ".join(classes):
            continue

        label_and_value = tag.get_text(" ", strip=True)
        if not label_and_value.startswith("Tip ofertă"):
            continue

        value_tag = tag.find(
            "span",
            class_=lambda cls: (
                cls is not None
                and "__advert__info__item__value"
                in (" ".join(cls) if isinstance(cls, list) else str(cls))
            ),
        )
        if value_tag:
            value = value_tag.get_text(" ", strip=True)
            if value:
                return value

        value = re.sub(
            r"^\s*Tip ofertă\s*:?\s*",
            "",
            label_and_value,
            flags=re.IGNORECASE,
        ).strip()
        if value:
            return value

    # Secondary source: embedded adView.offerType.value.translated.
    match = re.search(
        r'"offerType"\s*:\s*\{.*?'
        r'"value"\s*:\s*\{.*?'
        r'"translated"\s*:\s*"([^"]+)"',
        html,
        flags=re.DOTALL,
    )
    if match:
        return match.group(1).strip()

    return None


def extract_seller_type(features):
    """Extract 'Autorul anunțului' from the normal feature rows."""
    return features.get("Autorul anunțului")


def extract_price_and_currency(soup):
    amount = get_meta(soup, "product:price:amount")
    currency = get_meta(soup, "product:price:currency")

    return parse_decimal(amount), currency


def parse_listing_html(html, listing_id):
    soup = BeautifulSoup(html, "html.parser")

    features = extract_feature_map(soup)

    price, currency = extract_price_and_currency(soup)
    offer_type = extract_offer_type(soup, html)
    seller_type = extract_seller_type(features)

    # Metadata is a stable additional source for brand/model.
    brand = get_meta(soup, "product:brand") or features.get("Marcă")
    model = get_meta(soup, "product:custom_label_2") or features.get("Model")

    listing = {
        "id": int(listing_id),
        "url": f"{BASE_URL}/ro/{listing_id}",

        "brand": brand,
        "model": model,
        "price": price,
        "currency": currency,

        "generation": features.get("Generație"),
        "year": parse_year(features.get("An de fabricație")),
        "mileage": parse_mileage(features.get("Rulaj")),
        "engine": features.get("Motor"),
        "horsepower": parse_horsepower(features.get("Putere")),
        "fuel_type": features.get("Tip combustibil"),
        "gearbox": features.get("Cutie de viteze"),
        "state": features.get("Stare"),
        "registration_country": features.get("Înmatriculare"),
        "drivetrain": features.get("Tip tracțiune"),
        "body_type": features.get("Tip caroserie"),
        "offer_type": offer_type,
        "seller_type": seller_type,
        "doors": parse_integer(features.get("Număr uși")),
        "seats": parse_integer(features.get("Număr de locuri")),

        "scraped_at": datetime.now(timezone.utc),
    }

    metadata = public_metadata(html, listing_id)
    listing.update({key: value for key, value in metadata.items() if value is not None})

    # Important diagnostic information.
    # If a normal car page contains no vehicle features at all,
    # treat it as a bad/non-listing response rather than inserting
    # a row full of NULLs.
    if not features and not listing.get("brand") and not listing.get("model") and listing.get("price") is None:
        raise ValueError(
            "No vehicle data found in the HTML."
        )

    return listing


# ============================================================
# ONE AD REQUEST
# ============================================================

def scrape_one(listing_id):
    """Fetch one listing without aggressive retrying."""

    url = f"{BASE_URL}/ro/{listing_id}"
    session = get_session()
    last_error = None
    last_kind = "error"

    for attempt in range(1, MAX_RETRIES + 1):
        REQUESTS_CONTROL.wait()

        try:
            response = session.get(
                url,
                timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
                allow_redirects=True,
            )

            status = response.status_code

            if status == 200:
                try:
                    listing = parse_listing_html(
                        response.text,
                        listing_id,
                    )
                except Exception as exc:
                    return {
                        "ok": False,
                        "id": listing_id,
                        "kind": "parse",
                        "error": str(exc),
                    }

                REQUESTS_CONTROL.success()

                return {
                    "ok": True,
                    "listing": listing,
                }

            if status in {404, 410}:
                # A removed/invalid listing is normal and not a network issue.
                return {
                    "ok": False,
                    "id": listing_id,
                    "kind": str(status),
                    "error": f"HTTP {status}",
                }

            if status == 403:
                last_error = "HTTP 403"
                last_kind = "403"
                REQUESTS_CONTROL.failure(severe=True)

                print(
                    f"WARNING: possible access restriction — "
                    f"HTTP 403 for listing {listing_id}"
                )

            elif status == 429:
                retry_after = parse_retry_after(response)
                wait_time = (
                    retry_after
                    if retry_after is not None
                    else min(
                        MAX_BACKOFF_SECONDS,
                        RETRY_BACKOFF_SECONDS * (2 ** (attempt - 1)),
                    )
                )

                last_error = (
                    f"HTTP 429; waiting {wait_time:.0f}s"
                )
                last_kind = "429"

                REQUESTS_CONTROL.failure(severe=True)
                REQUESTS_CONTROL.pause(wait_time)

                print(
                    f"WARNING: possible rate limit — "
                    f"HTTP 429 for listing {listing_id}; "
                    f"backing off {wait_time:.0f}s"
                )

            elif status in {408, 500, 502, 503, 504}:
                last_error = f"HTTP {status}"
                last_kind = str(status)
                REQUESTS_CONTROL.failure(severe=True)

            else:
                return {
                    "ok": False,
                    "id": listing_id,
                    "kind": f"http_{status}",
                    "error": f"HTTP {status}",
                }

        except requests.exceptions.Timeout as exc:
            last_error = f"Timeout: {exc}"
            last_kind = "timeout"
            REQUESTS_CONTROL.failure(severe=True)

            print(
                f"WARNING: network timeout for listing "
                f"{listing_id}"
            )

        except requests.exceptions.ConnectionError as exc:
            last_error = f"Connection error: {exc}"
            last_kind = "connection"
            REQUESTS_CONTROL.failure(severe=True)

            print(
                f"WARNING: network connection error for listing "
                f"{listing_id}"
            )

        except requests.exceptions.RequestException as exc:
            last_error = f"Request error: {exc}"
            last_kind = "request"
            REQUESTS_CONTROL.failure(severe=True)

        # Stop adding pressure if the recent window is unhealthy.
        if REQUESTS_CONTROL.should_pause():
            print()
            print("!" * 78)
            print(
                "POSSIBLE RATE LIMIT / NETWORK PROBLEM: "
                f"{REQUESTS_CONTROL.failure_count()} failures "
                f"in the last {FAILURE_WINDOW} requests."
            )
            print(
                f"Pausing new request starts for "
                f"{FAILURE_PAUSE_SECONDS // 60} minutes."
            )
            print("!" * 78)
            print()

            REQUESTS_CONTROL.pause(FAILURE_PAUSE_SECONDS)

        if attempt < MAX_RETRIES:
            delay = min(
                MAX_BACKOFF_SECONDS,
                RETRY_BACKOFF_SECONDS * (2 ** (attempt - 1)),
            )
            delay += random.uniform(0.0, 0.75)
            if REQUESTS_CONTROL.stopped.wait(delay):
                return {"ok": False, "id": listing_id, "kind": "interrupted", "error": "Stopped"}

    return {
        "ok": False,
        "id": listing_id,
        "kind": last_kind,
        "error": last_error or "Unknown error",
    }





# ============================================================
# DATABASE SAVE
# ============================================================

def save_batch(connection, listings, run):
    if not listings:
        return
    fields = list(RAW_COLUMNS)
    updates = sql.SQL(", ").join(
        sql.SQL("{}=COALESCE(EXCLUDED.{},listings_temp.{})").format(
            sql.Identifier(field), sql.Identifier(field), sql.Identifier(field))
        for field in fields if field != "id"
    )
    statement = sql.SQL("INSERT INTO listings_temp ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {}").format(
        names(fields), sql.SQL(", ").join(sql.Placeholder() for _ in fields), updates)
    rows = []
    for listing in listings:
        rows.append(tuple(Jsonb(listing.get(field)) if RAW_COLUMNS[field] == "JSONB" and listing.get(field) is not None
                          else listing.get(field) for field in fields))
    with connection.cursor() as cur:
        cur.executemany(statement, rows)
        cur.executemany("UPDATE scrape_pipeline_ids SET outcome='scraped',error=NULL WHERE run_id=%s AND listing_id=%s",
                        [(run.id, listing["id"]) for listing in listings])
    connection.commit()
    log(f"Committed {len(listings)} details and their resume checkpoints.")


def record_failure(connection, run, listing_id, result):
    # A definite 404 is accounted for; timeouts, blocks and parse failures must be retried.
    outcome = "gone" if result.get("kind") in {"404", "410"} else "failed"
    with connection.cursor() as cur:
        cur.execute("UPDATE scrape_pipeline_ids SET outcome=%s,error=%s WHERE run_id=%s AND listing_id=%s",
                    (outcome, result.get("error", "unknown")[:1000], run.id, listing_id))
    connection.commit()


def preflight_check():
    """Only test basic 999.md reachability; real listing requests follow."""
    session = requests.Session()
    try:
        print("Connectivity check: testing 999.md before starting workers...")
        response = session.get(
            BASE_URL,
            timeout=(HTTP_CONNECT_TIMEOUT, HTTP_READ_TIMEOUT),
            allow_redirects=True,
        )
        print(f"Connectivity check: HTTP {response.status_code}")

        if response.status_code in {403, 429}:
            print(
                "WARNING: possible access restriction during connectivity check."
            )
            return False

        if response.status_code >= 500:
            print(
                "WARNING: 999.md returned a server error during connectivity check."
            )
            return False

        return 200 <= response.status_code < 400
    except requests.exceptions.RequestException as exc:
        print(f"Connectivity check failed: {exc}")
        return False
    finally:
        session.close()


def scrape_all(connection, ids, run):
    """Scrape IDs with bounded concurrency and frequent DB checkpoints."""

    total = len(ids)
    completed = 0
    successful = 0
    failed = 0
    pending = []

    completion_times = deque(maxlen=ETA_WINDOW)
    start_time = time.monotonic()

    print()
    print("=" * 78)
    print("PHASE 2 ONLY: CONTROLLED LISTING SCRAPER")
    print("=" * 78)
    print(f"Pending checkpoint IDs: {total:,}")
    print(f"HTTP workers:        {MAX_WORKERS}")
    print(f"Request spacing:     {REQUEST_MIN_INTERVAL:.2f}s + jitter")
    print(f"Connect timeout:     {HTTP_CONNECT_TIMEOUT}s")
    print(f"Read timeout:        {HTTP_READ_TIMEOUT}s")
    print(f"Bounded in-flight jobs: {MAX_WORKERS * 2}")
    print("Resume: already committed IDs are skipped; current inventory is unchanged")
    print("Category/ID discovery: OFF")
    print("Selenium: OFF")
    print()

    next_index = 0
    in_flight = {}

    def submit_more(executor):
        nonlocal next_index

        while (
            next_index < total
            and len(in_flight) < MAX_WORKERS * 2
        ):
            listing_id = ids[next_index]
            next_index += 1
            future = executor.submit(scrape_one, listing_id)
            in_flight[future] = listing_id

    def print_progress():
        processed = completed

        if len(completion_times) >= 2:
            span = completion_times[-1] - completion_times[0]
            rate = (
                (len(completion_times) - 1) / span
                if span > 0 else 0.0
            )
        elif completed >= ETA_WARMUP:
            elapsed = time.monotonic() - start_time
            rate = completed / elapsed if elapsed > 0 else 0.0
        else:
            rate = 0.0

        if completed >= ETA_WARMUP and rate > 0:
            remaining = max(total - processed, 0)
            eta_hours = remaining / rate / 3600
            eta = f"{eta_hours:.1f}h"
        else:
            eta = "warming up"

        print(
            f"[{processed:,}/{total:,}] "
            f"OK={successful:,} "
            f"FAILED={failed:,} "
            f"RATE={rate:.2f}/s "
            f"ETA={eta} "
            f"interval={REQUESTS_CONTROL.current_interval():.2f}s "
            f"recent_failures={REQUESTS_CONTROL.failure_count()}"
        )

    REQUESTS_CONTROL.stopped.clear()
    executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
    try:
        submit_more(executor)

        while in_flight:
            done = next(as_completed(in_flight), None)

            if done is None:
                break

            listing_id = in_flight.pop(done)
            completed += 1

            try:
                result = done.result()
            except Exception as exc:
                result = {
                    "ok": False,
                    "id": listing_id,
                    "kind": "worker",
                    "error": str(exc),
                }

            if not result["ok"]:
                failed += 1
                record_failure(connection, run, listing_id, result)

                print(
                    f"[{completed:,}/{total:,}] "
                    f"{listing_id} | FAILED | "
                    f"{result.get('error')}"
                )

            else:
                listing = result["listing"]
                successful += 1
                pending.append(listing)

                # Show useful metadata presence for the first few successful ads
                # so they can be verified before the long run continues.
                if successful <= 5:
                    print(
                        f"CHECK: ID={listing['id']} | "
                        f"offer_type={listing.get('offer_type')!r} | "
                        f"VIN={'yes' if listing.get('vin') else 'absent'} | "
                        f"seller={'yes' if listing.get('seller_id') else 'absent'} | "
                        f"image={'yes' if listing.get('image_url') else 'absent'}"
                    )
                completion_times.append(time.monotonic())

                if len(pending) >= DB_BATCH_SIZE:
                    save_batch(connection, pending, run)
                    pending.clear()

                if completed <= ETA_WARMUP or completed % 100 == 0:
                    print_progress()

            # Never submit more work if the request controller says the
            # recent failure pattern is unhealthy. Existing requests may
            # finish, but no extra work is launched until the cooldown ends.
            if REQUESTS_CONTROL.should_pause():
                print()
                print("!" * 78)
                print(
                    "POSSIBLE RATE LIMIT / NETWORK PROBLEM DETECTED."
                )
                print(
                    f"Pausing request starts for "
                    f"{FAILURE_PAUSE_SECONDS // 60} minutes."
                )
                print("!" * 78)
                print()

                REQUESTS_CONTROL.pause(FAILURE_PAUSE_SECONDS)

            submit_more(executor)

    finally:
        REQUESTS_CONTROL.stopped.set()
        for future in in_flight:
            future.cancel()
        # Finish in-flight HTTP calls (bounded timeouts), but do not launch new ones.
        executor.shutdown(wait=True, cancel_futures=True)
        if pending:
            try:
                save_batch(connection, pending, run)
            except Exception:
                connection.rollback()
                log("Last uncommitted details will be retried; earlier checkpoints are intact.")
                raise


    print_progress()

    return successful, failed





# ============================================================
# MAIN
# ============================================================

def main():
    with stage_session("details") as run:
        if run is None:
            return
        ids = run.pending_ids()
        log(f"{len(ids):,} detail pages pending/retrying. Successful records are already saved.")
        if ids:
            if not preflight_check():
                raise PipelineError("999.md connectivity check failed; rerun later to resume.")
            scrape_all(run.connection, ids, run)
        remaining = run.pending_ids()
        if remaining:
            raise PipelineError(f"{len(remaining):,} detail requests remain unresolved. Rerun this stage; publication is blocked.")
        with run.connection.cursor() as cur:
            run.finish(cur, "details")
        run.connection.commit()
        log("All discovered IDs are accounted for. Detail stage complete.")


if __name__ == "__main__":
    run_cli(main)
