"""Read public advert data; deliberately ignore safety/comfort equipment flags."""
import json
import re
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, urlparse

from bs4 import BeautifulSoup


FEATURE_FIELDS = {
    20: "brand", 21: "model", 2095: "generation", 19: "year", 104: "mileage",
    2553: "engine", 107: "horsepower", 151: "fuel_type", 101: "gearbox",
    593: "state", 775: "registration_country", 108: "drivetrain", 102: "body_type",
    1: "offer_type", 795: "seller_type", 851: "doors", 846: "seats",
    1761: "availability", 1763: "origin_country", 1196: "steering_wheel", 17: "color",
    2513: "range_km", 2554: "battery_kwh", 2555: "fast_charge_minutes", 7: "region",
}


def decode_flight(soup):
    """Decode JSON pushes, never execute scripts. Text records use UTF-8 byte lengths."""
    chunks = []
    for script in soup.find_all("script"):
        text = script.string or script.get_text()
        match = re.fullmatch(r"\s*self\.__next_f\.push\((.*)\);?\s*", text, re.S)
        if not match:
            continue
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
            records[key] = data[offset:offset + length].decode("utf-8")
            offset += length
            continue
        end = data.find(b"\n", offset)
        if end < 0:
            end = len(data)
        try:
            records[key] = json.loads(data[offset:end])
        except (ValueError, UnicodeDecodeError):
            pass  # Module references and other RSC control records are not advert data.
        offset = end + 1
    return records


def find_ad(value, listing_id):
    if isinstance(value, dict):
        ad = value.get("adView")
        if isinstance(ad, dict) and str(ad.get("id")) == str(listing_id):
            return ad
        for child in value.values():
            found = find_ad(child, listing_id)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = find_ad(child, listing_id)
            if found:
                return found
    return None


def scalar(value):
    while isinstance(value, dict):
        value = value.get("translated") if value.get("translated") is not None else value.get("value")
    return value if isinstance(value, (str, int, float, bool)) else None


def mapping(value):
    return value if isinstance(value, dict) else {}


def number(value):
    value = scalar(value)
    if value is None or isinstance(value, bool):
        return None
    try:
        result = Decimal(str(value).replace(",", "."))
        return result if result.is_finite() else None
    except InvalidOperation:
        return None


def text_value(value, records):
    if isinstance(value, str) and re.fullmatch(r"\$[0-9a-f]+", value):
        value = records.get(value[1:])
    return value if isinstance(value, str) else None


def public_metadata(html, listing_id):
    soup = BeautifulSoup(html, "html.parser")
    records = decode_flight(soup)
    ad = find_ad(records, listing_id)
    if not ad:
        return {}
    result = {}
    for group in ad.get("groups") or []:
        for control in mapping(group).get("controls") or []:
            feature = mapping(mapping(control).get("feature"))
            field = FEATURE_FIELDS.get(feature.get("id"))
            if field:
                result[field] = scalar(feature.get("value"))
                if field == "mileage":
                    distance = number(result[field])
                    unit = mapping(feature.get("value")).get("unit")
                    if distance is not None and unit in {"UNIT_MILE", "UNIT_MILES"}:
                        result[field] = round(distance * Decimal("1.609344"))
    for field in ("year", "mileage", "horsepower", "doors", "seats"):
        if result.get(field) is not None:
            try:
                result[field] = int(result[field])
            except (ValueError, TypeError, OverflowError):
                result[field] = None
    if result.get("engine") is not None:
        match = re.search(r"\d+(?:[.,]\d+)?", str(result["engine"]))
        result["engine"] = match[0].replace(",", ".") if match else None
    for field in ("range_km", "battery_kwh", "fast_charge_minutes"):
        result[field] = number(result.get(field))
    price = mapping(mapping(ad.get("price")).get("value"))
    unit = price.get("unit")
    result.update(price=number(price.get("value")), currency=unit.removeprefix("UNIT_") if isinstance(unit, str) else None,
                  price_negotiable=price.get("bargain"), price_mode=price.get("mode"),
                  down_payment=number(price.get("down_payment")), old_price=ad.get("oldPrice"))
    owner = mapping(ad.get("owner"))
    business = mapping(owner.get("business"))
    body = mapping(mapping(ad.get("body")).get("value"))
    vin = scalar(ad.get("vinCode"))
    result.update(
        title=ad.get("title"), vin=vin,
        description_ro=text_value(body.get("ro"), records),
        description_ru=text_value(body.get("ru"), records),
        seller_id=owner.get("id"), seller_username=owner.get("login"),
        seller_account_created=owner.get("createdDate"), seller_avatar=owner.get("avatar"),
        seller_verified=mapping(owner.get("verification")).get("isVerified"),
        seller_business_id=scalar(business.get("id")), seller_business_plan=scalar(business.get("plan")),
        contact_person=scalar(ad.get("contactPerson")), company=scalar(ad.get("company")),
        contact_email=scalar(ad.get("email")),
        phone_numbers=mapping(mapping(ad.get("phoneNumbers")).get("value")).get("phone_numbers"),
        posted_at_source=ad.get("posted"), updated_at_source=ad.get("resetedRedesign") or ad.get("reseted"),
        expires_at_source=ad.get("expire"), source_state=ad.get("state"),
        source_is_expired=ad.get("isExpired"),
    )
    images = mapping(ad.get("images")).get("value")
    if isinstance(images, list) and images and isinstance(images[0], str):
        result["image_url"] = "https://i.simpalsmedia.com/999.md/BoardImages/900x900/" + quote(images[0].split("?")[0], safe="")
    if not result.get("image_url"):
        image = soup.find("meta", property="og:image")
        url = image.get("content") if image else None
        if url and urlparse(url).scheme == "https":
            result["image_url"] = url
    return result
