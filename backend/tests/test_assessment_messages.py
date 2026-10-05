"""User-facing estimator and risk warnings are Romanian; validation is preserved."""
import os
from pathlib import Path
import sys
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from database import get_db
from price_estimate_schemas import PriceEstimateRequest
from routers import anomaly_risk, price_estimate
from services.price_estimate import PriceEstimateError, PriceEstimateService, effective_year_range, get_powertrain_group


def payload(year):
    return dict(brand="Toyota", model="Yaris", generation="I (1999 - 2005)", year=year,
                mileage=150000, fuel_type="Benzină", engine=1, gearbox="Mecanică", drivetrain="Din față",
                body_type="Hatchback", year_min=year-2, year_max=year+2, mileage_min=0, mileage_max=10000000)


class GenerationValidationService:
    async def estimate(self, target):
        effective_year_range(target)
        raise AssertionError("These requests must fail generation validation")


class AssessmentMessagesTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(price_estimate.router)
        self.app.include_router(anomaly_risk.router)
        self.app.dependency_overrides[price_estimate.get_price_estimate_service] = lambda: GenerationValidationService()
        self.app.dependency_overrides[anomaly_risk.get_anomaly_risk_service] = lambda: None
        self.app.dependency_overrides[get_db] = lambda: None

    def test_below_and_above_generation_year_errors_are_romanian(self):
        with TestClient(self.app) as client:
            for year in (1997, 2008):
                response = client.post("/price-estimate", json=payload(year))
                self.assertEqual(response.status_code, 422)
                self.assertIn("Anul de fabricație", response.json()["detail"])
                self.assertIn("1999–2005", response.json()["detail"])
                self.assertNotIn("Target year", response.json()["detail"])

    def test_future_year_warning_is_romanian_for_both_features(self):
        with TestClient(self.app) as client:
            requests = [("/price-estimate", payload(9999)),
                        ("/anomaly-risk", dict(brand="Toyota", model="Yaris", price=2500, year=9999))]
            for route, request in requests:
                response = client.post(route, json=request)
                self.assertEqual(response.status_code, 422)
                self.assertIn("anul calendaristic următor", response.json()["detail"][0]["msg"])

    def test_invalid_categories_and_missing_engine_have_human_readable_romanian_warnings(self):
        request = PriceEstimateRequest(**payload(2002))
        fields = ("brand", "model", "generation", "fuel_type", "gearbox", "drivetrain", "body_type", "engine")
        options = {field: [getattr(request, field)] for field in fields}
        for field in fields:
            invalid = {**options, field: []}
            with self.assertRaises(PriceEstimateError) as caught:
                PriceEstimateService._validate_categories(request, invalid, "ICE")
            self.assertIn("Selectează", caught.exception.detail)
        with self.assertRaises(PriceEstimateError) as caught:
            PriceEstimateService._validate_categories(request.model_copy(update={"engine": None}), options, "ICE")
        self.assertIn("Capacitatea motorului", caught.exception.detail)
        with self.assertRaises(ValueError) as caught:
            get_powertrain_group("unknown")
        self.assertIn("Tipul de combustibil", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
