import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from selenium import webdriver
from selenium.webdriver.chrome.options import Options


# ============================================================
# 999.MD ID COLLECTOR + REMOTE DB CONNECTION TEST
#
# This version ONLY:
#   1. Scrapes listing IDs from 999.md category pages
#   2. Writes the IDs to a separate TXT file
#   3. Connects to the remote Aiven PostgreSQL database
#
# Individual car scraping is intentionally removed.
# No DROP/TRUNCATE logic.
# ============================================================


# ============================================================
# 999.MD
# ============================================================

BASE_URL = "https://999.md"

SEARCH_URL = (
    "https://999.md/ro/list/transport/cars?page={page}"
)

TARGET_IDS = 150000
START_PAGE = 1
MAX_SEARCH_PAGES = 5000

SEARCH_WAIT_SECONDS = 2.0
SCROLL_COUNT = 2
SCROLL_DELAY_SECONDS = 0.75

CHROME_RESTART_EVERY_PAGES = 100
ZERO_NEW_PAGES_LIMIT = 10


# ============================================================
# REMOTE POSTGRESQL / AIVEN
# ============================================================

DB_HOST = ""
DB_PORT = ""
DB_NAME = ""
DB_USER = ""
DB_PASSWORD = ""


# ============================================================
# OUTPUT FILE
# ============================================================

# Deliberately different from the normal production ID file.
IDS_FILE = Path("listing_ids_test.txt")


# ============================================================
# DATABASE
# ============================================================

def connect_and_check_database():
    print()
    print("=" * 70)
    print("TESTING REMOTE POSTGRESQL CONNECTION")
    print("=" * 70)

    connection = psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        sslmode="require",
    )

    print("Remote PostgreSQL connection: OK")

    with connection.cursor() as cursor:
        cursor.execute("SELECT NOW()")
        server_time = cursor.fetchone()[0]

    print("Remote database check: OK")
    print(f"Database server time: {server_time}")

    return connection


