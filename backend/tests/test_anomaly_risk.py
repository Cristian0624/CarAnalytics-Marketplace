"""Unit, HTTP integration and optional real-artifact regression tests.

Run: python -m unittest discover -s backend/tests -p test_anomaly_risk.py -v
Real model checks run when the local artifact bundle is present.
"""
import ast
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from anomaly_risk_schemas import AnomalyRiskRequest, AnomalyRiskResponse
from routers import anomaly_risk as route
from services.anomaly_risk import AnomalyRiskService, DEFAULT_ARTIFACT_DIR, ModelUnavailableError, SCORING_POLICY

VEHICLE = dict(brand="Toyota", model="Auris", generation="II (2012 - 2018)",
               year=2013, mileage=315000, engine=1.4, fuel_type="Diesel",
               gearbox="Mecanică", drivetrain="Din față", body_type="Universal", price=7600)


class InputTests(unittest.TestCase):
    def test_calibration_repairs_crossings_and_keeps_middle_quantiles(self):
        service = object.__new__(AnomalyRiskService)
        service.SCORING = {"spread_floor": 1}
        service.calibration = {"p10_delta": -.1, "p90_delta": .2}
        service._prediction_lock = Lock()
        service.prepare_features = lambda frame: frame
        from unittest.mock import Mock
        service.model = Mock()
        service.model.predict.return_value = [[10000, 8000, 12000, 20000, 16000]]
        np.testing.assert_allclose(service.predict_quantiles({}), [6800, 10000, 12000, 16000, 22400])
        service.model.predict.return_value = [[1, 2, float("nan"), 4, 5]]
        with self.assertRaises(ValueError):
            service.predict_quantiles({})

    def test_invalid_inputs(self):
        for change in ({"price": 0}, {"price": float("nan")}, {"price": float("inf")},
                       {"mileage": -1}, {"year": 2013.5}, {"year": 9999},
                       {"brand": "  "}, {"engine": -1}, {"engine": float("inf")},
                       {"unexpected": 1}, {"price_eur": 7600}):
            with self.subTest(change=change), self.assertRaises(ValidationError):
                AnomalyRiskRequest(**(VEHICLE | change))

    def test_missing_price_and_identity_rejected(self):
        for field in ("price", "brand", "model"):
            value = VEHICLE.copy()
            value.pop(field)
            with self.assertRaises(ValidationError):
                AnomalyRiskRequest(**value)

    def test_optional_missing_and_unknown_categories_allowed(self):
        value = AnomalyRiskRequest(brand=" Unknown ", model="Rare", price=10000)
        self.assertEqual(value.brand, "Unknown")
        self.assertIsNone(value.mileage)

    def test_missing_artifacts_fail_clearly(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ModelUnavailableError):
                AnomalyRiskService(directory)

    def test_incompatible_metadata_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "model_metadata.json").write_text('{"model_version":"wrong"}')
            with self.assertRaises(ModelUnavailableError):
                AnomalyRiskService(directory)

    def test_load_failure_is_503_and_retryable(self):
        app = FastAPI()
        app.include_router(route.router)
        with patch.object(route, "_service", None), patch(
                "services.anomaly_risk.AnomalyRiskService", side_effect=ModelUnavailableError("private path")):
            with TestClient(app) as client:
                response = client.post("/anomaly-risk", json=VEHICLE)
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("private path", response.text)
            self.assertIsNone(route._service)


