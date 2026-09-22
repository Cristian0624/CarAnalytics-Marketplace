"""Run from the repository root: python -m unittest discover -s backend/tests -v."""

import os
from pathlib import Path
import sys
import unittest
from decimal import Decimal
from unittest.mock import patch

# Tests never connect to the configured application database or start main's
# background evaluator. Route integration uses its own SQLite inventory.
os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, delete, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from database import get_db
from models import Listing
from price_estimate_schemas import PriceEstimateRequest
from routers.listings import router as listings_router
from routers.price_estimate import router as estimate_router
from services.price_estimate import (
    Comparable, PriceEstimateError, PriceEstimateService, distribution,
    drivetrain_score, effective_year_range, get_powertrain_group,
    relevance_weight, remove_outliers, weighted_percentile,
    normal_fallback_engine_tolerance, emergency_fallback_engine_tolerance,
)


def payload(**overrides):
    return {
        "brand": "BMW", "model": "320", "generation": "II (2011 - 2020)",
        "year": 2018, "mileage": 120000, "fuel_type": "Benzină", "engine": 2.0,
        "gearbox": "Automată", "drivetrain": "Din spate", "body_type": "Sedan",
        "year_min": 2015, "year_max": 2023, "mileage_min": 80000, "mileage_max": 160000,
        **overrides,
    }


def listing(identity=1, **overrides):
    return {
        "id": identity, "url": f"https://example.test/{identity}",
        "brand": "BMW", "model": "320", "generation": "II (2011 - 2020)",
        "year": 2018, "mileage": 120000 + identity, "fuel_type": "Benzină", "engine": "2.0",
        "gearbox": "Automată", "drivetrain": "Din spate", "body_type": "Sedan",
        "price_eur": str(14000 + identity * 100), "class": "D", **overrides,
    }


def comparable(price, weight=1, **overrides):
    return Comparable({}, price, 2018, 120000, Decimal("2"), True, weight, **overrides)


