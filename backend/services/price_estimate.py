"""Read-only estimates built from the internal listings HTTP API."""

import math
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from statistics import mean, median

import httpx

from price_estimate_schemas import PriceEstimateRequest, PriceEstimateResponse


MIN_DIRECT_COMPARABLES = 8
MIN_ACCEPTABLE_POOL = 5
MAX_SIMILAR_COMPARABLES = 25
ENGINE_TOLERANCE = Decimal("0.3")
MIN_BARS, TARGET_BARS, MAX_BARS = 4, 6, 8


ICE_FUELS = {
    "benzină",
    "diesel",
    "gaz",
    "gaz / benzină (metan)",
    "gaz / benzină (propan)",
    "gaz/benzina (propan)",
}

DRIVETRAIN_GROUPS = {
    "Din față": "FWD",
    "Din spate": "RWD",
    "4x4": "4WD",
}


class PriceEstimateError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def normal_fallback_engine_tolerance(engine: Decimal | float) -> Decimal:
    engine = Decimal(str(engine))

    for ceiling, tolerance in (
        ("1.6", "0.3"),
        ("2.0", "0.4"),
        ("2.5", "0.5"),
        ("3.0", "0.6"),
        ("4.0", "0.8"),
    ):
        if engine <= Decimal(ceiling):
            return Decimal(tolerance)

    return Decimal("1.2")


def emergency_fallback_engine_tolerance(engine: Decimal | float) -> Decimal:
    engine = Decimal(str(engine))

    for ceiling, tolerance in (
        ("1.6", "0.3"),
        ("2.0", "0.4"),
        ("2.5", "0.6"),
        ("3.0", "0.8"),
        ("4.0", "1.2"),
    ):
        if engine <= Decimal(ceiling):
            return Decimal(tolerance)

    return Decimal("2.0")


def get_powertrain_group(fuel_type: str) -> str:
    value = fuel_type.strip().casefold()

    if value == "electricitate":
        return "EV"

    if "hybrid" in value or "hibrid" in value:
        return "HYBRID"

    if value in ICE_FUELS:
        return "ICE"

    raise ValueError(f"Unknown fuel_type: {fuel_type}")


def effective_year_range(
    target: PriceEstimateRequest,
) -> tuple[int, int]:
    match = re.search(
        r"\((\d{4})\s*[-–—]\s*(\d{4}|prezent|present)\)",
        target.generation,
        re.IGNORECASE,
    )

    if match is None:
        raise PriceEstimateError(
            422,
            "Selected generation has no recognizable production year range",
        )

    start = int(match[1])
    end = int(match[2]) if match[2].isdigit() else target.year_max

    lower = max(target.year_min, start)
    upper = min(target.year_max, end)

    if not lower <= target.year <= upper:
        raise PriceEstimateError(
            422,
            "Anul vizat trebuie să se încadreze în generația selectată și în intervalul de ani solicitat.",
        )

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
    source: str = "normal_fallback"


def relevance_weight(
    car: Comparable,
    target: PriceEstimateRequest,
    years: tuple[int, int],
    group: str,
) -> float:
    model_score = float(
        car.listing.get("brand") == target.brand
        and car.listing.get("model") == target.model
    )

    mileage_score = max(
        0.0,
        1.0
        - abs(car.mileage - target.mileage)
        / max(
            target.mileage - target.mileage_min,
            target.mileage_max - target.mileage,
            1,
        ),
    )

    year_score = max(
        0.0,
        1.0
        - abs(car.year - target.year)
        / max(
            target.year - years[0],
            years[1] - target.year,
            1,
        ),
    )

    if target.engine is None or group == "EV":
        engine_score = 0.5
    elif car.engine is None:
        engine_score = 0.0
    else:
        engine_score = max(
            0.0,
            1.0
            - float(abs(car.engine - target.engine) / ENGINE_TOLERANCE),
        )

    gearbox = car.listing.get("gearbox")
    gearbox_score = (
        0.5 if gearbox is None else float(gearbox == target.gearbox)
    )

    return (
        0.50 * model_score
        + 0.20 * mileage_score
        + 0.10 * year_score
        + 0.10 * drivetrain_score(
            target.drivetrain,
            car.listing.get("drivetrain"),
        )
        + 0.05 * engine_score
        + 0.05 * gearbox_score
    )


