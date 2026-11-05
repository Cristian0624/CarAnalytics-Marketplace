"""Parse and scrape live 999.md car listings for on-demand risk & deal analysis using httpx and stdlib."""
from decimal import Decimal, InvalidOperation
from html import unescape
import json
import re
import unicodedata
from urllib.parse import quote, urlparse

import httpx

BASE_URL = "https://999.md"
MDL_PER_EUR = 20.02
USD_PER_EUR = 1.16

PLACEHOLDER_BRANDS = {"alta marca", "alte marci"}
PLACEHOLDER_MODELS = {"alt model", "alte modele", "altele"}
PLACEHOLDER_GENERATIONS = {"toate generatiile", "alta generatie", "alte generatii"}

FEATURE_FIELDS = {
    20: "brand", 21: "model", 2095: "generation", 19: "year", 104: "mileage",
    2553: "engine", 107: "horsepower", 151: "fuel_type", 101: "gearbox",
    593: "state", 775: "registration_country", 108: "drivetrain", 102: "body_type",
    1: "offer_type", 795: "seller_type", 851: "doors", 846: "seats",
}


class InvalidListingUrlError(ValueError):
    """Raised when the supplied string is not a valid 999.md listing URL."""


class ListingNotFoundError(LookupError):
    """Raised when the 999.md listing does not exist or has been removed."""


class NonVehicleListingError(ValueError):
    """Raised when the 999.md page lacks required vehicle data (brand, model, or price)."""


def _strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _clean_text(value) -> str | None:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", unescape(str(value)).replace("\xa0", " ")).strip()
    return cleaned or None


def extract_999_listing_id(raw_url: str) -> int:
    """Validate a 999.md URL and extract its numeric listing ID."""
    if not raw_url or not str(raw_url).strip():
        raise InvalidListingUrlError("Introdu un link valid către un anunț de pe 999.md.")

    candidate = str(raw_url).strip()
    if re.match(r"^(?:www\.|m\.)?999\.md/", candidate, flags=re.IGNORECASE):
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)
    host = (parsed.hostname or "").lower()
    if host != "999.md" and not host.endswith(".999.md"):
        raise InvalidListingUrlError("Linkul trebuie să fie de pe 999.md (ex: https://999.md/ro/103948572).")

    match = re.search(r"/(?:ro/|ru/)?(\d{5,12})(?:[/?#]|$)", parsed.path or "")
    if not match:
        raise InvalidListingUrlError("Linkul 999.md nu conține un ID valid de anunț (ex: https://999.md/ro/103948572).")

    listing_id = int(match.group(1))
    if listing_id <= 0:
        raise InvalidListingUrlError("ID-ul anunțului 999.md este invalid.")
    return listing_id


def _decode_next_flight(html: str) -> dict:
    """Decode Next.js RSC self.__next_f.push chunks from raw HTML without external parsers."""
    chunks = []
    for match in re.finditer(r"self\.__next_f\.push\((\[.*?\])\)\s*;?\s*</script>", html, flags=re.DOTALL):
        try:
            item = json.loads(match.group(1))
        except (ValueError, TypeError):
            continue
        if isinstance(item, list) and len(item) == 2 and item[0] == 1 and isinstance(item[1], str):
            chunks.append(item[1])
    data = "".join(chunks).encode("utf-8")
    records = {}
    offset = 0
    while offset < len(data):
        header = re.match(rb"([0-9a-f]+):", data[offset:])
        if not header:
            end = data.find(b"\n", offset)
            if end < 0:
                break
            offset = end + 1
            continue
        key = header[1].decode()
        offset += header.end()
        text_header = re.match(rb"T([0-9a-f]+),", data[offset:])
        if text_header:
            offset += text_header.end()
            length = int(text_header[1], 16)
            records[key] = data[offset:offset + length].decode("utf-8", errors="replace")
            offset += length
            continue
        end = data.find(b"\n", offset)
        if end < 0:
            end = len(data)
        try:
            records[key] = json.loads(data[offset:end])
        except (ValueError, UnicodeDecodeError):
            pass
        offset = end + 1
    return records


def _find_ad(value, listing_id: int):
    if isinstance(value, dict):
        ad = value.get("adView")
        if isinstance(ad, dict) and str(ad.get("id")) == str(listing_id):
            return ad
        for child in value.values():
            found = _find_ad(child, listing_id)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find_ad(child, listing_id)
            if found:
                return found
    return None


def _scalar(value):
    while isinstance(value, dict):
        value = value.get("translated") if value.get("translated") is not None else value.get("value")
    return value if isinstance(value, (str, int, float, bool)) else None


def _mapping(value) -> dict:
    return value if isinstance(value, dict) else {}


def _number(value):
    value = _scalar(value)
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value).replace(",", "."))
        return float(result) if result.is_finite() else None
    except InvalidOperation:
        return None


def _text_value(value, records: dict) -> str | None:
    if isinstance(value, str) and re.fullmatch(r"\$[0-9a-f]+", value):
        value = records.get(value[1:])
    return value if isinstance(value, str) else None


