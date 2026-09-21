import json
import re
import time
import unicodedata
from urllib.parse import urljoin, urlparse

import psycopg
import requests
from bs4 import BeautifulSoup


# ============================================================
# DATABASE
# ============================================================

DB_NAME = ""
DB_USER = ""
DB_HOST = ""
DB_PORT = ""
DB_PASSWORD = ""

RESET_MODEL_CLASS_ON_START = False


# ============================================================
# CARS-DATA
# ============================================================

BASE_URL = "https://cars-data.com"

# Brand names used when searching Cars-Data.
CARS_DATA_BRAND_ALIASES = {
    "mercedes": "Mercedes-Benz",
    "mercedes benz": "Mercedes-Benz",
    "mercedes-benz": "Mercedes-Benz",
    "vauxhall": "Opel",
}

# Exact known Cars-Data naming differences.
CARS_DATA_MODEL_ALIASES = {
    ("lexus", "rx series"): ("Lexus", "RX"),
    ("lexus", "nx series"): ("Lexus", "NX"),
    ("lexus", "is series"): ("Lexus", "IS"),
    ("lexus", "gs series"): ("Lexus", "GS"),

    ("mercedes", "c-class"): ("Mercedes-Benz", "C-Class"),
    ("mercedes-benz", "c-class"): ("Mercedes-Benz", "C-Class"),

    ("mercedes", "e-class"): ("Mercedes-Benz", "E-Class"),
    ("mercedes-benz", "e-class"): ("Mercedes-Benz", "E-Class"),

    ("mercedes", "a-class"): ("Mercedes-Benz", "A-Class"),
    ("mercedes-benz", "a-class"): ("Mercedes-Benz", "A-Class"),

    ("mercedes", "glc-class"): ("Mercedes-Benz", "GLC"),
    ("mercedes-benz", "glc-class"): ("Mercedes-Benz", "GLC"),

    ("renault", "grand scenic"): ("Renault", "Scenic"),
}


# Brands where messy naming is common.
IMPORTANT_AI_BRANDS = {
    "audi",
    "bmw",
    "mercedes",
    "mercedes-benz",
    "volkswagen",
    "toyota",
    "nissan",
    "honda",
    "lexus",
    "hyundai",
    "mazda",
    "renault",
}


# Do not waste API/Cars-Data searches on these.
SKIP_BRANDS = {
    "lada / vaz",
    "lada/vaz",
    "lada-vaz",
    "moskvich / izh",
    "moskvich/izh",
    "moskvich-izh",
    "moskvich",
    "izh",
    "gaz",
    "uaz",
}


MERCEDES_CARS_DATA_URL = "https://cars-data.com/en/mercedes-benz"


# ============================================================
# RATE LIMITING
# ============================================================

TIMEOUT = 25

# About 15% slower than 5 seconds.
CARS_DATA_BATCH_SIZE = 20
CARS_DATA_PAUSE = 5.75
CARS_DATA_INTER_REQUEST_PAUSE = 0.10

# Small GPT batches to avoid large bursts/rate limits.
OPENAI_BATCH_SIZE = 30
OPENAI_MAX_RETRIES = 4
OPENAI_INTER_REQUEST_PAUSE = 2.0

CARS_DATA_REQUEST_COUNT = 0


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
    )
}


# ============================================================
# OPENAI
# ============================================================

OPENAI_API_KEY = ""

OPENAI_MODEL = "gpt-5.6-luna"
OPENAI_URL = "https://api.openai.com/v1/responses"


# ============================================================
# BASIC HELPERS
# ============================================================

def db_connect():
    return psycopg.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
        sslmode="require",
    )


def clean_spaces(value):
    if value is None:
        return ""

    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_text(value):
    value = clean_spaces(value).lower()
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    return clean_spaces(value)


def slugify(value):
    value = unicodedata.normalize("NFKD", str(value))
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.lower()

    # Spaces and punctuation become hyphens.
    value = re.sub(r"[^a-z0-9]+", "-", value)

    return value.strip("-")


def normalize_url(url):
    return url.rstrip("/")


def path_parts(url):
    path = urlparse(url).path.strip("/")
    return [x for x in path.split("/") if x]


def resolve_href(base_url, href):
    href = clean_spaces(href)

    if not href:
        return ""

    if href.startswith(("http://", "https://")):
        return normalize_url(href)

    return normalize_url(urljoin(base_url, href))


# ============================================================
# CARS-DATA REQUESTS
# ============================================================

def cars_data_get(session, url):
    global CARS_DATA_REQUEST_COUNT

    CARS_DATA_REQUEST_COUNT += 1
    n = CARS_DATA_REQUEST_COUNT

    print(f"    Cars-Data GET #{n}: {url}")

    if n > 1:
        time.sleep(CARS_DATA_INTER_REQUEST_PAUSE)

    try:
        response = session.get(
            url,
            headers=HEADERS,
            timeout=TIMEOUT,
        )

        print(
            f"    Cars-Data response #{n}: "
            f"HTTP {response.status_code}"
        )

        return response

    except requests.RequestException as exc:
        print(f"    Cars-Data request #{n} failed: {exc}")
        raise

    finally:
        if n % CARS_DATA_BATCH_SIZE == 0:
            print(
                f"    Cars-Data pacing: "
                f"{CARS_DATA_BATCH_SIZE} requests reached; "
                f"sleeping {CARS_DATA_PAUSE:g} seconds..."
            )

            time.sleep(CARS_DATA_PAUSE)


def fetch(session, url):
    response = cars_data_get(session, url)
    response.raise_for_status()
    return response.text


# ============================================================
# CANONICAL CARS-DATA NAMES
# ============================================================

