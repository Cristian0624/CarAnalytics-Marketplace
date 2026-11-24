"""Unit tests for v2.19 sequential mileage-first + expected-price risk analysis."""
from datetime import date
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from anomaly_risk_schemas import AnomalyRiskResponse
from services.anomaly_risk import AnomalyRiskService, SCORING_POLICY_VERSION


class MileageFirstExpectedPriceRiskTests(unittest.TestCase):
    def setUp(self):
        self.service = AnomalyRiskService()
        clock = patch("services.anomaly_risk.date")
        clock.start().today.return_value = date(2026, 11, 19)
        self.addCleanup(clock.stop)
        self.prices = np.linspace(10000, 14000, 35).tolist()  # median = 12,000 EUR
        self.rows = [
            dict(
                year=2017,
                mileage=int(m),
                engine=2.0,
                fuel_type="Diesel",
                gearbox="Automată",
                drivetrain="Din față",
                body_type="Sedan",
            )
            for m in np.linspace(110000, 210000, 35)  # median = 160,000 km
        ]
        self.base = dict(
            brand="Audi",
            model="A4",
            generation="B9",
            year=2017,
            engine=2.0,
            fuel_type="Diesel",
            gearbox="Automată",
            drivetrain="Din față",
            body_type="Sedan",
        )

    def assess(self, **overrides):
        result = self.service.assess_listing_risk(
            self.base | overrides, self.prices, len(self.prices), self.rows
        )
        AnomalyRiskResponse(model_version="anomaly-risk-v2", **result)
        return result

    def test_normal_mileage_and_fair_price_yield_zero_risk(self):
        r = self.assess(mileage=155000, price=11800)
        self.assertEqual(r["scoring_policy_version"], SCORING_POLICY_VERSION)
        self.assertEqual(r["components"]["mileage_anomaly"]["risk_points"], 0.0)
        self.assertEqual(r["components"]["price_anomaly"]["risk_points"], 0.0)
        self.assertEqual(r["anomaly_score"], 0.0)
        self.assertEqual(r["risk_level"], "low")
        # 5k km below median -> +2.5% of 12000 = +300 EUR -> expected 12300 EUR
        self.assertAlmostEqual(r["components"]["price_anomaly"]["expected_price"], 12300.0)
        self.assertAlmostEqual(r["components"]["price_anomaly"]["mileage_adjustment_eur"], 300.0)

    def test_step1_mileage_deviation_adds_risk_points_beyond_tolerance(self):
        # Within +-20% of 160,000 km (128k..192k) -> 0 pts
        self.assertEqual(self.assess(mileage=128000, price=12500)["components"]["mileage_anomaly"]["risk_points"], 0.0)
        self.assertEqual(self.assess(mileage=192000, price=9600)["components"]["mileage_anomaly"]["risk_points"], 0.0)

        # -50% below median (80,000 km) -> +32.5 pts (25*1.0 + 5*1.5) and triggers extreme_mileage_low flag
        low = self.assess(mileage=80000, price=13400)
        self.assertAlmostEqual(low["components"]["mileage_anomaly"]["risk_points"], 32.5)
        self.assertEqual(low["components"]["mileage_anomaly"]["direction"], "unusually_low")
        self.assertEqual(low["components"]["mileage_anomaly"]["flag"], "extreme_mileage_low")

        # +75% above median (280,000 km) -> +32.25 pts (40*0.6 + 15*0.55)
        high = self.assess(mileage=280000, price=6800)
        self.assertAlmostEqual(high["components"]["mileage_anomaly"]["risk_points"], 32.25)
        self.assertEqual(high["components"]["mileage_anomaly"]["direction"], "unusually_high")

    def test_step2_expected_price_prevents_false_price_risk_on_honest_high_mileage_car(self):
        # High mileage (280k km) lowers expected price to 6,600 EUR (-45% floor of 12,000)
        # Asking 6,800 EUR matches expected price -> 0 price risk points, only mileage wear points
        r = self.assess(mileage=280000, price=6800)
        self.assertAlmostEqual(r["components"]["price_anomaly"]["expected_price"], 6600.0)
        self.assertEqual(r["components"]["price_anomaly"]["risk_points"], 0.0)
        self.assertAlmostEqual(r["anomaly_score"], 32.25)

    def test_additive_combination_for_rollback_plus_suspicious_discount(self):
        r = self.assess(mileage=45000, price=8000)
        m_pts = r["components"]["mileage_anomaly"]["risk_points"]
        p_pts = r["components"]["price_anomaly"]["risk_points"]
        self.assertGreater(m_pts, 30.0)
        self.assertGreater(p_pts, 30.0)
        self.assertAlmostEqual(r["anomaly_score"], round(min(100.0, m_pts + p_pts), 2))
        self.assertEqual(r["risk_level"], "high")
        self.assertEqual(r["components"]["mileage_anomaly"]["flag"], "extreme_mileage_low")
        self.assertEqual(r["components"]["price_anomaly"]["flag"], "extreme_price_low")

    def test_young_car_low_mileage_leniency_preserved(self):
        young_rows = [dict(r, year=2025) for r in self.rows]
        r_young = self.service.assess_listing_risk(
            self.base | dict(year=2025, mileage=7000, price=13000),
            self.prices, len(self.prices), young_rows,
        )
        r_old = self.assess(year=2017, mileage=7000, price=13000)
        self.assertLess(
            r_young["components"]["mileage_anomaly"]["risk_points"],
            r_old["components"]["mileage_anomaly"]["risk_points"],
        )
        self.assertIsNone(r_young["components"]["mileage_anomaly"]["flag"])
        self.assertEqual(r_old["components"]["mileage_anomaly"]["flag"], "extreme_mileage_low")

    def test_distribution_domain_includes_expected_price_and_real_price(self):
        r = self.assess(mileage=280000, price=6800)
        dist = r["components"]["price_anomaly"]["distribution"]
        self.assertIsNotNone(dist)
        self.assertLessEqual(dist["min_price"], r["components"]["price_anomaly"]["expected_price"])
        self.assertGreaterEqual(dist["max_price"], r["components"]["price_anomaly"]["actual_price"])

    def test_spam_mileage_does_not_inflate_expected_price(self):
        r = self.assess(mileage=10, price=12000)
        self.assertAlmostEqual(r["components"]["price_anomaly"]["expected_price"], 12000.0)
        self.assertGreater(r["components"]["mileage_anomaly"]["risk_points"], 40.0)

    def test_empirical_depreciation_matches_eval_when_peer_prices_present(self):
        # Low-mileage peers avg 17,200 EUR @ 120k km; high-mileage peers avg 16,800 EUR @ 280k km
        # Empirical slope = (400 / 160,000) * 10,000 = 25 EUR / 10k km (far gentler than 5% = 850 EUR/10k)
        paired_rows = [
            dict(self.rows[0], price_eur=17200.0, mileage=120000) for _ in range(10)
        ] + [
            dict(self.rows[0], price_eur=16800.0, mileage=280000) for _ in range(10)
        ]
        prices = [r["price_eur"] for r in paired_rows]  # median = 17,000 EUR
        r = self.service.assess_listing_risk(
            self.base | dict(mileage=160000, price=17000),
            prices, len(prices), paired_rows,
        )
        # Median mileage = 200,000 km; car is 40,000 km below median -> +4 * 25 = +100 EUR
        self.assertAlmostEqual(r["components"]["price_anomaly"]["expected_price"], 17100.0)
        self.assertAlmostEqual(r["components"]["price_anomaly"]["mileage_adjustment_eur"], 100.0)


if __name__ == "__main__":
    unittest.main()
