"""Read-only estimates built from the internal listings HTTP API."""

import math
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from statistics import mean, median

import httpx

from price_estimate_schemas import PriceEstimateRequest, PriceEstimateResponse


MIN_DIRECT_COMPARABLES = 8
MIN_ACCEPTABLE_POOL = 7
MIN_EFFECTIVE_COMPARABLES = 5
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
    raise ValueError("Tipul de combustibil nu este recunoscut. Selectează o opțiune din listă.")


def effective_year_range(target: PriceEstimateRequest) -> tuple[int, int]:
    match = re.search(r"\((\d{4})\s*[-–—]\s*(\d{4}|prezent|present)\)", target.generation, re.IGNORECASE)
    if match is None:
        raise PriceEstimateError(422, "Generația selectată nu are un interval de fabricație recunoscut. Selectează o generație din listă.")
    start = int(match[1])
    end = int(match[2]) if match[2].isdigit() else target.year_max
    lower, upper = max(target.year_min, start), min(target.year_max, end)
    if not lower <= target.year <= upper:
        generation_end = match[2] if match[2].isdigit() else "prezent"
        raise PriceEstimateError(422, f"Anul de fabricație trebuie să corespundă generației selectate ({start}–{generation_end}) și intervalului de ani ales.")
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
    year: int | None
    mileage: int | None
    engine: Decimal | None
    direct: bool
    weight: float = 0.0
    source: str = "normal_fallback"


def proximity_score(value, target, scale):
    """Smoothly reduce similarity without excluding a distant comparison."""
    if value is None:
        return 0.5
    distance = abs(float(value) - float(target)) / scale
    return 1.0 / (1.0 + distance * distance)


def configuration_score(car: Comparable, target: PriceEstimateRequest, group: str) -> float:
    matches = []
    for field in ("fuel_type", "gearbox", "body_type"):
        value = car.listing.get(field)
        matches.append(0.5 if value is None else float(value == getattr(target, field)))
    matches.append(drivetrain_score(target.drivetrain, car.listing.get("drivetrain")))
    engine_score = 1.0 if group == "EV" else proximity_score(
        car.engine, target.engine, max(0.3, float(target.engine) * 0.30),
    )
    matches.append(engine_score)
    return mean(matches)


def distance_weight(value, target, scale):
    if value is None:
        return 0.5
    # Keep even very distant comparisons positive without numerical underflow.
    distance = min(abs(float(value) - float(target)) / scale, 100)
    return math.exp(-distance)


def relevance_weight(
    car: Comparable, target: PriceEstimateRequest, group: str,
    comparison_mileage: int | None = None,
) -> float:
    # No hard exclusions: relevance decreases gradually over three years and
    # 100,000 km. Configuration changes the weight by at most 5%.
    mileage = target.mileage if comparison_mileage is None else comparison_mileage
    year_score = distance_weight(car.year, target.year, 3.0)
    mileage_score = distance_weight(car.mileage, mileage, 100000)
    configuration = 0.95 + 0.05 * configuration_score(car, target, group)
    return year_score * mileage_score * configuration


def weight_comparisons(cars: list[Comparable], target: PriceEstimateRequest, group: str):
    mileages = [car.mileage for car in cars if car.mileage is not None]
    comparison_mileage = target.mileage
    if mileages:
        # Beyond observed mileage, retain the nearest boundary comparison.
        # Do not invent a depreciation rate or drift back to the group median.
        comparison_mileage = max(min(mileages), min(target.mileage, max(mileages)))
    for car in cars:
        car.weight = relevance_weight(car, target, group, comparison_mileage)


def effective_sample_size(cars: list[Comparable]) -> float:
    """Describe how evenly the comparison weights are distributed."""
    weights = [car.weight for car in cars]
    squared_sum = sum(weight * weight for weight in weights)
    return sum(weights) ** 2 / squared_sum if squared_sum else 0.0


def near_engine_count(cars: list[Comparable], target: PriceEstimateRequest, group: str) -> int:
    if group == "EV":
        return len(cars)
    tolerance = max(Decimal("0.3"), target.engine * Decimal("0.30"))
    return sum(car.engine is not None and abs(car.engine - target.engine) <= tolerance for car in cars)


