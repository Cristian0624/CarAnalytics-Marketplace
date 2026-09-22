"""Read-only estimates built from the internal listings HTTP API."""

import math
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from statistics import mean, median

import httpx

from price_estimate_schemas import PriceEstimateRequest, PriceEstimateResponse


MIN_EXACT_COMPARABLES = 8
MAX_SIMILAR_COMPARABLES = 25
ENGINE_TOLERANCE = Decimal("0.3")
MIN_BARS, TARGET_BARS, MAX_BARS = 4, 6, 8

# Values checked against DISTINCT fuel_type in listings_cleaned. Unknown future
# fuels are never silently treated as combustion vehicles.
ICE_FUELS = {
    "benzină", "diesel", "gaz", "gaz / benzină (metan)",
    "gaz / benzină (propan)", "gaz/benzina (propan)",
}
DRIVETRAIN_GROUPS = {"Din față": "FWD", "Din spate": "RWD", "4x4": "4WD"}
# 4x2 does not distinguish front from rear drive; keep it as its own value.


class PriceEstimateError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def get_powertrain_group(fuel_type: str) -> str:
    value = fuel_type.strip().casefold()
    if value == "electricitate":
        return "EV"
    if "hybrid" in value or "hibrid" in value:
        return "HYBRID"
    if value in ICE_FUELS:
        return "ICE"
    raise ValueError(f"Unknown fuel_type: {fuel_type}")


def effective_year_range(target: PriceEstimateRequest) -> tuple[int, int]:
    match = re.search(r"\((\d{4})\s*[-–—]\s*(\d{4}|prezent|present)\)", target.generation, re.IGNORECASE)
    if match is None:
        raise PriceEstimateError(422, "Selected generation has no recognizable production year range")
    start = int(match[1])
    end = int(match[2]) if match[2].isdigit() else target.year_max
    lower, upper = max(target.year_min, start), min(target.year_max, end)
    if not lower <= target.year <= upper:
        raise PriceEstimateError(422, "Target year must fall within the selected generation and requested year range")
    return lower, upper


def drivetrain_score(target: str, candidate: str | None) -> float:
    if candidate is None:
        return 0.5
    target = DRIVETRAIN_GROUPS.get(target, target)
    candidate = DRIVETRAIN_GROUPS.get(candidate, candidate)
    if candidate == target:
        return 1.0
    if {target, candidate} <= {"AWD", "4WD"}:
        return 0.8
    if target in {"AWD", "4WD"} or candidate in {"AWD", "4WD"}:
        return 0.5
    if {target, candidate} == {"FWD", "RWD"}:
        return 0.25
    return 0.5


@dataclass
class Comparable:
    listing: dict
    price: float
    year: int
    mileage: int
    engine: Decimal | None
    direct: bool
    weight: float = 0.0


def relevance_weight(car: Comparable, target: PriceEstimateRequest, years: tuple[int, int], group: str) -> float:
    # Generation determines the initial direct pool, never fallback scoring.
    model_score = float(car.listing.get("brand") == target.brand and car.listing.get("model") == target.model)
    mileage_score = max(0.0, 1.0 - abs(car.mileage - target.mileage) /
                        max(target.mileage - target.mileage_min, target.mileage_max - target.mileage, 1))
    year_score = max(0.0, 1.0 - abs(car.year - target.year) /
                     max(target.year - years[0], years[1] - target.year, 1))
    engine_score = 1.0 if group == "EV" else max(
        0.0, 1.0 - float(abs(car.engine - target.engine) / ENGINE_TOLERANCE)
    )
    gearbox = car.listing.get("gearbox")
    gearbox_score = 0.5 if gearbox is None else float(gearbox == target.gearbox)
    return (
        0.50 * model_score
        + 0.20 * mileage_score
        + 0.10 * year_score
        + 0.10 * drivetrain_score(target.drivetrain, car.listing.get("drivetrain"))
        + 0.05 * engine_score
        + 0.05 * gearbox_score
    )


def percentile(prices: list[float], fraction: float) -> float:
    """Linear-interpolated, unweighted percentile for the IQR fences."""
    position = (len(prices) - 1) * fraction
    lower, upper = math.floor(position), math.ceil(position)
    return prices[lower] + (prices[upper] - prices[lower]) * (position - lower)


def remove_outliers(cars: list[Comparable]) -> list[Comparable]:
    prices = sorted(car.price for car in cars)
    q1, q3 = percentile(prices, 0.25), percentile(prices, 0.75)
    iqr = q3 - q1
    return [car for car in cars if q1 - 1.5 * iqr <= car.price <= q3 + 1.5 * iqr]