def canonical_cars_data_lookup(brand, model):
    b = clean_spaces(brand)
    m = clean_spaces(model)

    key = (
        b.lower(),
        m.lower(),
    )

    if key in CARS_DATA_MODEL_ALIASES:
        return CARS_DATA_MODEL_ALIASES[key]

    canonical_brand = CARS_DATA_BRAND_ALIASES.get(
        b.lower(),
        b,
    )

    return canonical_brand, m


def cars_data_model_url(brand, model):
    lookup_brand, lookup_model = canonical_cars_data_lookup(
        brand,
        model,
    )

    return (
        f"{BASE_URL}/en/"
        f"{slugify(lookup_brand)}/"
        f"{slugify(lookup_model)}"
    )


# ============================================================
# LOCAL MODEL NORMALIZATION
# ============================================================

def local_model_candidates(brand, model):
    """
    Return cheap deterministic Cars-Data lookup candidates.

    The FIRST candidate is the preferred lookup.
    """

    original_brand = clean_spaces(brand)
    original_model = clean_spaces(model)

    b = normalize_text(original_brand)
    m = normalize_text(original_model)

    candidates = []

    def add(candidate_brand, candidate_model):
        candidate = (
            clean_spaces(candidate_brand),
            clean_spaces(candidate_model),
        )

        if not all(candidate):
            return

        if candidate not in candidates:
            candidates.append(candidate)

    # --------------------------------------------------------
    # Skip useless Russian old-school brands.
    # --------------------------------------------------------

    if b in SKIP_BRANDS:
        return []

    # --------------------------------------------------------
    # Vauxhall -> Opel
    # --------------------------------------------------------

    if b == "vauxhall":
        add("Opel", original_model)

    # --------------------------------------------------------
    # MERCEDES
    # --------------------------------------------------------

    if b in {"mercedes", "mercedes benz", "mercedes-benz"}:

        # Canonical names first.
        mercedes_families = {
            "a-class": "A-Class",
            "b-class": "B-Class",
            "c-class": "C-Class",
            "e-class": "E-Class",
            "s-class": "S-Class",
            "g-class": "G-Class",
            "glc": "GLC",
            "gle": "GLE",
            "gls": "GLS",
            "cla": "CLA",
            "cls": "CLS",
            "cle": "CLE",
            "sl": "SL",
            "slk": "SLK",
            "clk": "CLK",
            "cl": "CL",
            "v-class": "V-Class",
            "x-class": "X-Class",
        }

        if m in mercedes_families:
            add(
                "Mercedes-Benz",
                mercedes_families[m],
            )

        # C220, C200 CDI, C63 AMG, etc.
        if re.search(
            r"\bc\s*\d{2,3}\b",
            m,
        ):
            add(
                "Mercedes-Benz",
                "C-Class",
            )

        if re.search(
            r"\be\s*\d{2,3}\b",
            m,
        ):
            add(
                "Mercedes-Benz",
                "E-Class",
            )

        if re.search(
            r"\ba\s*\d{2,3}\b",
            m,
        ):
            add(
                "Mercedes-Benz",
                "A-Class",
            )

        if re.search(
            r"\bb\s*\d{2,3}\b",
            m,
        ):
            add(
                "Mercedes-Benz",
                "B-Class",
            )

        if re.search(
            r"\bs\s*\d{2,3}\b",
            m,
        ):
            add(
                "Mercedes-Benz",
                "S-Class",
            )

        # GLC Coupe -> GLC
        if "glc" in m:
            add(
                "Mercedes-Benz",
                "GLC",
            )

        if "gle" in m:
            add(
                "Mercedes-Benz",
                "GLE",
            )

        if "gls" in m:
            add(
                "Mercedes-Benz",
                "GLS",
            )

        if "g-class" in m or re.fullmatch(r"g\s*\d+", m):
            add(
                "Mercedes-Benz",
                "G-Class",
            )

        if "cla" in m:
            add(
                "Mercedes-Benz",
                "CLA",
            )

        if "cls" in m:
            add(
                "Mercedes-Benz",
                "CLS",
            )

        if "cle" in m:
            add(
                "Mercedes-Benz",
                "CLE",
            )

    # --------------------------------------------------------
    # BMW
    # --------------------------------------------------------

    if b == "bmw":

        # Preserve actual X/i models.
        for family in [
            "x1",
            "x2",
            "x3",
            "x4",
            "x5",
            "x6",
            "x7",
            "i3",
            "i4",
            "i5",
            "i7",
            "ix",
            "ix1",
            "ix3",
        ]:
            if re.search(rf"\b{re.escape(family)}\b", m):
                add(
                    "BMW",
                    family.upper() if family.startswith("x") else family,
                )

        # BMW 118d -> 1 Series
        # BMW 320d -> 3 Series
        # BMW 520d -> 5 Series
        # BMW 730d -> 7 Series
        # BMW M340i -> 3 Series
        match = re.search(
            r"\b([1-8])\s*\d{2}[a-z]*\b",
            m,
        )

        if match:
            series_number = match.group(1)

            add(
                "BMW",
                f"{series_number} Series",
            )

        # M1...M8 where applicable.
        match = re.search(
            r"\bm([1-8])\b",
            m,
        )

        if match:
            series_number = match.group(1)

            add(
                "BMW",
                f"{series_number} Series",
            )

        # Explicit series names.
        match = re.search(
            r"\b([1-8])\s*series\b",
            m,
        )

        if match:
            add(
                "BMW",
                f"{match.group(1)} Series",
            )

        # 6 Series GT / Gran Turismo -> 6 Series
        if re.search(
            r"\b6\s+series\b",
            m,
        ):
            add(
                "BMW",
                "6 Series",
            )

    # --------------------------------------------------------
    # AUDI
    # --------------------------------------------------------

    if b == "audi":

        audi_map = {
            "rs3": "A3",
            "s3": "A3",

            "rs4": "A4",
            "s4": "A4",

            "rs5": "A5",
            "s5": "A5",

            "rs6": "A6",
            "s6": "A6",

            "rs7": "A7",
            "s7": "A7",

            "rs2": "A2",
            "s2": "A2",

            "rs8": "A8",
            "s8": "A8",

            "sq5": "Q5",
            "sq7": "Q7",
            "sq8": "Q8",
        }

        if m in audi_map:
            add(
                "Audi",
                audi_map[m],
            )

        # RS6 Performance etc.
        match = re.search(
            r"\brs([2-8])\b",
            m,
        )

        if match:
            add(
                "Audi",
                f"A{match.group(1)}",
            )

        match = re.search(
            r"\bs([2-8])\b",
            m,
        )

        if match:
            add(
                "Audi",
                f"A{match.group(1)}",
            )

        # A4 2.0 TDI / A4 Avant / A4 B9 / A4 Sedan
        match = re.search(
            r"\b(a[1-8])\b",
            m,
        )

        if match:
            add(
                "Audi",
                match.group(1).upper(),
            )

        match = re.search(
            r"\b(q[2-8])\b",
            m,
        )

        if match:
            add(
                "Audi",
                match.group(1).upper(),
            )

    # --------------------------------------------------------
    # RENAULT
    # --------------------------------------------------------

    if b == "renault":

        if "grand scenic" in m:
            add(
                "Renault",
                "Scenic",
            )

        elif "scenic" in m:
            add(
                "Renault",
                "Scenic",
            )

        if "megane" in m or "megane" in normalize_text(m):
            add(
                "Renault",
                "Megane",
            )

        if "kangoo" in m:
            add(
                "Renault",
                "Kangoo",
            )

        # Renault Logan -> search Dacia Logan,
        # but original row remains Renault Logan in DB.
        if re.search(r"\blogan\b", m):
            add(
                "Dacia",
                "Logan",
            )

        # Generic Renault core families.
        for family in [
            "clio",
            "captur",
            "kadjar",
            "koleos",
            "arkana",
            "talisman",
            "laguna",
            "espace",
            "trafic",
            "master",
            "fluence",
        ]:
            if re.search(
                rf"\b{re.escape(family)}\b",
                m,
            ):
                add(
                    "Renault",
                    family.title(),
                )

    # --------------------------------------------------------
    # VOLKSWAGEN
    # --------------------------------------------------------

    if b == "volkswagen":

        vw_models = [
            "golf",
            "polo",
            "passat",
            "tiguan",
            "touareg",
            "arteon",
            "jetta",
            "touran",
            "sharan",
            "caddy",
            "amarok",
            "up",
            "t-roc",
            "t-cross",
            "taigo",
            "id.3",
            "id.4",
            "id.5",
            "id.7",
        ]

        for family in vw_models:
            if family in m:
                add(
                    "Volkswagen",
                    family,
                )

    # --------------------------------------------------------
    # GENERAL ENGINE / TRIM CLEANUP
    # --------------------------------------------------------

    def stripped_model(value):
        x = normalize_text(value)

        # Generation years / generation codes.
        x = re.sub(
            r"\b(?:19|20)\d{2}\b",
            " ",
            x,
        )

        x = re.sub(
            r"\b(?:mk[1-9]|f\d{2}|g\d{2}|b\d|w\d{3}|e\d{3})\b",
            " ",
            x,
        )

        # Body styles and common trim noise.
        remove_tokens = [
            "coupe",
            "coupé",
            "gran turismo",
            "gt",
            "touring",
            "avant",
            "estate",
            "wagon",
            "sedan",
            "saloon",
            "limousine",
            "cabrio",
            "cabriolet",
            "convertible",
            "sportback",
            "hatchback",
            "tourer",
            "grand",
            "maxi",
            "competition",
            "performance",
            "edition",
            "line",
            "package",
            "luxury",
            "premium",

            "tdi",
            "tfsi",
            "fsi",
            "tsi",
            "dci",
            "cdi",
            "hdi",
            "jtd",
            "d",
            "i",
            "e",

            "xdrive",
            "sdrive",
            "quattro",
            "4matic",

            "amg",
            "nismo",
            "type r",
            "type-r",
        ]

        for token in remove_tokens:
            x = re.sub(
                rf"\b{re.escape(token)}\b",
                " ",
                x,
            )

        x = clean_spaces(x)

        return x

    stripped = stripped_model(original_model)

    # For common brands, try the simplified original brand/model too.
    if b not in SKIP_BRANDS and stripped:
        if b == "vauxhall":
            add("Opel", stripped)
        elif b in {"mercedes", "mercedes benz", "mercedes-benz"}:
            add("Mercedes-Benz", stripped)
        else:
            add(original_brand, stripped)

    return candidates