class SupportPolicyUnitTests(unittest.TestCase):
    def setUp(self):
        self.service = object.__new__(AnomalyRiskService)
        self.service.SCORING = SCORING_POLICY
        self.service.MISSING = "<missing>"
        self.service.normalized_vehicle = lambda vehicle: vehicle
        self.key = ("Toyota", "Auris", "II (2012 - 2018)")
        self.vehicle = dict(zip(("brand", "model", "generation"), self.key))
        self.service.market_stats = {"generation": {}}

    def support(self, observations):
        self.service.market_stats["generation"][self.key] = {"sample_size": observations}
        return self.service.assess_market_support(self.vehicle)

    def test_exact_support_boundaries(self):
        expected = {0: "very_rare", 1: "very_rare", 4: "very_rare",
                    5: "rare", 14: "rare", 15: "limited", 29: "limited",
                    30: "normal", 100: "normal"}
        for observations, level in expected.items():
            with self.subTest(observations=observations):
                result = self.support(observations)
                self.assertEqual(result["model_generation_observations"], observations)
                self.assertEqual(result["support_level"], level)
        self.service.market_stats["generation"].clear()
        self.assertEqual(self.service.assess_market_support(self.vehicle)["support_level"], "very_rare")

    def test_rarity_adjustment_never_rises_with_more_usable_evidence(self):
        penalties = [self.support(n)["rarity_penalty"] for n in range(5, 31)]
        self.assertEqual(penalties, sorted(penalties, reverse=True))
        self.assertEqual(penalties[0], 8)
        self.assertEqual(penalties[9], 4)
        self.assertEqual(penalties[10], 4)
        self.assertEqual(penalties[-1], 0)


