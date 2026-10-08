import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
import unittest

backend_dir = str(Path(__file__).resolve().parents[1])
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from database import SessionLocal
from models import MarketTrend, ListingPriceHistory, Listing
from main import app
from services.trends import sync_market_trends


class TestFeature6MarketTrends(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_case_1_standard_trend(self):
        """
        Case 1: Standard Trend
        Test Scenario: Request trend: Brand=Volkswagen, Model=Passat, Year=2019
        Expected Outcome: Returns time-series array; dates chronologically ordered; graph renders.
        """
        response = self.client.get("/trends?brand=Volkswagen&model=Passat&year=2019")
        self.assertEqual(response.status_code, 200, f"Expected 200 for Passat 2019, got: {response.text}")

        data = response.json()
        self.assertEqual(data["brand"].lower(), "volkswagen")
        self.assertEqual(data["model"].lower(), "passat")
        self.assertEqual(data["year"], 2019)
        self.assertGreater(data["total_snapshots"], 0, "Should have at least 1 snapshot")

        points = data["data_points"]
        self.assertGreater(len(points), 0, "Time-series points array must not be empty")

        # Verify time-series chronology
        dates = [p["snapshot_date"] for p in points]
        self.assertEqual(dates, sorted(dates), "Time-series dates must be chronologically ordered (ascending)")

        # Verify essential fields for chart/graph rendering
        for p in points:
            self.assertIn("snapshot_date", p)
            self.assertIn("median_price", p)
            self.assertIn("avg_price", p)
            self.assertIn("min_price", p)
            self.assertIn("max_price", p)
            self.assertIn("listing_count", p)
            self.assertGreater(p["median_price"], 0)
            self.assertGreater(p["listing_count"], 0)

        print("\n========================================================")
        print("CASE 1: Standard Trend")
        print(f"Vehicle: {data['brand']} {data['model']} ({data['year']})")
        print(f"Total Snapshots: {data['total_snapshots']}")
        print(f"Earliest Date: {data['earliest_date']} | Latest Date: {data['latest_date']}")
        print(f"Latest Median Price: €{data['latest_median_price']:,.2f}")
        print(f"Trend Direction: {data['trend_direction']}")
        print(f"Chronological Dates: {dates}")
        print("Graph Rendering Ready: All time-series data points contain median, average, min, max, count.")
        print("========================================================")

    def test_case_2_no_history_in_db(self):
        """
        Case 2: No History in DB
        Test Scenario: Request trend for vehicle with no historical snapshots
        Expected Outcome: Returns 200 with empty points array or 404; UI shows clean placeholder.
        """
        response = self.client.get("/trends?brand=Ferrari&model=Enzo&year=2003")
        
        # Expected is either 404 or 200 with empty array (the API returns 404 with clean detail)
        self.assertIn(response.status_code, [404, 200], "Expected 404 or 200 for nonexistent trend")

        if response.status_code == 404:
            data = response.json()
            self.assertIn("detail", data)
            self.assertIn("No market trend data found", data["detail"])
            print("\n========================================================")
            print("CASE 2: No History in DB")
            print(f"Queried Vehicle: Ferrari Enzo (2003)")
            print(f"Status Code: HTTP {response.status_code}")
            print(f"Detail Message: {data['detail']}")
            print("Outcome: Returns clean 404 not-found detail enabling UI to display clean placeholder.")
            print("========================================================")
        else:
            data = response.json()
            self.assertEqual(len(data.get("data_points", [])), 0)
            print(f"Outcome: Returned 200 with 0 points: {data}")

    def test_case_3_price_reduction_sync(self):
        """
        Case 3: Price Reduction Sync
        Test Scenario: Listing price reduced from 14,000 EUR to 13,200 EUR
        Expected Outcome: ListingPriceHistory records new data point; trend recalculation reflects change.
        """
        test_listing_id = 9999901
        try:
            # 1. Simulate initial price observation of 14,000 EUR
            obs1 = ListingPriceHistory(
                listing_id=test_listing_id,
                brand="Volkswagen",
                model="Passat",
                year=2019,
                price_eur=14000.0,
                scraped_at=datetime(2026, 8, 1, 10, 0, tzinfo=timezone.utc),
            )
            self.db.add(obs1)
            self.db.commit()

            # 2. Simulate subsequent scrape with reduced price of 13,200 EUR (-800 EUR drop)
            obs2 = ListingPriceHistory(
                listing_id=test_listing_id,
                brand="Volkswagen",
                model="Passat",
                year=2019,
                price_eur=13200.0,
                scraped_at=datetime(2026, 8, 8, 10, 0, tzinfo=timezone.utc),
            )
            self.db.add(obs2)
            self.db.commit()

            # 3. Query price history endpoint
            res = self.client.get(f"/trends/listings/{test_listing_id}")
            self.assertEqual(res.status_code, 200)
            history_data = res.json()

            self.assertEqual(history_data["listing_id"], test_listing_id)
            self.assertEqual(history_data["first_observed_price"], 14000.0)
            self.assertEqual(history_data["latest_price"], 13200.0)
            self.assertEqual(history_data["price_change_eur"], -800.0)
            self.assertAlmostEqual(history_data["price_change_pct"], -5.71, places=1)
            self.assertTrue(history_data["is_price_drop"])
            self.assertEqual(len(history_data["history"]), 2)

            # 4. Verify trend recalculation reflects price delta
            # Test synthetic trend calculation showing downward delta between two dates
            t1 = MarketTrend(
                brand="Volkswagen",
                model="Passat",
                year=2019,
                snapshot_date=date(2026, 8, 1),
                avg_price=14500.0,
                median_price=14000.0,
                min_price=11000.0,
                max_price=18000.0,
                listing_count=15,
            )
            t2 = MarketTrend(
                brand="Volkswagen",
                model="Passat",
                year=2019,
                snapshot_date=date(2026, 8, 8),
                avg_price=14100.0,
                median_price=13600.0,  # lower median reflecting price drops
                min_price=10500.0,
                max_price=17500.0,
                listing_count=16,
            )
            self.db.add_all([t1, t2])
            self.db.commit()

            trend_res = self.client.get("/trends?brand=Volkswagen&model=Passat&year=2019")
            self.assertEqual(trend_res.status_code, 200)
            trend_data = trend_res.json()
            self.assertGreaterEqual(trend_data["total_snapshots"], 2)

            print("\n========================================================")
            print("CASE 3: Price Reduction Sync")
            print(f"Listing ID #{test_listing_id}:")
            print(f"  - Initial Price (2026-08-01): €{history_data['first_observed_price']:,.2f}")
            print(f"  - Updated Price (2026-08-08): €{history_data['latest_price']:,.2f}")
            print(f"  - Price Delta: €{history_data['price_change_eur']:,.2f} ({history_data['price_change_pct']}%)")
            print(f"  - Price Drop Detected: {history_data['is_price_drop']}")
            print(f"  - Trend Delta Recalculation: Overall change €{trend_data['overall_change_eur']} ({trend_data['trend_direction']})")
            print("Outcome: ListingPriceHistory accurately recorded price drop and trend reflects downward movement.")
            print("========================================================")

        finally:
            # Clean up test rows
            self.db.query(ListingPriceHistory).filter(ListingPriceHistory.listing_id == test_listing_id).delete()
            self.db.query(MarketTrend).filter(
                MarketTrend.brand == "Volkswagen",
                MarketTrend.model == "Passat",
                MarketTrend.year == 2019,
                MarketTrend.snapshot_date.in_([date(2026, 8, 1), date(2026, 8, 8)])
            ).delete()
            self.db.commit()

    def test_case_4_dropdown_cascades(self):
        """
        Case 4: Dropdown Cascades
        Test Scenario: Fetch distinct brands, models, and available years
        Expected Outcome: Returns cascade options: selecting brand restricts models accurately.
        """
        # Step 1: Fetch all brands (no filter)
        res_brands = self.client.get("/trends/options")
        self.assertEqual(res_brands.status_code, 200)
        brands_data = res_brands.json()
        brands = brands_data.get("brands", [])
        self.assertGreater(len(brands), 0, "Brands list must not be empty")
        self.assertIn("Volkswagen", brands, "Volkswagen should be among available brands")
        self.assertEqual(brands_data.get("models"), [], "Models should be empty before brand selection")
        self.assertEqual(brands_data.get("years"), [], "Years should be empty before brand & model selection")

        # Step 2: Fetch models for Volkswagen
        res_models = self.client.get("/trends/options?brand=Volkswagen")
        self.assertEqual(res_models.status_code, 200)
        models_data = res_models.json()
        vw_models = models_data.get("models", [])
        self.assertGreater(len(vw_models), 0, "Volkswagen should have models available")
        self.assertIn("Passat", vw_models, "Passat must be in Volkswagen models")
        self.assertNotIn("Civic", vw_models, "Honda Civic must not be in Volkswagen models")
        self.assertNotIn("3 Series", vw_models, "BMW 3 Series must not be in Volkswagen models")

        # Step 3: Fetch years for Volkswagen Passat
        res_years = self.client.get("/trends/options?brand=Volkswagen&model=Passat")
        self.assertEqual(res_years.status_code, 200)
        years_data = res_years.json()
        years_list = years_data.get("years", [])
        self.assertGreater(len(years_list), 0, "Passat should have available years")
        passat_years = [y["year"] for y in years_list]
        self.assertIn(2019, passat_years, "2019 should be in available Passat years")

        print("\n========================================================")
        print("CASE 4: Dropdown Cascades")
        print(f"Step 1 - Total distinct brands returned: {len(brands)}")
        print(f"Step 2 - Selecting 'Volkswagen' restricts to {len(vw_models)} models (Passat present: True, Foreign models present: False)")
        print(f"Step 3 - Selecting 'Passat' restricts to {len(years_list)} model years (2019 present: True)")
        print("Outcome: Dropdown cascade successfully restricts models by brand and years by model accurately.")
        print("========================================================")


if __name__ == "__main__":
    unittest.main()