class MathTests(unittest.TestCase):
    def test_fallback_tolerance_tiers_and_boundaries(self):
        cases = (
            (1.5, "0.3", "0.3"), (1.6, "0.3", "0.3"), (1.6001, "0.4", "0.4"),
            (2.0, "0.4", "0.4"), (2.0001, "0.5", "0.6"), (2.5, "0.5", "0.6"),
            (2.5001, "0.6", "0.8"), (3.0, "0.6", "0.8"), (3.0001, "0.8", "1.2"),
            (3.5, "0.8", "1.2"), (4.0, "0.8", "1.2"), (4.0001, "1.2", "2.0"),
            (4.7, "1.2", "2.0"), (5.5, "1.2", "2.0"),
        )
        for engine, normal, emergency in cases:
            with self.subTest(engine=engine):
                self.assertEqual(normal_fallback_engine_tolerance(engine), Decimal(normal))
                self.assertEqual(emergency_fallback_engine_tolerance(engine), Decimal(emergency))

    def test_fallback_eligibility_does_not_inflate_engine_score(self):
        target = PriceEstimateRequest(**payload(engine=4.7))
        rows = [listing(i, engine=engine) for i, engine in enumerate(("4.4", "5.0", "4.39", "5.01", "3.5", "2.7"), 1)]
        direct = PriceEstimateService._eligible(rows, target, (2015, 2020), "ICE", True, engine_tolerance=Decimal("2"))
        self.assertEqual([car.engine for car in direct], [Decimal("4.4"), Decimal("5.0")])
        normal = PriceEstimateService._eligible(rows, target, (2015, 2020), "ICE", False, "D", Decimal("1.2"))
        emergency = PriceEstimateService._eligible(rows, target, (2015, 2020), "ICE", False, "D", Decimal("2"))
        self.assertEqual(len(normal), 5)
        self.assertEqual(len(emergency), 6)
        # The original 0.3 scoring denominator stays fixed across retrieval stages.
        for car in normal:
            self.assertEqual(car.weight, next(other.weight for other in emergency if other.listing["id"] == car.listing["id"]))
        perfect = Comparable(listing(), 14500, 2018, 120000, Decimal("4.7"), True)
        distant = Comparable(listing(), 14500, 2018, 120000, Decimal("2.7"), False)
        self.assertAlmostEqual(relevance_weight(perfect, target, (2015, 2020), "ICE"), 1.0)
        self.assertAlmostEqual(relevance_weight(distant, target, (2015, 2020), "ICE"), 0.95)

    def test_actual_database_fuels_and_unknown(self):
        for fuel in ("Benzină", "Diesel", "Gaz", "Gaz / Benzină (metan)", "Gaz / Benzină (propan)"):
            self.assertEqual(get_powertrain_group(fuel), "ICE")
        for fuel in ("Hybrid", "Mild Hybrid (benzină)", "Mild Hybrid (diesel)",
                     "Plug-in Hybrid (benzină)", "Plug-in Hybrid (diesel)"):
            self.assertEqual(get_powertrain_group(fuel), "HYBRID")
        self.assertEqual(get_powertrain_group("Electricitate"), "EV")
        with self.assertRaises(ValueError):
            get_powertrain_group("unknown future fuel")

    def test_generation_ranges_and_open_ended_generations(self):
        self.assertEqual(effective_year_range(PriceEstimateRequest(**payload())), (2015, 2020))
        self.assertEqual(effective_year_range(PriceEstimateRequest(**payload(generation="V167 (2018 - prezent)"))), (2018, 2023))
        self.assertEqual(effective_year_range(PriceEstimateRequest(**payload(generation="II (2011–2020)"))), (2015, 2020))
        for generation in ("Unknown", "II (2000 - 2010)"):
            with self.assertRaises(PriceEstimateError):
                effective_year_range(PriceEstimateRequest(**payload(generation=generation)))

    def test_invalid_numeric_ranges(self):
        for overrides in ({"year": 2014}, {"mileage": 170000}, {"mileage_min": -1},
                          {"year_max": 9999}, {"mileage": 10000001}, {"engine": "NaN"}):
            with self.assertRaises(ValidationError):
                PriceEstimateRequest(**payload(**overrides))

    def test_exact_formula_example_and_engine_boundary(self):
        target = PriceEstimateRequest(**payload())
        car = Comparable(listing(), 14500, 2018, 130000, Decimal("2"), True)
        self.assertAlmostEqual(relevance_weight(car, target, (2015, 2020), "ICE"), 0.95)
        car.direct = False
        car.listing.update(brand="Audi", model="A4")
        self.assertAlmostEqual(relevance_weight(car, target, (2015, 2020), "ICE"), 0.45)
        rows = [listing(i, engine=value) for i, value in enumerate(("1.7", "2.3", "1.69", "2.31", None), 1)]
        eligible = PriceEstimateService._eligible(rows, target, (2015, 2020), "ICE", True)
        self.assertEqual([car.engine for car in eligible], [Decimal("1.7"), Decimal("2.3")])

    def test_drivetrain_database_labels(self):
        self.assertEqual(drivetrain_score("Din față", "Din spate"), 0.25)
        self.assertEqual(drivetrain_score("4x4", "AWD"), 0.8)
        self.assertEqual(drivetrain_score("Din spate", "4x4"), 0.5)
        self.assertEqual(drivetrain_score("4x2", "Din față"), 0.5)
        self.assertEqual(drivetrain_score("Din spate", None), 0.5)

    def test_percentiles_use_actual_prices_and_unsquared_weights(self):
        cars = [comparable(10000, 0.9), comparable(20000, 0.5), comparable(30000, 0.5)]
        self.assertEqual(weighted_percentile(cars, 0.5), 20000)
        self.assertEqual(weighted_percentile(cars, 0.2), 10000)
        self.assertEqual(weighted_percentile(cars, 0.8), 30000)

    def test_iqr_removes_extreme_price(self):
        cars = [comparable(price) for price in (14000, 14100, 14200, 14300, 14400, 14500, 14600, 100000)]
        self.assertEqual(len(remove_outliers(cars)), 7)

    def test_histogram_matches_spec_and_boundary_counts(self):
        cars = [comparable(price) for price in (12100, 14000, 14000, 17900)]
        result = distribution(cars)
        self.assertEqual(result["interval"], 1000)
        self.assertEqual(result["bar_count"], 6)
        self.assertEqual([bar["count"] for bar in result["bars"]], [1, 0, 2, 0, 0, 1])
        self.assertEqual(result["bars"][2]["percentage"], 50)
        self.assertIsNone(result["bars"][1]["average_year"])
        cars[-1].price = 18000
        self.assertEqual(sum(bar["count"] for bar in distribution(cars)["bars"]), 4)

    def test_histogram_single_price_and_many_scales(self):
        for prices in ((14500,), (14500, 14500), (0.01, 0.02), (1, 3), (14999, 15001), (100, 300000)):
            result = distribution([comparable(price) for price in prices])
            self.assertTrue(4 <= result["bar_count"] <= 8)
            self.assertEqual(sum(bar["count"] for bar in result["bars"]), len(prices))


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    async def run_estimate(self, direct, fallback=(), data=None, options_override=None, emergency=None):
        data = data or payload()
        self.calls = []
        options = {
            "brand": ["BMW"], "model": ["320"], "generation": [data["generation"]],
            "fuel_type": ["Benzină", "Diesel", "Electricitate", "Hybrid"],
            "engine": [1.7, 2.0, 2.3, 4.7], "gearbox": ["Automată", "Mecanică"],
            "drivetrain": ["Din spate", "Din față", "4x4"], "body_type": ["Sedan"], "class": ["D"],
            **(options_override or {}),
        }

        fallback_calls = 0

        def handle(request):
            nonlocal fallback_calls
            self.calls.append(request)
            if request.url.path == "/listings/options":
                return httpx.Response(200, json=options)
            if "class" in request.url.params:
                fallback_calls += 1
                rows = emergency if fallback_calls == 2 and emergency is not None else fallback
                return httpx.Response(200, json=list(rows))
            return httpx.Response(200, json=direct)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handle), base_url="http://internal") as client:
            result = await PriceEstimateService(client).estimate(PriceEstimateRequest(**data))
        comparison = result.comparison
        self.assertEqual(comparison.direct_count + comparison.normal_fallback_added + comparison.emergency_fallback_added,
                         comparison.total_used)
        return result

    async def test_eight_direct_stops_without_fallback(self):
        result = await self.run_estimate([listing(i) for i in range(1, 9)])
        self.assertTrue(result.comparison.same_model_only)
        self.assertEqual(result.comparison.total_used, 8)
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(result.comparison.comparison_mode, "direct")
        self.assertFalse(result.comparison.limited_market_data)
        self.assertEqual(result.comparison.direct_count, 8)
        self.assertNotIn("engine_min", self.calls[-1].url.params)
        self.assertEqual(self.calls[-1].url.params["year_max"], "2020")
        self.assertEqual(self.calls[-1].url.params["generation"], "II (2011 - 2020)")

    async def test_keeps_direct_and_caps_best_fallbacks(self):
        exact = [listing(i) for i in range(1, 4)]
        fallback = [listing(
            i, brand="Audi", model="A4", generation="Unrelated",
            price_eur=str(14100 + i % 8 * 100) if i < 35 else "20000",
            mileage=120000 + i if i < 35 else 159999 - i,
        ) for i in range(10, 50)]
        result = await self.run_estimate(exact, exact + fallback)
        self.assertEqual(result.comparison.same_model_count, 3)
        self.assertEqual(result.comparison.similar_model_count, 25)
        self.assertEqual(result.comparison.eligible, 43)
        self.assertEqual(result.comparison.normal_fallback_added, 25)
        self.assertLess(result.market_stats.highest_price, 20000)
        params = self.calls[-1].url.params
        self.assertEqual(params["class"], "D")
        for field in ("brand", "model", "generation", "gearbox", "drivetrains", "fuel_type"):
            self.assertNotIn(field, params)

    async def test_deduplication_happens_before_direct_threshold(self):
        exact = [listing(i) for i in range(1, 8)]
        duplicate = {**exact[0], "id": 500, "url": "https://duplicate.test/500"}
        result = await self.run_estimate(exact + [exact[0], duplicate], exact)
        self.assertFalse(result.comparison.same_model_only)
        self.assertEqual(result.comparison.direct_comparables_available, 7)
        self.assertEqual(result.comparison.total_used, 7)

    async def test_fallback_hard_filters_and_no_generation_requirement(self):
        overrides = ({"class": "C"}, {"body_type": "SUV"}, {"fuel_type": "Electricitate"},
                     {"fuel_type": "Hybrid"}, {"engine": "3"}, {"year": 2021}, {"mileage": 170000},
                     {"price_eur": None}, {"year": None}, {"mileage": None}, {"fuel_type": "unknown"})
        rows = [listing(i + 10, brand="Audi", model="A4", **values) for i, values in enumerate(overrides)]
        rows.append(listing(30, brand="Audi", model="A4", generation=None, fuel_type="Diesel", price_eur="14500"))
        result = await self.run_estimate([listing()], rows)
        self.assertEqual(result.comparison.total_used, 2)
        self.assertEqual(result.comparison.similar_model_count, 1)

    async def test_evs_ignore_displacement(self):
        rows = [listing(i, fuel_type="Electricitate", engine=None) for i in range(1, 9)]
        result = await self.run_estimate(rows, data=payload(fuel_type="Electricitate", engine=None))
        self.assertEqual(result.comparison.total_used, 8)

    async def test_same_model_other_generation_has_model_bonus_in_fallback(self):
        target = PriceEstimateRequest(**payload())
        other_generation = listing(30, generation="Other production generation", mileage=120000)
        cars = PriceEstimateService._eligible([other_generation], target, (2015, 2020), "ICE", False, "D")
        self.assertEqual(len(cars), 1)
        self.assertAlmostEqual(cars[0].weight, 1.0)
        result = await self.run_estimate([listing()], [other_generation])
        self.assertEqual(result.comparison.direct_comparables_available, 1)
        self.assertEqual(result.comparison.same_model_count, 2)
        self.assertEqual(result.comparison.similar_model_count, 0)

    async def test_outlier_counts_describe_cleaned_pool(self):
        rows = [listing(i) for i in range(1, 9)]
        rows[-1]["price_eur"] = "100000"
        result = await self.run_estimate(rows)
        self.assertTrue(result.comparison.same_model_only)
        self.assertEqual(result.comparison.total_used, 7)
        self.assertEqual(result.comparison.same_model_count, 7)
        self.assertEqual(result.comparison.outliers_removed, 1)
        self.assertEqual(result.comparison.direct_count, 7)
        self.assertEqual(sum(bar.count for bar in result.distribution.bars), 7)

    async def test_no_comparables(self):
        result = await self.run_estimate([])
        self.assertFalse(result.estimate_available)
        self.assertEqual(result.comparison.comparison_mode, "no_comparables")
        self.assertIsNone(result.estimate)
        self.assertIsNone(result.reference_price)
        self.assertIsNone(result.market_stats)
        self.assertIsNone(result.distribution)
        self.assertEqual(len(self.calls), 4)  # Metadata + three listings calls, never a fourth.

    async def test_five_combined_stops_before_emergency(self):
        exact = [listing(1, engine="4.7")]
        normal = [listing(i, engine="3.5") for i in range(2, 6)]
        result = await self.run_estimate(exact, exact + normal, payload(engine=4.7))
        self.assertEqual(len(self.calls), 3)
        self.assertEqual(result.comparison.comparison_mode, "normal_fallback")
        self.assertFalse(result.comparison.limited_market_data)
        self.assertEqual(result.comparison.direct_count, 1)
        self.assertEqual(result.comparison.normal_fallback_added, 4)
        self.assertEqual(result.comparison.emergency_fallback_added, 0)
        self.assertEqual(self.calls[-1].url.params["engine_min"], "3.5")
        self.assertEqual(self.calls[-1].url.params["engine_max"], "5.9")

    async def test_emergency_union_preserves_origins_and_only_expands_engine(self):
        exact = [listing(1, engine="4.7")]
        normal = [listing(i, engine="3.5") for i in range(2, 4)]
        new = [listing(i, engine="2.7", generation=None) for i in range(4, 9)]
        result = await self.run_estimate(exact, exact + normal, payload(engine=4.7), emergency=exact + normal + new)
        self.assertEqual(len(self.calls), 4)
        self.assertEqual(result.comparison.comparison_mode, "emergency_fallback")
        self.assertTrue(result.comparison.limited_market_data)
        self.assertTrue(result.estimate_available)
        self.assertEqual((result.comparison.direct_count, result.comparison.normal_fallback_added,
                          result.comparison.emergency_fallback_added), (1, 2, 5))
        self.assertEqual(result.comparison.total_used, 8)
        self.assertIn("broader engine-size range", result.comparison.message)
        normal_query, emergency_query = (dict(call.url.params) for call in self.calls[-2:])
        self.assertEqual(emergency_query.pop("engine_min"), "2.7")
        self.assertEqual(emergency_query.pop("engine_max"), "6.7")
        normal_query.pop("engine_min")
        normal_query.pop("engine_max")
        self.assertEqual(normal_query, emergency_query)
        self.assertNotIn("generation", emergency_query)
        self.assertNotIn("brand", emergency_query)

    async def test_duplicate_ids_do_not_prevent_emergency_search(self):
        exact = [listing(1, engine="4.7")]
        normal = [listing(i, engine="3.5") for i in range(2, 5)]
        changed_duplicate = {**normal[0], "mileage": 125000, "url": "https://changed.test/2"}
        result = await self.run_estimate(exact, exact + normal + [changed_duplicate] * 3,
                                         payload(engine=4.7), emergency=exact + normal)
        self.assertEqual(len(self.calls), 4)
        self.assertEqual(result.comparison.total_used, 4)
        self.assertEqual(result.comparison.comparison_mode, "very_limited")
        self.assertEqual(result.comparison.emergency_fallback_added, 0)

    async def test_emergency_rejects_every_other_incompatible_dimension(self):
        invalid = ({"class": "C"}, {"body_type": "SUV"}, {"fuel_type": "Electricitate"},
                   {"fuel_type": "Hybrid"}, {"year": 2021}, {"mileage": 160001},
                   {"engine": "2.69"}, {"engine": "6.71"}, {"price_eur": None}, {"engine": None})
        rows = [listing(i + 10, **{"engine": "2.7", **overrides}) for i, overrides in enumerate(invalid)]
        rows += [listing(40, engine="2.7", generation=None), listing(41, engine="6.7", generation="unrelated")]
        result = await self.run_estimate([], [], payload(engine=4.7), emergency=rows)
        self.assertEqual(result.comparison.total_used, 2)
        self.assertEqual(result.comparison.emergency_fallback_added, 2)
        self.assertEqual(result.comparison.comparison_mode, "very_limited")

    async def test_two_to_four_results_keep_actual_price_variance(self):
        for count in (2, 3, 4):
            with self.subTest(count=count):
                rows = [listing(i + 1, engine="2.7", price_eur=str(price))
                        for i, price in enumerate((14000, 21000, 32000, 38000)[:count])]
                result = await self.run_estimate([], [], payload(engine=4.7), emergency=rows)
                self.assertTrue(result.estimate_available)
                self.assertEqual(result.comparison.comparison_mode, "very_limited")
                self.assertTrue(result.comparison.limited_market_data)
                self.assertEqual(result.market_stats.lowest_price, 14000)
                self.assertEqual(result.market_stats.highest_price, float(rows[-1]["price_eur"]))
                self.assertEqual(len(self.calls), 4)

    async def test_single_reference_from_any_source_never_runs_estimator(self):
        for source in ("direct", "normal_fallback", "emergency_fallback"):
            with self.subTest(source=source), patch("services.price_estimate.weighted_percentile") as estimator:
                row = listing(1, engine={"direct": "4.7", "normal_fallback": "3.5", "emergency_fallback": "2.7"}[source],
                              price_eur="18900")
                result = await self.run_estimate(
                    [row] if source == "direct" else [],
                    [row] if source == "normal_fallback" else [],
                    payload(engine=4.7), emergency=[row],
                )
                estimator.assert_not_called()
                self.assertFalse(result.estimate_available)
                self.assertEqual(result.reference_price, 18900)
                self.assertIsNone(result.estimate)
                self.assertIsNone(result.market_stats)
                self.assertIsNone(result.distribution)
                self.assertEqual(result.comparison.comparison_mode, "single_comparable")
                self.assertEqual(result.comparison.total_used, 1)
                expected = tuple(int(source == origin) for origin in ("direct", "normal_fallback", "emergency_fallback"))
                self.assertEqual((result.comparison.direct_count, result.comparison.normal_fallback_added,
                                  result.comparison.emergency_fallback_added), expected)

    async def test_sparse_evs_never_repeat_identical_displacement_query(self):
        for count in range(5):
            with self.subTest(count=count):
                rows = [listing(i + 1, fuel_type="Electricitate", engine=None) for i in range(count)]
                result = await self.run_estimate([], rows, payload(fuel_type="Electricitate", engine=None))
                self.assertEqual(len(self.calls), 3)
                self.assertEqual(result.comparison.total_used, count)
                self.assertEqual(result.comparison.emergency_fallback_added, 0)
                self.assertNotIn("engine_min", self.calls[-1].url.params)
                self.assertNotIn("engine_max", self.calls[-1].url.params)
                self.assertNotIn("broader engine", result.comparison.message)
                self.assertEqual(result.estimate_available, count >= 2)

    async def test_small_engine_emergency_never_allows_13_litre(self):
        result = await self.run_estimate([listing()], [], emergency=[listing(2, engine="1.3")])
        self.assertEqual(result.comparison.total_used, 1)
        self.assertEqual(result.comparison.comparison_mode, "single_comparable")
        self.assertEqual(self.calls[-1].url.params["engine_min"], "1.6")
        self.assertEqual(self.calls[-1].url.params["engine_max"], "2.4")
        self.assertNotIn("broader engine-size range", result.comparison.message)

    async def test_source_counts_exclude_final_outliers(self):
        exact = [listing(1, engine="4.7", price_eur="100000")]
        normal = [listing(2, engine="3.5")]
        emergency = [listing(i, engine="2.7") for i in range(3, 10)]
        result = await self.run_estimate(exact, normal, payload(engine=4.7), emergency=exact + normal + emergency)
        self.assertEqual(result.comparison.outliers_removed, 1)
        self.assertEqual(result.comparison.direct_comparables_available, 1)
        self.assertEqual(result.comparison.direct_count, 0)
        self.assertEqual(result.comparison.normal_fallback_added, 1)
        self.assertEqual(result.comparison.emergency_fallback_added, 7)

    async def test_cleanup_below_five_warns_without_restarting_search(self):
        rows = [listing(i, price_eur="14000") for i in range(1, 5)] + [listing(5, price_eur="100000")]
        result = await self.run_estimate([], rows)
        self.assertEqual(len(self.calls), 3)
        self.assertEqual(result.comparison.total_used, 4)
        self.assertEqual(result.comparison.comparison_mode, "very_limited")
        self.assertTrue(result.comparison.limited_market_data)

    async def test_invalid_categories_and_missing_class(self):
        for values in ({"brand": "invented"}, {"engine": 1.9}, {"gearbox": "Automatic"}, {"engine": None}):
            with self.assertRaises(PriceEstimateError) as context:
                await self.run_estimate([], data=payload(**values))
            self.assertEqual(context.exception.status_code, 422)
        for classes in ([], ["C", "D"]):
            with self.assertRaises(PriceEstimateError):
                await self.run_estimate([listing()], options_override={"class": classes})

    async def test_upstream_errors_are_controlled(self):
        for response in (httpx.Response(500), httpx.Response(200, text="not json")):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: response), base_url="http://internal") as client:
                with self.assertRaises(PriceEstimateError) as context:
                    await PriceEstimateService(client).estimate(PriceEstimateRequest(**payload()))
                self.assertEqual(context.exception.status_code, 502)


class RouteIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Listing.__table__.create(self.engine)
        with Session(self.engine) as db:
            for i in range(1, 9):
                row = listing(i)
                row["class_"] = row.pop("class")
                db.add(Listing(**row))
            db.add(Listing(id=99, brand="Audi", model="A4", generation="B9 (2015 - prezent)", fuel_type="Diesel", class_="D"))
            db.commit()
        self.statements = []
        event.listen(self.engine, "before_cursor_execute", self.record_statement)

        def test_db():
            with Session(self.engine) as db:
                yield db

        app = FastAPI()
        app.include_router(listings_router)
        app.include_router(estimate_router)
        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)

    def record_statement(self, conn, cursor, statement, parameters, context, executemany):
        self.statements.append(statement)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def test_post_routes_through_real_listings_api_without_writes(self):
        response = self.client.post("/price-estimate", json=payload())
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["currency"], "EUR")
        self.assertEqual(body["comparison"]["total_used"], 8)
        self.assertIsInstance(body["estimate"]["market_price"], (int, float))
        self.assertTrue(all(statement.lstrip().startswith("SELECT") for statement in self.statements))
        self.assertEqual(self.client.get("/price-estimate").status_code, 405)

    def test_cascading_options_and_global_configuration_values(self):
        response = self.client.get("/listings/options", params={"brand": "BMW", "model": "320"})
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["brand"], ["Audi", "BMW"])
        self.assertEqual(body["model"], ["320"])
        self.assertEqual(body["generation"], ["II (2011 - 2020)"])
        self.assertEqual(body["fuel_type"], ["Benzină", "Diesel"])
        self.assertEqual(body["class"], ["D"])
        self.assertEqual(self.client.get("/listings/options", params={"model": "320"}).status_code, 422)

    def test_fallback_uses_real_class_filter_and_preserves_direct_rows(self):
        with Session(self.engine) as db:
            db.execute(delete(Listing).where(Listing.id.between(4, 8)))
            for i in range(100, 135):
                row = listing(i, brand="Audi", model="A4", generation="B9 (2015 - prezent)",
                              price_eur=str(14100 + i % 8 * 100))
                row["class_"] = row.pop("class")
                db.add(Listing(**row))
            db.commit()
        self.statements.clear()
        response = self.client.post("/price-estimate", json=payload())
        self.assertEqual(response.status_code, 200, response.text)
        comparison = response.json()["comparison"]
        self.assertEqual(comparison["same_model_count"], 3)
        self.assertEqual(comparison["similar_model_count"], 25)
        self.assertEqual(comparison["total_used"], 28)
        self.assertFalse(comparison["same_model_only"])
        self.assertTrue(all(statement.lstrip().startswith("SELECT") for statement in self.statements))

    def test_wrong_vehicle_combination_and_request_ranges(self):
        for overrides in ({"brand": "Audi"}, {"year": 2021}, {"mileage_min": 130000}, {"body_type": "invented"}):
            response = self.client.post("/price-estimate", json=payload(**overrides))
            self.assertEqual(response.status_code, 422, response.text)

    def test_single_and_no_data_responses_are_http_200(self):
        with Session(self.engine) as db:
            db.execute(delete(Listing).where(Listing.id.between(2, 8)))
            db.commit()
        for mileage_min, expected_mode, expected_price in (
            (80000, "single_comparable", 14100.0),
            (130000, "no_comparables", None),
        ):
            with self.subTest(mode=expected_mode):
                self.statements.clear()
                body = payload(mileage=140000, mileage_min=mileage_min)
                response = self.client.post("/price-estimate", json=body)
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertEqual(result["comparison"]["comparison_mode"], expected_mode)
                self.assertFalse(result["estimate_available"])
                self.assertEqual(result["reference_price"], expected_price)
                for field in ("estimate", "market_stats", "distribution"):
                    self.assertIsNone(result[field])
                self.assertTrue(all(statement.lstrip().startswith("SELECT") for statement in self.statements))

    def test_engine_emergency_through_real_listings_filters(self):
        with Session(self.engine) as db:
            db.execute(delete(Listing))
            for i, displacement in enumerate(("4.7", "3.5", "5.9", "2.7", "6.7", "2.7", "6.7", "2.7"), 1):
                row = listing(i, engine=displacement)
                row["class_"] = row.pop("class")
                db.add(Listing(**row))
            db.commit()
        self.statements.clear()
        response = self.client.post("/price-estimate", json=payload(engine=4.7))
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["comparison"]["comparison_mode"], "emergency_fallback")
        self.assertEqual(result["comparison"]["direct_count"], 1)
        self.assertEqual(result["comparison"]["normal_fallback_added"], 2)
        self.assertEqual(result["comparison"]["emergency_fallback_added"], 5)
        self.assertEqual(result["comparison"]["total_used"], 8)
        self.assertTrue(result["estimate_available"])
        self.assertTrue(all(statement.lstrip().startswith("SELECT") for statement in self.statements))


if __name__ == "__main__":
    unittest.main()
