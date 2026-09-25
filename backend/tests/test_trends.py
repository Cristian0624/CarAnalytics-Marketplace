"""Tests for the Market Trends & Historical Pricing endpoints."""

import os
from datetime import date, datetime, timezone
from pathlib import Path
import sys
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from models import MarketTrend, ListingPriceHistory, Listing
from routers.trends import router as trends_router


class TestMarketTrendsRoutes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        cls.TestingSessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=cls.engine
        )
        cls.tables = [MarketTrend.__table__, ListingPriceHistory.__table__]
        for t in cls.tables:
            t.create(bind=cls.engine, checkfirst=True)

        app = FastAPI()
        app.include_router(trends_router)

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

    def setUp(self):
        for t in self.tables:
            t.drop(bind=self.engine, checkfirst=True)
            t.create(bind=self.engine, checkfirst=True)
        self.db = self.TestingSessionLocal()

    def tearDown(self):
        self.db.close()

    def test_get_trends_success_single_point(self):
        self.db.add(
            MarketTrend(
                brand="Volkswagen",
                model="Passat",
                year=2010,
                snapshot_date=date(2026, 9, 5),
                avg_price=5870.0,
                median_price=6000.0,
                min_price=3500.0,
                max_price=8000.0,
                listing_count=20,
            )
        )
        self.db.commit()

        res = self.client.get("/trends?brand=Volkswagen&model=Passat&year=2010")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["brand"], "Volkswagen")
        self.assertEqual(data["model"], "Passat")
        self.assertEqual(data["year"], 2010)
        self.assertEqual(data["total_snapshots"], 1)
        self.assertEqual(data["latest_median_price"], 6000.0)
        self.assertIsNone(data["overall_change_eur"])
        self.assertEqual(data["trend_direction"], "stable")
        self.assertEqual(len(data["data_points"]), 1)
        self.assertEqual(data["data_points"][0]["listing_count"], 20)

    def test_get_trends_multi_points_trend_direction(self):
        # Point 1: 2026-09-05, €6,000
        # Point 2: 2026-09-12, €5,700 (drop of 5%)
        self.db.add_all([
            MarketTrend(
                brand="Volkswagen",
                model="Passat",
                year=2010,
                snapshot_date=date(2026, 9, 5),
                avg_price=5900.0,
                median_price=6000.0,
                min_price=3500.0,
                max_price=8000.0,
                listing_count=20,
            ),
            MarketTrend(
                brand="Volkswagen",
                model="Passat",
                year=2010,
                snapshot_date=date(2026, 9, 12),
                avg_price=5650.0,
                median_price=5700.0,
                min_price=3400.0,
                max_price=7800.0,
                listing_count=22,
            ),
        ])
        self.db.commit()

        res = self.client.get("/trends?brand=volkswagen&model=passat&year=2010")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_snapshots"], 2)
        self.assertEqual(data["earliest_date"], "2026-09-05")
        self.assertEqual(data["latest_date"], "2026-09-12")
        self.assertEqual(data["overall_change_eur"], -300.0)
        self.assertEqual(data["overall_change_pct"], -5.0)
        self.assertEqual(data["trend_direction"], "down")

    def test_get_trends_not_found(self):
        res = self.client.get("/trends?brand=Ferrari&model=Enzo&year=2003")
        self.assertEqual(res.status_code, 404)
        self.assertIn("No market trend data found", res.json()["detail"])

    def test_get_trend_options(self):
        self.db.add_all([
            MarketTrend(
                brand="Volkswagen",
                model="Passat",
                year=2010,
                snapshot_date=date(2026, 9, 5),
                avg_price=6000.0,
                median_price=6000.0,
                min_price=4000.0,
                max_price=8000.0,
                listing_count=10,
            ),
            MarketTrend(
                brand="Volkswagen",
                model="Golf",
                year=2015,
                snapshot_date=date(2026, 9, 5),
                avg_price=9000.0,
                median_price=9000.0,
                min_price=7000.0,
                max_price=12000.0,
                listing_count=15,
            ),
            MarketTrend(
                brand="BMW",
                model="3 Series",
                year=2018,
                snapshot_date=date(2026, 9, 5),
                avg_price=16000.0,
                median_price=16000.0,
                min_price=13000.0,
                max_price=20000.0,
                listing_count=8,
            ),
        ])
        self.db.commit()

        # 1. No params -> returns all brands
        r_brands = self.client.get("/trends/options")
        self.assertEqual(r_brands.status_code, 200)
        self.assertListEqual(r_brands.json()["brands"], ["BMW", "Volkswagen"])

        # 2. Brand param -> returns models for that brand
        r_models = self.client.get("/trends/options?brand=Volkswagen")
        self.assertEqual(r_models.status_code, 200)
        self.assertListEqual(r_models.json()["models"], ["Golf", "Passat"])

        # 3. Brand & model param -> returns available years with price summaries
        r_years = self.client.get("/trends/options?brand=Volkswagen&model=Passat")
        self.assertEqual(r_years.status_code, 200)
        years_data = r_years.json()["years"]
        self.assertEqual(len(years_data), 1)
        self.assertEqual(years_data[0]["year"], 2010)
        self.assertEqual(years_data[0]["median_price"], 6000.0)
        self.assertEqual(years_data[0]["avg_price"], 6000.0)
        self.assertEqual(years_data[0]["listing_count"], 10)

    def test_get_listing_price_history_with_price_drop(self):
        # Add 2 price observations for listing #100
        self.db.add_all([
            ListingPriceHistory(
                listing_id=100,
                brand="KIA",
                model="Sportage",
                year=2020,
                price_eur=14000.0,
                scraped_at=datetime(2026, 9, 5, 12, 0, tzinfo=timezone.utc),
            ),
            ListingPriceHistory(
                listing_id=100,
                brand="KIA",
                model="Sportage",
                year=2020,
                price_eur=13200.0,
                scraped_at=datetime(2026, 9, 12, 12, 0, tzinfo=timezone.utc),
            ),
        ])
        self.db.commit()

        res = self.client.get("/trends/listings/100")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["listing_id"], 100)
        self.assertEqual(data["first_observed_price"], 14000.0)
        self.assertEqual(data["latest_price"], 13200.0)
        self.assertEqual(data["price_change_eur"], -800.0)
        self.assertEqual(data["is_price_drop"], True)
        self.assertEqual(len(data["history"]), 2)


if __name__ == "__main__":
    unittest.main()
