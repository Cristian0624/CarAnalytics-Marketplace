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
        self.service = AnomalyRiskService()
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

    def test_extreme_transition_is_continuous_and_monotonic_in_both_directions(self):
        prices = np.linspace(1800, 3200, 30).tolist()
        rows = [{"mileage": 150000}] * 30
        for component, threshold, width in (("price", .45, .10), ("mileage", .65, .15)):
            for side in (-1, 1):
                with self.subTest(component=component, side=side):
                    scores, component_scores = [], []
                    for deviation in (threshold - .0001, threshold, threshold + .0001,
                                      threshold + width / 2, threshold + width, .99):
                        payload = VEHICLE | {"price": 2500, "mileage": 150000}
                        payload["price" if component == "price" else "mileage"] = (
                            2500 * (1 + side * deviation) if component == "price" else
                            round(150000 * (1 + side * deviation))
                        )
                        result = self.service.assess_listing_risk(payload, prices, 30, rows)
                        scores.append(result["anomaly_score"])
                        component_scores.append(result["components"][f"{component}_anomaly"]["score"])
                        self.assertAlmostEqual(result["anomaly_score"], min(100, sum(
                            weight * (result["components"][f"{name}_anomaly"]["score"] or 0)
                            for name, weight in result["effective_weights"].items()
                        ) + result["market_support"]["rarity_penalty"]))
                    self.assertLess(abs(scores[2] - scores[0]), .2)
                    self.assertEqual(scores, sorted(scores))
                    self.assertEqual(component_scores, sorted(component_scores))

    def test_self_exclusion_near_25_retains_a_strong_mileage_signal(self):
        self.seed([23000] * 25, mileage=155000)
        with TestClient(self.app) as client:
            payload = VEHICLE | {"price": 23000, "mileage": 10}
            full = client.post("/anomaly-risk", json=payload).json()
            excluded = client.post("/anomaly-risk", json=payload | {"listing_id": 1}).json()
        self.assertEqual(full["components"]["mileage_anomaly"]["sample_size"], 25)
        self.assertEqual(excluded["components"]["mileage_anomaly"]["sample_size"], 24)
        self.assertGreater(excluded["anomaly_score"], 90)
        self.assertLess(full["anomaly_score"] - excluded["anomaly_score"], 10)
        self.assertIsNone(excluded["components"]["mileage_anomaly"]["flag"])
        self.assertEqual(excluded["scoring_context"]["mode"], "blended")
        self.assertEqual(excluded["risk_level"], "high")

    def test_joint_boundaries_are_continuous_even_when_an_extreme_signal_is_compensated(self):
        prices = np.linspace(2000, 18000, 40).tolist()
        rows = [{"mileage": value} for value in np.linspace(50000, 250000, 40)]
        cases = (
            ("price", .7 / 1.65, 1.65), ("price", 1.3 / .85, .85),
            ("price", .40, 1.80), ("price", 2.50, .40),
            ("price", .75, 1.80), ("price", 1.25, .40),
            ("price", .85, 2.00), ("price", 1.15, .50),
            ("mileage", 1.3 / 1.65, 1.65), ("mileage", .7 / 1.65, 1.65),
            ("mileage", .35, 2.00), ("mileage", 2.50, .50),
            ("mileage", 1.25, .40), ("mileage", .75, 1.80),
            ("mileage", .85, 2.00), ("mileage", 1.15, .50),
        )
        for component, anchor, counterpart in cases:
            with self.subTest(component=component, anchor=anchor, counterpart=counterpart):
                totals = []
                for offset in (-.00001, 0, .00001):
                    price_ratio = anchor + offset if component == "price" else counterpart
                    mileage_ratio = counterpart if component == "price" else anchor + offset
                    result = self.service.assess_listing_risk(
                        VEHICLE | {"price": 10000 * price_ratio, "mileage": round(150000 * mileage_ratio)},
                        prices, 40, rows,
                    )
                    totals.append(result["anomaly_score"])
                    context = result["scoring_context"]
                    reconstructed = sum(
                        weight * result["components"][f"{name}_anomaly"]["score"]
                        for name, weight in result["effective_weights"].items()
                    ) + result["market_support"]["rarity_penalty"] + context["joint_penalty"] - context["joint_reduction"]
                    self.assertAlmostEqual(result["anomaly_score"], min(100, max(0, reconstructed)))
                self.assertLess(max(totals) - min(totals), .2)

    def test_supported_deviations_still_escalate_quickly_for_price_and_mileage(self):
        prices = np.linspace(4000, 16000, 40).tolist()
        rows = [{"mileage": value} for value in np.linspace(50000, 250000, 40)]
        # The deliberately broad bands must not hide serious median deviations.
        for component, side, deviations, minimum_final in (
            ("price", -1, (.45, .50, .55, .75, .99), 99),
            ("price", 1, (.45, .50, .55, .75, 1), 99),
            ("mileage", -1, (.65, .70, .80, .90, .99), 98),
            ("mileage", 1, (.65, .70, .80, 1, 2), 99),
        ):
            with self.subTest(component=component, side=side):
                totals = []
                for deviation in deviations:
                    vehicle = VEHICLE | {"price": 10000, "mileage": 150000}
                    vehicle[component] = (10000 if component == "price" else 150000) * (1 + side * deviation)
                    result = self.service.assess_listing_risk(vehicle, prices, 40, rows)
                    totals.append(result["anomaly_score"])
                self.assertEqual(totals, sorted(totals))
                self.assertGreater(totals[2] - totals[0], 20)
                self.assertGreaterEqual(totals[-1], minimum_final)

    def test_same_direction_price_mileage_combinations_never_improve_with_larger_deviations(self):
        prices = np.linspace(2000, 18000, 40).tolist()
        rows = [{"mileage": value} for value in np.linspace(50000, 250000, 40)]
        for side in (-1, 1):
            totals = []
            for deviation in (.05, .15, .25, .40, .50, .65, .80, .95):
                ratio = 1 + side * deviation
                result = self.service.assess_listing_risk(
                    VEHICLE | {"price": 10000 * ratio, "mileage": round(150000 * ratio)},
                    prices, 40, rows,
                )
                totals.append(result["anomaly_score"])
            self.assertEqual(totals, sorted(totals))
            self.assertLess(totals[0], 10)
            self.assertGreater(totals[-1], 95)

    def test_extreme_support_strength_changes_gradually_without_weakening_component_scores(self):
        totals = []
        for count in range(20, 31):
            result = self.service.assess_listing_risk(
                VEHICLE | {"mileage": 10}, [5000] * count, count, [{"mileage": 150000}] * count,
            )
            totals.append(result["anomaly_score"])
            self.assertGreater(result["components"]["mileage_anomaly"]["score"], 95)
            self.assertGreater(result["effective_weights"]["mileage"], .5)
        self.assertEqual(totals, sorted(totals))
        self.assertLess(max(right - left for left, right in zip(totals, totals[1:])), 10)
        self.assertGreater(totals[-1], 99)

    def test_entered_unscorable_mileage_is_partial_but_price_only_request_still_works(self):
        self.seed([4599] * 17, mileage=215000)
        with TestClient(self.app) as client:
            response = client.post("/anomaly-risk", json=VEHICLE | {"price": 4599, "mileage": 10})
            self.assertEqual(response.status_code, 200)
            partial = response.json()
            price_only = client.post("/anomaly-risk", json=VEHICLE | {"price": 4599}).json()
        self.assertEqual(partial["assessment_status"], "partial")
        self.assertIsNone(partial["anomaly_score"])
        self.assertIsNone(partial["risk_level"])
        self.assertEqual(partial["effective_weights"], {})
        self.assertEqual(partial["components"]["price_anomaly"]["score"], 0)
        self.assertEqual(partial["components"]["mileage_anomaly"]["expected_median_mileage"], 215000)
        self.assertIsNone(partial["components"]["mileage_anomaly"]["score"])
        self.assertEqual(price_only["assessment_status"], "limited_support")
        self.assertIsNotNone(price_only["anomaly_score"])
        self.assertEqual(partial["confidence_score"], price_only["confidence_score"])
        self.assertEqual(partial["market_confidence"], price_only["market_confidence"])

    def test_extreme_flags_require_distance_and_25_usable_comparisons_not_high_score(self):
        flag = self.service.extreme_anomaly_flag
        for component in ("price", "mileage"):
            with self.subTest(component=component):
                threshold = 45 if component == "price" else 65
                self.assertIsNone(flag(component, 200, 100, 100, 24))
                self.assertEqual(flag(component, 200, 100, 17, 25), f"extreme_{component}_high")
                for actual in (125, 75, 100 + threshold, 100 - threshold):
                    self.assertIsNone(flag(component, actual, 100, 100, 25))
                self.assertEqual(flag(component, 100 + threshold + .01, 100, 80, 25), f"extreme_{component}_high")
                self.assertEqual(flag(component, 100 - threshold - .01, 100, 80, 25), f"extreme_{component}_low")
                self.assertIsNone(flag(component, None, None, None, 25))
                self.assertIsNone(flag(component, 100, 0, 100, 25))

    def test_risk_labels_use_four_bands_without_changing_scores_or_confidence(self):
        confidence = None
        for score, expected in (
            (25, "low"), (29.9, "low"), (30, "medium"), (49.9, "medium"),
            (50, "medium_high"), (65, "medium_high"), (65.9, "medium_high"),
            (66, "high"), (100, "high"),
        ):
            with self.subTest(score=score):
                context = {"relation": "unavailable", "mode": "weighted",
                           "price_ratio": None, "mileage_ratio": None,
                           "balance_deviation": None, "joint_penalty": 0,
                           "joint_reduction": 0, "weighted_score": score,
                           "override_scores": {}, "extreme_score": None}
                with patch.object(self.service, "combine_component_scores",
                                  return_value=(score, {"price": 1}, context)):
                    result = self.service.assess_listing_risk(VEHICLE, [5000] * 30, 30, [])
                self.assertEqual(result["risk_level"], expected)
                self.assertEqual(result["anomaly_score"], score)
                AnomalyRiskResponse.model_validate({"model_version": "anomaly-risk-v2", **result})
                if confidence is None:
                    confidence = result["confidence"]
                self.assertEqual(result["confidence"], confidence)

    def test_ten_km_against_310k_median_overrides_low_percentile_score(self):
        # A broad lower tail kept the original mileage score below 80.
        mileages = [0] * 10 + [310000] * 15
        rows = [{"mileage": value} for value in mileages]
        result = self.service.assess_listing_risk(
            VEHICLE | {"mileage": 10}, [5000] * 25, 25, rows
        )
        mileage = result["components"]["mileage_anomaly"]
        self.assertEqual(mileage["expected_median_mileage"], 310000)
        self.assertEqual(mileage["score"], result["anomaly_score"])
        self.assertEqual(mileage["flag"], "extreme_mileage_low")
        self.assertGreater(result["anomaly_score"], 99.9)
        self.assertEqual(result["risk_level"], "high")
        self.assertEqual(result["effective_weights"], {"price": 0, "mileage": 1})

    def test_broad_price_distribution_also_overrides_low_percentile_score(self):
        for actual in (500, 1500):
            with self.subTest(price=actual):
                prices = [100] * 10 + [1000] * 5 + [2000] * 10
                result = self.service.assess_listing_risk(VEHICLE | {"price": actual}, prices, 25, [])
                self.assertEqual(result["scoring_context"]["mode"], "blended")
                self.assertAlmostEqual(result["scoring_context"]["extreme_strength"], .5)
                price_score = result["components"]["price_anomaly"]["score"]
                self.assertAlmostEqual(result["anomaly_score"], price_score + result["market_support"]["rarity_penalty"])
                self.assertLess(result["anomaly_score"], 80)

    def test_http_extreme_tails_override_weighted_total(self):
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
                    self.assertAlmostEqual(sum(result["effective_weights"].values()), 1.05)
                    self.assertGreaterEqual(result["anomaly_score"], 80)
                    self.assertEqual(result["risk_level"], "high")
                    self.assertEqual(result["anomaly_score"], 100)
                    self.assertGreater(result["effective_weights"]["price"], 0)
                    self.assertGreater(result["effective_weights"]["mileage"], 0)
                    self.assertEqual(set(result["scoring_context"]["override_scores"]), {"price", "mileage"})
                    self.assertEqual(result["market_support"]["rarity_penalty"], 0)

            normal = client.post("/anomaly-risk", json=vehicle | {"price": 5000, "mileage": 150000}).json()
            self.assertIsNone(normal["components"]["price_anomaly"]["flag"])
            self.assertIsNone(normal["components"]["mileage_anomaly"]["flag"])
            excluded = client.post("/anomaly-risk", json=vehicle | {"listing_id": 1, "price": 12000, "mileage": 500000}).json()
            self.assertEqual(excluded["components"]["price_anomaly"]["count"], 24)
            self.assertIsNone(excluded["components"]["price_anomaly"]["flag"])
            self.assertIsNone(excluded["components"]["mileage_anomaly"]["flag"])

    def test_each_extreme_component_alone_overrides_normal_components(self):
        rows = [{"mileage": 150000, "year": 2011}] * 25
        for component, values in (
            ("price", {"price": 1000, "mileage": 150000}),
            ("price", {"price": 12000, "mileage": 150000}),
            ("mileage", {"price": 5000, "mileage": 1000}),
            ("mileage", {"price": 5000, "mileage": 500000}),
        ):
            with self.subTest(component=component, values=values):
                result = self.service.assess_listing_risk(
                    VEHICLE | {"year": 2011} | values, [5000] * 25, 25, rows
                )
                self.assertEqual(result["risk_level"], "high")
                self.assertGreaterEqual(result["anomaly_score"], 80)
                self.assertAlmostEqual(result["anomaly_score"], result["components"][f"{component}_anomaly"]["score"])
                self.assertEqual(result["effective_weights"][component], 1)
                self.assertEqual(result["market_support"]["rarity_penalty"], 0)
                self.assertIn("determine the overall score", result["message"])

    def test_http_single_extreme_keeps_the_other_anomaly_in_every_direction(self):
        self.seed(np.linspace(4000, 6000, 30).tolist(), mileage=150000)
        cases = (
            (6200, 270000, "mileage"),  # Both high, only mileage extreme.
            (3800, 30000, "mileage"),   # Both low, only mileage extreme.
            (8000, 210000, "price"),   # Both high, only price extreme.
            (2000, 90000, "price"),    # Both low, only price extreme.
            (8000, 60000, "price"),    # Opposite, too unbalanced to compensate.
            (2000, 240000, "price"),
            (6500, 30000, "mileage"),
            (3500, 280000, "mileage"),
        )
        with TestClient(self.app) as client:
            for actual_price, actual_mileage, primary in cases:
                with self.subTest(price=actual_price, mileage=actual_mileage):
                    response = client.post("/anomaly-risk", json=VEHICLE | {
                        "price": actual_price, "mileage": actual_mileage,
                    })
                    self.assertEqual(response.status_code, 200, response.text)
                    result = response.json()
                    components = result["components"]
                    secondary = "mileage" if primary == "price" else "price"
                    primary_score = components[f"{primary}_anomaly"]["score"]
                    secondary_score = components[f"{secondary}_anomaly"]["score"]
                    self.assertIsNone(components[f"{secondary}_anomaly"]["flag"])
                    self.assertGreater(secondary_score, 0)
                    self.assertIn(result["scoring_context"]["mode"], {"extreme", "weighted"})
                    self.assertEqual(set(result["scoring_context"]["override_scores"]), {primary})
                    extreme_score = min(100, primary_score + .05 * secondary_score)
                    self.assertAlmostEqual(result["scoring_context"]["extreme_score"], extreme_score)
                    self.assertAlmostEqual(result["anomaly_score"], max(extreme_score, result["scoring_context"]["weighted_score"]))
                    if result["scoring_context"]["mode"] == "extreme":
                        self.assertEqual(result["effective_weights"], {primary: 1, secondary: .05})
                    else:
                        self.assertAlmostEqual(result["effective_weights"]["price"], .60 / .85)
                        self.assertAlmostEqual(result["effective_weights"]["mileage"], .25 / .85)
                    self.assertGreater(result["anomaly_score"], primary_score)
                    self.assertEqual(components[f"{secondary}_anomaly"][f"{secondary}_anomaly_score"], secondary_score)

                    baseline = client.post("/anomaly-risk", json=VEHICLE | {
                        "price": actual_price if primary == "price" else 5000,
                        "mileage": actual_mileage if primary == "mileage" else 150000,
                    }).json()
                    self.assertEqual(result["confidence"], baseline["confidence"])
                    self.assertEqual(baseline["anomaly_score"], primary_score)

    def test_secondary_contribution_is_gradual_and_never_reduces_the_extreme(self):
        price = {"actual_price": 6000, "p50": 5000, "count": 30,
                 "price_anomaly_score": 0, "flag": None}
        mileage = {"actual_mileage": 270000, "expected_median_mileage": 150000,
                   "sample_size": 30, "mileage_anomaly_score": 60, "flag": "extreme_mileage_high"}
        primary_score = self.service.extreme_override_score(270000, 150000, "mileage")
        totals = []
        for score in (0, 10, 30, 60):
            total, weights, context = self.service.combine_component_scores(
                {"price": score, "mileage": 60}, {**price, "price_anomaly_score": score},
                {**mileage}, 0,
            )
            self.assertAlmostEqual(total, primary_score + .05 * score)
            self.assertEqual(weights["price"], .05 if score > 0 else 0)
            self.assertEqual(context["mode"], "extreme")
            totals.append(total)
        self.assertEqual(totals, sorted(set(totals)))

        # Preserve the existing guard when the ordinary weighted result is higher.
        total, weights, context = self.service.combine_component_scores(
            {"price": 100, "mileage": 60}, {**price, "price_anomaly_score": 100}, {**mileage}, 0,
        )
        self.assertEqual(context["mode"], "weighted")
        self.assertEqual(total, context["weighted_score"])
        self.assertAlmostEqual(weights["price"], .60 / .85)
        self.assertAlmostEqual(weights["mileage"], .25 / .85)

    def test_gradual_override_distinguishes_mileage_deviations(self):
        rows = [{"mileage": 320000}] * 25
        scores = []
        for actual in (175999, 150000, 80000, 10, 0):
            with self.subTest(mileage=actual):
                result = self.service.assess_listing_risk(
                    VEHICLE | {"mileage": actual}, [5000] * 25, 25, rows
                )
                if actual >= 150000:
                    self.assertLess(result["anomaly_score"], 40)
                    self.assertIsNone(result["components"]["mileage_anomaly"]["flag"])
                elif actual == 80000:
                    self.assertEqual(result["scoring_context"]["mode"], "blended")
                    self.assertGreater(result["anomaly_score"], 50)
                    self.assertLess(result["anomaly_score"], 80)
                else:
                    self.assertGreater(result["anomaly_score"], 99.9)
                scores.append(result["anomaly_score"])
        self.assertEqual(scores, sorted(set(scores)))

    def test_gradual_override_is_symmetric_and_capped(self):
        score = self.service.extreme_override_score
        for deviation, expected in ((.45, 80), (.5, 81.8181818182), (.75, 90.9090909091), (1, 100)):
            self.assertAlmostEqual(score(100 * (1 - deviation), 100), expected)
            self.assertAlmostEqual(score(100 * (1 + deviation), 100), expected)
        self.assertEqual(score(10000, 100), 100)

    def test_flag_support_is_per_component_and_missing_components_still_reweight(self):
        prices = [5000] * 25
        rows = [{"mileage": 150000}] * 24 + [{"mileage": None}]
        result = self.service.assess_listing_risk(VEHICLE | {"price": 12000, "mileage": 500000}, prices, 25, rows)
        self.assertEqual(result["components"]["price_anomaly"]["flag"], "extreme_price_high")
        self.assertIsNone(result["components"]["mileage_anomaly"]["flag"])
        self.assertEqual(result["effective_weights"]["price"], 1)
        self.assertEqual(result["effective_weights"]["mileage"], .05)
        self.assertNotIn("specification", result["effective_weights"])
        missing = self.service.assess_listing_risk(VEHICLE, prices, 25, rows)
        self.assertIsNone(missing["components"]["mileage_anomaly"]["flag"])
        self.assertEqual(missing["effective_weights"], {"price": 1})

    def test_nearly_identical_comparisons_do_not_flag_small_changes(self):
        result = self.service.assess_listing_risk(
            VEHICLE | {"price": 5010, "mileage": 150010}, [5000] * 25, 25, [{"mileage": 150000}] * 25
        )
        for component in ("price_anomaly", "mileage_anomaly"):
            if component == "price_anomaly":
                self.assertGreater(result["components"][component]["score"], 80)
            else:
                self.assertLess(result["components"][component]["score"], 1)
            self.assertIsNone(result["components"][component]["flag"])

    def test_opposite_moderate_deviations_keep_normal_weights_and_small_penalty(self):
        for price, mileage in ((2500, 600000), (10000, 160000)):
            result = self.service.assess_listing_risk(
                VEHICLE | {"price": price, "mileage": mileage},
                [5000] * 30, 30, [{"mileage": 320000}] * 30,
            )
            context = result["scoring_context"]
            self.assertEqual(context["mode"], "contextual_weighted")
            self.assertEqual(context["relation"], "consistent_opposite")
            self.assertAlmostEqual(result["effective_weights"]["price"], .60 / .85)
            self.assertAlmostEqual(result["effective_weights"]["mileage"], .25 / .85)
            self.assertGreater(context["joint_penalty"], 0)
            self.assertLessEqual(context["joint_penalty"], 6)
            self.assertAlmostEqual(result["anomaly_score"], min(100, context["weighted_score"] + context["joint_penalty"] - context["joint_reduction"]))
            AnomalyRiskResponse.model_validate({"model_version": "anomaly-risk-v2", **result})

    def test_joint_check_recognizes_smaller_price_deviation_with_clear_mileage_deviation(self):
        for price, mileage, relation in (
            (32000, 200000, "consistent_opposite"),
            (51000, 100000, "consistent_opposite"),
            (32000, 90000, "inconsistent"),
            (47000, 200000, "not_applicable"),
            (34000, 120000, "not_applicable"),
        ):
            with self.subTest(price=price, mileage=mileage):
                result = self.service.assess_listing_risk(
                    VEHICLE | {"price": price, "mileage": mileage},
                    [41500] * 30, 30, [{"mileage": 150000}] * 30,
                )
                context = result["scoring_context"]
                self.assertEqual(context["relation"], relation)
                expected_mode = "contextual_weighted" if relation == "consistent_opposite" else "weighted"
                self.assertEqual(context["mode"], expected_mode)
                self.assertAlmostEqual(result["effective_weights"]["price"], .60 / .85)
                self.assertAlmostEqual(result["effective_weights"]["mileage"], .25 / .85)
                self.assertLessEqual(context["joint_penalty"], 6)
                self.assertAlmostEqual(
                    result["anomaly_score"],
                    min(100, context["weighted_score"] + context["joint_penalty"] - context["joint_reduction"]),
                )

    def test_cheaper_high_mileage_pair_reduces_63_to_high_forties(self):
        price = {"actual_price": 32000, "p50": 40500, "count": 30,
                 "price_anomaly_score": 75, "flag": None}
        mileage = {"actual_mileage": 210000, "expected_median_mileage": 155000,
                   "sample_size": 30, "mileage_anomaly_score": 30, "flag": None}
        scores = {"price": 75, "mileage": 30, "specification": None}
        total, weights, context = self.service.combine_component_scores(scores, price, mileage, 0)
        unadjusted = context["weighted_score"] + context["joint_penalty"]
        self.assertAlmostEqual(unadjusted, 63.02, places=2)
        self.assertGreaterEqual(total, 47)
        self.assertLessEqual(total, 50)
        self.assertGreater(context["joint_reduction"], 0)
        self.assertLessEqual(context["joint_reduction"], context["weighted_score"] * .25)
        self.assertAlmostEqual(total, unadjusted - context["joint_reduction"])
        self.assertAlmostEqual(weights["price"], .60 / .85)
        self.assertEqual(price["price_anomaly_score"], 75)
        self.assertEqual(mileage["mileage_anomaly_score"], 30)

        # Lower mileage does not explain the cheap price; no reduction applies.
        low_mileage = {**mileage, "actual_mileage": 90000}
        low_total, _, low_context = self.service.combine_component_scores(scores, price, low_mileage, 0)
        self.assertEqual(low_context["joint_reduction"], 0)
        self.assertGreater(low_total, total)

    def test_coherence_reduction_fades_in_and_cannot_discount_extreme_signals(self):
        price = {"actual_price": 8000, "p50": 10000, "count": 30,
                 "price_anomaly_score": 75, "flag": None}
        mileage = {"actual_mileage": 130000, "expected_median_mileage": 100000,
                   "sample_size": 30, "mileage_anomaly_score": 30, "flag": None}
        scores = {"price": 75, "mileage": 30}
        reductions = []
        for actual in (8501, 8499, 8250, 8000):
            _, _, context = self.service.combine_component_scores(
                scores, {**price, "actual_price": actual}, mileage, 0,
            )
            reductions.append(context["joint_reduction"])
        self.assertEqual(reductions[0], 0)
        self.assertLess(reductions[1], .1)
        self.assertEqual(reductions, sorted(reductions))
        for flagged_price, flagged_mileage in (
            ({**price, "flag": "extreme_price_low"}, mileage),
            (price, {**mileage, "flag": "extreme_mileage_high"}),
        ):
            _, _, context = self.service.combine_component_scores(scores, flagged_price, flagged_mileage, 0)
            self.assertEqual(context["joint_reduction"], 0)
        # A higher price with lower mileage retains the existing treatment.
        _, _, context = self.service.combine_component_scores(
            scores, {**price, "actual_price": 13000}, {**mileage, "actual_mileage": 80000}, 0,
        )
        self.assertEqual(context["joint_reduction"], 0)

    def test_coherence_credit_fades_out_without_a_jump_when_an_extreme_flag_appears(self):
        for component, values in (("price", (5501, 5500, 5499)),
                                  ("mileage", (164999, 165000, 165001))):
            with self.subTest(component=component):
                totals, reductions = [], []
                for actual in values:
                    price = {"actual_price": 6000, "p50": 10000, "count": 30,
                             "price_anomaly_score": 75}
                    mileage = {"actual_mileage": 180000, "expected_median_mileage": 100000,
                               "sample_size": 30, "mileage_anomaly_score": 30}
                    if component == "price":
                        price["actual_price"] = actual
                    else:
                        mileage["actual_mileage"] = actual
                    price["flag"] = self.service.extreme_anomaly_flag(
                        "price", price["actual_price"], price["p50"], 75, 30,
                    )
                    mileage["flag"] = self.service.extreme_anomaly_flag(
                        "mileage", mileage["actual_mileage"], mileage["expected_median_mileage"], 30, 30,
                    )
                    total, _, context = self.service.combine_component_scores(
                        {"price": 75, "mileage": 30}, price, mileage, 0,
                    )
                    self.assertEqual(context["relation"], "consistent_opposite")
                    totals.append(total)
                    reductions.append(context["joint_reduction"])
                self.assertLess(max(totals) - min(totals), .1)
                self.assertLess(reductions[0], .1)
                self.assertAlmostEqual(reductions[1], 0)
                self.assertEqual(reductions[2], 0)

    def test_absurd_reciprocal_values_cannot_cancel_and_missing_or_small_groups_stay_separate(self):
        for price, mileage, count in ((500000, 3200, 30), (2500, 600000, 24), (2500, None, 30)):
            result = self.service.assess_listing_risk(
                VEHICLE | {"price": price, "mileage": mileage},
                [5000] * count, count, [{"mileage": 320000}] * count,
            )
            if count == 24:
                self.assertEqual(result["scoring_context"]["mode"], "contextual_weighted")
                self.assertEqual(result["scoring_context"]["relation"], "consistent_opposite")
                self.assertIsNone(result["components"]["price_anomaly"]["flag"])
                self.assertIsNone(result["components"]["mileage_anomaly"]["flag"])
            else:
                self.assertNotEqual(result["scoring_context"]["mode"], "contextual_weighted")
            if price == 500000:
                self.assertEqual(result["anomaly_score"], 100)
                self.assertEqual(set(result["scoring_context"]["override_scores"]), {"price", "mileage"})
            elif count != 24:
                self.assertEqual(result["scoring_context"]["relation"], "unavailable")

    def test_joint_inconsistent_signals_both_contribute_without_changing_confidence(self):
        rows = [{"mileage": 320000}] * 30
        results = [self.service.assess_listing_risk(VEHICLE | {"price": price, "mileage": mileage},
                   [5000] * 30, 30, rows) for price, mileage in ((8000, 550000), (2000, 50000), (8000, 50000))]
        for result in results:
            self.assertEqual(result["scoring_context"]["relation"], "inconsistent")
            self.assertIn(result["scoring_context"]["mode"], {"extreme", "weighted"})
            self.assertGreater(result["effective_weights"]["price"], 0)
            self.assertGreater(result["effective_weights"]["mileage"], 0)
            severity = result["scoring_context"]["override_scores"]
            self.assertGreaterEqual(result["anomaly_score"], max(severity.values()))
            self.assertLessEqual(result["anomaly_score"], 100)
        self.assertEqual(results[0]["confidence"], results[1]["confidence"])
        for result in results:
            components = result["components"]
            for name, used_score in result["scoring_context"]["override_scores"].items():
                self.assertEqual(components[f"{name}_anomaly"]["score"], used_score)
                self.assertEqual(components[f"{name}_anomaly"][f"{name}_anomaly_score"], used_score)
            reconstructed = sum(result["effective_weights"][name] * components[f"{name}_anomaly"]["score"]
                                for name in result["effective_weights"])
            self.assertAlmostEqual(result["anomaly_score"], min(100, reconstructed))

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