def should_send_to_ai(brand, model):
    b = normalize_text(brand)
    m = normalize_text(model)

    if b in SKIP_BRANDS:
        return False

    if b not in IMPORTANT_AI_BRANDS:
        return True

    # Obvious noisy models.
    noise = {
        "coupe",
        "gt",
        "gran turismo",
        "touring",
        "avant",
        "estate",
        "wagon",
        "sedan",
        "sportback",
        "cdi",
        "tdi",
        "tfsi",
        "dci",
        "hdi",
        "amg",
        "quattro",
        "xdrive",
        "sdrive",
        "4matic",
        "rs",
        "nismo",
    }

    if any(
        re.search(rf"\b{re.escape(token)}\b", m)
        for token in noise
    ):
        return True

    # BMW 320d etc.
    if b == "bmw" and re.search(
        r"\b[1-8]\s*\d{2}[a-z]*\b",
        m,
    ):
        return True

    # Mercedes C220 etc.
    if b in {"mercedes", "mercedes benz", "mercedes-benz"}:
        if re.search(
            r"\b[a-z]{1,4}\s*\d{2,3}\b",
            m,
        ):
            return True

    return False


# ============================================================
# CARS-DATA PARSING
# ============================================================

def candidate_hrefs(soup, html, base_url):
    seen = set()
    result = []

    for a in soup.find_all("a", href=True):
        href = resolve_href(
            base_url,
            a.get("href", ""),
        )

        if not href or href in seen:
            continue

        seen.add(href)

        result.append(
            (
                href,
                clean_spaces(
                    a.get_text(
                        " ",
                        strip=True,
                    )
                ),
            )
        )

    # Backup extraction from raw HTML.
    for match in re.finditer(
        r"href\s*=\s*['\"]([^'\"]+)['\"]",
        html,
        flags=re.IGNORECASE,
    ):
        href = resolve_href(
            base_url,
            match.group(1),
        )

        if not href or href in seen:
            continue

        seen.add(href)

        result.append(
            (
                href,
                "",
            )
        )

    return result