def sufficient_comparisons(cars: list[Comparable]) -> bool:
    return len(cars) >= MIN_ACCEPTABLE_POOL


def weighted_percentile(cars: list[Comparable], fraction: float) -> float:
    """Interpolate between prices at the centres of their cumulative weights."""
    ordered = sorted(cars, key=lambda car: car.price)
    total_weight = sum(car.weight for car in ordered)
    cumulative = 0.0
    previous_position = 0.0
    previous_price = ordered[0].price
    for car in ordered:
        cumulative += car.weight
        position = (cumulative - car.weight / 2) / total_weight
        if fraction <= position:
            # Clamp below the first observation; every other segment is linear.
            if fraction <= previous_position:
                return previous_price
            progress = (fraction - previous_position) / (position - previous_position)
            return previous_price + progress * (car.price - previous_price)
        previous_position = position
        previous_price = car.price
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
            "average_year": average_feature(bucket, "year"),
            "average_mileage": average_feature(bucket, "mileage"),
        })
    return {"interval": interval, "bar_count": bar_count, "bars": bars}


def average_feature(cars: list[Comparable], field: str) -> float | None:
    values = [getattr(car, field) for car in cars if getattr(car, field) is not None]
    return round(mean(values), 1) if values else None


def is_close_comparison(car: Comparable, target: PriceEstimateRequest) -> bool:
    return (
        car.year is not None and abs(car.year - target.year) <= 2
        and car.mileage is not None and abs(car.mileage - target.mileage) <= max(60000, target.mileage * 0.30)
    )