def percentile(prices: list[float], fraction: float) -> float:
    position = (len(prices) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)

    return prices[lower] + (
        prices[upper] - prices[lower]
    ) * (position - lower)


def remove_outliers(cars: list[Comparable]) -> list[Comparable]:
    if len(cars) < 2:
        return list(cars)

    prices = sorted(car.price for car in cars)

    q1 = percentile(prices, 0.25)
    q3 = percentile(prices, 0.75)
    iqr = q3 - q1

    return [
        car
        for car in cars
        if q1 - 1.5 * iqr <= car.price <= q3 + 1.5 * iqr
    ]


def weighted_percentile(
    cars: list[Comparable],
    fraction: float,
) -> float:
    ordered = sorted(cars, key=lambda car: car.price)
    threshold = fraction * sum(car.weight for car in ordered)

    cumulative = 0.0

    for car in ordered:
        cumulative += car.weight

        if cumulative >= threshold:
            return car.price

    return ordered[-1].price


def distribution(cars: list[Comparable]) -> dict:
    lowest = min(car.price for car in cars)
    highest = max(car.price for car in cars)

    if lowest == highest:
        interval = 10 ** math.floor(
            math.log10(max(lowest * 0.01, 0.01))
        )
        start = max(
            0,
            (math.floor(lowest / interval) - 3) * interval,
        )
        bar_count = TARGET_BARS
    else:
        raw_interval = (highest - lowest) / TARGET_BARS
        exponent = math.floor(math.log10(raw_interval))
        choices = []

        for power in range(exponent - 2, exponent + 3):
            for multiplier in (1, 2, 2.5, 5):
                width = multiplier * 10**power
                first = math.floor(lowest / width) * width
                last = math.ceil(highest / width) * width
                count = round((last - first) / width)

                if MIN_BARS <= count <= MAX_BARS:
                    choices.append(
                        (
                            abs(count - TARGET_BARS),
                            abs(width - raw_interval),
                            width,
                            first,
                            count,
                        )
                    )

        _, _, interval, start, bar_count = min(choices)

    buckets = [[] for _ in range(bar_count)]

    for car in cars:
        index = min(
            math.floor((car.price - start) / interval),
            bar_count - 1,
        )
        buckets[index].append(car)

    bars = []

    for index, bucket in enumerate(buckets):
        bars.append(
            {
                "min_price": round(
                    start + index * interval,
                    8,
                ),
                "max_price": round(
                    start + (index + 1) * interval,
                    8,
                ),
                "count": len(bucket),
                "percentage": round(
                    len(bucket) / len(cars) * 100,
                    1,
                ),
                "average_year": (
                    round(
                        mean(car.year for car in bucket),
                        1,
                    )
                    if bucket
                    else None
                ),
                "average_mileage": (
                    round(
                        mean(car.mileage for car in bucket),
                        1,
                    )
                    if bucket
                    else None
                ),
            }
        )

    return {
        "interval": interval,
        "bar_count": bar_count,
        "bars": bars,
    }


