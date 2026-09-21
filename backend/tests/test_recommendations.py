import sys
from pathlib import Path
import unittest

backend_dir = str(Path(__file__).resolve().parents[1])
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from database import SessionLocal
from models import CarListing
from services.recommendation_service import (
    get_recommendations_for_listing,
    get_recommendations_by_attributes,
    DEFAULT_PRICE_TOLERANCE,
    DEFAULT_MILEAGE_TOLERANCE,
)
from routers.recommendations import (
    get_recommendations_by_id,
    get_recommendations_custom,
    get_car_by_id,
    search_cars,
)


class TestCarRecommendations(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_recommendations_for_passat_listing(self):
        """
        Looking at a Volkswagen Passat should return other Passats and compatible
        peers in the same price & mileage tolerance, without excluding any type of car.
        """
        passat = self.db.query(CarListing).filter(
            CarListing.brand.ilike("volkswagen"),
            CarListing.model.ilike("passat"),
            CarListing.price_eur >= 6000,
            CarListing.price_eur <= 15000,
            CarListing.mileage >= 100000,
        ).first()

        self.assertIsNotNone(passat, "Database should contain at least one Passat listing")
        print(f"\n[TEST] Target Passat: ID={passat.id}, Year={passat.year}, Price={passat.price_eur} EUR, Mileage={passat.mileage} km")

        response = get_recommendations_for_listing(
            db=self.db,
            listing_id=passat.id,
        )

        self.assertGreater(len(response.recommendations), 0, "Should find recommendations for Passat")
        print(f"[TEST] Total recommendations returned: {len(response.recommendations)}")

        for rec in response.recommendations[:5]:
            print(f"  -> Recommended: {rec.brand} {rec.model} ({rec.year}) | €{rec.price_eur:,} | {rec.mileage:,} km | Body: {rec.body_type} | Class: {rec.car_class} | Score: {rec.similarity_score}%")

        p_min = passat.price_eur * (1.0 - DEFAULT_PRICE_TOLERANCE)
        p_max = passat.price_eur * (1.0 + DEFAULT_PRICE_TOLERANCE)
        m_window = max(20000, int(passat.mileage * DEFAULT_MILEAGE_TOLERANCE))
        m_min = max(0, passat.mileage - m_window)
        m_max = passat.mileage + m_window

        # Verify strict tolerances and 999.md link
        for rec in response.recommendations:
            self.assertGreaterEqual(rec.price_eur, p_min)
            self.assertLessEqual(rec.price_eur, p_max)
            self.assertGreaterEqual(rec.mileage, m_min)
            self.assertLessEqual(rec.mileage, m_max)
            self.assertIsNotNone(rec.link_999)
            self.assertTrue(rec.link_999.startswith("https://999.md/"))

        print(f"[TEST] Success: All {len(response.recommendations)} recommendations strictly within 10% price & 20% mileage.")

    def test_recommendations_custom_passat(self):
        """
        Test custom query endpoint without pre-existing listing ID:
        e.g. searching for a Passat at €10,000 and 180,000 km with lowercase input.
        Verifies no car type is excluded.
        """
        response = get_recommendations_by_attributes(
            db=self.db,
            brand="volkswagen",
            model="passat",
            price_eur=10000.0,
            mileage=180000,
            year=2015,
            body_type="sedan",
        )

        self.assertGreater(len(response.recommendations), 0)
        found_body_types = set(r.body_type for r in response.recommendations if r.body_type)
        print(f"\n[TEST] Passat body types in recommendations: {found_body_types}")
        # Verify no SUVs or Pickups are recommended for Passat
        for bt in found_body_types:
            self.assertNotIn("suv", bt.lower())
            self.assertNotIn("pickup", bt.lower())
        for rec in response.recommendations:
            self.assertIsNotNone(rec.link_999)

    def test_recommendations_pickup(self):
        """
        If the target car is a Pickup, ALL recommendations MUST be Pickups.
        """
        response = get_recommendations_by_attributes(
            db=self.db,
            brand="ford",
            model="f-150",
            price_eur=18000.0,
            mileage=150000,
            year=2018,
        )
        self.assertGreater(len(response.recommendations), 0, "Should find pickup recommendations")
        print(f"\n[TEST] Total pickup recommendations returned: {len(response.recommendations)}")
        for rec in response.recommendations[:5]:
            print(f"  -> Recommended Pickup: {rec.brand} {rec.model} | Body: {rec.body_type} | €{rec.price_eur:,} | {rec.mileage:,} km")
            self.assertIn("pickup", rec.body_type.lower())

    def test_recommendations_suv(self):
        """
        If the target car is an SUV, ALL recommendations MUST be SUVs or Crossovers.
        """
        response = get_recommendations_by_attributes(
            db=self.db,
            brand="bmw",
            model="x5",
            price_eur=15000.0,
            mileage=200000,
            year=2012,
        )
        self.assertGreater(len(response.recommendations), 0, "Should find SUV recommendations")
        print(f"\n[TEST] Total SUV recommendations returned: {len(response.recommendations)}")
        for rec in response.recommendations[:5]:
            print(f"  -> Recommended SUV: {rec.brand} {rec.model} | Body: {rec.body_type} | Class: {rec.car_class}")
            is_suv = (rec.body_type and rec.body_type.lower() in ["suv", "crossover"]) or (rec.car_class and "suv" in rec.car_class.lower())
            self.assertTrue(is_suv)

    def test_router_endpoints(self):
        """Test router handlers directly with DB session."""
        # 1. Search cars - returns list of matching cars directly without pagination prompts
        cars_res = search_cars(brand="audi", model="a6", db=self.db)
        self.assertIsInstance(cars_res, list)
        self.assertGreater(len(cars_res), 0)

        # 2. Get car by ID
        first_id = cars_res[0].id
        car = get_car_by_id(car_id=first_id, db=self.db)
        self.assertEqual(car.id, first_id)
        self.assertEqual(car.brand.lower(), "audi")
        self.assertIsNotNone(car.link_999)


if __name__ == "__main__":
    unittest.main()