def _extract_flight_metadata(html: str, listing_id: int) -> dict:
    records = _decode_next_flight(html)
    ad = _find_ad(records, listing_id)
    if not ad:
        return {}
    result = {}
    for group in ad.get("groups") or []:
        for control in _mapping(group).get("controls") or []:
            feature = _mapping(_mapping(control).get("feature"))
            field = FEATURE_FIELDS.get(feature.get("id"))
            if field:
                result[field] = _scalar(feature.get("value"))
                if field == "mileage":
                    distance = _number(result[field])
                    unit = _mapping(feature.get("value")).get("unit")
                    if distance is not None and unit in {"UNIT_MILE", "UNIT_MILES"}:
                        result[field] = round(distance * 1.609344)
    price = _mapping(_mapping(ad.get("price")).get("value"))
    unit = price.get("unit")
    if price.get("value") is not None:
        result["price"] = _number(price.get("value"))
    if isinstance(unit, str):
        result["currency"] = unit.removeprefix("UNIT_")
    body = _mapping(_mapping(ad.get("body")).get("value"))
    result["title"] = ad.get("title")
    result["vin"] = _scalar(ad.get("vinCode"))
    result["description_ro"] = _text_value(body.get("ro"), records)
    result["description_ru"] = _text_value(body.get("ru"), records)
    images = _mapping(ad.get("images")).get("value")
    if isinstance(images, list) and images and isinstance(images[0], str):
        result["image_url"] = "https://i.simpalsmedia.com/999.md/BoardImages/900x900/" + quote(images[0].split("?")[0], safe="")
    return {k: v for k, v in result.items() if v is not None}


