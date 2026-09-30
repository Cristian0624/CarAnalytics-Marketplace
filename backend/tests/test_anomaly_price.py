"""Price-policy unit tests and SQLite-to-HTTP integration without CatBoost."""
import builtins
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, insert
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.schema import CreateTable

from anomaly_risk_schemas import AnomalyRiskResponse
from database import get_db
from models import Listing
from repositories.anomaly_comparisons import AnomalyComparisonsRepository
from routers import anomaly_risk as route
from services.anomaly_risk import AnomalyRiskService, FEATURES, Q_NAMES, SCORING_POLICY


VEHICLE = {"brand": "Peugeot", "model": "308", "generation": "I (2007 - 2013)", "price": 5000}
PRICES = np.linspace(4000, 6000, 21).tolist()


def write_scoring_metadata(directory):
    """Minimal scoring metadata, with no model or saved comparison statistics."""
    numeric = ["year", "mileage", "engine"]
    categorical = [field for field in FEATURES if field not in numeric]
    metadata = {
        "model_version": "anomaly-risk-v2",
        "scoring_policy_version": "anomaly-risk-v2.3",
        "input_feature_names": FEATURES,
        "feature_names": FEATURES,
        "derived_features": [],
        "categorical_feature_names": categorical,
        "numeric_feature_names": numeric,
        "missing_category": "__MISSING__",
        "anomaly_scoring_constants": {
            **SCORING_POLICY,
            "spread_floor": 1.0, "inner_score": 20.0, "outer_score": 60.0,
            "tail_width_fraction": .1, "risk_medium": 25.0, "risk_high": 50.0,
            "mileage_min_samples": 20, "nearby_year_radius": 2, "spec_min_samples": 25,
            "engine_tolerance": .051, "spec_max_rarity_score": 60.0,
            "spec_rare_frequency": .05, "spec_very_rare_frequency": .01,
            "spec_outside_year_score": 80.0,
            "confidence_model_support": 200, "confidence_generation_support": 100,
            "confidence_mileage_support": 100, "confidence_spec_support": 100,
            "confidence_relative_width_scale": 1.0,
            "confidence_medium": 45.0, "confidence_high": 75.0,
        },
    }
    directory.joinpath("model_metadata.json").write_text(json.dumps(metadata), encoding="utf-8")


class DatabasePriceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.artifacts = Path(self.directory.name)
        write_scoring_metadata(self.artifacts)
        self.service = AnomalyRiskService(self.artifacts)
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        # The app has two mappings of this table with duplicate index names.
        with self.engine.begin() as connection:
            connection.execute(CreateTable(Listing.__table__))
        self.session = Session(self.engine)
        self.addCleanup(self.session.close)
        self.repository = AnomalyComparisonsRepository(self.session)
        self.app = FastAPI()
        self.app.include_router(route.router)

        def session_dependency():
            with Session(self.engine) as session:
                yield session

        self.app.dependency_overrides[get_db] = session_dependency
        self.app.dependency_overrides[route.get_anomaly_risk_service] = lambda: self.service

    def seed(self, prices, **identity):
        rows = [dict(id=index + 1, **{key: VEHICLE[key] for key in ("brand", "model", "generation")},
                     price_eur=price, **identity) for index, price in enumerate(prices)]
        self.session.execute(delete(Listing))
        if rows:
            self.session.execute(insert(Listing.__table__), rows)
        self.session.commit()

    def get_prices(self, vehicle=None):
        vehicle = vehicle or VEHICLE
        return self.repository.get_prices(vehicle["brand"], vehicle["model"], vehicle.get("generation"),
                                          vehicle.get("listing_id"))

    def test_support_boundaries(self):
        for count in (0, 1, 4, 9, 10, 19, 20, 100):
            with self.subTest(count=count):
                self.seed([5000] * count)
                result = self.service.analyze_price_anomaly(5000, self.get_prices())
                self.assertEqual(result["count"], count)
                if count < 10:
                    self.assertEqual(result["support_level"], "insufficient")
                    self.assertEqual(result["reason"], "insufficient_market_support")
                    self.assertEqual(result["direction"], "unknown")
                    self.assertIsNone(result["price_anomaly_score"])
                    self.assertTrue(all(result[name] is None for name in Q_NAMES))
                else:
                    self.assertEqual(result["support_level"], "limited" if count < 20 else "normal")
                    self.assertEqual(result["price_anomaly_score"], 0)

    def test_database_percentiles_and_scoring_landmarks(self):
        self.seed(PRICES)
        prices = self.get_prices()
        quantiles = np.percentile(PRICES, [10, 25, 50, 75, 90])
        for actual, score in zip(quantiles, [60, 20, 0, 20, 60]):
            with self.subTest(actual=actual):
                result = self.service.analyze_price_anomaly(actual, prices)
                np.testing.assert_allclose([result[name] for name in Q_NAMES], quantiles)
                self.assertAlmostEqual(result["price_anomaly_score"], score)

    def test_extreme_flags_require_score_distance_and_25_usable_comparisons(self):
        flag = self.service.extreme_anomaly_flag
        for component in ("price", "mileage"):
            with self.subTest(component=component):
                self.assertIsNone(flag(component, 150, 100, 100, 24))
                self.assertIsNone(flag(component, 150, 100, 79.99, 25))
                self.assertIsNone(flag(component, 124.99, 100, 100, 25))
                self.assertEqual(flag(component, 125, 100, 80, 25), f"extreme_{component}_high")
                self.assertEqual(flag(component, 75, 100, 80, 25), f"extreme_{component}_low")
                self.assertIsNone(flag(component, None, None, None, 25))
                self.assertIsNone(flag(component, 100, 0, 100, 25))

    def test_http_flags_both_tails_and_preserves_weighted_total(self):
        self.seed(np.linspace(4000, 6000, 25).tolist(), mileage=150000, year=2011,
                  engine="1.6", fuel_type="Benzină", gearbox="Mecanică",
                  drivetrain="Din față", body_type="Hatchback")
        vehicle = VEHICLE | {"year": 2011, "engine": 1.6, "fuel_type": "Benzină",
                             "gearbox": "Mecanică", "drivetrain": "Din față", "body_type": "Hatchback"}
        with TestClient(self.app) as client:
            for actual_price, mileage, direction in [(1000, 1000, "low"), (12000, 500000, "high")]:
                with self.subTest(direction=direction):
                    response = client.post("/anomaly-risk", json=vehicle | {"price": actual_price, "mileage": mileage})
                    self.assertEqual(response.status_code, 200, response.text)
                    result = response.json()
                    self.assertEqual(result["components"]["price_anomaly"]["flag"], f"extreme_price_{direction}")
                    self.assertEqual(result["components"]["mileage_anomaly"]["flag"], f"extreme_mileage_{direction}")
                    self.assertEqual(result["effective_weights"], {"price": .6, "mileage": .25, "specification": .15})
                    expected = sum(weight * result["components"][name + "_anomaly"]["score"]
                                   for name, weight in result["effective_weights"].items())
                    self.assertAlmostEqual(result["anomaly_score"], expected + result["market_support"]["rarity_penalty"])

            normal = client.post("/anomaly-risk", json=vehicle | {"price": 5000, "mileage": 150000}).json()
            self.assertIsNone(normal["components"]["price_anomaly"]["flag"])
            self.assertIsNone(normal["components"]["mileage_anomaly"]["flag"])
            excluded = client.post("/anomaly-risk", json=vehicle | {"listing_id": 1, "price": 12000, "mileage": 500000}).json()
            self.assertEqual(excluded["components"]["price_anomaly"]["count"], 24)
            self.assertIsNone(excluded["components"]["price_anomaly"]["flag"])
            self.assertIsNone(excluded["components"]["mileage_anomaly"]["flag"])

    def test_flag_support_is_per_component_and_missing_components_still_reweight(self):
        prices = [5000] * 25
        rows = [{"mileage": 150000}] * 24 + [{"mileage": None}]
        result = self.service.assess_listing_risk(VEHICLE | {"price": 12000, "mileage": 500000}, prices, 25, rows)
        self.assertEqual(result["components"]["price_anomaly"]["flag"], "extreme_price_high")
        self.assertIsNone(result["components"]["mileage_anomaly"]["flag"])
        self.assertAlmostEqual(result["effective_weights"]["price"], .6 / .85)
        self.assertAlmostEqual(result["effective_weights"]["mileage"], .25 / .85)
        self.assertNotIn("specification", result["effective_weights"])
        missing = self.service.assess_listing_risk(VEHICLE, prices, 25, rows)
        self.assertIsNone(missing["components"]["mileage_anomaly"]["flag"])
        self.assertEqual(missing["effective_weights"], {"price": 1})

    def test_nearly_identical_comparisons_do_not_flag_small_changes(self):
        result = self.service.assess_listing_risk(
            VEHICLE | {"price": 5010, "mileage": 150010}, [5000] * 25, 25, [{"mileage": 150000}] * 25
        )
        for component in ("price_anomaly", "mileage_anomaly"):
            self.assertGreater(result["components"][component]["score"], 80)
            self.assertIsNone(result["components"][component]["flag"])

    def test_price_eur_is_used_without_trimming_or_deduplication(self):
        prices = [4000] * 18 + [10000, 100000]
        self.seed(prices, price=1, currency="USD", original_price=2)
        actual = self.service.analyze_price_anomaly(4000, self.get_prices())
        self.assertEqual(actual["count"], 20)
        np.testing.assert_allclose([actual[name] for name in Q_NAMES], np.percentile(prices, [10, 25, 50, 75, 90]))

    def test_exact_identity_and_no_fallback(self):
        self.seed(PRICES)
        contaminants = [
            {"brand": "Other"}, {"model": "Other"}, {"generation": "II (2013 - 2021)"},
            {"generation": None}, {"brand": "peugeot"}, {"model": "308 SW"},
        ]
        rows = []
        for index, change in enumerate(contaminants):
            rows.append({**{key: VEHICLE[key] for key in ("brand", "model", "generation")},
                         "id": 100 + index, "price_eur": 999999, **change})
        self.session.execute(insert(Listing.__table__), rows)
        self.session.commit()
        self.assertEqual(self.get_prices(), PRICES)
        for change in ({"brand": "Missing"}, {"model": "Missing"}, {"generation": "Missing"}):
            with self.subTest(change=change):
                prices = self.get_prices(VEHICLE | change)
                self.assertEqual(prices, [])
                self.assertIsNone(self.service.analyze_price_anomaly(5000, prices)["price_anomaly_score"])
        self.assertEqual(len(self.get_prices(VEHICLE | {"generation": None})), len(PRICES) + 2)

    def test_optional_characteristics_do_not_change_price_group_or_score(self):
        self.seed(PRICES, year=2008, mileage=500000, engine="3", fuel_type="Diesel",
                  gearbox="Mecanică", drivetrain="Din față", body_type="Universal")
        with TestClient(self.app) as client:
            baseline = client.post("/anomaly-risk", json=VEHICLE)
            changed = client.post("/anomaly-risk", json=VEHICLE | {
                "year": 2013, "mileage": 1, "engine": 1.2, "fuel_type": "Benzină",
                "gearbox": "Automată", "drivetrain": "Din spate", "body_type": "Cabriolet",
            })
        self.assertEqual(baseline.status_code, 200, baseline.text)
        self.assertEqual(changed.status_code, 200, changed.text)
        self.assertEqual(baseline.json()["components"]["price_anomaly"], changed.json()["components"]["price_anomaly"])

    def test_outside_values_approach_100_continuously(self):
        prices = np.linspace(9900, 10100, 21)
        score = lambda price: self.service.analyze_price_anomaly(price, prices)["price_anomaly_score"]
        self.assertGreater(score(1), 99)
        self.assertGreater(score(1_000_000), 99)
        self.assertLessEqual(score(1_000_000), 100)
        boundary = np.percentile(prices, 90)
        self.assertLess(abs(score(boundary + .0001) - score(boundary - .0001)), .001)
        self.assertLess(score(boundary + 1), score(boundary + 10))

    def test_listing_id_exclusion_changes_count_before_support_check(self):
        self.seed(PRICES[:10])
        with TestClient(self.app) as client:
            manual = client.post("/anomaly-risk", json=VEHICLE).json()["components"]["price_anomaly"]
            excluded = client.post("/anomaly-risk", json=VEHICLE | {"listing_id": 1}).json()["components"]["price_anomaly"]
            absent = client.post("/anomaly-risk", json=VEHICLE | {"listing_id": 999}).json()["components"]["price_anomaly"]
        self.assertEqual(manual["count"], 10)
        self.assertEqual(excluded["count"], 9)
        self.assertIsNone(excluded["score"])
        self.assertEqual(absent, manual)

    def test_current_database_count_drives_price_support_rarity_and_confidence(self):
        self.seed(PRICES[:17])
        with TestClient(self.app) as client:
            response = client.post("/anomaly-risk", json=VEHICLE)
            excluded = client.post("/anomaly-risk", json=VEHICLE | {"listing_id": 1})

        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result["components"]["price_anomaly"]["count"], 17)
        self.assertEqual(result["market_support"]["model_generation_observations"], 17)
        self.assertEqual(result["market_support"]["support_level"], "limited")
        self.assertEqual(result["confidence"]["model_observations"], 17)
        self.assertEqual(result["confidence"]["generation_observations"], 17)
        self.assertEqual(excluded.json()["market_support"]["model_generation_observations"], 16)
        self.assertEqual(excluded.json()["confidence"]["model_observations"], 16)

    def test_yaris_uses_all_29_live_listings_and_refreshes_on_next_request(self):
        vehicle = {
            "brand": "Toyota", "model": "Yaris", "generation": "I (1999 - 2005)",
            "price": 3000, "mileage": 200000, "engine": 1.3,
        }
        rows = [
            dict(id=index + 1, brand="Toyota", model="Yaris", generation=vehicle["generation"],
                 price_eur=2000 + index * 100, mileage=150000 + index * 5000,
                 year=1999 + index % 7, engine="1.3")
            for index in range(29)
        ]
        self.session.execute(insert(Listing.__table__), rows[:20])
        self.session.commit()
        with TestClient(self.app) as client:
            before = client.post("/anomaly-risk", json=vehicle)
            self.assertEqual(before.status_code, 200, before.text)
            self.assertEqual(before.json()["components"]["price_anomaly"]["count"], 20)

            self.session.execute(insert(Listing.__table__), rows[20:])
            self.session.commit()
            after = client.post("/anomaly-risk", json=vehicle)

        self.assertEqual(after.status_code, 200, after.text)
        result = after.json()
        price = result["components"]["price_anomaly"]
        self.assertEqual(price["count"], 29)
        self.assertEqual(result["market_support"]["model_generation_observations"], 29)
        self.assertEqual(result["confidence"]["generation_observations"], 29)
        self.assertEqual(result["market_confidence"], "medium")
        self.assertEqual(result["components"]["mileage_anomaly"]["sample_size"], 29)
        engine_signal = next(signal for signal in result["components"]["specification_anomaly"]["signals"]
                             if signal["field"] == "engine")
        self.assertEqual(engine_signal["sample_size"], 29)
        np.testing.assert_allclose([price[name] for name in Q_NAMES],
                                   np.percentile([row["price_eur"] for row in rows], [10, 25, 50, 75, 90]))

    def test_all_vehicle_groups_use_complete_model_or_selected_generation(self):
        identities = [("Toyota", "Yaris"), ("Peugeot", "308"), ("BMW", "3 Series"),
                      ("Test brand", "Unseen model")]
        for brand, model in identities:
            with self.subTest(brand=brand, model=model):
                self.session.execute(delete(Listing))
                rows = []
                for generation, count, first_price in [("Gen A", 31, 3000), ("Gen B", 27, 10000)]:
                    for index in range(count):
                        rows.append(dict(
                            id=len(rows) + 1, brand=brand, model=model, generation=generation,
                            price_eur=first_price + index * 100,
                            year=2001 if index < 20 else 2005, mileage=100000 + index * 5000,
                            engine="1.6", fuel_type="Diesel", gearbox="Mecanică",
                            drivetrain="Din față", body_type="Hatchback",
                        ))
                # Neither a different model nor the same model name under another brand belongs.
                rows += [dict(rows[0], id=1000, model="Other model"),
                         dict(rows[0], id=1001, brand="Other brand")]
                self.session.execute(insert(Listing.__table__), rows)
                self.session.commit()
                payload = dict(brand=brand, model=model, price=4500, year=2001,
                               mileage=180000, engine=1.6, fuel_type="Diesel",
                               gearbox="Mecanică", drivetrain="Din față", body_type="Hatchback")
                with TestClient(self.app) as client:
                    for generation, count in [("Gen A", 31), ("Gen B", 27), (None, 58)]:
                        response = client.post("/anomaly-risk", json=payload | {"generation": generation})
                        self.assertEqual(response.status_code, 200, response.text)
                        result = response.json()
                        self.assertEqual(result["market_support"]["model_generation_observations"], count)
                        self.assertEqual(result["confidence"]["model_observations"], count)
                        self.assertEqual(result["confidence"]["generation_observations"], count)
                        components = result["components"]
                        self.assertEqual(components["price_anomaly"]["count"], count)
                        self.assertEqual(components["mileage_anomaly"]["sample_size"], count)
                        self.assertEqual(components["specification_anomaly"]["sample_size"], count)
                        self.assertEqual(components["specification_anomaly"]["supported_fields"], 6)
                        selected = [row for row in rows if row["brand"] == brand and row["model"] == model
                                    and (generation is None or row["generation"] == generation)]
                        self.assertAlmostEqual(components["price_anomaly"]["p50"],
                                               float(np.median([row["price_eur"] for row in selected])))
                        self.assertAlmostEqual(components["mileage_anomaly"]["p50"],
                                               float(np.median([row["mileage"] for row in selected])))

    def test_generation_selects_one_group_and_blank_generation_selects_model(self):
        self.seed([5000] * 10, year=2011, mileage=210000, engine=1.6,
                  fuel_type="Benzină", gearbox="Mecanică", drivetrain="Din față", body_type="Hatchback")
        other_generation = [
            dict(id=100 + index, brand="Peugeot", model="308", generation="II (2013 - 2021)",
                 price_eur=10000, year=2018, mileage=80000 + index * 1000, engine=1.6,
                 fuel_type="Diesel", gearbox="Automată", drivetrain="Din față", body_type="Hatchback")
            for index in range(30)
        ]
        self.session.execute(insert(Listing.__table__), other_generation)
        self.session.commit()

        payload = VEHICLE | {"year": 2011, "mileage": 210000, "engine": 1.6,
                             "fuel_type": "Benzină", "gearbox": "Mecanică",
                             "drivetrain": "Din față", "body_type": "Hatchback"}
        with TestClient(self.app) as client:
            specific = client.post("/anomaly-risk", json=payload)
            broad = client.post("/anomaly-risk", json=payload | {"generation": None})

        self.assertEqual(specific.status_code, 200, specific.text)
        self.assertEqual(broad.status_code, 200, broad.text)
        specific_data, broad_data = specific.json(), broad.json()
        self.assertEqual(specific_data["components"]["price_anomaly"]["count"], 10)
        self.assertEqual(specific_data["components"]["price_anomaly"]["p50"], 5000)
        self.assertEqual(specific_data["components"]["price_anomaly"]["comparison_level"], "model_generation")
        self.assertEqual(specific_data["components"]["mileage_anomaly"]["sample_size"], 10)
        self.assertIsNone(specific_data["components"]["mileage_anomaly"]["score"])
        self.assertEqual(specific_data["components"]["specification_anomaly"]["supported_fields"], 0)

        self.assertEqual(broad_data["components"]["price_anomaly"]["count"], 40)
        self.assertEqual(broad_data["components"]["price_anomaly"]["comparison_level"], "model")
        self.assertEqual(broad_data["market_support"]["model_generation_observations"], 40)
        self.assertEqual(broad_data["components"]["mileage_anomaly"]["comparison_level"], "model")
        self.assertEqual(broad_data["components"]["mileage_anomaly"]["sample_size"], 40)
        self.assertEqual(broad_data["components"]["specification_anomaly"]["supported_fields"], 6)

    def test_listing_id_exclusion_applies_to_all_components(self):
        self.seed([5000] * 30, year=2011, mileage=210000, engine=1.6,
                  fuel_type="Benzină", gearbox="Mecanică", drivetrain="Din față", body_type="Hatchback")
        payload = VEHICLE | {"year": 2011, "mileage": 210000, "engine": 1.6,
                             "fuel_type": "Benzină", "gearbox": "Mecanică",
                             "drivetrain": "Din față", "body_type": "Hatchback"}
        with TestClient(self.app) as client:
            manual = client.post("/anomaly-risk", json=payload).json()
            excluded = client.post("/anomaly-risk", json=payload | {"listing_id": 1}).json()
        self.assertEqual(manual["components"]["mileage_anomaly"]["sample_size"], 30)
        self.assertEqual(manual["components"]["specification_anomaly"]["supported_fields"], 6)
        self.assertEqual(excluded["components"]["price_anomaly"]["count"], 29)
        self.assertIsNotNone(excluded["components"]["mileage_anomaly"]["score"])
        self.assertEqual(excluded["components"]["mileage_anomaly"]["sample_size"], 29)
        self.assertEqual(excluded["components"]["specification_anomaly"]["supported_fields"], 6)

    def test_excluded_price_is_not_in_percentiles(self):
        self.seed([999999] + PRICES)
        prices = self.get_prices(VEHICLE | {"listing_id": 1})
        result = self.service.analyze_price_anomaly(5000, prices)
        self.assertEqual(result["count"], 21)
        self.assertEqual(result["p50"], 5000)
        self.assertEqual(result["p90"], 5800)

    def test_no_components_means_no_overall_score_or_rarity_only_verdict(self):
        result = self.service.assess_listing_risk(VEHICLE, [], 200, [])
        self.assertIsNone(result["anomaly_score"])
        self.assertIsNone(result["risk_level"])
        self.assertEqual(result["effective_weights"], {})
        self.assertEqual(result["assessment_status"], "very_rare")
        self.assertEqual(result["market_confidence"], "low")
        self.assertIsNone(result["confidence"]["p10_p90_width"])
        AnomalyRiskResponse(model_version="anomaly-risk-v2", **result)

    def test_few_listings_suppress_price_mileage_and_specification(self):
        self.seed([5000] * 9, mileage=80000, year=2011, engine=1.6,
                  fuel_type="Benzină", gearbox="Mecanică", drivetrain="Din față", body_type="Hatchback")
        with TestClient(self.app) as client:
            response = client.post("/anomaly-risk", json=VEHICLE | {"mileage": 80000, "year": 2011})
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertIsNone(result["components"]["price_anomaly"]["score"])
        self.assertIsNone(result["components"]["mileage_anomaly"]["score"])
        self.assertIsNone(result["components"]["specification_anomaly"]["score"])
        self.assertIsNone(result["anomaly_score"])

    def test_endpoint_without_catboost_or_price_artifacts(self):
        self.seed(PRICES)
        self.app.dependency_overrides.pop(route.get_anomaly_risk_service)
        original_import = builtins.__import__

        def forbid_catboost(name, *args, **kwargs):
            if name == "catboost" or name.startswith("catboost."):
                raise AssertionError("Runtime attempted to import CatBoost")
            return original_import(name, *args, **kwargs)

        with patch.dict(os.environ, {"ANOMALY_RISK_ARTIFACT_DIR": str(self.artifacts)}), \
             patch.object(route, "_service", None), patch("builtins.__import__", side_effect=forbid_catboost):
            with TestClient(self.app) as client:
                response = client.post("/anomaly-risk", json=VEHICLE)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertFalse(hasattr(route._service, "model"))
            self.assertFalse(hasattr(route._service, "calibration"))
        result = response.json()
        self.assertEqual(result["components"]["price_anomaly"]["p50"], 5000)
        self.assertEqual(result["components"]["price_anomaly"]["source"], "database")
        self.assertIn("not fraud probabilities", result["interpretation"])

    def test_database_error_returns_safe_503(self):
        with patch.object(AnomalyComparisonsRepository, "get_prices", side_effect=RuntimeError("private database details")):
            with TestClient(self.app) as client:
                response = client.post("/anomaly-risk", json=VEHICLE)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private database details", response.text)


if __name__ == "__main__":
    unittest.main()
