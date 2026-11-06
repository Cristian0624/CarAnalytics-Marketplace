"""Unit and integration tests for 999.md URL risk analysis (DB-first + live scrape fallback) and Deal Score."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import MetaData, create_engine, insert
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.schema import CreateTable

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import get_db
from models import Listing
from repositories.listings import clear_options_cache
from routers import anomaly_risk as route
from routers import listings as listings_route
from routers import price_estimate as price_route
from services.anomaly_risk import AnomalyRiskService
from services.url_scraper import (
    InvalidListingUrlError,
    extract_999_listing_id,
    parse_999_listing_html,
)


class UrlAndDealScoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = AnomalyRiskService()
        cls.app = FastAPI()
        cls.app.include_router(route.router)
        cls.app.include_router(listings_route.router)
        cls.app.include_router(price_route.router)

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        table = Listing.__table__.to_metadata(MetaData())
        for column in Listing.__mapper__.columns:
            table.c[column.name].type = column.type
        with engine.begin() as conn:
            conn.execute(CreateTable(table))

        prices = np.linspace(8000, 14000, 35).tolist()
        mileages = np.linspace(90000, 220000, 35).astype(int).tolist()
        rows = []
        for idx, (p, m) in enumerate(zip(prices, mileages)):
            rows.append(
                dict(
                    id=10000000 + idx,
                    url=f"https://999.md/ro/{10000000 + idx}",
                    brand="Toyota",
                    model="Auris",
                    generation="II (2012 - 2018)",
                    year=2015,
                    mileage=int(m),
                    engine=1.6,
                    fuel_type="Benzină",
                    gearbox="Automată",
                    drivetrain="Din față",
                    body_type="Hatchback",
                    price=p,
                    currency="EUR",
                    price_eur=p,
                    Score=64.5 if idx == 0 else 52.0,
                )
            )
        with engine.begin() as conn:
            conn.execute(insert(Listing.__table__), rows)

        def session_dep():
            with Session(engine) as session:
                yield session

        clear_options_cache()
        cls.app.dependency_overrides[get_db] = session_dep
        cls.app.dependency_overrides[route.get_anomaly_risk_service] = lambda: cls.service
        cls.addClassCleanup(clear_options_cache)
        cls.addClassCleanup(engine.dispose)

    def test_extract_999_listing_id_accepts_valid_urls_and_rejects_invalid(self):
        self.assertEqual(extract_999_listing_id("https://999.md/ro/103948572"), 103948572)
        self.assertEqual(extract_999_listing_id("https://m.999.md/ru/89123456?x=1"), 89123456)
        self.assertEqual(extract_999_listing_id("999.md/ro/10000000"), 10000000)

        for invalid in ("", "https://example.com/ro/103948572", "https://999.md/ro/list/transport/cars"):
            with self.subTest(invalid=invalid), self.assertRaises(InvalidListingUrlError):
                extract_999_listing_id(invalid)

    def test_parse_999_listing_html_extracts_features_and_converts_currency(self):
        html = """
        <html>
          <head>
            <meta property="og:title" content="Toyota Auris 2015" />
            <meta property="product:brand" content="Toyota" />
            <meta property="product:custom_label_2" content="Auris" />
            <meta property="product:price:amount" content="9800" />
            <meta property="product:price:currency" content="EUR" />
          </head>
          <body>
            <ul>
              <li class="styles__group__feature">
                <span class="styles__group__key">Generație</span>
                <a class="styles__group__link">II (2012 - 2018)</a>
              </li>
              <li class="styles__group__feature">
                <span class="styles__group__key">An de fabricație</span>
                <span class="styles__group__value">2015</span>
              </li>
              <li class="styles__group__feature">
                <span class="styles__group__key">Rulaj</span>
                <span class="styles__group__value">145 000 km</span>
              </li>
              <li class="styles__group__feature">
                <span class="styles__group__key">Motor</span>
                <span class="styles__group__value">1.6 l</span>
              </li>
              <li class="styles__group__feature">
                <span class="styles__group__key">Tip combustibil</span>
                <span class="styles__group__value">Benzină</span>
              </li>
            </ul>
          </body>
        </html>
        """
        parsed = parse_999_listing_html(html, 99999999)
        self.assertEqual(parsed["brand"], "Toyota")
        self.assertEqual(parsed["model"], "Auris")
        self.assertEqual(parsed["generation"], "II (2012 - 2018)")
        self.assertEqual(parsed["price"], 9800.0)
        self.assertEqual(parsed["year"], 2015)
        self.assertEqual(parsed["mileage"], 145000)
        self.assertEqual(parsed["engine"], 1.6)
        self.assertEqual(parsed["fuel_type"], "Benzină")

    def test_from_url_uses_database_first_and_returns_deal_score(self):
        with TestClient(self.app) as client:
            res = client.post("/anomaly-risk/from-url", json={"url": "https://999.md/ro/10000000"})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["vehicle"]["source"], "database")
        self.assertEqual(body["vehicle"]["brand"], "Toyota")
        self.assertEqual(body["vehicle"]["model"], "Auris")
        self.assertEqual(body["assessment"]["deal_score"], 64.5)
        self.assertEqual(body["assessment"]["deal_level"], "good")
        self.assertIsNotNone(body["assessment"]["anomaly_score"])

    def test_from_url_falls_back_to_live_scrape_when_not_in_database(self):
        mock_scraped = {
            "listing_id": 88888888,
            "url": "https://999.md/ro/88888888",
            "source": "live_scrape",
            "title": "Toyota Auris 2015",
            "image_url": None,
            "brand": "Toyota",
            "model": "Auris",
            "generation": "II (2012 - 2018)",
            "price": 9200.0,
            "original_price": 9200.0,
            "original_currency": "EUR",
            "year": 2015,
            "mileage": 140000,
            "engine": 1.6,
            "fuel_type": "Benzină",
            "gearbox": "Automată",
            "drivetrain": "Din față",
            "body_type": "Hatchback",
            "state": "Cu rulaj",
            "description_ro": "Stare buna",
            "description_ru": None,
            "has_vin": True,
        }
        with patch("routers.anomaly_risk.scrape_live_999_listing", return_value=mock_scraped) as mock_fn:
            with TestClient(self.app) as client:
                res = client.post("/anomaly-risk/from-url", json={"url": "https://999.md/ro/88888888"})
                self.assertEqual(res.status_code, 200)
                mock_fn.assert_called_once_with(88888888)
                body = res.json()
                self.assertEqual(body["vehicle"]["source"], "live_scrape")
                self.assertIsNotNone(body["assessment"]["deal_score"])
                self.assertIn(body["assessment"]["deal_level"], ("good", "medium", "bad"))
                self.assertIsNotNone(body["assessment"]["anomaly_score"])

                # Second call for the same URL must resolve directly from the database without re-scraping
                res_cached = client.post("/anomaly-risk/from-url", json={"url": "https://999.md/ro/88888888"})
                self.assertEqual(res_cached.status_code, 200)
                mock_fn.assert_called_once_with(88888888)
                cached_body = res_cached.json()
                self.assertEqual(cached_body["vehicle"]["source"], "database")
                self.assertEqual(cached_body["assessment"]["deal_score"], body["assessment"]["deal_score"])

    def test_deal_score_clamped_to_80(self):
        score, level = self.service.calculate_deal_score(
            vehicle={"price": 5000.0, "mileage": 100000, "year": 2020},
            prices=[15000.0] * 10,
            comparison_rows=[{"mileage": 150000}] * 10,
            stored_score=95.0,
        )
        self.assertEqual(score, 80.0)
        self.assertEqual(level, "good")

    def test_deal_score_mod_plateau_and_max_80(self):
        # 0% cheaper -> bonus 0.0, score 50.0
        self.assertAlmostEqual(self.service._deal_score_mod(0.0), 0.0)
        # 10% cheaper -> 10 * 2.1 = 21.0, score 71.0
        self.assertAlmostEqual(self.service._deal_score_mod(10.0), 21.0)
        # 15% cheaper -> 21.0 + 5 * 1.8 = 30.0, reaches max score 80.0
        self.assertAlmostEqual(self.service._deal_score_mod(15.0), 30.0)
        # Plateau zone (15% to 18%) -> maintains +30.0 bonus (score 80.0)
        self.assertAlmostEqual(self.service._deal_score_mod(16.5), 30.0)
        self.assertAlmostEqual(self.service._deal_score_mod(18.0), 30.0)
        # 20% cheaper -> 30.0 - (2.0 * 1.5) = 27.0
        self.assertAlmostEqual(self.service._deal_score_mod(20.0), 27.0)
        # 23% cheaper -> 30.0 - (5.0 * 1.5) = 22.5
        self.assertAlmostEqual(self.service._deal_score_mod(23.0), 22.5)

    def test_price_estimate_from_url_uses_database_first_and_returns_estimate(self):
        with TestClient(self.app) as client:
            res = client.post("/price-estimate/from-url", json={"url": "https://999.md/ro/10000000"})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["vehicle"]["source"], "database")
        self.assertEqual(body["vehicle"]["brand"], "Toyota")
        self.assertEqual(body["vehicle"]["model"], "Auris")
        self.assertTrue(body["estimate"]["estimate_available"])
        self.assertIsNotNone(body["estimate"]["estimate"]["market_price"])


if __name__ == "__main__":
    unittest.main()