def weighted_percentile(cars: list[Comparable], fraction: float) -> float:
    ordered = sorted(cars, key=lambda car: car.price)
    threshold = fraction * sum(car.weight for car in ordered)
    cumulative = 0.0
    for car in ordered:
        cumulative += car.weight
        if cumulative >= threshold:
            return car.price
    return ordered[-1].price


def distribution(cars: list[Comparable]) -> dict:
    lowest, highest = min(car.price for car in cars), max(car.price for car in cars)
    if lowest == highest:
        # A zero-width market still needs a usable continuous axis.
        interval = 10 ** math.floor(math.log10(max(lowest * 0.01, 0.01)))
        start = max(0, (math.floor(lowest / interval) - 3) * interval)
        bar_count = TARGET_BARS
    else:
        raw_interval = (highest - lowest) / TARGET_BARS
        exponent = math.floor(math.log10(raw_interval))
        choices = []
        for power in range(exponent - 2, exponent + 3):
            for multiplier in (1, 2, 2.5, 5):
                width = multiplier * 10 ** power
                first = math.floor(lowest / width) * width
                last = math.ceil(highest / width) * width
                count = round((last - first) / width)
                if MIN_BARS <= count <= MAX_BARS:
                    choices.append((abs(count - TARGET_BARS), abs(width - raw_interval), width, first, count))
        _, _, interval, start, bar_count = min(choices)

    buckets = [[] for _ in range(bar_count)]
    for car in cars:
        index = min(math.floor((car.price - start) / interval), bar_count - 1)
        buckets[index].append(car)
    bars = []
    for index, bucket in enumerate(buckets):
        bars.append({
            "min_price": round(start + index * interval, 8),
            "max_price": round(start + (index + 1) * interval, 8),
            "count": len(bucket),
            "percentage": round(len(bucket) / len(cars) * 100, 1),
            "average_year": round(mean(car.year for car in bucket), 1) if bucket else None,
            "average_mileage": round(mean(car.mileage for car in bucket), 1) if bucket else None,
        })
    return {"interval": interval, "bar_count": bar_count, "bars": bars}