@unittest.skipUnless((DEFAULT_ARTIFACT_DIR / "price_quantile_model.cbm").exists(), "Deploy V2 artifacts for model integration tests")
class ModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = AnomalyRiskService()
        cls.app = FastAPI()
        cls.app.include_router(route.router)
        cls.app.dependency_overrides[route.get_anomaly_risk_service] = lambda: cls.service
        # Execute only original notebook function definitions, never training cells.
        notebook = json.loads((DEFAULT_ARTIFACT_DIR.parent / "anomaly_risk.ipynb").read_text(encoding="utf-8"))
        wanted = {"prepare_features", "ordered_quantiles", "apply_calibration", "spread_anomaly_score",
                  "normalized_vehicle", "analyze_price_anomaly", "analyze_mileage_anomaly", "mileage_anomaly_score",
                  "analyze_specification", "assess_market_confidence", "assess_listing_risk",
                  "group_split_indices"}
        namespace = dict(np=np, pd=pd, FEATURES=cls.service.FEATURES, CATEGORICAL=cls.service.CATEGORICAL,
                         NUMERIC=cls.service.NUMERIC, MISSING=cls.service.MISSING, SCORING=cls.service.SCORING,
                         SCORING_POLICY_VERSION="anomaly-risk-v2.3",
                         Q_NAMES=["p10", "p25", "p50", "p75", "p90"],
                         MILEAGE_NAMES=["p05", "p10", "p25", "p50", "p75", "p90", "p95"],
                         SPEC_FIELDS=["year", "engine", "fuel_type", "gearbox", "drivetrain", "body_type"],
                         mileage_stats=cls.service.mileage_stats, spec_stats=cls.service.spec_stats,
                         market_stats=cls.service.market_stats)
        for cell in notebook["cells"]:
            if cell["cell_type"] == "code":
                for node in ast.parse("".join(cell["source"])).body:
                    if isinstance(node, ast.FunctionDef) and node.name in wanted:
                        exec(compile(ast.Module(body=[node], type_ignores=[]), "notebook_reference", "exec"), namespace)
        def reference_prediction(vehicle):
            frame = namespace["prepare_features"](pd.DataFrame([vehicle]))
            return namespace["apply_calibration"](cls.service.model.predict(frame), cls.service.calibration)[0]
        namespace["predict_quantiles"] = reference_prediction
        cls.reference = namespace

    def test_notebook_price_model_parity_for_common_ev_unknown_and_missing(self):
        examples = [VEHICLE, VEHICLE | dict(price=1000),
                    dict(brand="Tesla", model="Model 3", generation="I (2017 - prezent)", year=2020,
                         mileage=80000, engine=None, fuel_type="Electricitate", gearbox="Automată",
                         drivetrain="Din spate", body_type="Sedan", price=20000),
                    dict(brand="Unknown", model="Unknown", price=10000),
                    VEHICLE | dict(mileage=None, generation=None)]
        for vehicle in examples:
            with self.subTest(vehicle=vehicle):
                actual = self.service.analyze_price_anomaly(vehicle, vehicle["price"])
                expected = self.reference["analyze_price_anomaly"](vehicle, vehicle["price"])
                self.assertEqual(actual, expected)

    def test_scoring_landmarks_and_continuity(self):
        score = self.service.spread_anomaly_score
        q = [6000, 8000, 10000, 12000, 14000]
        for value, expected in [(10000, 0), (8000, 20), (12000, 20), (6000, 60), (14000, 60)]:
            self.assertAlmostEqual(score(value, q), expected)
        self.assertGreater(score(2000, q), 60)
        self.assertLess(score(2000, q), 100)
        self.assertLess(abs(score(14000 - .001, q) - score(14000 + .001, q)), .001)

    def test_mileage_curve_is_supporting_and_reaches_high_only_in_far_tail(self):
        stats = {"p05": 10000, "p10": 20000, "p25": 40000, "p50": 60000,
                 "p75": 80000, "p90": 100000, "p95": 120000}
        score = self.service.mileage_anomaly_score
        for mileage, expected in [(60000, 0), (80000, 10), (100000, 20), (120000, 40)]:
            self.assertAlmostEqual(score(mileage, stats), expected)
        self.assertGreater(score(130000, stats), 40)
        self.assertLess(score(130000, stats), 70)
        self.assertGreater(score(200000, stats), 90)

    def test_toyota_high_mileage_is_medium_signal_and_low_combined_risk(self):
        result = self.service.assess_listing_risk(VEHICLE)
        mileage = result["components"]["mileage_anomaly"]["score"]
        self.assertGreater(mileage, 50)
        self.assertLess(mileage, 70)
        self.assertEqual(result["effective_weights"], {"price": .75, "mileage": .1, "specification": .15})
        self.assertEqual(result["risk_level"], "low")

    def service_with_generation_support(self, observations):
        service = copy.copy(self.service)
        service.market_stats = copy.deepcopy(self.service.market_stats)
        key = (VEHICLE["brand"], VEHICLE["model"], VEHICLE["generation"])
        service.market_stats["generation"][key] = {
            **service.market_stats["generation"][key], "sample_size": observations,
        }
        return service

    def typical_vehicle(self):
        vehicle = VEHICLE | {"mileage": 235000}
        return vehicle | {"price": float(self.service.predict_quantiles(vehicle)[2])}

    def test_supported_prices_have_sensible_order_and_risk(self):
        normal = self.typical_vehicle()
        quantiles = self.service.predict_quantiles(normal)
        mildly_unusual = normal | {"price": float(quantiles[3])}
        cheap = normal | {"price": 1.0}
        expensive = normal | {"price": normal["price"] * 100}
        results = [self.service.assess_listing_risk(vehicle)
                   for vehicle in (normal, mildly_unusual, cheap, expensive)]
        normal_result, mild_result, cheap_result, expensive_result = results
        self.assertEqual(normal_result["assessment_status"], "full")
        self.assertEqual(normal_result["risk_level"], "low")
        self.assertLess(normal_result["anomaly_score"], 25)
        self.assertLess(normal_result["components"]["price_anomaly"]["score"],
                        mild_result["components"]["price_anomaly"]["score"])
        for extreme, direction in ((cheap_result, "unusually_cheap"),
                                   (expensive_result, "unusually_expensive")):
            self.assertEqual(extreme["assessment_status"], "full")
            self.assertEqual(extreme["risk_level"], "high")
            self.assertGreater(extreme["anomaly_score"], mild_result["anomaly_score"] + 30)
            self.assertGreater(extreme["components"]["price_anomaly"]["score"],
                               mild_result["components"]["price_anomaly"]["score"] + 50)
            self.assertEqual(extreme["components"]["price_anomaly"]["direction"], direction)

    def test_mileage_both_tails_and_weight_remains_supporting(self):
        normal = self.typical_vehicle()
        median = self.service.analyze_mileage_anomaly(normal)["p50"]
        vehicles = [normal | {"mileage": mileage} for mileage in (median, 0, 300000, 1000000)]
        baseline_price = self.service.analyze_price_anomaly(normal, normal["price"])
        with patch.object(self.service, "analyze_price_anomaly", return_value=baseline_price):
            median_result, low_result, moderate_result, extreme_result = [
                self.service.assess_listing_risk(vehicle) for vehicle in vehicles
            ]
        median_score = median_result["components"]["mileage_anomaly"]["score"]
        low_score = low_result["components"]["mileage_anomaly"]["score"]
        moderate_score = moderate_result["components"]["mileage_anomaly"]["score"]
        extreme_score = extreme_result["components"]["mileage_anomaly"]["score"]
        self.assertLess(median_score, low_score)
        self.assertLess(median_score, moderate_score)
        self.assertLess(moderate_score, extreme_score)
        self.assertEqual(low_result["components"]["mileage_anomaly"]["direction"], "unusually_low")
        self.assertEqual(extreme_result["components"]["mileage_anomaly"]["direction"], "unusually_high")
        self.assertLess(moderate_result["anomaly_score"] - median_result["anomaly_score"], 7)
        self.assertLessEqual(extreme_result["anomaly_score"] - median_result["anomaly_score"], 10)
        self.assertNotEqual(extreme_result["risk_level"], "high")

    def test_common_rare_and_unseen_specifications(self):
        normal = self.typical_vehicle()
        common = self.service.analyze_specification(normal)
        rare = self.service.analyze_specification(normal | {"drivetrain": "Din spate"})
        unseen = self.service.analyze_specification(normal | {"drivetrain": "Unseen drivetrain"})
        field = lambda result: next(signal for signal in result["signals"] if signal["field"] == "drivetrain")
        self.assertEqual(field(common)["severity"], "normal")
        self.assertEqual(field(common)["score"], 0)
        self.assertGreater(field(rare)["score"], field(common)["score"])
        self.assertIn(field(rare)["severity"], {"uncommon", "very_rare"})
        self.assertEqual(field(unseen)["severity"], "unobserved")
        self.assertEqual(field(unseen)["frequency"], 0)
        self.assertGreaterEqual(field(unseen)["score"], field(rare)["score"])

    def test_unsupported_components_stay_unavailable(self):
        missing_mileage = self.service.analyze_mileage_anomaly(self.typical_vehicle() | {"mileage": None})
        unsupported_specs = self.service.analyze_specification(
            self.typical_vehicle() | {"generation": "Unseen generation"})
        self.assertEqual(missing_mileage["comparison_level"], "unsupported")
        self.assertIsNone(missing_mileage["mileage_anomaly_score"])
        self.assertEqual(unsupported_specs["supported_fields"], 0)
        self.assertIsNone(unsupported_specs["specification_anomaly_score"])
        self.assertTrue(all(signal["score"] is None for signal in unsupported_specs["signals"]))

    def test_confidence_and_penalty_track_support_without_boundary_reversal(self):
        counts = (0, 1, 4, 5, 14, 15, 29, 30, 262)
        results = [self.service_with_generation_support(n).assess_listing_risk(VEHICLE)
                   for n in counts]
        confidence = [result["confidence_score"] for result in results]
        self.assertEqual(confidence, sorted(confidence))
        self.assertEqual(results[0]["market_confidence"], "low")
        self.assertEqual(results[-1]["market_confidence"], "high")
        self.assertTrue(all(result["anomaly_score"] is None for result in results[:3]))
        self.assertTrue(all(result["anomaly_score"] is not None for result in results[3:]))
        penalties = [result["market_support"]["rarity_penalty"] for result in results[3:]]
        self.assertEqual(penalties, sorted(penalties, reverse=True))
        self.assertEqual(penalties[1], penalties[2])  # 14 to 15 must not rise.
        self.assertEqual(penalties[-1], 0)

    def test_rare_support_is_warning_not_automatic_high_risk(self):
        normal = self.typical_vehicle()
        rare_service = self.service_with_generation_support(5)
        normal_result = rare_service.assess_listing_risk(normal)
        extreme_result = rare_service.assess_listing_risk(normal | {"price": 1.0})
        self.assertEqual(normal_result["assessment_status"], "limited_support")
        self.assertEqual(normal_result["market_confidence"], "low")
        self.assertEqual(normal_result["risk_level"], "low")
        self.assertLess(normal_result["anomaly_score"], 25)
        self.assertEqual(extreme_result["market_confidence"], "low")
        self.assertGreater(extreme_result["anomaly_score"], normal_result["anomaly_score"] + 30)
        self.assertEqual(extreme_result["components"]["price_anomaly"]["direction"], "unusually_cheap")

    def test_very_rare_support_suppresses_overall_verdict(self):
        for observations in (0, 1, 4):
            with self.subTest(observations=observations):
                result = self.service_with_generation_support(observations).assess_listing_risk(VEHICLE)
                self.assertEqual(result["assessment_status"], "very_rare")
                self.assertEqual(result["market_support"], {
                    "model_generation_observations": observations,
                    "support_level": "very_rare",
                    "rarity_penalty": 0.0,
                })
                self.assertIsNone(result["anomaly_score"])
                self.assertIsNone(result["risk_level"])
                self.assertEqual(result["market_confidence"], "low")
                self.assertEqual(result["effective_weights"], {})
                self.assertIn("reliable overall anomaly assessment", result["message"])

    def test_low_support_with_missing_components_does_not_promote_price_to_overall_score(self):
        result = self.service_with_generation_support(1).assess_listing_risk(VEHICLE | {"mileage": None})
        self.assertIsNone(result["components"]["mileage_anomaly"]["score"])
        self.assertIsNone(result["anomaly_score"])
        self.assertEqual(result["effective_weights"], {})

    def test_rare_and_limited_support_have_bounded_penalties(self):
        baseline = self.service.assess_listing_risk(VEHICLE)["anomaly_score"]
        cases = {
            5: ("rare", "limited_support", 8.0, "low"),
            14: ("rare", "limited_support", 4.0, "low"),
            15: ("limited", "limited_support", 4.0, "medium"),
            29: ("limited", "limited_support", 0.27, "medium"),
        }
        for observations, (support_level, status, penalty, confidence) in cases.items():
            with self.subTest(observations=observations):
                result = self.service_with_generation_support(observations).assess_listing_risk(VEHICLE)
                self.assertEqual(result["market_support"]["support_level"], support_level)
                self.assertEqual(result["assessment_status"], status)
                self.assertEqual(result["market_support"]["rarity_penalty"], penalty)
                self.assertEqual(result["market_confidence"], confidence)
                self.assertAlmostEqual(result["anomaly_score"], baseline + penalty)

    def test_common_vehicle_has_full_assessment_without_rarity_penalty(self):
        result = self.service.assess_listing_risk(VEHICLE)
        self.assertGreaterEqual(result["market_support"]["model_generation_observations"], 30)
        self.assertEqual(result["assessment_status"], "full")
        self.assertEqual(result["market_support"]["support_level"], "normal")
        self.assertEqual(result["market_support"]["rarity_penalty"], 0.0)
        self.assertIsNotNone(result["anomaly_score"])
        self.assertIsNotNone(result["risk_level"])

    def test_asking_price_does_not_change_predictions_or_confidence(self):
        a = self.service.assess_listing_risk(VEHICLE)
        b = self.service.assess_listing_risk(VEHICLE | dict(price=100000))
        self.assertEqual(a["confidence"], b["confidence"])
        for name in ("p10", "p25", "p50", "p75", "p90"):
            self.assertEqual(a["components"]["price_anomaly"][name], b["components"]["price_anomaly"][name])
        self.assertGreater(b["anomaly_score"], a["anomaly_score"])

    def test_unknown_vehicle_is_very_rare_and_has_no_overall_verdict(self):
        result = self.service.assess_listing_risk(dict(brand="Unknown", model="Unknown", price=10000))
        self.assertEqual(result["assessment_status"], "very_rare")
        self.assertEqual(result["market_support"], {
            "model_generation_observations": 0,
            "support_level": "very_rare",
            "rarity_penalty": 0.0,
        })
        self.assertEqual(result["market_confidence"], "low")
        self.assertIsNone(result["anomaly_score"])
        self.assertIsNone(result["risk_level"])
        self.assertEqual(result["effective_weights"], {})
        self.assertIsNotNone(result["components"]["price_anomaly"]["score"])
        self.assertIsNone(result["components"]["mileage_anomaly"]["score"])
        json.dumps(result, allow_nan=False)

    def test_mileage_fallbacks_and_insufficient_support(self):
        service = copy.copy(self.service)
        key = (VEHICLE["brand"], VEHICLE["model"], VEHICLE["generation"])
        summary = dict(sample_size=30, p05=10000, p10=20000, p25=40000, p50=60000, p75=80000, p90=100000, p95=120000)
        levels = ["exact_year", "nearby_years", "model_generation", "model"]
        service.mileage_stats = {level: {} for level in levels}
        for level, group in zip(levels, [key + (2013,), key + (2013,), key, key[:2]]):
            service.mileage_stats[level][group] = summary
            self.assertEqual(service.analyze_mileage_anomaly(VEHICLE)["comparison_level"], level)
            service.mileage_stats[level].clear()
        self.assertEqual(service.analyze_mileage_anomaly(VEHICLE)["comparison_level"], "unsupported")

    def test_http_response_and_openapi(self):
        with TestClient(self.app) as client:
            response = client.post("/anomaly-risk", json=VEHICLE)
            self.assertEqual(response.status_code, 200, response.text)
            data = response.json()
            self.assertEqual(data["model_version"], "anomaly-risk-v2")
            self.assertEqual(data["currency"], "EUR")
            self.assertEqual(data["anomaly_score"], self.service.assess_listing_risk(VEHICLE)["anomaly_score"])
            self.assertIn("/anomaly-risk", client.get("/openapi.json").json()["paths"])
            self.assertEqual(client.post("/anomaly-risk", json=VEHICLE | dict(price=-1)).status_code, 422)

    def test_loaded_service_reused(self):
        with patch.object(route, "_service", None), patch("services.anomaly_risk.AnomalyRiskService", return_value=self.service) as factory:
            self.assertIs(route.get_anomaly_risk_service(), route.get_anomaly_risk_service())
            factory.assert_called_once()

    def test_concurrent_assessments_remain_consistent(self):
        expected = self.service.assess_listing_risk(VEHICLE)
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(self.service.assess_listing_risk, [VEHICLE] * 8))
        self.assertTrue(all(result == expected for result in results))

    def test_inference_error_has_safe_503_response(self):
        with patch.object(self.service, "assess_listing_risk", side_effect=ValueError("private internals")):
            with TestClient(self.app) as client:
                response = client.post("/anomaly-risk", json=VEHICLE)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private internals", response.text)

    @unittest.skipUnless((DEFAULT_ARTIFACT_DIR.parent / "data_ml.csv").exists(), "Local evaluation CSV unavailable")
    def test_saved_holdout_accuracy_is_preserved(self):
        raw = pd.read_csv(DEFAULT_ARTIFACT_DIR.parent / "data_ml.csv")
        target = pd.to_numeric(raw["price_eur"], errors="coerce")
        valid = np.isfinite(target) & (target > 0)
        clean = self.service.prepare_features(raw.loc[valid])
        clean["price_eur"] = target.loc[valid].astype(float)
        clean = clean.drop_duplicates().reset_index(drop=True)
        groups = pd.util.hash_pandas_object(clean[self.service.FEATURES], index=False)
        _, indices = self.reference["group_split_indices"](groups, .20, 42)
        test = clean.iloc[indices]
        raw_predictions = self.service.model.predict(test[self.service.FEATURES], thread_count=1)
        predictions = self.reference["apply_calibration"](raw_predictions, self.service.calibration)
        actual = test["price_eur"].to_numpy()
        self.assertEqual(len(test), 11779)
        self.assertAlmostEqual(float(np.mean(abs(actual - predictions[:, 2]))), 2305.960189428506, places=6)
        coverage = np.mean((actual >= predictions[:, 0]) & (actual <= predictions[:, 4]))
        self.assertAlmostEqual(float(coverage), .7982001867730707, places=10)


