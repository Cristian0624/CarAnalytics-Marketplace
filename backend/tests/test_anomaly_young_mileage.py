"""Age context softens low mileage without changing the comparison statistics."""
from datetime import date
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from anomaly_risk_schemas import AnomalyRiskResponse
from services.anomaly_risk import AnomalyRiskService


class YoungMileageTests(unittest.TestCase):
    def setUp(self):
        self.service = AnomalyRiskService()
        clock = patch("services.anomaly_risk.date")
        clock.start().today.return_value = date(2026, 10, 5)
        self.addCleanup(clock.stop)
        self.prices = np.linspace(30000, 46000, 41).tolist()
        self.rows = [dict(year=2023 + index % 3, mileage=int(mileage), engine=2.0,
                          fuel_type="Benzină", gearbox="Automată", drivetrain="4x4", body_type="SUV")
                     for index, mileage in enumerate(np.linspace(60000, 180000, 41))]
        self.vehicle = dict(brand="Test", model="SUV", generation="I", year=2025,
                            mileage=7000, price=38000, engine=2.0, fuel_type="Benzină",
                            gearbox="Automată", drivetrain="4x4", body_type="SUV")

    def assess(self, **changes):
        result = self.service.assess_listing_risk(self.vehicle | changes, self.prices, len(self.prices), self.rows)
        AnomalyRiskResponse(model_version="anomaly-risk-v2", **result)
        return result

    def test_young_low_mileage_is_gentler_including_the_extreme_override(self):
        young = self.assess()
        no_year = self.assess(year=None)
        mileage = young["components"]["mileage_anomaly"]
        self.assertLess(young["anomaly_score"], 30)
        self.assertGreater(no_year["anomaly_score"], 90)
        self.assertIsNone(mileage["flag"])
        self.assertIsNotNone(no_year["components"]["mileage_anomaly"]["flag"])
        self.assertLess(mileage["score"], 35)
        self.assertEqual(mileage["vehicle_age_years"], 1)

    def test_low_mileage_leniency_fades_with_age_and_missing_year_keeps_old_policy(self):
        scores = []
        for year in (2027, 2026, 2025, 2024, 2023, 2022, 2021):
            result = self.assess(year=year)
            scores.append(result["components"]["mileage_anomaly"]["score"])
        self.assertEqual(scores, sorted(scores))
        self.assertLess(scores[-2], scores[-1])
        old = self.assess(year=2021)["components"]["mileage_anomaly"]
        missing = self.assess(year=None)["components"]["mileage_anomaly"]
        self.assertEqual(old["score"], missing["score"])
        self.assertEqual(old["flag"], missing["flag"])

    def test_high_and_median_mileage_are_not_softened(self):
        for actual in (120000, 210000, 400000):
            with self.subTest(mileage=actual):
                young = self.assess(mileage=actual)["components"]["mileage_anomaly"]
                missing = self.assess(mileage=actual, year=None)["components"]["mileage_anomaly"]
                self.assertEqual(young["score"], missing["score"])
                self.assertEqual(young["flag"], missing["flag"])
                self.assertEqual(young["age_adjustment_factor"], 1)
        self.assertEqual(self.assess(mileage=120000)["components"]["mileage_anomaly"]["score"], 0)
        self.assertEqual(self.assess(mileage=400000)["risk_level"], "high")

    def test_new_car_with_extreme_price_still_has_high_overall_anomaly(self):
        for price in (3000, 150000):
            with self.subTest(price=price):
                result = self.assess(price=price)
                self.assertEqual(result["risk_level"], "high")
                self.assertIsNotNone(result["components"]["price_anomaly"]["flag"])
                self.assertGreater(result["effective_weights"]["price"], .9)

    def test_price_specs_confidence_and_complete_pool_do_not_change(self):
        normal = self.assess()
        with patch.object(self.service, "low_mileage_age_adjustment", return_value=(1, 1.0)):
            previous = self.assess()
        for name in ("price_anomaly", "specification_anomaly"):
            self.assertEqual(normal["components"][name], previous["components"][name])
        self.assertEqual(normal["confidence"], previous["confidence"])
        mileage = normal["components"]["mileage_anomaly"]
        old_mileage = previous["components"]["mileage_anomaly"]
        for name in ("p05", "p10", "p25", "p50", "p75", "p90", "p95", "sample_size", "comparison_level"):
            self.assertEqual(mileage[name], old_mileage[name])

    def test_young_adjustment_does_not_bypass_mileage_support_requirement(self):
        result = self.service.assess_listing_risk(self.vehicle, self.prices[:17], 17, self.rows[:17])
        self.assertEqual(result["assessment_status"], "partial")
        self.assertIsNone(result["anomaly_score"])
        self.assertIsNone(result["components"]["mileage_anomaly"]["score"])

    def test_young_low_mileage_scores_remain_monotonic_and_totals_reconcile(self):
        for year in (2025, 2022):
            scores = []
            for mileage in (120000, 100000, 80000, 42001, 42000, 41999, 24001, 24000, 23999, 7000, 10, 0):
                result = self.assess(year=year, mileage=mileage)
                scores.append(result["anomaly_score"])
                context = result["scoring_context"]
                contribution = sum(result["components"][name + "_anomaly"]["score"] * weight
                                   for name, weight in result["effective_weights"].items())
                expected = min(100, max(0, contribution + context["applied_rarity_penalty"]
                                       + context["joint_penalty"] - context["joint_reduction"]))
                self.assertAlmostEqual(result["anomaly_score"], expected)
            self.assertEqual(scores, sorted(scores))


if __name__ == "__main__":
    unittest.main()