class PriceEstimateService:
    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def _get(self, path: str, params: dict):
        try:
            response = await self.client.get(
                path,
                params=params,
            )
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise PriceEstimateError(
                502,
                "API-ul pentru listările interne nu a putut furniza date de comparare.",
            ) from exc

    @staticmethod
    def _validate_categories(
        target: PriceEstimateRequest,
        options: dict,
        group: str,
    ):
        for name in (
            "brand",
            "model",
            "generation",
            "fuel_type",
            "gearbox",
            "drivetrain",
            "body_type",
        ):
            if getattr(target, name) not in options[name]:
                raise PriceEstimateError(
                    422,
                    f"{name} trebuie să fie o opțiune exactă din baza de date pentru vehiculul selectat",
                )

        # Engine is optional.
        # If supplied, it must be a valid database option.
        if target.engine is not None:
            if group != "EV" and target.engine <= 0:
                raise PriceEstimateError(
                    422,
                    "Capacitatea cilindrică a motorului trebuie să fie pozitivă.",
                )

            if target.engine not in {
                Decimal(str(value))
                for value in options["engine"]
            }:
                raise PriceEstimateError(
                    422,
                    "motorul trebuie să fie o opțiune exactă de bază de date.",
                )

    @staticmethod
    def _eligible(
        rows,
        target,
        years,
        group,
        direct,
        target_class=None,
        engine_tolerance=ENGINE_TOLERANCE,
        source="normal_fallback",
    ):
        cars = []

        for row in rows:
            if row.get("body_type") != target.body_type:
                continue

            if not row.get("brand") or not row.get("model"):
                continue

            if direct and any(
                row.get(field) != getattr(target, field)
                for field in (
                    "brand",
                    "model",
                    "generation",
                )
            ):
                continue

            if not direct and row.get("class") != target_class:
                continue

            try:
                price = float(row["price_eur"])
                year = row["year"]
                mileage = row["mileage"]

                if (
                    not math.isfinite(price)
                    or price <= 0
                    or not isinstance(year, int)
                    or not isinstance(mileage, int)
                ):
                    continue

                if not years[0] <= year <= years[1]:
                    continue

                if not target.mileage_min <= mileage <= target.mileage_max:
                    continue

                if get_powertrain_group(row["fuel_type"]) != group:
                    continue

                if group == "EV":
                    engine = None
                else:
                    raw_engine = row.get("engine")

                    if raw_engine is None:
                        engine = None
                    else:
                        engine = Decimal(str(raw_engine))

                # Only filter by engine when the user selected one.
                if target.engine is not None and group != "EV":
                    if (
                        engine is None
                        or not engine.is_finite()
                        or engine <= 0
                    ):
                        continue

                    tolerance = (
                        ENGINE_TOLERANCE
                        if direct
                        else engine_tolerance
                    )

                    if abs(engine - target.engine) > tolerance:
                        continue

            except (
                KeyError,
                TypeError,
                ValueError,
                InvalidOperation,
                AttributeError,
            ):
                continue

            car = Comparable(
                row,
                price,
                year,
                mileage,
                engine,
                direct,
                source="direct" if direct else source,
            )

            car.weight = relevance_weight(
                car,
                target,
                years,
                group,
            )

            cars.append(car)

        return cars

    @staticmethod
    def _deduplicate(cars):
        ids = set()
        urls = set()
        fingerprints = set()
        result = []

        fields = (
            "brand",
            "model",
            "generation",
            "year",
            "mileage",
            "engine",
            "horsepower",
            "fuel_type",
            "gearbox",
            "state",
            "registration_country",
            "drivetrain",
            "body_type",
            "doors",
            "seats",
            "price_eur",
            "offer_type",
            "seller_type",
        )

        for car in cars:
            row = car.listing

            identity = row.get("id")
            url = row.get("url")

            fingerprint = tuple(
                row.get(field)
                for field in fields
            )

            if (
                (identity is not None and identity in ids)
                or (url and url in urls)
                or fingerprint in fingerprints
            ):
                continue

            if identity is not None:
                ids.add(identity)

            if url:
                urls.add(url)

            fingerprints.add(fingerprint)
            result.append(car)

        return result

    async def _fetch_fallback(
        self,
        target,
        years,
        group,
        params,
        target_class,
        tolerance,
        source,
    ):
        query = {
            **params,
            "class": target_class,
        }

        # Only add engine range when an engine was selected.
        if (
            group != "EV"
            and target.engine is not None
            and tolerance is not None
        ):
            query.update(
                engine_min=str(
                    max(
                        Decimal("0"),
                        target.engine - tolerance,
                    )
                ),
                engine_max=str(
                    target.engine + tolerance
                ),
            )

        rows = await self._get(
            "/listings",
            query,
        )

        cars = self._eligible(
            rows,
            target,
            years,
            group,
            direct=False,
            target_class=target_class,
            engine_tolerance=tolerance
            if tolerance is not None
            else ENGINE_TOLERANCE,
            source=source,
        )

        return cars, len(rows)

    @staticmethod
    def _comparison_state(
        count,
        search_mode,
        engine_range_widened,
    ):
        if count == 0:
            mode = "no_comparables"
            message = (
                "Nu au fost identificate vehicule suficient de comparabile."
                "Nu există suficiente date de piață pentru a calcula "
                "o estimare de preț relevantă pentru această configurație."

            )

        elif count == 1:
            mode = "single_comparable"
            message = (
                "A fost găsit un singur vehicul suficient de comparabil. "
                "Prețul solicitat este afișat cu titlu de referință, însă "
                "nu există suficiente date de piață pentru a calcula o "
                "estimare de preț fiabilă."
            )

        elif count < MIN_ACCEPTABLE_POOL:
            mode = "very_limited"
            message = (
                f"Doar {count} rămân vehicule suficient de comparabile "
                "după filtrare și ajustarea prețurilor. Estimarea se "
                "bazează pe date de piață foarte limitate și poate prezenta o varianță ridicată."
            )

        else:
            mode = search_mode

            message = {
                "direct": (
                    "Au fost disponibile suficiente comparații directe între modele."
                ),
                "normal_fallback": (
                    "Au fost incluse comparații alternative compatibile"
                    "deoarece erau disponibile mai puțin de 8 comparații directe."
                ),
                "emergency_fallback": (
                    "Datele directe și cele normale de rezervă au fost limitate, "
                    "astfel încât s-a utilizat o gamă mai largă de cilindree a motorului."
                    if engine_range_widened
                    else
                    "Datele directe și cele normale de rezervă au fost limitate, "
                    "așadar s-a utilizat căutarea finală a motorului."
                ),
            }[mode]

        if engine_range_widened:
            if count < MIN_ACCEPTABLE_POOL:
                message += (
                    " Căutarea finală a utilizat un interval mai larg al capacității motorului."
                )

            message += (
               " Anul, parcursul, tipul de caroserie, clasa vehiculului și "
               "constrângerile privind sistemul de propulsie au rămas neschimbate."
            )

        elif search_mode == "emergency_fallback":
            message += (
                " Căutarea finală a motorului nu a mai permis nicio relaxare suplimentară a"
                "restricțiilor privind cilindreea pentru această dimensiune de motor."
            )

        if count >= 2:
            message += (
                "Estimările reflectă prețurile solicitate și nu garantează"
                "prețurile de vânzare sau durata necesară vânzării."
            )

        return (
            mode,
            mode not in {"direct", "normal_fallback"},
            message,
        )

    async def estimate(
        self,
        target: PriceEstimateRequest,
    ) -> PriceEstimateResponse:
        years = effective_year_range(target)

        try:
            group = get_powertrain_group(
                target.fuel_type
            )
        except ValueError as exc:
            raise PriceEstimateError(
                422,
                str(exc),
            ) from exc

        options = await self._get(
            "/listings/options",
            {
                "brand": target.brand,
                "model": target.model,
                "generation": target.generation,
            },
        )

        self._validate_categories(
            target,
            options,
            group,
        )

        params = {
            "body_types": target.body_type,
            "year_min": years[0],
            "year_max": years[1],
            "mileage_min": target.mileage_min,
            "mileage_max": target.mileage_max,
        }

        rows = await self._get(
            "/listings",
            {
                **params,
                "brand": target.brand,
                "model": target.model,
                "generation": target.generation,
            },
        )

        fetched = len(rows)

        exact = self._deduplicate(
            self._eligible(
                rows,
                target,
                years,
                group,
                direct=True,
            )
        )

        direct_count = len(exact)
        same_model_only = (
            direct_count >= MIN_DIRECT_COMPARABLES
        )

        pool = exact
        eligible = direct_count
        search_mode = "direct"
        engine_range_widened = False

        if not same_model_only:
            classes = options["class"]

            if len(classes) != 1:
                raise PriceEstimateError(
                    422,
                    "Vehiculul selectat trebuie să aibă o singură clasă"
                    "de bază de date neambiguă pentru comparații de rezervă",
                )

            # If no engine is selected, fallback comparisons also
            # ignore engine size completely.
            if group == "EV" or target.engine is None:
                normal_tolerance = None
            else:
                normal_tolerance = (
                    normal_fallback_engine_tolerance(
                        target.engine
                    )
                )

            normal, count = await self._fetch_fallback(
                target,
                years,
                group,
                params,
                classes[0],
                normal_tolerance,
                "normal_fallback",
            )

            fetched += count

            candidates = self._deduplicate(
                exact + normal
            )

            search_mode = "normal_fallback"

            # Only perform the wider-engine emergency fallback
            # when an engine was actually selected.
            if (
                len(candidates) < MIN_ACCEPTABLE_POOL
                and group != "EV"
                and target.engine is not None
            ):
                emergency_tolerance = (
                    emergency_fallback_engine_tolerance(
                        target.engine
                    )
                )

                emergency, count = await self._fetch_fallback(
                    target,
                    years,
                    group,
                    params,
                    classes[0],
                    emergency_tolerance,
                    "emergency_fallback",
                )

                fetched += count

                candidates = self._deduplicate(
                    candidates + emergency
                )

                search_mode = "emergency_fallback"
                engine_range_widened = (
                    emergency_tolerance > normal_tolerance
                )

            similar = [
                car
                for car in candidates
                if not car.direct
            ]

            eligible = len(candidates)

            similar.sort(
                key=lambda car: (
                    -car.weight,
                    car.listing["id"],
                )
            )

            pool = (
                exact
                + similar[:MAX_SIMILAR_COMPARABLES]
            )

        cleaned = remove_outliers(pool)

        same_count = sum(
            car.listing.get("brand") == target.brand
            and car.listing.get("model") == target.model
            for car in cleaned
        )

        mode, limited, message = self._comparison_state(
            len(cleaned),
            search_mode,
            engine_range_widened,
        )

        response = {
            "estimate_available": len(cleaned) >= 2,
            "estimate": None,
            "reference_price": (
                cleaned[0].price
                if len(cleaned) == 1
                else None
            ),
            "market_stats": None,
            "distribution": None,
            "comparison": {
                "comparison_mode": mode,
                "limited_market_data": limited,
                "direct_count": sum(
                    car.source == "direct"
                    for car in cleaned
                ),
                "normal_fallback_added": sum(
                    car.source == "normal_fallback"
                    for car in cleaned
                ),
                "emergency_fallback_added": sum(
                    car.source == "emergency_fallback"
                    for car in cleaned
                ),
                "same_model_only": same_model_only,
                "same_model_count": same_count,
                "similar_model_count": (
                    len(cleaned) - same_count
                ),
                "total_used": len(cleaned),
                "fetched": fetched,
                "eligible": eligible,
                "direct_comparables_available": direct_count,
                "outliers_removed": (
                    len(pool) - len(cleaned)
                ),
                "message": message,
            },
            "search": {
                "brand": target.brand,
                "model": target.model,
                "generation": target.generation,
                "target_year": target.year,
                "target_mileage": target.mileage,
                "requested_year_min": target.year_min,
                "requested_year_max": target.year_max,
                "effective_year_min": years[0],
                "effective_year_max": years[1],
                "mileage_min": target.mileage_min,
                "mileage_max": target.mileage_max,
            },
        }

        if len(cleaned) < 2:
            return PriceEstimateResponse.model_validate(
                response
            )

        prices = [
            car.price
            for car in cleaned
        ]

        percentiles = {
            p: weighted_percentile(
                cleaned,
                p / 100,
            )
            for p in (
                20,
                30,
                40,
                50,
                60,
                70,
                80,
            )
        }

        response.update(
            {
                "estimate": {
                    "market_price": percentiles[50],
                    "sell_fast": {
                        "min": percentiles[20],
                        "max": percentiles[30],
                        "percentile_range": "P20-P30",
                    },
                    "normal": {
                        "min": percentiles[40],
                        "max": percentiles[60],
                        "percentile_range": "P40-P60",
                    },
                    "higher_asking": {
                        "min": percentiles[70],
                        "max": percentiles[80],
                        "percentile_range": "P70-P80",
                    },
                },
                "market_stats": {
                    "average_price": round(
                        mean(prices),
                        2,
                    ),
                    "median_price": median(prices),
                    "lowest_price": min(prices),
                    "highest_price": max(prices),
                    "average_year": round(
                        mean(
                            car.year
                            for car in cleaned
                        ),
                        1,
                    ),
                    "average_mileage": round(
                        mean(
                            car.mileage
                            for car in cleaned
                        ),
                        1,
                    ),
                },
                "distribution": distribution(
                    cleaned
                ),
            }
        )

        return PriceEstimateResponse.model_validate(
            response
        )