@unittest.skipUnless((DEFAULT_ARTIFACT_DIR / "price_quantile_model.cbm").exists(),
                     "Deploy V2 artifacts for HTTP integration tests")
class HttpIntegrationTests(unittest.TestCase):
    """Use the real dependency and artifact loader, with no database or external API."""

    @classmethod
    def setUpClass(cls):
        cls.service = AnomalyRiskService()
        cls.app = FastAPI()
        cls.app.include_router(route.router)

    def test_real_router_service_artifact_and_json_flow(self):
        normal = VEHICLE | {"mileage": 235000}
        normal["price"] = float(self.service.predict_quantiles(normal)[2])
        rare = {"brand": "Audi", "model": "Q2", "generation": "GA (2016 - prezent)", "price": 10000}
        one_observation = {"brand": "Acura", "model": "Integra",
                           "generation": "IV (2022 - prezent)", "price": 10000}
        unseen = {"brand": "Never Seen", "model": "Never Seen", "price": 10000}
        with patch.object(route, "_service", None):
            with TestClient(self.app) as client:
                responses = {
                    "normal": client.post("/anomaly-risk", json=normal),
                    "cheap": client.post("/anomaly-risk", json=normal | {"price": 1}),
                    "expensive": client.post("/anomaly-risk", json=normal | {"price": normal["price"] * 100}),
                    "rare": client.post("/anomaly-risk", json=rare),
                    "one": client.post("/anomaly-risk", json=one_observation),
                    "unseen": client.post("/anomaly-risk", json=unseen),
                }
                self.assertIsInstance(route._service, AnomalyRiskService)
        for name, response in responses.items():
            with self.subTest(name=name):
                self.assertEqual(response.status_code, 200, response.text)
                AnomalyRiskResponse.model_validate(response.json())
                self.assertIn("not fraud probabilities", response.json()["interpretation"])
        normal_data = responses["normal"].json()
        self.assertEqual(normal_data["assessment_status"], "full")
        self.assertEqual(normal_data["risk_level"], "low")
        self.assertEqual(normal_data["market_support"]["support_level"], "normal")
        self.assertIsNotNone(normal_data["components"]["mileage_anomaly"]["score"])
        for name, direction in (("cheap", "unusually_cheap"), ("expensive", "unusually_expensive")):
            data = responses[name].json()
            self.assertEqual(data["risk_level"], "high")
            self.assertGreater(data["anomaly_score"], normal_data["anomaly_score"] + 30)
            self.assertEqual(data["components"]["price_anomaly"]["direction"], direction)
        rare_data = responses["rare"].json()
        self.assertEqual(rare_data["market_support"]["model_generation_observations"], 12)
        self.assertEqual(rare_data["assessment_status"], "limited_support")
        self.assertEqual(rare_data["market_support"]["support_level"], "rare")
        self.assertEqual(rare_data["market_confidence"], "low")
        for name, observations in (("one", 1), ("unseen", 0)):
            data = responses[name].json()
            self.assertEqual(data["market_support"]["model_generation_observations"], observations)
            self.assertEqual(data["assessment_status"], "very_rare")
            self.assertIsNone(data["anomaly_score"])
            self.assertIsNone(data["risk_level"])
            self.assertEqual(data["market_confidence"], "low")
            self.assertEqual(data["effective_weights"], {})
            self.assertIsNotNone(data["components"]["price_anomaly"]["score"])

    def test_real_router_validates_requests(self):
        with patch.object(route, "_service", None):
            with TestClient(self.app) as client:
                for payload in (dict(model="Auris", price=10000),
                                dict(brand="Toyota", model="Auris", price=10000, mileage="invalid")):
                    with self.subTest(payload=payload):
                        self.assertEqual(client.post("/anomaly-risk", json=payload).status_code, 422)
                unknown_category = client.post("/anomaly-risk", json=VEHICLE | {"fuel_type": "Unseen fuel"})
        self.assertEqual(unknown_category.status_code, 200, unknown_category.text)
        self.assertEqual(unknown_category.json()["market_confidence"], "low")

    def test_real_router_missing_and_corrupt_metadata_return_503(self):
        with tempfile.TemporaryDirectory() as directory:
            for contents in (None, "not json", '{"model_version":"wrong"}'):
                with self.subTest(contents=contents):
                    metadata_path = Path(directory, "model_metadata.json")
                    if contents is None:
                        metadata_path.unlink(missing_ok=True)
                    else:
                        metadata_path.write_text(contents, encoding="utf-8")
                    with patch.dict("os.environ", {"ANOMALY_RISK_ARTIFACT_DIR": directory}), \
                         patch.object(route, "_service", None):
                        with TestClient(self.app) as client:
                            response = client.post("/anomaly-risk", json=VEHICLE)
                    self.assertEqual(response.status_code, 503)
                    self.assertIsNone(route._service)
                    self.assertNotIn(directory, response.text)


if __name__ == "__main__":
    unittest.main()