def find_generation_links(model_url, soup, html):
    parent = path_parts(model_url)

    if len(parent) != 3:
        return []

    result = []
    seen = set()

    for href, text in candidate_hrefs(
        soup,
        html,
        model_url,
    ):
        child = path_parts(href)

        if len(child) != 4:
            continue

        if child[:3] != parent:
            continue

        if child[-1].lower() in {
            "dimensions",
            "specs",
            "compare",
            "statistics",
            "alternatives",
        }:
            continue

        if href not in seen:
            seen.add(href)
            result.append(
                (
                    href,
                    text,
                )
            )

    return result


def find_variant_links(generation_url, soup, html):
    parent = path_parts(generation_url)

    if len(parent) != 4:
        return []

    result = []
    seen = set()

    for href, text in candidate_hrefs(
        soup,
        html,
        generation_url,
    ):
        child = path_parts(href)

        if len(child) != 5:
            continue

        if child[:4] != parent:
            continue

        slug = child[-1]

        if not re.search(
            r"\d{4,}",
            slug,
        ):
            continue

        if slug.lower() in {
            "specs",
            "dimensions",
            "compare",
        }:
            continue

        if href not in seen:
            seen.add(href)

            result.append(
                (
                    href,
                    text,
                )
            )

    return result


def cars_data_model_exists(session, brand, model):
    url = cars_data_model_url(
        brand,
        model,
    )

    response = cars_data_get(
        session,
        url,
    )

    if response.status_code == 404:
        return False

    if response.status_code != 200:
        raise RuntimeError(
            f"Cars-Data lookup HTTP "
            f"{response.status_code}: {url}"
        )

    soup = BeautifulSoup(
        response.text,
        "html.parser",
    )

    h1 = soup.find("h1")
    title = soup.find("title")

    identity = clean_spaces(
        h1.get_text(
            " ",
            strip=True,
        )
        if h1
        else (
            title.get_text(
                " ",
                strip=True,
            )
            if title
            else ""
        )
    )

    if not identity:
        raise RuntimeError(
            f"Cars-Data returned HTTP 200 "
            f"without model identity: {url}"
        )

    return True


# ============================================================
# MARKET SEGMENT
# ============================================================

def extract_market_segment(soup):
    # Table.
    for row in soup.find_all("tr"):
        cells = row.find_all(
            ["th", "td"]
        )

        if len(cells) < 2:
            continue

        label = clean_spaces(
            cells[0].get_text(
                " ",
                strip=True,
            )
        ).lower()

        if label == "market segment":
            value = clean_spaces(
                cells[1].get_text(
                    " ",
                    strip=True,
                )
            )

            if value:
                return value

    # Definition list.
    for dt in soup.find_all("dt"):
        label = clean_spaces(
            dt.get_text(
                " ",
                strip=True,
            )
        ).lower()

        if label == "market segment":
            dd = dt.find_next_sibling("dd")

            if dd:
                value = clean_spaces(
                    dd.get_text(
                        " ",
                        strip=True,
                    )
                )

                if value:
                    return value

    # Generic page-text fallback.
    text = clean_spaces(
        soup.get_text(
            " ",
            strip=True,
        )
    )

    match = re.search(
        r"Market\s+segment\s*[:\-]?\s*"
        r"(.{2,100})",
        text,
        flags=re.IGNORECASE,
    )

    if match:
        value = clean_spaces(
            match.group(1)
        )

        value = re.split(
            r"\s+(?:Body|Doors|Seats|Engine|"
            r"Fuel|Gearbox|Drive|Wheelbase|"
            r"Price|Dimensions)\b",
            value,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0].strip()

        if value:
            return value

    return None


# ============================================================
# SCRAPE ONE CARS-DATA MODEL
# ============================================================

