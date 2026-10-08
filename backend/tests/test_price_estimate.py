"""Generation-wide price policy and read-only listings HTTP integration."""
import math
import os
from pathlib import Path
import sys
import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import MetaData, create_engine, delete, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.schema import CreateTable

from database import get_db
from models import Listing
from price_estimate_schemas import PriceEstimateRequest
from routers.listings import router as listings_router
from routers.price_estimate import router as estimate_router
from services.price_estimate import (
    Comparable, PriceEstimateError, PriceEstimateService, distribution,
    drivetrain_score, effective_sample_size, effective_year_range, get_powertrain_group,
    relevance_weight, weight_comparisons, weighted_percentile,
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
    values = dict(listing=listing(), price=price, year=2018, mileage=120000,
                  engine=Decimal("2"), direct=True, weight=weight)
    return Comparable(**(values | overrides))


class MathTests(unittest.TestCase):
    def test_year_and_mileage_preferences_are_gradual_and_never_zero(self):
        target = PriceEstimateRequest(**payload())
        perfect = relevance_weight(comparable(15000), target, "ICE")
        previous = perfect
        for distance in (1000, 30000, 60000, 120000, 500000):
            weight = relevance_weight(comparable(15000, mileage=120000 + distance), target, "ICE")
            self.assertLess(weight, previous)
            self.assertGreater(weight, 0)
            previous = weight
        self.assertEqual(perfect, 1)
        near = relevance_weight(comparable(15000, year=2019), target, "ICE")
        far = relevance_weight(comparable(15000, year=2011), target, "ICE")
        self.assertGreater(near, far)
        for boundary in (30000, 60000, 100000):
            before = relevance_weight(comparable(15000, mileage=120000 + boundary - 1), target, "ICE")
            after = relevance_weight(comparable(15000, mileage=120000 + boundary + 1), target, "ICE")
            self.assertLess(abs(before - after), .0001)

    def test_all_configuration_differences_have_only_a_small_effect(self):
        target = PriceEstimateRequest(**payload())
        other = listing(engine="6", fuel_type="Diesel", gearbox="Mecanică", drivetrain="Din față", body_type="SUV")
        weight = relevance_weight(comparable(15000, listing=other, engine=Decimal("6")), target, "ICE")
        self.assertGreaterEqual(weight, .95)
        self.assertLess(weight, 1)
        self.assertGreater(relevance_weight(comparable(15000, engine=Decimal("2.01")), target, "ICE"),
                           relevance_weight(comparable(15000, engine=Decimal("6")), target, "ICE"))

    def test_missing_features_keep_a_nonzero_weight(self):
        target = PriceEstimateRequest(**payload())
        car = comparable(15000, year=None, mileage=None, engine=None,
                         listing=listing(fuel_type=None, gearbox=None, drivetrain=None, body_type=None))
        weight = relevance_weight(car, target, "ICE")
        self.assertTrue(0 < weight < 1)

    def test_generation_year_validation_and_open_generations(self):
        self.assertEqual(effective_year_range(PriceEstimateRequest(**payload())), (2015, 2020))
        self.assertEqual(effective_year_range(PriceEstimateRequest(**payload(generation="V167 (2018 - prezent)"))), (2018, 2023))
        self.assertEqual(effective_year_range(PriceEstimateRequest(**payload(generation="II (2011–2020)"))), (2015, 2020))
        for generation in ("Unknown", "II (2000 - 2010)"):
            with self.assertRaises(PriceEstimateError):
                effective_year_range(PriceEstimateRequest(**payload(generation=generation)))

    def test_invalid_numeric_requests_remain_rejected(self):
        for overrides in ({"year": 2014}, {"mileage": 170000}, {"mileage_min": -1},
                          {"year_max": 9999}, {"mileage": 10000001}, {"engine": "NaN"}):
            with self.assertRaises(ValidationError):
                PriceEstimateRequest(**payload(**overrides))

    def test_powertrain_categories(self):
        for fuel in ("Benzină", "Diesel", "Gaz", "Gaz / Benzină (metan)", "Gaz / Benzină (propan)"):
            self.assertEqual(get_powertrain_group(fuel), "ICE")
        for fuel in ("Hybrid", "Mild Hybrid (benzină)", "Plug-in Hybrid (diesel)"):
            self.assertEqual(get_powertrain_group(fuel), "HYBRID")
        self.assertEqual(get_powertrain_group("Electricitate"), "EV")
        self.assertEqual(drivetrain_score("4x4", "AWD"), .8)
        with self.assertRaises(ValueError):
            get_powertrain_group("unknown fuel")

    def test_percentiles_interpolate_with_unsquared_weights_within_observed_prices(self):
        cars = [comparable(10000, .9), comparable(20000, .5), comparable(30000, .5)]
        self.assertAlmostEqual(weighted_percentile(cars, .5), 17142.857142857)
        self.assertEqual(weighted_percentile(cars, .2), 10000)
        self.assertAlmostEqual(weighted_percentile(cars, .8), 27400)
        self.assertEqual(weighted_percentile(cars, 0), 10000)
        self.assertEqual(weighted_percentile(cars, 1), 30000)
        self.assertAlmostEqual(effective_sample_size([comparable(1) for _ in range(5)]), 5)

    def test_tiny_weight_changes_do_not_jump_across_large_price_gaps(self):
        before = [comparable(10000, 1.00001), comparable(100000, 1)]
        after = [comparable(10000, .99999), comparable(100000, 1)]
        for fraction in (.2, .3, .4, .5, .6, .7, .8):
            with self.subTest(fraction=fraction):
                self.assertLess(abs(weighted_percentile(before, fraction) -
                                    weighted_percentile(after, fraction)), 2)
        self.assertAlmostEqual(weighted_percentile([comparable(10000), comparable(100000)], .5), 55000)

    def test_equal_prices_do_not_gain_an_artificial_spread(self):
        cars = [comparable(15000, weight) for weight in (.01, .3, 1, .04)]
        for fraction in (0, .2, .3, .4, .5, .6, .7, .8, 1):
            self.assertEqual(weighted_percentile(cars, fraction), 15000)

    def test_histogram_keeps_its_existing_boundary_counts(self):
        cars = [comparable(price) for price in (12100, 14000, 14000, 17900)]
        result = distribution(cars)
        self.assertEqual(result["interval"], 1000)
        self.assertEqual(result["bar_count"], 6)
        self.assertEqual([bar["count"] for bar in result["bars"]], [1, 0, 2, 0, 0, 1])
        self.assertEqual(result["bars"][2]["percentage"], 50)
        cars[-1].price = 18000
        self.assertEqual(sum(bar["count"] for bar in distribution(cars)["bars"]), 4)

    def test_distribution_handles_equal_prices_and_missing_features(self):
        for prices in ([15000] * 8, [1, 200, 50000, 500000], [1.1, 1.2, 1.3]):
            result = distribution([comparable(price, year=None, mileage=None) for price in prices])
            self.assertTrue(4 <= result["bar_count"] <= 8)
            self.assertEqual(sum(bar["count"] for bar in result["bars"]), len(prices))
            self.assertTrue(all(bar["average_year"] is None for bar in result["bars"]))


class ServiceTests(unittest.IsolatedAsyncioTestCase):
    async def run_estimate(self, rows, data=None):
        data = data or payload()
        self.calls = []
        options = {
            "brand": [data["brand"]], "model": [data["model"]], "generation": [data["generation"]],
            "fuel_type": ["Benzină", "Diesel", "Electricitate", "Hybrid"],
            "engine": [1, 1.3, 1.6, 2, 3, 4, 6], "gearbox": ["Automată", "Mecanică"],
            "drivetrain": ["Din spate", "Din față", "4x4"], "body_type": ["Sedan", "SUV", "Hatchback"],
        }

        def handle(request):
            self.calls.append(request)
            return httpx.Response(200, json=options if request.url.path == "/listings/options" else rows)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handle), base_url="http://internal") as client:
            result = await PriceEstimateService(client).estimate(PriceEstimateRequest(**data))
        comparison = result.comparison
        self.assertEqual(comparison.direct_count + comparison.normal_fallback_added + comparison.emergency_fallback_added,
                         comparison.total_used)
        self.assertTrue(comparison.same_model_only)
        self.assertEqual(comparison.similar_model_count, 0)
        self.assertEqual(comparison.outliers_removed, 0)
        self.assertEqual(dict(self.calls[-1].url.params), {key: data[key] for key in ("brand", "model", "generation")})
        self.assertEqual(result.estimate_available, result.estimate is not None)
        if result.estimate_available:
            estimate = result.estimate
            values = [estimate.sell_fast.min, estimate.sell_fast.max, estimate.normal.min, estimate.market_price,
                      estimate.normal.max, estimate.higher_asking.min, estimate.higher_asking.max]
            self.assertEqual(values, sorted(values))
            self.assertTrue(all(math.isfinite(value) and value > 0 for value in values))
        return result

    async def test_all_generation_listings_are_considered_with_soft_preferences(self):
        rows = [listing(i) for i in range(1, 5)]
        rows += [listing(10, year=2011, mileage=450000, engine="1.3", gearbox="Mecanică"),
                 listing(11, year=2023, mileage=1000, engine="6", fuel_type="Hybrid", drivetrain="4x4", body_type="SUV"),
                 listing(12, mileage=1000000, fuel_type="Diesel", engine="4")]
        result = await self.run_estimate(rows)
        self.assertTrue(result.estimate_available)
        self.assertEqual(result.comparison.total_used, len(rows))
        self.assertEqual(result.search.effective_year_min, 2011)
        self.assertEqual(result.search.effective_year_max, 2023)
        self.assertEqual(result.search.mileage_max, 1000000)
        cars = PriceEstimateService._eligible(rows, PriceEstimateRequest(**payload()), "ICE")
        weight_comparisons(cars, PriceEstimateRequest(**payload()), "ICE")
        self.assertGreater(cars[0].weight, cars[-1].weight)

    async def test_nearby_mileage_can_outweigh_more_numerous_distant_cars(self):
        rows = [listing(i, mileage=50000 + i, price_eur="20000") for i in range(1, 13)]
        rows += [listing(i, mileage=350000 + i, price_eur="10000") for i in range(13, 17)]
        lower = await self.run_estimate(rows, payload(mileage=50000, mileage_min=0))
        higher = await self.run_estimate(rows, payload(mileage=350000, mileage_max=1000000))
        self.assertEqual(lower.estimate.market_price, 20000)
        self.assertEqual(higher.estimate.market_price, 10000)
        self.assertEqual(higher.comparison.total_used, 16)

    async def test_mileage_outside_observed_range_does_not_rebound_to_group_median(self):
        rows = [listing(i, mileage=i * 50000, price_eur=str(30000 - i * 2000)) for i in range(1, 9)]
        rows += [listing(20, mileage=None, price_eur="30000")]
        estimates = []
        for mileage in (0, 50000, 100000, 200000, 300000, 400000, 500000, 1000000, 10000000):
            result = await self.run_estimate(rows, payload(mileage=mileage, mileage_min=0, mileage_max=10000000))
            estimates.append(result.estimate.market_price)
            self.assertEqual(result.comparison.total_used, 9)
        self.assertEqual(estimates, sorted(estimates, reverse=True))
        self.assertEqual(len(set(estimates[-4:])), 1)
        self.assertLess(estimates[-1], estimates[0])

    async def test_one_kilometre_changes_keep_all_three_price_ranges_stable(self):
        rows = [listing(i, mileage=50000, horsepower=120 + i, price_eur="10000") for i in range(1, 5)]
        rows += [listing(i, mileage=350000, horsepower=120 + i, price_eur="100000") for i in range(5, 9)]
        before = await self.run_estimate(rows, payload(mileage=199999, mileage_min=0, mileage_max=1000000))
        after = await self.run_estimate(rows, payload(mileage=200000, mileage_min=0, mileage_max=1000000))
        self.assertEqual(before.comparison.total_used, 8)
        self.assertEqual(after.comparison.total_used, 8)
        self.assertAlmostEqual(after.estimate.market_price, 55000)
        for field in ("sell_fast", "normal", "higher_asking"):
            first = getattr(before.estimate, field)
            second = getattr(after.estimate, field)
            self.assertLess(abs(first.min - second.min), 5)
            self.assertLess(abs(first.max - second.max), 5)
        self.assertLess(abs(before.estimate.market_price - after.estimate.market_price), 5)

    async def test_uneven_support_is_marked_limited_without_dropping_comparisons(self):
        rows = [listing(i) for i in range(1, 4)]
        rows += [listing(i, year=2011, mileage=1000000) for i in range(4, 64)]
        result = await self.run_estimate(rows)
        self.assertEqual(result.comparison.total_used, 63)
        self.assertEqual(result.comparison.direct_count, 3)
        self.assertLess(result.comparison.effective_sample_size, 5)
        self.assertTrue(result.comparison.limited_market_data)
        self.assertTrue(result.estimate_available)

    async def test_wrong_brand_model_and_generation_never_enter_the_pool(self):
        rows = [listing(i) for i in range(1, 8)]
        rows += [listing(20, brand="Audi"), listing(21, model="520"),
                 listing(22, generation="Other"), listing(23, generation=None)]
        result = await self.run_estimate(rows)
        self.assertEqual(result.comparison.total_used, 7)

    async def test_small_rare_group_gets_an_explicitly_limited_estimate(self):
        for count in (7, 8):
            rows = [listing(i, mileage=800000, engine="6", gearbox="Mecanică") for i in range(1, count + 1)]
            result = await self.run_estimate(rows)
            self.assertTrue(result.estimate_available)
            self.assertTrue(result.comparison.limited_market_data)
            self.assertIn("Date de piață limitate", result.comparison.message)
            self.assertEqual(result.comparison.near_engine_count, 0)

    async def test_fewer_than_seven_never_invent_price_ranges(self):
        for count in range(7):
            mode = "no_comparables" if count == 0 else "single_comparable" if count == 1 else "very_limited"
            with patch("services.price_estimate.weighted_percentile") as estimator:
                result = await self.run_estimate([listing(i) for i in range(1, count + 1)])
                estimator.assert_not_called()
            self.assertFalse(result.estimate_available)
            self.assertIsNone(result.estimate)
            self.assertIsNone(result.market_stats)
            self.assertIsNone(result.distribution)
            self.assertIn("minimum 7", result.comparison.message)
            self.assertEqual(result.comparison.comparison_mode, mode)
            self.assertEqual(result.reference_price, 14100 if count == 1 else None)

    async def test_rare_luxury_comparisons_do_not_borrow_from_other_models(self):
        data = payload(brand="Bentley", model="Bentayga", generation="I (2015 - prezent)", engine=6, body_type="SUV")
        rows = [listing(i, brand="Bentley", model="Bentayga", generation=data["generation"],
                        year=2016 + i, mileage=i * 50000, engine="4", body_type="SUV", price_eur=str(80000 + i * 10000))
                for i in range(1, 8)]
        rows += [listing(i, brand="BMW", model="X5", engine="4", price_eur="30000") for i in range(100, 140)]
        result = await self.run_estimate(rows, data)
        self.assertTrue(result.estimate_available)
        self.assertEqual(result.comparison.total_used, 7)
        self.assertGreaterEqual(result.estimate.market_price, 90000)

    async def test_broad_configuration_variants_are_not_deleted_as_price_outliers(self):
        rows = [listing(i, price_eur="14000") for i in range(1, 10)]
        rows += [listing(20, price_eur="100000", fuel_type="Hybrid", engine="6")]
        result = await self.run_estimate(rows)
        self.assertEqual(result.comparison.total_used, 10)
        self.assertEqual(result.market_stats.highest_price, 100000)
        self.assertEqual(result.estimate.market_price, 14000)
        self.assertEqual(result.estimate.higher_asking.max, 14000)

    async def test_missing_specifications_do_not_exclude_an_existing_price(self):
        rows = [listing(i, year=None, mileage=None, engine=None, fuel_type=None,
                        gearbox=None, drivetrain=None, body_type=None) for i in range(1, 8)]
        result = await self.run_estimate(rows)
        self.assertTrue(result.estimate_available)
        self.assertEqual(result.comparison.total_used, 7)
        self.assertIsNone(result.market_stats.average_year)
        self.assertIsNone(result.market_stats.average_mileage)
        self.assertTrue(result.comparison.limited_market_data)

    async def test_duplicates_still_cannot_inflate_support(self):
        rows = [listing(1), listing(2)]
        rows += [rows[0], {**rows[1], "id": 20}, {**rows[1], "id": 21, "url": "https://different.test"}]
        result = await self.run_estimate(rows)
        self.assertEqual(result.comparison.total_used, 2)
        self.assertFalse(result.estimate_available)

    async def test_usable_prices_required_but_missing_engine_is_only_a_soft_difference(self):
        for price in (None, "NaN", "Infinity", "garbage", 0, -1):
            result = await self.run_estimate([listing(i, price_eur=price) for i in range(1, 10)])
            self.assertEqual(result.comparison.total_used, 0)
        for engine in (None, "NaN", "garbage", "6", "0"):
            result = await self.run_estimate([listing(i, engine=engine) for i in range(1, 8)])
            self.assertTrue(result.estimate_available)
            self.assertEqual(result.comparison.total_used, 7)

    async def test_ev_and_hybrid_targets_accept_all_generation_variants(self):
        for fuel, engine in (("Electricitate", None), ("Electricitate", 0), ("Hybrid", 2)):
            rows = [listing(i, fuel_type="Electricitate" if i % 2 else "Diesel", engine=None) for i in range(1, 9)]
            result = await self.run_estimate(rows, payload(fuel_type=fuel, engine=engine))
            self.assertTrue(result.estimate_available)
            self.assertEqual(result.comparison.total_used, 8)
            self.assertEqual(len(self.calls), 2)

    async def test_many_close_matches_still_keep_broader_generation_variants(self):
        rows = [listing(i) for i in range(1, 9)] + [listing(20, year=2011, mileage=450000)]
        result = await self.run_estimate(rows)
        self.assertEqual(result.comparison.total_used, 9)
        self.assertEqual(result.comparison.direct_count, 8)
        self.assertEqual(result.comparison.normal_fallback_added, 1)
        self.assertFalse(result.comparison.limited_market_data)

    async def test_year_and_mileage_can_move_the_estimate_without_changing_the_pool(self):
        year_rows = [listing(i, year=2011, price_eur="10000") for i in range(1, 5)]
        year_rows += [listing(i, year=2018, price_eur="20000") for i in range(5, 9)]
        newer = await self.run_estimate(year_rows)
        older = await self.run_estimate(year_rows, payload(year=2012, year_min=2011))
        self.assertEqual(newer.comparison.total_used, older.comparison.total_used)
        self.assertGreater(newer.estimate.market_price, older.estimate.market_price)
        mileage_rows = [listing(i, mileage=10000 + i, price_eur="20000") for i in range(1, 5)]
        mileage_rows += [listing(i, mileage=400000 + i, price_eur="10000") for i in range(5, 9)]
        lower = await self.run_estimate(mileage_rows, payload(mileage=10000, mileage_min=0))
        higher = await self.run_estimate(mileage_rows, payload(mileage=400000, mileage_max=1000000))
        self.assertEqual(lower.comparison.total_used, higher.comparison.total_used)
        self.assertGreater(lower.estimate.market_price, higher.estimate.market_price)

    async def test_equal_prices_keep_the_existing_three_ranges(self):
        result = await self.run_estimate([listing(i, price_eur="14000") for i in range(1, 9)])
        self.assertEqual(result.estimate.market_price, 14000)
        self.assertEqual(result.estimate.normal.min, result.estimate.normal.max)

    async def test_invalid_input_categories_remain_rejected(self):
        for changes in ({"engine": 1.9}, {"gearbox": "Automatic"}, {"engine": None}, {"fuel_type": "unknown"}):
            with self.assertRaises(PriceEstimateError) as caught:
                await self.run_estimate([], payload(**changes))
            self.assertEqual(caught.exception.status_code, 422)

    async def test_upstream_errors_remain_controlled(self):
        for response in (httpx.Response(500), httpx.Response(200, text="not json")):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: response), base_url="http://internal") as client:
                with self.assertRaises(PriceEstimateError) as caught:
                    await PriceEstimateService(client).estimate(PriceEstimateRequest(**payload()))
                self.assertEqual(caught.exception.status_code, 502)


class RouteIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        table = Listing.__table__.to_metadata(MetaData())
        for column in Listing.__mapper__.columns:
            table.c[column.name].type = column.type
        with self.engine.begin() as connection:
            connection.execute(CreateTable(table))
        with Session(self.engine) as db:
            for i in range(1, 9):
                row = listing(i)
                row["class_"] = row.pop("class")
                db.add(Listing(**row))
            db.commit()
        self.statements = []
        event.listen(self.engine, "before_cursor_execute", lambda conn, cursor, statement, *args: self.statements.append(statement))
        app = FastAPI()
        app.include_router(listings_router)
        app.include_router(estimate_router)

        def test_db():
            with Session(self.engine) as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_real_listings_router_returns_read_only_generation_estimate(self):
        response = self.client.post("/price-estimate", json=payload())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["estimate_available"])
        self.assertEqual(response.json()["comparison"]["total_used"], 8)
        self.assertTrue(all(statement.lstrip().startswith("SELECT") for statement in self.statements))
        self.assertEqual(self.client.get("/price-estimate").status_code, 405)

    def test_yaris_uses_the_whole_generation_even_outside_legacy_bounds(self):
        vehicle = dict(brand="Toyota", model="Yaris", generation="I (1999 - 2005)",
                       engine="1.0", fuel_type="Benzină", gearbox="Mecanică",
                       drivetrain="Din față", body_type="Hatchback")
        samples = [(2000, 201000, 2200), (2002, 220000, 850), (2003, 272000, 1900),
                   (2002, 315000, 3000), (2002, 330000, 1700)]
        with Session(self.engine) as db:
            db.execute(delete(Listing))
            for i, (year, mileage, price) in enumerate(samples, 1):
                db.add(Listing(id=i, year=year, mileage=mileage, price_eur=price, **vehicle))
            db.add(Listing(id=20, year=2005, mileage=110000, price_eur=4000,
                           **{**vehicle, "engine": "1.3", "fuel_type": "Diesel", "gearbox": "Automată", "body_type": "Sedan"}))
            db.add(Listing(id=21, year=2002, mileage=270000, price_eur=9000,
                           **{**vehicle, "generation": "II (2005 - 2011)"}))
            db.commit()
        request = payload(**vehicle, year=2002, mileage=270000, year_min=2000, year_max=2004,
                          mileage_min=240000, mileage_max=300000)
        result = self.client.post("/price-estimate", json=request).json()
        self.assertFalse(result["estimate_available"])
        self.assertIsNone(result["estimate"])
        self.assertEqual(result["comparison"]["total_used"], 6)
        self.assertEqual(result["search"]["effective_year_max"], 2005)
        self.assertEqual(result["search"]["mileage_min"], 110000)

    def test_three_listings_cannot_be_supplemented_with_other_models(self):
        with Session(self.engine) as db:
            db.execute(delete(Listing).where(Listing.id.between(4, 8)))
            for i in range(100, 140):
                row = listing(i, brand="Audi", model="A4")
                row["class_"] = row.pop("class")
                db.add(Listing(**row))
            db.commit()
        result = self.client.post("/price-estimate", json=payload()).json()
        self.assertFalse(result["estimate_available"])
        self.assertIsNone(result["estimate"])
        self.assertEqual(result["comparison"]["total_used"], 3)
        self.assertTrue(result["comparison"]["limited_market_data"])
        self.assertEqual(result["comparison"]["similar_model_count"], 0)

    def test_invalid_combinations_and_ranges_remain_422(self):
        for changes in ({"brand": "Audi"}, {"year": 2021}, {"mileage_min": 130000}, {"body_type": "invented"}):
            self.assertEqual(self.client.post("/price-estimate", json=payload(**changes)).status_code, 422)

    def test_current_year_with_frontend_capped_bounds_is_accepted(self):
        year = date.today().year
        generation = f"III ({year - 1} - prezent)"
        with Session(self.engine) as db:
            db.execute(delete(Listing))
            for i in range(1, 8):
                row = listing(i, year=year, generation=generation)
                row["class_"] = row.pop("class")
                db.add(Listing(**row))
            db.commit()
        request = payload(year=year, generation=generation, year_min=year-2, year_max=year+1)
        response = self.client.post("/price-estimate", json=request)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["estimate_available"])


if __name__ == "__main__":
    unittest.main()