def _get_meta(html: str, property_name: str) -> str | None:
    pattern1 = rf'<meta[^>]+property=["\']{re.escape(property_name)}["\'][^>]+content=["\']([^"\']+)["\']'
    pattern2 = rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(property_name)}["\']'
    for pat in (pattern1, pattern2):
        match = re.search(pat, html, flags=re.IGNORECASE)
        if match:
            return _clean_text(match.group(1))
    return None


def _extract_feature_map_from_html(html: str) -> dict[str, str]:
    result = {}
    for li_match in re.finditer(r"<li[^>]*__group__feature[^>]*>(.*?)</li>", html, flags=re.DOTALL | re.IGNORECASE):
        li_html = li_match.group(1)
        key_match = re.search(r"<span[^>]*__group__key[^>]*>(.*?)</span>", li_html, flags=re.DOTALL | re.IGNORECASE)
        if not key_match:
            continue
        key = _clean_text(re.sub(r"<[^>]+>", " ", key_match.group(1)))
        val_match = re.search(
            r"<(?:a|span)[^>]*__group__(?:link|value)[^>]*>(.*?)</(?:a|span)>",
            li_html,
            flags=re.DOTALL | re.IGNORECASE,
        )
        if key and val_match:
            val = _clean_text(re.sub(r"<[^>]+>", " ", val_match.group(1)))
            if val:
                result[key] = val
    return result


def _parse_decimal(value) -> float | None:
    if value is None:
        return None
    cleaned = str(value).replace("\xa0", "").replace(" ", "").replace(",", ".")
    match = re.search(r"\d+(?:\.\d+)?", cleaned)
    if not match:
        return None
    try:
        return float(match.group(0))
    except ValueError:
        return None


def _parse_integer(value) -> int | None:
    if value is None:
        return None
    match = re.search(r"\d[\d\s.,]*", str(value))
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


def _parse_year(value) -> int | None:
    if value is None:
        return None
    match = re.search(r"\b(?:19|20)\d{2}\b", str(value))
    return int(match.group(0)) if match else None


def _parse_mileage(value) -> int | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    match = re.search(r"(\d[\d\s.,]*)\s*(?:km|км)\b", str(value), flags=re.IGNORECASE)
    if match:
        return _parse_integer(match.group(1))
    return _parse_integer(value)


def _normalize_engine(value) -> float | None:
    val = _parse_decimal(value)
    if val is None or val < 0:
        return None
    if val > 20 and val <= 20000:
        val = round(val / 1000.0, 1)
    return val if 0 <= val <= 20 else None


def _convert_to_eur(price: float | None, currency: str | None) -> float | None:
    if price is None or price <= 0:
        return None
    curr = (currency or "EUR").strip().upper()
    if curr in {"EUR", "€"}:
        return round(float(price), 2)
    if curr in {"MDL", "LEI"}:
        return round(float(price) / MDL_PER_EUR, 2)
    if curr in {"USD", "$"}:
        return round(float(price) / USD_PER_EUR, 2)
    return None


def parse_999_listing_html(html: str, listing_id: int) -> dict:
    """Extract and normalize vehicle details from 999.md listing HTML."""
    features = _extract_feature_map_from_html(html)

    amount_meta = _get_meta(html, "product:price:amount")
    currency_meta = _get_meta(html, "product:price:currency")

    brand = _get_meta(html, "product:brand") or features.get("Marcă")
    model = _get_meta(html, "product:custom_label_2") or features.get("Model")

    raw = {
        "brand": brand,
        "model": model,
        "generation": features.get("Generație"),
        "price": _parse_decimal(amount_meta),
        "currency": currency_meta,
        "year": _parse_year(features.get("An de fabricație")),
        "mileage": _parse_mileage(features.get("Rulaj")),
        "engine": features.get("Motor"),
        "horsepower": _parse_integer(features.get("Putere")),
        "fuel_type": features.get("Tip combustibil"),
        "gearbox": features.get("Cutie de viteze"),
        "drivetrain": features.get("Tip tracțiune"),
        "body_type": features.get("Tip caroserie"),
        "state": features.get("Stare"),
        "registration_country": features.get("Înmatriculare"),
        "doors": _parse_integer(features.get("Număr uși")),
        "seats": _parse_integer(features.get("Număr de locuri")),
        "offer_type": features.get("Tip ofertă"),
        "seller_type": features.get("Autorul anunțului"),
        "title": _get_meta(html, "og:title"),
        "description_ro": None,
        "description_ru": None,
        "vin": None,
        "image_url": _get_meta(html, "og:image"),
    }

    metadata = _extract_flight_metadata(html, listing_id)
    for key, val in metadata.items():
        if val is not None:
            raw[key] = val

    brand_clean = _clean_text(raw.get("brand"))
    model_clean = _clean_text(raw.get("model"))
    gen_clean = _clean_text(raw.get("generation"))

    if brand_clean and _strip_accents(brand_clean).lower() in PLACEHOLDER_BRANDS:
        brand_clean = None
    if model_clean and _strip_accents(model_clean).lower() in PLACEHOLDER_MODELS:
        model_clean = None
    if gen_clean and _strip_accents(gen_clean).lower() in PLACEHOLDER_GENERATIONS:
        gen_clean = None

    orig_price = float(raw["price"]) if raw.get("price") is not None else None
    orig_currency = _clean_text(raw.get("currency")) or "EUR"
    price_eur = _convert_to_eur(orig_price, orig_currency)

    if not brand_clean or not model_clean or price_eur is None or price_eur <= 0:
        raise NonVehicleListingError(
            "Anunțul 999.md nu conține datele auto obligatorii (marcă, model și preț)."
        )

    year_val = _parse_year(raw.get("year")) if not isinstance(raw.get("year"), int) else raw.get("year")
    mileage_val = _parse_mileage(raw.get("mileage"))
    mileage_was_corrected = False
    if mileage_val is not None and 70 <= mileage_val <= 700 and year_val is not None and year_val < 2020:
        mileage_val *= 1000
        mileage_was_corrected = True

    fuel_clean = _clean_text(raw.get("fuel_type"))
    gearbox_clean = _clean_text(raw.get("gearbox"))
    if not gearbox_clean and fuel_clean and fuel_clean.lower() in {"electricitate", "plug-in hybrid", "plug-in hibrid"}:
        gearbox_clean = "Automată"

    engine_val = _normalize_engine(raw.get("engine"))
    vin_clean = _clean_text(raw.get("vin"))

    return {
        "listing_id": int(listing_id),
        "url": f"{BASE_URL}/ro/{listing_id}",
        "source": "live_scrape",
        "title": _clean_text(raw.get("title")),
        "image_url": _clean_text(raw.get("image_url")),
        "brand": brand_clean,
        "model": model_clean,
        "generation": gen_clean,
        "price": price_eur,
        "original_price": orig_price,
        "original_currency": orig_currency,
        "year": year_val,
        "mileage": mileage_val,
        "mileage_was_corrected": mileage_was_corrected,
        "engine": engine_val,
        "horsepower": _parse_integer(raw.get("horsepower")),
        "fuel_type": fuel_clean,
        "gearbox": gearbox_clean,
        "drivetrain": _clean_text(raw.get("drivetrain")),
        "body_type": _clean_text(raw.get("body_type")),
        "state": _clean_text(raw.get("state")),
        "registration_country": _clean_text(raw.get("registration_country")),
        "doors": _parse_integer(raw.get("doors")),
        "seats": _parse_integer(raw.get("seats")),
        "offer_type": _clean_text(raw.get("offer_type")),
        "seller_type": _clean_text(raw.get("seller_type")),
        "description_ro": _clean_text(raw.get("description_ro")),
        "description_ru": _clean_text(raw.get("description_ru")),
        "vin": vin_clean,
        "has_vin": bool(vin_clean),
    }


def scrape_live_999_listing(listing_id: int) -> dict:
    """Fetch a single 999.md listing over HTTPS using httpx and return normalized vehicle fields."""
    url = f"{BASE_URL}/ro/{listing_id}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/151.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://999.md/ro/list/transport/cars",
    }
    try:
        response = httpx.get(url, headers=headers, timeout=12.0, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Nu am putut accesa 999.md: {exc}") from exc

    if response.status_code in {404, 410}:
        raise ListingNotFoundError("Anunțul 999.md nu a fost găsit sau nu mai este activ.")
    if response.status_code != 200:
        raise RuntimeError(f"999.md a returnat codul HTTP {response.status_code}.")

    return parse_999_listing_html(response.text, listing_id)