def scrape_cars_data_model(
    session,
    original_brand,
    original_model,
    lookup_brand,
    lookup_model,
):
    canonical_brand, canonical_model = (
        canonical_cars_data_lookup(
            lookup_brand,
            lookup_model,
        )
    )

    cars_url = cars_data_model_url(
        canonical_brand,
        canonical_model,
    )

    result = {
        "brand": original_brand,
        "model": original_model,

        "counterpart_brand": lookup_brand,
        "counterpart_model": lookup_model,

        "cars_data_model_url": cars_url,
        "generation_url": None,
        "variant_url": None,
        "specs_url": None,

        "market_segment": None,

        "status": "failed",
        "error": None,
    }

    html = fetch(
        session,
        cars_url,
    )

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    generations = find_generation_links(
        cars_url,
        soup,
        html,
    )

    if not generations:
        raise RuntimeError(
            f"No generation links: {cars_url}"
        )

    # Small bounded scrape.
    for generation_url, generation_text in generations[:3]:

        print(
            f"    Generation: {generation_text}"
        )

        try:
            generation_html = fetch(
                session,
                generation_url,
            )

            generation_soup = BeautifulSoup(
                generation_html,
                "html.parser",
            )

            variants = find_variant_links(
                generation_url,
                generation_soup,
                generation_html,
            )

            if not variants:
                continue

            for variant_url, variant_text in variants[:3]:

                print(
                    f"    Variant: {variant_text}"
                )

                specs_url = normalize_url(
                    variant_url + "/specs"
                )

                try:
                    specs_html = fetch(
                        session,
                        specs_url,
                    )

                    specs_soup = BeautifulSoup(
                        specs_html,
                        "html.parser",
                    )

                    segment = extract_market_segment(
                        specs_soup
                    )

                    if not segment:
                        continue

                    result["generation_url"] = (
                        generation_url
                    )
                    result["variant_url"] = (
                        variant_url
                    )
                    result["specs_url"] = (
                        specs_url
                    )
                    result["market_segment"] = (
                        segment
                    )
                    result["status"] = "success"

                    return result

                except Exception as exc:
                    print(
                        f"        Specs failed: {exc}"
                    )

        except Exception as exc:
            print(
                f"        Generation failed: {exc}"
            )

    raise RuntimeError(
        f"Could not extract market segment: {cars_url}"
    )


# ============================================================
# DATABASE
# ============================================================

def setup_db(conn):
    with conn.cursor() as cur:

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS model_class (
                id BIGSERIAL PRIMARY KEY,

                brand TEXT NOT NULL,
                model TEXT NOT NULL,

                counterpart_brand TEXT,
                counterpart_model TEXT,

                cars_data_model_url TEXT,
                generation_url TEXT,
                variant_url TEXT,
                specs_url TEXT,

                market_segment TEXT,

                status TEXT NOT NULL DEFAULT 'pending',
                error TEXT,

                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),

                UNIQUE (brand, model)
            )
            """
        )

    conn.commit()


def reset_model_class(conn):
    with conn.cursor() as cur:
        cur.execute(
            "TRUNCATE TABLE model_class RESTART IDENTITY"
        )

    conn.commit()

    print("model_class cleared.")


def get_models(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT
                TRIM(listing.brand),
                TRIM(listing.model)
            FROM listings AS listing
            WHERE listing.brand IS NOT NULL
              AND listing.model IS NOT NULL
              AND TRIM(listing.brand) <> ''
              AND TRIM(listing.model) <> ''
              AND NOT EXISTS (
                  SELECT 1
                  FROM model_class AS existing
                  WHERE LOWER(TRIM(existing.brand)) = LOWER(TRIM(listing.brand))
                    AND LOWER(TRIM(existing.model)) = LOWER(TRIM(listing.model))
              )
            ORDER BY 1, 2
            """
        )

        return cur.fetchall()


def save_result(conn, result):
    with conn.cursor() as cur:

        cur.execute(
            """
            INSERT INTO model_class (
                brand,
                model,
                counterpart_brand,
                counterpart_model,
                cars_data_model_url,
                generation_url,
                variant_url,
                specs_url,
                market_segment,
                status,
                error,
                updated_at
            )
            VALUES (
                %(brand)s,
                %(model)s,
                %(counterpart_brand)s,
                %(counterpart_model)s,
                %(cars_data_model_url)s,
                %(generation_url)s,
                %(variant_url)s,
                %(specs_url)s,
                %(market_segment)s,
                %(status)s,
                %(error)s,
                NOW()
            )
            ON CONFLICT (brand, model)
            DO UPDATE SET
                counterpart_brand = EXCLUDED.counterpart_brand,
                counterpart_model = EXCLUDED.counterpart_model,
                cars_data_model_url = EXCLUDED.cars_data_model_url,
                generation_url = EXCLUDED.generation_url,
                variant_url = EXCLUDED.variant_url,
                specs_url = EXCLUDED.specs_url,
                market_segment = EXCLUDED.market_segment,
                status = EXCLUDED.status,
                error = EXCLUDED.error,
                updated_at = NOW()
            """,
            result,
        )

    conn.commit()


# ============================================================
# OPENAI
# ============================================================

def extract_openai_text(data):
    output = data.get(
        "output",
        [],
    )

    texts = []

    for item in output:

        if (
            not isinstance(item, dict)
            or item.get("type") != "message"
        ):
            continue

        for part in item.get(
            "content",
            [],
        ):

            if (
                isinstance(part, dict)
                and part.get("type") == "output_text"
                and isinstance(part.get("text"), str)
            ):
                if part["text"].strip():
                    texts.append(
                        part["text"]
                    )

    result = "\n".join(
        texts
    ).strip()

    if not result:
        raise RuntimeError(
            "OpenAI returned no output_text."
        )

    return result