class PriceEstimateService:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def _get(self, path: str, params: dict):
        try:
            response = await self.client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PriceEstimateError(502, "Internal listings API could not supply comparison data") from exc

    @staticmethod
    def _validate_categories(target: PriceEstimateRequest, options: dict, group: str):
        for name in ("brand", "model", "generation", "fuel_type", "gearbox", "drivetrain", "body_type"):
            if getattr(target, name) not in options[name]:
                raise PriceEstimateError(422, f"{name} must be an exact database option for the selected vehicle")
        if group != "EV" and (target.engine is None or target.engine <= 0):
            raise PriceEstimateError(422, "A positive engine displacement is required for ICE and hybrid vehicles")
        if target.engine is not None and target.engine not in {Decimal(str(value)) for value in options["engine"]}:
            raise PriceEstimateError(422, "engine must be an exact database option")

    @staticmethod
    def _eligible(rows, target, years, group, direct, target_class=None):
        cars = []
        for row in rows:
            if row.get("body_type") != target.body_type:
                continue
            if not row.get("brand") or not row.get("model"):
                continue
            if direct and any(row.get(field) != getattr(target, field) for field in ("brand", "model", "generation")):
                continue
            if not direct and row.get("class") != target_class:
                continue
            try:
                price = float(row["price_eur"])
                year, mileage = row["year"], row["mileage"]
                if not math.isfinite(price) or price <= 0 or not isinstance(year, int) or not isinstance(mileage, int):
                    continue
                if not years[0] <= year <= years[1] or not target.mileage_min <= mileage <= target.mileage_max:
                    continue
                if get_powertrain_group(row["fuel_type"]) != group:
                    continue
                engine = None if group == "EV" else Decimal(str(row["engine"]))
                if group != "EV" and (not engine.is_finite() or engine <= 0 or abs(engine - target.engine) > ENGINE_TOLERANCE):
                    continue
            except (KeyError, TypeError, ValueError, InvalidOperation, AttributeError):
                continue
            car = Comparable(row, price, year, mileage, engine, direct)
            car.weight = relevance_weight(car, target, years, group)
            cars.append(car)
        return cars

    @staticmethod
    def _deduplicate(cars):
        ids, urls, fingerprints = set(), set(), set()
        result = []
        fields = ("brand", "model", "generation", "year", "mileage", "engine", "horsepower",
                  "fuel_type", "gearbox", "state", "registration_country", "drivetrain", "body_type",
                  "doors", "seats", "price_eur", "offer_type", "seller_type")
        for car in cars:
            row = car.listing
            identity, url = row.get("id"), row.get("url")
            fingerprint = tuple(row.get(field) for field in fields)
            if (identity is not None and identity in ids) or (url and url in urls) or fingerprint in fingerprints:
                continue
            if identity is not None:
                ids.add(identity)
            if url:
                urls.add(url)
            fingerprints.add(fingerprint)
            result.append(car)
        return result

    async def estimate(self, target: PriceEstimateRequest) -> PriceEstimateResponse:
        years = effective_year_range(target)
        try:
            group = get_powertrain_group(target.fuel_type)
        except ValueError as exc:
            raise PriceEstimateError(422, str(exc)) from exc
        options = await self._get("/listings/options", {
            "brand": target.brand, "model": target.model, "generation": target.generation,
        })
        self._validate_categories(target, options, group)
        params = {
            "body_types": target.body_type, "year_min": years[0], "year_max": years[1],
            "mileage_min": target.mileage_min, "mileage_max": target.mileage_max,
        }
        rows = await self._get("/listings", {
            **params, "brand": target.brand, "model": target.model, "generation": target.generation,
        })
        fetched = len(rows)
        exact = self._deduplicate(self._eligible(rows, target, years, group, direct=True))
        direct_count = len(exact)
        same_model_only = direct_count >= MIN_EXACT_COMPARABLES
        pool = exact
        eligible = direct_count
        if not same_model_only:
            classes = options["class"]
            if len(classes) != 1:
                raise PriceEstimateError(422, "Selected vehicle must have one unambiguous database class for fallback comparisons")
            fallback_rows = await self._get("/listings", {**params, "class": classes[0]})
            fetched += len(fallback_rows)
            candidates = self._deduplicate(exact + self._eligible(
                fallback_rows, target, years, group, direct=False, target_class=classes[0],
            ))
            similar = [car for car in candidates if not car.direct]
            eligible = len(candidates)
            similar.sort(key=lambda car: (-car.weight, car.listing["id"]))
            pool = exact + similar[:MAX_SIMILAR_COMPARABLES]
        if not pool:
            raise PriceEstimateError(404, "No eligible comparison listings were found")
        cleaned = remove_outliers(pool)
        if not cleaned or sum(car.weight for car in cleaned) <= 0:
            raise PriceEstimateError(404, "No comparison listings with usable relevance remain")
        prices = [car.price for car in cleaned]
        percentiles = {p: weighted_percentile(cleaned, p / 100) for p in (20, 30, 40, 50, 60, 70, 80)}
        same_count = sum(car.listing.get("brand") == target.brand and car.listing.get("model") == target.model for car in cleaned)
        message = ("Sufficient direct model comparisons were available."
                   if same_model_only else
                   f"Only {direct_count} direct model comparisons were available; compatible similar models were searched.")
        message += " Estimates reflect asking prices and do not guarantee sale prices or time to sell."
        return PriceEstimateResponse.model_validate({
            "estimate": {
                "market_price": percentiles[50],
                "sell_fast": {"min": percentiles[20], "max": percentiles[30], "percentile_range": "P20-P30"},
                "normal": {"min": percentiles[40], "max": percentiles[60], "percentile_range": "P40-P60"},
                "higher_asking": {"min": percentiles[70], "max": percentiles[80], "percentile_range": "P70-P80"},
            },
            "comparison": {
                "same_model_only": same_model_only, "same_model_count": same_count,
                "similar_model_count": len(cleaned) - same_count, "total_used": len(cleaned),
                "fetched": fetched, "eligible": eligible, "direct_comparables_available": direct_count,
                "outliers_removed": len(pool) - len(cleaned), "message": message,
            },
            "search": {
                "brand": target.brand, "model": target.model, "generation": target.generation,
                "target_year": target.year, "target_mileage": target.mileage,
                "requested_year_min": target.year_min, "requested_year_max": target.year_max,
                "effective_year_min": years[0], "effective_year_max": years[1],
                "mileage_min": target.mileage_min, "mileage_max": target.mileage_max,
            },
            "market_stats": {
                "average_price": round(mean(prices), 2), "median_price": median(prices),
                "lowest_price": min(prices), "highest_price": max(prices),
                "average_year": round(mean(car.year for car in cleaned), 1),
                "average_mileage": round(mean(car.mileage for car in cleaned), 1),
            },
            "distribution": distribution(cleaned),
        })