def prepare_listings_temp_and_remove_known_ids(ids):
    """Start a fresh staging table and leave only unseen IDs in IDS_FILE."""
    connection = psycopg.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        sslmode="require",
    )

    columns = (
        "id, url, brand, model, price, currency, generation, year, mileage, "
        "engine, horsepower, fuel_type, gearbox, state, registration_country, "
        "drivetrain, body_type, offer_type, seller_type, doors, seats, scraped_at"
    )
    current_columns = ", ".join(
        f"current_listing.{column.strip()}" for column in columns.split(",")
    )

    try:
        with connection.cursor() as cursor:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS listings_temp (
                    id BIGINT PRIMARY KEY,
                    url TEXT NOT NULL,
                    brand TEXT,
                    model TEXT,
                    price NUMERIC,
                    currency TEXT,
                    generation TEXT,
                    year INTEGER,
                    mileage INTEGER,
                    engine TEXT,
                    horsepower INTEGER,
                    fuel_type TEXT,
                    gearbox TEXT,
                    state TEXT,
                    registration_country TEXT,
                    drivetrain TEXT,
                    body_type TEXT,
                    offer_type TEXT,
                    seller_type TEXT,
                    doors INTEGER,
                    seats INTEGER,
                    scraped_at TIMESTAMPTZ NOT NULL
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS listings
                (LIKE listings_temp INCLUDING ALL)
            """)
            cursor.execute("TRUNCATE TABLE listings_temp")
            cursor.execute("CREATE TEMP TABLE discovered_ids (id BIGINT PRIMARY KEY) ON COMMIT DROP")
            with cursor.copy("COPY discovered_ids (id) FROM STDIN") as copy:
                for listing_id in ids:
                    copy.write_row((listing_id,))

            cursor.execute("SELECT to_regclass('public.listings')")
            has_listings = cursor.fetchone()[0] is not None

            if has_listings:
                cursor.execute("ALTER TABLE listings ADD COLUMN IF NOT EXISTS horsepower INTEGER")
                cursor.execute("ALTER TABLE listings ADD COLUMN IF NOT EXISTS offer_type TEXT")
                cursor.execute("ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_type TEXT")
                cursor.execute(f"""
                    INSERT INTO listings_temp ({columns})
                    SELECT {current_columns}
                    FROM listings AS current_listing
                    JOIN discovered_ids AS discovered
                      ON discovered.id = current_listing.id
                """)
                cursor.execute("""
                    SELECT discovered.id
                    FROM discovered_ids AS discovered
                    JOIN listings AS current_listing
                      ON current_listing.id = discovered.id
                """)
                known_ids = {row[0] for row in cursor.fetchall()}
            else:
                known_ids = set()

        connection.commit()
    finally:
        connection.close()

    remaining_ids = [listing_id for listing_id in ids if listing_id not in known_ids]
    save_ids(remaining_ids)

    print(f"Copied into listings_temp: {len(known_ids):,}")
    print(f"IDs remaining to scrape:   {len(remaining_ids):,}")
    return remaining_ids


# ============================================================
# SELENIUM
# ============================================================

def create_driver():
    options = Options()
    options.add_argument("--start-maximized")

    options.set_capability(
        "goog:loggingPrefs",
        {
            "performance": "ALL"
        }
    )

    driver = webdriver.Chrome(options=options)

    return driver


def clear_performance_logs(driver):
    try:
        driver.get_log("performance")
    except Exception:
        pass


def get_network_events(driver):
    try:
        logs = driver.get_log("performance")
    except Exception:
        return []

    events = []

    for entry in logs:
        try:
            message = json.loads(
                entry["message"]
            )["message"]

            events.append(message)

        except Exception:
            continue

    return events


def get_response_body(driver, request_id):
    try:
        result = driver.execute_cdp_cmd(
            "Network.getResponseBody",
            {
                "requestId": request_id
            }
        )

        return result.get(
            "body",
            ""
        )

    except Exception:
        return ""


# ============================================================
# GRAPHQL ID EXTRACTION
#
# This keeps the working "fattest GraphQL response" approach
# from the original scraper.
# ============================================================

def get_graphql_responses(driver):
    events = get_network_events(driver)

    responses = []

    for event in events:

        if event.get("method") != "Network.responseReceived":
            continue

        params = event.get(
            "params",
            {}
        )

        response = params.get(
            "response",
            {}
        )

        url = response.get(
            "url",
            ""
        )

        if "graphql" not in url.lower():
            continue

        request_id = params.get(
            "requestId"
        )

        if not request_id:
            continue

        body = get_response_body(
            driver,
            request_id
        )

        if not body:
            continue

        size = len(
            body.encode(
                "utf-8",
                errors="ignore"
            )
        )

        responses.append(
            {
                "url": url,
                "request_id": request_id,
                "body": body,
                "size": size,
            }
        )

    return responses


def find_ads_recursively(data):
    found = []

    if isinstance(data, dict):

        for key, value in data.items():

            if key == "ads" and isinstance(
                value,
                list
            ):
                found.extend(value)

            else:
                found.extend(
                    find_ads_recursively(
                        value
                    )
                )

    elif isinstance(data, list):

        for item in data:
            found.extend(
                find_ads_recursively(
                    item
                )
            )

    return found


def extract_ad_object(item):
    if not isinstance(item, dict):
        return None

    if isinstance(
        item.get("ad"),
        dict
    ):
        return item["ad"]

    if (
        "id" in item
        and "title" in item
    ):
        return item

    return None


def extract_ids_from_graphql_body(body):

    try:
        data = json.loads(body)

    except Exception:
        data = None

    ids = []

    if data is not None:

        ads = find_ads_recursively(
            data
        )

        for item in ads:

            ad = extract_ad_object(
                item
            )

            if not ad:
                continue

            listing_id = ad.get(
                "id"
            )

            if listing_id is None:
                continue

            listing_id = str(
                listing_id
            )

            if not listing_id.isdigit():
                continue

            if listing_id not in ids:
                ids.append(
                    listing_id
                )

    # Same fallback pattern as the original scraper.
    if not ids:

        matches = re.findall(
            r'"id"\s*:\s*"(\d+)"\s*,\s*"title"\s*:',
            body
        )

        for listing_id in matches:

            if listing_id not in ids:
                ids.append(
                    listing_id
                )

    return ids


# ============================================================
# CAPTURE IDS FROM ONE SEARCH PAGE
# ============================================================

def capture_listing_ids(driver, page_number):

    print()
    print("=" * 70)
    print(
        f"SEARCH PAGE {page_number}"
    )
    print("=" * 70)

    url = SEARCH_URL.format(
        page=page_number
    )

    print(
        f"Opening: {url}"
    )

    clear_performance_logs(
        driver
    )

    driver.get(url)

    time.sleep(
        SEARCH_WAIT_SECONDS
    )

    for _ in range(
        SCROLL_COUNT
    ):

        driver.execute_script(
            """
            window.scrollTo(
                0,
                Math.max(
                    document.documentElement.scrollHeight,
                    document.body
                        ? document.body.scrollHeight
                        : 0
                )
            );
            """
        )

        time.sleep(
            SCROLL_DELAY_SECONDS
        )

    time.sleep(0.5)

    print(
        "Reading Chrome Network logs..."
    )

    responses = get_graphql_responses(
        driver
    )

    print(
        f"Found {len(responses)} GraphQL responses."
    )

    if not responses:
        print(
            "No GraphQL responses found."
        )
        return []

    fattest = max(
        responses,
        key=lambda response: response["size"]
    )

    print(
        "Fattest GraphQL response:"
        f" {fattest['size']:,} bytes"
    )

    ids = extract_ids_from_graphql_body(
        fattest["body"]
    )

    print(
        f"IDs in fattest response:"
        f" {len(ids)}"
    )

    return ids


# ============================================================
# SAVE IDS
# ============================================================

def save_ids(ids):

    with open(
        IDS_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        for listing_id in ids:

            file.write(
                f"{listing_id}\n"
            )


# ============================================================
# COLLECT IDS
# ============================================================

def collect_ids(driver):

    all_ids = []
    seen = set()

    page_number = START_PAGE
    pages_since_restart = 0
    consecutive_zero_new_pages = 0

    while (
        len(all_ids) < TARGET_IDS
        and page_number <= MAX_SEARCH_PAGES
    ):

        if pages_since_restart >= CHROME_RESTART_EVERY_PAGES:

            print()
            print("=" * 70)
            print(
                f"Restarting Chrome after "
                f"{pages_since_restart} pages..."
            )
            print("=" * 70)

            try:
                driver.quit()
            except Exception:
                pass

            time.sleep(2)

            driver = create_driver()

            pages_since_restart = 0

        try:

            page_ids = capture_listing_ids(
                driver,
                page_number
            )

        except Exception as error:

            print()
            print(
                f"SEARCH PAGE {page_number} ERROR: {error}"
            )

            print(
                "Chrome timed out. Restarting Chrome and "
                "retrying this page..."
            )

            try:
                driver.quit()
            except Exception:
                pass

            time.sleep(2)

            driver = create_driver()

            pages_since_restart = 0

            try:

                page_ids = capture_listing_ids(
                    driver,
                    page_number
                )

            except Exception as retry_error:

                print(
                    f"Retry failed for page {page_number}: "
                    f"{retry_error}"
                )

                print(
                    "Skipping this page and continuing."
                )

                page_number += 1
                pages_since_restart += 1

                continue

        added = 0

        for listing_id in page_ids:

            if listing_id in seen:
                continue

            seen.add(listing_id)
            all_ids.append(listing_id)
            added += 1

            if len(all_ids) >= TARGET_IDS:
                break

        print(
            f"New IDs from page: {added}"
        )

        print(
            f"Total unique IDs: "
            f"{len(all_ids)}/{TARGET_IDS}"
        )

        if added == 0:

            consecutive_zero_new_pages += 1

            print(
                f"Consecutive pages with 0 new IDs: "
                f"{consecutive_zero_new_pages}/"
                f"{ZERO_NEW_PAGES_LIMIT}"
            )

        else:

            consecutive_zero_new_pages = 0

        # Save a checkpoint every 100 pages.
        if (
            (pages_since_restart + 1)
            % CHROME_RESTART_EVERY_PAGES
            == 0
        ):

            save_ids(all_ids)

            print(
                f"Checkpoint saved: {len(all_ids)} IDs"
            )

        if consecutive_zero_new_pages >= ZERO_NEW_PAGES_LIMIT:

            print()
            print("=" * 70)
            print(
                f"Stopping Phase 1: "
                f"{ZERO_NEW_PAGES_LIMIT} consecutive pages "
                f"added 0 new IDs."
            )
            print("=" * 70)

            break

        page_number += 1
        pages_since_restart += 1

    return all_ids[:TARGET_IDS], driver


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print("=" * 70)
    print("999.MD ID COLLECTOR")
    print("=" * 70)

    start_time = time.time()

    # --------------------------------------------------------
    # TEST REMOTE DATABASE FIRST
    # --------------------------------------------------------

    connection = None

    try:

        connection = connect_and_check_database()

    except Exception as error:

        print()
        print("=" * 70)
        print("REMOTE DATABASE CONNECTION FAILED")
        print("=" * 70)
        print(error)
        print()
        print(
            "Check DB_PASSWORD and the Aiven connection details."
        )
        return

    # We only needed the connection to prove the remote DB works.
    # No DROP, TRUNCATE, or delete operation is performed.
    connection.close()

    print("Remote PostgreSQL connection closed.")

    # --------------------------------------------------------
    # PHASE 1 ONLY: COLLECT IDS
    # --------------------------------------------------------

    driver = None

    try:

        print()
        print("=" * 70)
        print("COLLECTING LISTING IDS")
        print("=" * 70)

        driver = create_driver()

        all_ids, driver = collect_ids(
            driver
        )

        driver.quit()
        driver = None

        print(
            "\nChrome closed."
        )

        # ----------------------------------------------------
        # SAVE IDS TO TEST FILE
        # ----------------------------------------------------

        save_ids(
            all_ids
        )

        print()
        print(
            f"Saved {len(all_ids)} IDs to "
            f"{IDS_FILE}"
        )

        prepare_listings_temp_and_remove_known_ids(all_ids)

        elapsed = (
            time.time()
            - start_time
        )

        print()
        print("=" * 70)
        print("ID COLLECTION FINISHED")
        print("=" * 70)

        print(
            f"IDs collected: {len(all_ids)}"
        )

        print(
            f"Output file:   {IDS_FILE}"
        )

        print(
            f"Elapsed time:  {elapsed / 3600:.2f} hours"
        )

    except KeyboardInterrupt:

        print()
        print(
            "Stopped by user."
        )
        sys.exit(130)

    finally:

        if driver is not None:

            try:
                driver.quit()
            except Exception:
                pass


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()