def openai_resolve_batch(
    session,
    batch,
):
    if not OPENAI_API_KEY.strip():
        raise RuntimeError(
            "OPENAI_API_KEY is empty."
        )

    model_list = "\n".join(
        f"{i}. {brand} | {model}"
        for i, (brand, model) in enumerate(
            batch,
            start=1,
        )
    )

    prompt = f"""
You are cleaning vehicle listing model names for a database.

Your ONLY job is to convert each messy brand + model into the
SIMPLEST REAL MAINSTREAM MODEL FAMILY that exists as a top-level
model on Cars-Data.com.

Do NOT find a competitor.
Do NOT choose something merely similar.
Do NOT use platform sharing as a reason.

The desired result is the normal manufacturer's model family.

IMPORTANT:
Strip:
- engine sizes
- diesel/petrol/electric labels
- transmission
- drivetrain
- trim
- generation
- chassis codes
- performance badges
- body styles
- marketing editions

Examples:

Audi RS6 -> Audi A6
Audi S4 -> Audi A4
Audi A4 2.0 TDI -> Audi A4
Audi A6 Avant 40 TDI -> Audi A6
Audi SQ5 -> Audi Q5

BMW 320d -> BMW 3 Series
BMW 330i -> BMW 3 Series
BMW M340i -> BMW 3 Series
BMW 520d -> BMW 5 Series
BMW M5 -> BMW 5 Series
BMW 6 Series GT -> BMW 6 Series
BMW X5 30d -> BMW X5

Mercedes C220 CDI -> Mercedes-Benz C-Class
Mercedes C63 AMG -> Mercedes-Benz C-Class
Mercedes E220d -> Mercedes-Benz E-Class
Mercedes E63 AMG -> Mercedes-Benz E-Class
Mercedes A200 -> Mercedes-Benz A-Class
Mercedes GLC Coupe -> Mercedes-Benz GLC
Mercedes GLC 220d -> Mercedes-Benz GLC
Mercedes GLE 350d -> Mercedes-Benz GLE
Mercedes S500 -> Mercedes-Benz S-Class

Renault Grand Scenic -> Renault Scenic
Renault Scenic III -> Renault Scenic
Renault Megane IV -> Renault Megane
Renault Megane GT -> Renault Megane
Renault Kangoo Maxi -> Renault Kangoo

Renault Logan -> Dacia Logan for SEARCH ONLY.
The original Renault Logan identity must remain in the database.

Vauxhall -> Opel for SEARCH ONLY.

Use normal/common top-level Cars-Data spelling.

If a model is already simple, return it unchanged.

Try hard to simplify messy names rather than returning null.

For unclear cases, use web search, preferably Cars-Data.com.

Return ONE primary candidate and up to TWO alternatives.
Alternatives must represent the same underlying vehicle,
not competitors.

Return exactly one result for every numbered input.

INPUTS:
{model_list}
"""

    schema = {
        "type": "object",
        "properties": {
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "integer"
                        },
                        "counterpart_brand": {
                            "type": [
                                "string",
                                "null",
                            ]
                        },
                        "counterpart_model": {
                            "type": [
                                "string",
                                "null",
                            ]
                        },
                        "confidence": {
                            "type": "string",
                            "enum": [
                                "high",
                                "medium",
                                "low",
                            ]
                        },
                        "reason": {
                            "type": "string"
                        },
                        "alternatives": {
                            "type": "array",
                            "maxItems": 2,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "brand": {
                                        "type": [
                                            "string",
                                            "null",
                                        ]
                                    },
                                    "model": {
                                        "type": [
                                            "string",
                                            "null",
                                        ]
                                    },
                                },
                                "required": [
                                    "brand",
                                    "model",
                                ],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": [
                        "id",
                        "counterpart_brand",
                        "counterpart_model",
                        "confidence",
                        "reason",
                        "alternatives",
                    ],
                    "additionalProperties": False,
                },
            }
        },
        "required": [
            "results"
        ],
        "additionalProperties": False,
    }

    payload = {
        "model": OPENAI_MODEL,
        "input": prompt,

        "tools": [
            {
                "type": "web_search"
            }
        ],

        "tool_choice": "required",

        "reasoning": {
            "effort": "low"
        },

        "text": {
            "format": {
                "type": "json_schema",
                "name": "vehicle_normalization",
                "strict": True,
                "schema": schema,
            },
            "verbosity": "low",
        },

        "include": [
            "web_search_call.action.sources"
        ],
    }

    response = session.post(
        OPENAI_URL,
        headers={
            "Authorization": (
                f"Bearer {OPENAI_API_KEY}"
            ),
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=TIMEOUT * 10,
    )

    if response.status_code != 200:
        raise RuntimeError(
            "OpenAI API error:\n"
            + response.text[:12000]
        )

    data = response.json()

    raw_text = extract_openai_text(
        data
    )

    parsed = json.loads(
        raw_text
    )

    results = parsed.get(
        "results"
    )

    if not isinstance(
        results,
        list,
    ):
        raise RuntimeError(
            "OpenAI response has no results array."
        )

    mapped = {}

    for item in results:

        if not isinstance(
            item,
            dict,
        ):
            continue

        item_id = item.get(
            "id"
        )

        if not isinstance(
            item_id,
            int,
        ):
            continue

        if not (
            1 <= item_id <= len(batch)
        ):
            continue

        original = batch[
            item_id - 1
        ]

        alternatives = []

        for alt in item.get(
            "alternatives",
            [],
        ):

            if not isinstance(
                alt,
                dict,
            ):
                continue

            alt_brand = (
                clean_spaces(
                    alt.get("brand")
                )
                or None
            )

            alt_model = (
                clean_spaces(
                    alt.get("model")
                )
                or None
            )

            if alt_brand and alt_model:
                alternatives.append(
                    {
                        "brand": alt_brand,
                        "model": alt_model,
                    }
                )

        mapped[original] = {
            "brand": (
                clean_spaces(
                    item.get(
                        "counterpart_brand"
                    )
                )
                or None
            ),
            "model": (
                clean_spaces(
                    item.get(
                        "counterpart_model"
                    )
                )
                or None
            ),
            "confidence": (
                clean_spaces(
                    item.get(
                        "confidence"
                    )
                ).lower()
            ),
            "reason": clean_spaces(
                item.get(
                    "reason"
                )
            ),
            "alternatives": alternatives,
        }

    return mapped


def openai_resolve_all(
    session,
    missing_models,
):
    """
    Small batches deliberately.
    """
    all_results = {}

    batches = [
        missing_models[
            i:i + OPENAI_BATCH_SIZE
        ]
        for i in range(
            0,
            len(missing_models),
            OPENAI_BATCH_SIZE,
        )
    ]

    print(
        f"OpenAI: "
        f"{len(missing_models):,} unresolved models "
        f"in {len(batches):,} small batches."
    )

    for batch_number, batch in enumerate(
        batches,
        start=1,
    ):

        print()
        print(
            f"OPENAI BATCH "
            f"{batch_number}/{len(batches)} "
            f"({len(batch)} models)"
        )

        result = {}

        for attempt in range(
            1,
            OPENAI_MAX_RETRIES + 1,
        ):

            try:
                result = openai_resolve_batch(
                    session,
                    batch,
                )

                break

            except Exception as exc:
                print(
                    f"  OpenAI attempt "
                    f"{attempt}/{OPENAI_MAX_RETRIES} failed: "
                    f"{exc}"
                )

                if attempt < OPENAI_MAX_RETRIES:
                    time.sleep(
                        2 + attempt
                    )

        all_results.update(
            result
        )

        # Slow down between small API calls.
        if batch_number < len(batches):
            time.sleep(
                OPENAI_INTER_REQUEST_PAUSE
            )

    return all_results


# ============================================================
# CANDIDATE TESTING
# ============================================================

def try_candidates(
    session,
    conn,
    original_brand,
    original_model,
    candidates,
):
    seen = set()

    for lookup_brand, lookup_model in candidates:

        candidate = (
            clean_spaces(lookup_brand),
            clean_spaces(lookup_model),
        )

        if candidate in seen:
            continue

        seen.add(candidate)

        if not all(candidate):
            continue

        print(
            f"    Trying Cars-Data: "
            f"{candidate[0]} / {candidate[1]}"
        )

        try:
            exists = cars_data_model_exists(
                session,
                candidate[0],
                candidate[1],
            )

        except Exception as exc:
            print(
                f"        Lookup failed: {exc}"
            )
            continue

        if not exists:
            print(
                "        Not found."
            )
            continue

        try:
            result = scrape_cars_data_model(
                session,
                original_brand,
                original_model,
                candidate[0],
                candidate[1],
            )

            save_result(
                conn,
                result,
            )

            print(
                f"    SUCCESS: "
                f"{result['market_segment']} "
                f"via "
                f"{candidate[0]} / "
                f"{candidate[1]}"
            )

            return result

        except Exception as exc:
            print(
                f"        Scrape failed: {exc}"
            )

    return None


# ============================================================
# ONE MODEL
# ============================================================

def process_one_model(
    session,
    conn,
    brand,
    model,
    ai_result=None,
):
    """
    Order:

    1. Skip known hopeless Russian old-school brands.
    2. Try local deterministic normalization.
    3. Try original clean/simple form.
    4. If still unresolved, use GPT.
    5. Try GPT primary + alternatives.
    """

    b = normalize_text(brand)

    # --------------------------------------------------------
    # Skip old Russian brands.
    # --------------------------------------------------------

    if b in SKIP_BRANDS:

        result = {
            "brand": brand,
            "model": model,
            "counterpart_brand": None,
            "counterpart_model": None,
            "cars_data_model_url": None,
            "generation_url": None,
            "variant_url": None,
            "specs_url": None,
            "market_segment": None,
            "status": "skipped",
            "error": "Skipped intentionally",
        }

        save_result(
            conn,
            result,
        )

        print(
            f"    SKIPPED: {brand} {model}"
        )

        return result

    # --------------------------------------------------------
    # Local normalization.
    # --------------------------------------------------------

    local_candidates = local_model_candidates(
        brand,
        model,
    )

    if local_candidates:
        result = try_candidates(
            session,
            conn,
            brand,
            model,
            local_candidates,
        )

        if result:
            return result

    # --------------------------------------------------------
    # Direct original model.
    # --------------------------------------------------------

    original_candidates = [
        (
            brand,
            model,
        )
    ]

    result = try_candidates(
        session,
        conn,
        brand,
        model,
        original_candidates,
    )

    if result:
        return result

    # --------------------------------------------------------
    # GPT.
    # --------------------------------------------------------

    if not ai_result:
        result = {
            "brand": brand,
            "model": model,
            "counterpart_brand": None,
            "counterpart_model": None,
            "cars_data_model_url": None,
            "generation_url": None,
            "variant_url": None,
            "specs_url": None,
            "market_segment": None,
            "status": "ai_failed",
            "error": "No usable OpenAI result",
        }

        save_result(
            conn,
            result,
        )

        return result

    candidates = []

    primary = (
        ai_result.get("brand"),
        ai_result.get("model"),
    )

    if all(primary):
        candidates.append(
            primary
        )

    # Add local normalization of GPT's answer too.
    if all(primary):
        candidates.extend(
            local_model_candidates(
                primary[0],
                primary[1],
            )
        )

    # GPT alternatives.
    for alternative in ai_result.get(
        "alternatives",
        [],
    ):

        alt = (
            alternative.get("brand"),
            alternative.get("model"),
        )

        if all(alt):
            candidates.append(
                alt
            )

            candidates.extend(
                local_model_candidates(
                    alt[0],
                    alt[1],
                )
            )

    result = try_candidates(
        session,
        conn,
        brand,
        model,
        candidates,
    )

    if result:
        return result

    # --------------------------------------------------------
    # Still unresolved.
    # --------------------------------------------------------

    error = (
        "Local normalization and GPT "
        "candidates could not be used on Cars-Data"
    )

    result = {
        "brand": brand,
        "model": model,

        "counterpart_brand": (
            ai_result.get("brand")
        ),
        "counterpart_model": (
            ai_result.get("model")
        ),

        "cars_data_model_url": None,
        "generation_url": None,
        "variant_url": None,
        "specs_url": None,

        "market_segment": None,

        "status": "ai_failed",
        "error": error,
    }

    save_result(
        conn,
        result,
    )

    print(
        f"    FAILED: {brand} {model}"
    )

    return result


# ============================================================
# SELF TESTS
# ============================================================

def self_test():
    assert (
        cars_data_model_url(
            "Mercedes",
            "C-Class",
        )
        == "https://cars-data.com/en/mercedes-benz/c-class"
    )

    assert (
        cars_data_model_url(
            "Mercedes",
            "GLC-Class",
        )
        == "https://cars-data.com/en/mercedes-benz/glc"
    )

    assert (
        local_model_candidates(
            "Mercedes",
            "C220 CDI",
        )[0]
        == (
            "Mercedes-Benz",
            "C-Class",
        )
    )

    assert (
        local_model_candidates(
            "Mercedes",
            "GLC Coupe",
        )[0]
        == (
            "Mercedes-Benz",
            "GLC",
        )
    )

    assert (
        local_model_candidates(
            "BMW",
            "320d",
        )[0]
        == (
            "BMW",
            "3 Series",
        )
    )

    assert (
        local_model_candidates(
            "BMW",
            "M5",
        )[0]
        == (
            "BMW",
            "5 Series",
        )
    )

    assert (
        local_model_candidates(
            "BMW",
            "6 Series GT",
        )[0]
        == (
            "BMW",
            "6 Series",
        )
    )

    assert (
        local_model_candidates(
            "Audi",
            "RS6",
        )[0]
        == (
            "Audi",
            "A6",
        )
    )

    assert (
        local_model_candidates(
            "Audi",
            "A4 2.0 TDI",
        )[0]
        == (
            "Audi",
            "A4",
        )
    )

    assert (
        local_model_candidates(
            "Renault",
            "Grand Scenic",
        )[0]
        == (
            "Renault",
            "Scenic",
        )
    )

    assert (
        local_model_candidates(
            "Renault",
            "Kangoo Maxi",
        )[0]
        == (
            "Renault",
            "Kangoo",
        )
    )

    assert (
        local_model_candidates(
            "Renault",
            "Logan",
        )[0]
        == (
            "Dacia",
            "Logan",
        )
    )

    assert (
        local_model_candidates(
            "Vauxhall",
            "Astra",
        )[0]
        == (
            "Opel",
            "Astra",
        )
    )

    assert local_model_candidates(
        "Lada / VAZ",
        "2107",
    ) == []

    print("Self-tests passed.")


# ============================================================
# MAIN
# ============================================================

def main():
    self_test()

    print(
        "Connecting to database..."
    )

    conn = db_connect()

    try:
        setup_db(conn)

        if RESET_MODEL_CLASS_ON_START:
            reset_model_class(
                conn
            )

        models = get_models(
            conn
        )

        print(
            f"Distinct models: "
            f"{len(models):,}"
        )

        session = requests.Session()

        try:
            missing_for_ai = []

            # ------------------------------------------------
            # PASS 1
            # ------------------------------------------------

            print()
            print("=" * 70)
            print("PASS 1: LOCAL NORMALIZATION + CARS-DATA")
            print("=" * 70)

            for index, (
                brand,
                model,
            ) in enumerate(
                models,
                start=1,
            ):

                print()
                print(
                    f"[{index}/{len(models)}] "
                    f"{brand} | {model}"
                )

                # We deliberately collect unresolved models
                # for small GPT batches.
                if normalize_text(brand) in SKIP_BRANDS:
                    process_one_model(
                        session,
                        conn,
                        brand,
                        model,
                    )
                    continue

                local = local_model_candidates(
                    brand,
                    model,
                )

                local_success = None

                if local:
                    local_success = try_candidates(
                        session,
                        conn,
                        brand,
                        model,
                        local,
                    )

                if local_success:
                    continue

                direct_success = try_candidates(
                    session,
                    conn,
                    brand,
                    model,
                    [
                        (
                            brand,
                            model,
                        )
                    ],
                )

                if direct_success:
                    continue

                missing_for_ai.append(
                    (
                        brand,
                        model,
                    )
                )

            print()
            print(
                f"Pass 1 unresolved: "
                f"{len(missing_for_ai):,}"
            )

            # ------------------------------------------------
            # PASS 2
            # ------------------------------------------------

            if missing_for_ai:

                if not OPENAI_API_KEY.strip():

                    print(
                        "OPENAI_API_KEY is empty. "
                        "Skipping GPT pass."
                    )

                else:

                    print()
                    print("=" * 70)
                    print("PASS 2: SMALL OPENAI NORMALIZATION")
                    print("=" * 70)

                    ai_results = openai_resolve_all(
                        session,
                        missing_for_ai,
                    )

                    print()
                    print(
                        f"GPT usable results: "
                        f"{len(ai_results):,}/"
                        f"{len(missing_for_ai):,}"
                    )

                    # ----------------------------------------
                    # Try GPT answers one by one.
                    # ----------------------------------------

                    for index, (
                        brand,
                        model,
                    ) in enumerate(
                        missing_for_ai,
                        start=1,
                    ):

                        print()
                        print(
                            f"[AI {index}/{len(missing_for_ai)}] "
                            f"{brand} | {model}"
                        )

                        ai_result = ai_results.get(
                            (
                                brand,
                                model,
                            )
                        )

                        process_one_model(
                            session,
                            conn,
                            brand,
                            model,
                            ai_result=ai_result,
                        )

            else:
                print(
                    "No unresolved models. "
                    "GPT pass not needed."
                )

        finally:
            session.close()

    finally:
        conn.close()

    print()
    print("=" * 70)
    print("DONE")
    print("=" * 70)


if __name__ == "__main__":
    main()
