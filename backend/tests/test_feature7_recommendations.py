import sys
from decimal import Decimal
from pathlib import Path
import unittest

backend_dir = str(Path(__file__).resolve().parents[1])
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi.testclient import TestClient
from database import SessionLocal
from models import CarListing, Listing
from main import app
from services.recommendation_service import (
    get_recommendations_for_listing,
    get_recommendations_by_attributes,
)
from routers.recommendations import search_cars


class TestFeature7VehicleRecommendationEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.client = TestClient(app)

        # Ensure Listing #45 (Ford Focus 2018) exists for the test scenario
        cls.created_listing_45 = False
        existing_45 = cls.db.query(Listing).filter(Listing.id == 45).first()
        if not existing_45:
            # Find an existing 2018 Focus to base data on, or create standard specs
            focus_sample = cls.db.query(Listing).filter(
                Listing.brand.ilike("ford"),
                Listing.model.ilike("focus"),
                Listing.year == 2018,
            ).first()

            price_eur = float(focus_sample.price_eur) if focus_sample and focus_sample.price_eur else 8500.0
            mileage = int(focus_sample.mileage) if focus_sample and focus_sample.mileage else 160000
            body = focus_sample.body_type if focus_sample and focus_sample.body_type else "Hatchback"

            dummy_45 = Listing(
                id=45,
                url="https://999.md/ro/45",
                brand="Ford",
                model="Focus",
                year=2018,
                price=Decimal(str(int(price_eur))),
                price_eur=Decimal(str(int(price_eur))),
                currency="EUR",
                mileage=mileage,
                mileage_was_corrected=False,
                body_type=body,
                class_="C-segment (Compact)",
                score=Decimal("85.0"),
            )
            cls.db.add(dummy_45)
            cls.db.commit()
            cls.created_listing_45 = True
            cls.listing_45 = dummy_45
        else:
            cls.listing_45 = existing_45

    @classmethod
    def tearDownClass(cls):
        if cls.created_listing_45:
            dummy = cls.db.query(Listing).filter(Listing.id == 45).first()
            if dummy:
                cls.db.delete(dummy)
                cls.db.commit()
        cls.db.close()

    def test_case_1_similar_vehicles(self):
        """
        Case 1: Similar Vehicles
        Test Scenario: Request recommendations for Listing #45 (Ford Focus 2018)
        Expected Outcome: Returns comparable vehicles (Golf, Astra, Megane) within ±15% budget.
        """
        # Test via API endpoint
        response = self.client.get("/recommendations/45")
        self.assertEqual(response.status_code, 200, f"Endpoint should return 200: {response.text}")
        data = response.json()

        recommendations = data.get("recommendations", [])
        total_found = data.get("total_found", len(recommendations))
        self.assertGreater(total_found, 0, "Recommendations should not be empty")

        target_price = float(self.listing_45.price_eur)
        min_budget = target_price * 0.85
        max_budget = target_price * 1.15

        # Check for comparable models: Golf, Astra, Megane
        golfs = [r for r in recommendations if "golf" in r["model"].lower()]
        astras = [r for r in recommendations if "astra" in r["model"].lower()]
        meganes = [r for r in recommendations if "megane" in r["model"].lower()]

        # Check ±15% budget
        out_of_budget = [
            r for r in recommendations
            if r["price_eur"] < min_budget or r["price_eur"] > max_budget
        ]

        print("\n========================================================")
        print("CASE 1: Similar Vehicles")
        print(f"Target Listing: #{self.listing_45.id} {self.listing_45.brand} {self.listing_45.model} ({self.listing_45.year})")
        print(f"Target Price: €{target_price:,.2f} (Allowed ±15% Budget Range: €{min_budget:,.2f} - €{max_budget:,.2f})")
        print(f"Total Recommendations Returned: {len(recommendations)}")
        print(f"Comparable Models Found:")
        print(f"  - Volkswagen Golf: {len(golfs)} vehicles")
        print(f"  - Opel Astra: {len(astras)} vehicles")
        print(f"  - Renault Megane: {len(meganes)} vehicles")
        print(f"Vehicles Exceeding ±15% Budget: {len(out_of_budget)}")
        print("Sample comparable recommendations:")
        for r in (golfs[:1] + astras[:1] + meganes[:1]):
            print(f"  -> {r['brand']} {r['model']} ({r['year']}) | €{r['price_eur']:,} | {r['mileage']:,} km | Score: {r['similarity_score']}%")
        print("========================================================")

        self.assertGreater(len(golfs), 0, "Must include comparable models like Volkswagen Golf")
        self.assertGreater(len(astras), 0, "Must include comparable models like Opel Astra")
        self.assertGreater(len(meganes), 0, "Must include comparable models like Renault Megane")
        self.assertEqual(len(out_of_budget), 0, "All returned vehicles must strictly be within ±15% budget")

        # Verify descending score order (best score first)
        scores = [float(r["score"]) for r in recommendations if r.get("score") is not None]
        for i in range(len(scores) - 1):
            self.assertGreaterEqual(scores[i], scores[i + 1], "Recommendations must be sorted by descending score")

    def test_case_2_self_exclusion(self):
        """
        Case 2: Self Exclusion
        Test Scenario: Inspect recommended list for Listing #45
        Expected Outcome: Listing #45 itself is never present in its own recommended list.
        """
        response = self.client.get("/recommendations/45")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        all_rec_ids = [r["id"] for r in data.get("recommendations", [])]
        same_model_ids = [r["id"] for r in data.get("same_model_recommendations", [])]
        peer_ids = [r["id"] for r in data.get("peer_competitor_recommendations", [])]

        is_present_in_recs = 45 in all_rec_ids
        is_present_in_same = 45 in same_model_ids
        is_present_in_peers = 45 in peer_ids

        print("\n========================================================")
        print("CASE 2: Self Exclusion")
        print(f"Target Listing ID: #45 ({self.listing_45.brand} {self.listing_45.model})")
        print(f"Presence in 'recommendations': {is_present_in_recs}")
        print(f"Presence in 'same_model_recommendations': {is_present_in_same}")
        print(f"Presence in 'peer_competitor_recommendations': {is_present_in_peers}")
        print(f"Self-exclusion verification: Listing #45 excluded from all {len(all_rec_ids)} recommendations.")
        print("========================================================")

        self.assertFalse(is_present_in_recs, "Listing #45 must NEVER be present in recommendations")
        self.assertFalse(is_present_in_same, "Listing #45 must NEVER be present in same_model_recommendations")
        self.assertFalse(is_present_in_peers, "Listing #45 must NEVER be present in peer_competitor_recommendations")

    def test_case_3_cold_start(self):
        """
        Case 3: Cold Start
        Test Scenario: User with zero saved favourites or searches opens recommendations
        Expected Outcome: Defaults to top-rated / best-deal vehicles; no empty crash.
        """
        # When a user opens Recommendations without saved favourites/history,
        # RecommendationsPage loads initial inventory via /listings/paginated
        response = self.client.get("/listings/paginated?page=1&limit=9")
        self.assertEqual(response.status_code, 200, f"Cold start request failed: {response.text}")
        data = response.json()

        items = data.get("items", [])
        total = data.get("total", 0)

        # Also verify sorted by deal score (top-rated / best-deal vehicles)
        top_deal_response = self.client.get("/listings/paginated?page=1&limit=9&sort_by=score&sort_order=desc")
        self.assertEqual(top_deal_response.status_code, 200)
        top_deal_data = top_deal_response.json()
        top_items = top_deal_data.get("items", [])

        print("\n========================================================")
        print("CASE 3: Cold Start")
        print(f"User state: New user with 0 saved searches and 0 favourites")
        print(f"Cold start inventory response status: HTTP {response.status_code}")
        print(f"Listings successfully returned: {len(items)} items (Total available: {total})")
        print(f"Top-rated / best-deal vehicles query status: HTTP {top_deal_response.status_code}")
        print("Top deal vehicles loaded:")
        for car in top_items[:3]:
            p = float(car['price_eur']) if car.get('price_eur') is not None else 0.0
            print(f"  - {car['brand']} {car['model']} ({car['year']}) | €{p:,.2f} | Deal Score: {car.get('score')}")
        print("Outcome: Defaults gracefully to available catalog / best-deal vehicles with NO crash.")
        print("========================================================")

        self.assertGreater(len(items), 0, "Cold start must return vehicle listings without crashing")
        self.assertGreater(len(top_items), 0, "Top deal vehicles must be available on cold start")

    def test_case_4_budget_ceiling(self):
        """
        Case 4: Budget Ceiling
        Test Scenario: User filter max budget 15,000 EUR
        Expected Outcome: Zero recommended vehicles exceed specified ceiling.
        """
        ceiling = 15000.0

        # Test filtering via paginated inventory (used by marketplace and recommendations page)
        res_paginated = self.client.get(f"/listings/paginated?price_max={int(ceiling)}&limit=50")
        self.assertEqual(res_paginated.status_code, 200)
        paginated_items = res_paginated.json().get("items", [])

        exceeding_paginated = [
            item for item in paginated_items
            if item.get("price_eur") is not None and float(item["price_eur"]) > ceiling
        ]
        max_p_paginated = max(
            (float(item["price_eur"]) for item in paginated_items if item.get("price_eur") is not None),
            default=0.0
        )

        # Also test /cars endpoint in recommendations router
        res_cars = self.client.get(f"/cars?max_price={int(ceiling)}")
        self.assertEqual(res_cars.status_code, 200)
        cars_items = res_cars.json()
        exceeding_cars = [
            item for item in cars_items
            if item.get("price_eur") is not None and float(item["price_eur"]) > ceiling
        ]
        max_p_cars = max(
            (float(item["price_eur"]) for item in cars_items if item.get("price_eur") is not None),
            default=0.0
        )

        print("\n========================================================")
        print("CASE 4: Budget Ceiling")
        print(f"Budget ceiling applied: €{ceiling:,.2f}")
        print(f"Total listings evaluated under ceiling: {len(paginated_items)} (paginated sample), {len(cars_items)} (cars catalog)")
        print(f"Maximum price observed in paginated results: €{max_p_paginated:,.2f}")
        print(f"Maximum price observed in /cars results: €{max_p_cars:,.2f}")
        print(f"Number of vehicles exceeding €15,000 ceiling: {len(exceeding_paginated) + len(exceeding_cars)}")
        print(f"Outcome: Exactly ZERO recommended/returned vehicles exceed the specified budget ceiling.")
        print("========================================================")

        self.assertGreater(len(paginated_items), 0, "Should return results below ceiling")
        self.assertEqual(len(exceeding_paginated), 0, "Zero vehicles in paginated listings must exceed 15,000 EUR")
        self.assertEqual(len(exceeding_cars), 0, "Zero vehicles in /cars must exceed 15,000 EUR")
        self.assertLessEqual(max_p_paginated, ceiling)
        self.assertLessEqual(max_p_cars, ceiling)


if __name__ == "__main__":
    unittest.main()
