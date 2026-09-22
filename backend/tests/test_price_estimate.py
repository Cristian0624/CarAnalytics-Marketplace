"""Run from the repository root: python -m unittest discover -s backend/tests -v."""

import os
from pathlib import Path
import sys
import unittest
from decimal import Decimal

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
    async def run_estimate(self, direct, fallback=(), data=None, options_override=None):
        data = data or payload()
        self.calls = []
        options = {
            "brand": ["BMW"], "model": ["320"], "generation": [data["generation"]],
            "fuel_type": ["Benzină", "Diesel", "Electricitate", "Hybrid"],
            "engine": [1.7, 2.0, 2.3], "gearbox": ["Automată", "Mecanică"],
            "drivetrain": ["Din spate", "Din față", "4x4"], "body_type": ["Sedan"], "class": ["D"],
            **(options_override or {}),
        }

        def handle(request):
            self.calls.append(request)
            if request.url.path == "/listings/options":
                return httpx.Response(200, json=options)
            return httpx.Response(200, json=list(fallback) if "class" in request.url.params else direct)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handle), base_url="http://internal") as client:
            return await PriceEstimateService(client).estimate(PriceEstimateRequest(**data))

    async def test_eight_direct_stops_without_fallback(self):
        result = await self.run_estimate([listing(i) for i in range(1, 9)])
        self.assertTrue(result.comparison.same_model_only)
        self.assertEqual(result.comparison.total_used, 8)
        self.assertEqual(len(self.calls), 2)
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
        self.assertEqual(sum(bar.count for bar in result.distribution.bars), 7)

    async def test_no_comparables(self):
        with self.assertRaises(PriceEstimateError) as context:
            await self.run_estimate([])
        self.assertEqual(context.exception.status_code, 404)

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


if __name__ == "__main__":
    unittest.main()