class PriceEstimateService:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def _get(self, path: str, params: dict):
        try:
            response = await self.client.get(path, params=params)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PriceEstimateError(502, "Datele de comparație nu au putut fi încărcate. Încearcă din nou mai târziu.") from exc

    @staticmethod
    def _validate_categories(target: PriceEstimateRequest, options: dict, group: str):
        labels = {"brand": "marca", "model": "modelul", "generation": "generația",
                  "fuel_type": "combustibilul", "gearbox": "cutia de viteze",
                  "drivetrain": "tracțiunea", "body_type": "caroseria"}
        for name in ("brand", "model", "generation", "fuel_type", "gearbox", "drivetrain", "body_type"):
            if getattr(target, name) not in options[name]:
                raise PriceEstimateError(422, f"Selectează {labels[name]} din opțiunile disponibile pentru mașina aleasă.")
        if group != "EV" and (target.engine is None or target.engine <= 0):
            raise PriceEstimateError(422, "Capacitatea motorului trebuie să fie mai mare decât zero pentru mașinile cu motor termic sau hibrid.")
        if group != "EV" and target.engine not in {Decimal(str(value)) for value in options["engine"]}:
            raise PriceEstimateError(422, "Selectează capacitatea motorului din opțiunile disponibile.")

    @staticmethod
    def _eligible(rows, target, group):
        cars = []
        for row in rows:
            if any(row.get(field) != getattr(target, field) for field in (
                "brand", "model", "generation",
            )):
                continue
            try:
                price = float(row["price_eur"])
                if not math.isfinite(price) or price <= 0:
                    continue
            except (KeyError, TypeError, ValueError):
                continue
            year = row.get("year") if isinstance(row.get("year"), int) else None
            mileage = row.get("mileage") if isinstance(row.get("mileage"), int) else None
            try:
                engine = Decimal(str(row.get("engine")))
                if not engine.is_finite() or engine <= 0:
                    engine = None
            except (TypeError, ValueError, InvalidOperation):
                engine = None
            car = Comparable(row, price, year, mileage, engine, False)
            car.direct = is_close_comparison(car, target)
            car.source = "direct" if car.direct else "normal_fallback"
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

    @staticmethod
    def _comparison_state(count, close_count, effective_count):
        limited = (
            count < MIN_DIRECT_COMPARABLES
            or close_count < min(3, count)
            or effective_count < MIN_EFFECTIVE_COMPARABLES
        )
        if count == 0:
            mode = "no_comparables"
            message = "Nu există suficiente date pentru o estimare corectă. Nu există anunțuri cu preț disponibil în grupul selectat; sunt necesare minimum 7."
        elif count == 1:
            mode = "single_comparable"
            message = "Nu există suficiente date pentru o estimare corectă. Există un singur anunț în grupul selectat; sunt necesare minimum 7."
        elif count < MIN_ACCEPTABLE_POOL:
            mode = "very_limited"
            message = f"Nu există suficiente date pentru o estimare corectă. Doar {count} anunțuri în grupul selectat; sunt necesare minimum 7."
        else:
            mode = "direct" if close_count == count else "normal_fallback"
            message = (f"Estimare din {count} anunțuri cu aceeași marcă, același model și aceeași generație. "
                       "Anul și kilometrajul apropiate cântăresc mai mult.")
            if limited:
                message += " Date de piață limitate; estimare orientativă."
            message += " Prețuri cerute, fără garanția vânzării."
        return mode, limited, message

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
            "brand": target.brand, "model": target.model, "generation": target.generation,
        }
        rows = await self._get("/listings", params)
        fetched = len(rows)
        cleaned = self._deduplicate(self._eligible(rows, target, group))
        weight_comparisons(cleaned, target, group)
        # Generation variants can legitimately have very different prices.
        # Weighted percentiles are robust without deleting those variants by IQR.
        quality_ok = sufficient_comparisons(cleaned)
        direct_count = sum(car.direct for car in cleaned)
        effective_count = effective_sample_size(cleaned)
        mode, limited, message = self._comparison_state(len(cleaned), direct_count, effective_count)
        observed_years = [car.year for car in cleaned if car.year is not None]
        observed_mileages = [car.mileage for car in cleaned if car.mileage is not None]
        response = {
            "estimate_available": quality_ok,
            "estimate": None,
            "reference_price": cleaned[0].price if len(cleaned) == 1 else None,
            "market_stats": None,
            "distribution": None,
            "comparison": {
                "comparison_mode": mode, "limited_market_data": limited,
                "direct_count": sum(car.source == "direct" for car in cleaned),
                "normal_fallback_added": sum(car.source == "normal_fallback" for car in cleaned),
                "emergency_fallback_added": sum(car.source == "emergency_fallback" for car in cleaned),
                "same_model_only": True, "same_model_count": len(cleaned),
                "similar_model_count": 0, "total_used": len(cleaned),
                "effective_sample_size": round(effective_count, 2),
                "near_engine_count": near_engine_count(cleaned, target, group),
                "fetched": fetched, "eligible": len(cleaned), "direct_comparables_available": direct_count,
                "outliers_removed": 0, "message": message,
            },
            "search": {
                "brand": target.brand, "model": target.model, "generation": target.generation,
                "target_year": target.year, "target_mileage": target.mileage,
                "requested_year_min": target.year_min, "requested_year_max": target.year_max,
                "effective_year_min": min(observed_years) if observed_years else years[0],
                "effective_year_max": max(observed_years) if observed_years else years[1],
                "mileage_min": min(observed_mileages) if observed_mileages else 0,
                "mileage_max": max(observed_mileages) if observed_mileages else 0,
            },
        }
        if not quality_ok:
            return PriceEstimateResponse.model_validate(response)

        prices = [car.price for car in cleaned]
        percentiles = {p: weighted_percentile(cleaned, p / 100) for p in (20, 30, 40, 50, 60, 70, 80)}
        response.update({
            "estimate": {
                "market_price": percentiles[50],
                "sell_fast": {"min": percentiles[20], "max": percentiles[30], "percentile_range": "P20-P30"},
                "normal": {"min": percentiles[40], "max": percentiles[60], "percentile_range": "P40-P60"},
                "higher_asking": {"min": percentiles[70], "max": percentiles[80], "percentile_range": "P70-P80"},
            },
            "market_stats": {
                "average_price": round(mean(prices), 2), "median_price": median(prices),
                "lowest_price": min(prices), "highest_price": max(prices),
                "average_year": average_feature(cleaned, "year"),
                "average_mileage": average_feature(cleaned, "mileage"),
            },
            "distribution": distribution(cleaned),
        })
        return PriceEstimateResponse.model_validate(response)
