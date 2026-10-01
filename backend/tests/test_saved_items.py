"""HTTP integration tests with real cookie authentication and isolated SQLite."""
import copy
import os
from pathlib import Path
import sys
import unittest

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event, insert, inspect, MetaData, Numeric, select, update
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.schema import CreateTable

from database import Base, get_db
from models import Listing, User, UserSession
from routers import anomaly_risk, favourites, listings, saved_risk_assessments, saved_searches
from saved_items_models import FavouriteListing, SavedRiskAssessment, SavedSearch
from security import create_access_token


VEHICLE = {"brand": "Toyota", "model": "Auris", "price": 7600, "year": 2013, "mileage": 210000}


def assessment_result():
    """A valid engine response; storage tests do not retrain or load ML artifacts."""
    return {
        "scoring_policy_version": "test-policy", "assessment_status": "full",
        "market_support": {"model_generation_observations": 40, "support_level": "normal", "rarity_penalty": 0},
        "message": None, "anomaly_score": 10, "risk_level": "low", "market_confidence": "medium",
        "confidence_score": 60,
        "confidence": {
            "market_confidence": "medium", "confidence_score": 60, "reasons": [],
            "model_observations": 40, "generation_observations": 40, "p10_p90_width": 4000,
            "relative_interval_width": .5, "observed_relative_price_iqr": .2,
        },
        "components": {
            "price_anomaly": {
                "count": 40, "support_level": "normal", "source": "database",
                "comparison_level": "model",
                "actual_price": 7600, "p10": 6000, "p25": 7000, "p50": 8000, "p75": 9000, "p90": 10000,
                "deviation_from_p50_pct": -5, "direction": "normal", "price_anomaly_score": 10,
                "score": 10, "reason": "Observed interval",
            },
            "mileage_anomaly": {
                "actual_mileage": 210000, "expected_median_mileage": None,
                **dict.fromkeys(("p05", "p10", "p25", "p50", "p75", "p90", "p95")),
                "mileage_anomaly_score": None, "score": None, "direction": "unknown", "sample_size": 0,
                "comparison_level": "unsupported", "reason": "Insufficient observations",
            },
            "specification_anomaly": {
                "specification_anomaly_score": None, "score": None, "sample_size": 0,
                "supported_fields": 0, "signals": [],
            },
        },
        "effective_weights": {"price": 1}, "reasons": [],
    }


class FakeEngine:
    metadata = {"model_version": "test-model"}

    def __init__(self):
        self.result = assessment_result()
        self.calls = 0
        self.fail = False

    def assess_listing_risk(self, vehicle, prices, model_count, characteristics):
        self.calls += 1
        if self.fail:
            raise RuntimeError("private diagnostic")
        return copy.deepcopy(self.result)


class SavedItemsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(self.engine, tables=[
            User.__table__, UserSession.__table__, SavedSearch.__table__,
            SavedRiskAssessment.__table__, FavouriteListing.__table__,
        ])
        with self.engine.begin() as connection:
            # The two existing inventory mappings disagree on engine's type and
            # duplicate index names. Match Listing's numeric mapper in SQLite
            # without changing the application's shared metadata or its indexes.
            inventory_table = Listing.__table__.to_metadata(MetaData())
            inventory_table.c.engine.type = Numeric()
            connection.execute(CreateTable(inventory_table))
            connection.execute(insert(User.__table__), [
                {"id": 1, "name": "One", "email": "one@example.com", "password": "unused", "seller_type": "private"},
                {"id": 2, "name": "Two", "email": "two@example.com", "password": "unused", "seller_type": "private"},
            ])
            connection.execute(insert(Listing.__table__), [
                {"id": 1, "url": "https://example.test/car/1", "brand": "Toyota", "model": "Auris",
                 "generation": "II", "year": 2013, "price_eur": 7600, "engine": "1.4", "class": "C"},
                {"id": 2, "url": "https://example.test/car/2", "brand": "BMW", "model": "3 Series",
                 "generation": "F30", "year": 2015, "price_eur": 12000, "engine": "2.0", "class": "D"},
            ])

        def sessions():
            with Session(self.engine) as db:
                yield db

        self.app = FastAPI()
        for router in (anomaly_risk.router, saved_searches.router, saved_risk_assessments.router, favourites.router, listings.router):
            self.app.include_router(router)
        self.app.dependency_overrides[get_db] = sessions
        self.risk_engine = FakeEngine()
        self.app.dependency_overrides[anomaly_risk.get_anomaly_risk_service] = lambda: self.risk_engine
        self.client = TestClient(self.app)
        self.login(1)

    def tearDown(self):
        self.client.close()
        self.engine.dispose()

    def login(self, user_id):
        self.client.cookies.clear()
        self.client.cookies.set("access_token", create_access_token(user_id))

    def create_search(self, **changes):
        response = self.client.post("/saved-searches", json={
            "name": "My search", "filters": {"brand": ["Toyota"], "price_max": 10000}, **changes,
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def create_risk(self):
        response = self.client.post("/saved-risk-assessments", json={"name": "Auris", "input": VEHICLE})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def create_favourite(self):
        response = self.client.post("/favourites", json={"listing_id": 1})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_tables_have_user_indexes_foreign_keys_and_unique_favourites(self):
        inspector = inspect(self.engine)
        for table in ("saved_searches", "saved_risk_assessments", "favourite_listings"):
            self.assertTrue(any(index["column_names"] == ["user_id"] for index in inspector.get_indexes(table)))
            self.assertTrue(any(fk["referred_table"] == "users" for fk in inspector.get_foreign_keys(table)))
        self.assertEqual(inspector.get_unique_constraints("favourite_listings")[0]["column_names"],
                         ["user_id", "listing_key"])

    def test_authentication_required_for_every_router(self):
        self.client.cookies.clear()
        payloads = {"/saved-searches": {"name": "All", "filters": {}},
                    "/saved-risk-assessments": {"name": "Auris", "input": VEHICLE},
                    "/favourites": {"listing_id": 1}}
        for path, payload in payloads.items():
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)
                self.assertEqual(self.client.post(path, json=payload).status_code, 401)
                self.assertEqual(self.client.delete(path + "/1").status_code, 401)
        self.assertEqual(self.risk_engine.calls, 0)

    def test_ownership_for_reads_updates_deletes_and_actions(self):
        search, risk, favourite = self.create_search(), self.create_risk(), self.create_favourite()
        self.login(2)
        records = [("/saved-searches", search, {"name": "stolen"}),
                   ("/saved-risk-assessments", risk, {"name": "stolen"}),
                   ("/favourites", favourite, {"notes": "stolen"})]
        for path, item, patch in records:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).json()["total"], 0)
                url = f"{path}/{item['id']}"
                self.assertEqual(self.client.get(url).status_code, 404)
                self.assertEqual(self.client.patch(url, json=patch).status_code, 404)
                self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertEqual(self.client.get(f"/saved-searches/{search['id']}/results").status_code, 404)
        self.assertEqual(self.client.post(f"/saved-risk-assessments/{risk['id']}/reanalyse").status_code, 404)
        self.assertEqual(self.risk_engine.calls, 1)
        self.login(1)
        for path, item, _ in records:
            self.assertEqual(self.client.get(f"{path}/{item['id']}").status_code, 200)

    def test_client_cannot_choose_owner_or_supply_assessment_result(self):
        bodies = [("/saved-searches", {"name": "All", "filters": {}}),
                  ("/saved-risk-assessments", {"name": "Auris", "input": VEHICLE}),
                  ("/favourites", {"listing_id": 1})]
        for path, payload in bodies:
            self.assertEqual(self.client.post(path, json=payload | {"user_id": 2}).status_code, 422)
        self.assertEqual(self.client.post("/saved-risk-assessments", json={
            "name": "Fake", "input": VEHICLE, "result": {"risk_level": "low"},
        }).status_code, 422)

    def test_saved_search_round_trips_ranges_lists_sort_and_class(self):
        filters = {"brand": ["Toyota", "BMW"], "price_min": 5000, "price_max": 15000,
                   "year_min": 2010, "mileage_max": 250000, "class": ["C", "D"],
                   "sort_by": "price_eur", "sort_order": "desc"}
        item = self.create_search(filters=filters)
        returned = self.client.get(f"/saved-searches/{item['id']}").json()
        self.assertEqual(returned["filters"]["class"], ["C", "D"])
        self.assertEqual(returned["filters"]["brand"], filters["brand"])
        self.assertEqual(float(returned["filters"]["price_min"]), 5000)
        result = self.client.get(f"/saved-searches/{item['id']}/results").json()
        self.assertEqual([row["id"] for row in result["items"]], [])  # mileage was not provided on fixtures
        updated = self.client.patch(f"/saved-searches/{item['id']}", json={
            "filters": {"class": ["C", "D"], "sort_by": "price_eur", "sort_order": "desc"},
        })
        self.assertEqual(updated.status_code, 200, updated.text)
        result = self.client.get(f"/saved-searches/{item['id']}/results").json()
        self.assertEqual([row["id"] for row in result["items"]], [2, 1])

    def test_saved_search_results_follow_inventory_changes(self):
        item = self.create_search()
        url = f"/saved-searches/{item['id']}/results"
        self.assertEqual(self.client.get(url).json()["total"], 1)
        with self.engine.begin() as connection:
            connection.execute(update(Listing.__table__).where(Listing.id == 1).values(price_eur=16000))
        self.assertEqual(self.client.get(url).json()["total"], 0)
        self.assertEqual(self.client.get(f"/saved-searches/{item['id']}").json()["filters"], item["filters"])

    def test_invalid_filters_and_updates_rejected(self):
        for filters in ({"price_min": 100, "price_max": 10}, {"model": ["Golf"]},
                        {"generation": ["I"]}, {"brand": ["VW"], "model": ["Golf"], "class": ["E"]},
                        {"brand": []}, {"brand": [" , "]}, {"mileage_min": -1},
                        {"sort_by": "DROP TABLE"}, {"typo": "x"}, {"price_min": "NaN"}):
            with self.subTest(filters=filters):
                response = self.client.post("/saved-searches", json={"name": "Search", "filters": filters})
                self.assertEqual(response.status_code, 422, response.text)
        item = self.create_search()
        for payload in ({}, {"filters": None}, {"name": None}, {"name": "  "}):
            self.assertEqual(self.client.patch(f"/saved-searches/{item['id']}", json=payload).status_code, 422)

    def test_marketplace_filter_dependencies_and_class_search(self):
        for endpoint in ("/listings", "/listings/paginated"):
            for params in ({"model": "Auris"}, {"generation": "II"},
                           {"brand": "Toyota", "generation": "II"},
                           {"brand": "Toyota", "model": "Auris", "class": "D"}):
                with self.subTest(endpoint=endpoint, params=params):
                    self.assertEqual(self.client.get(endpoint, params=params).status_code, 422)
        response = self.client.get("/listings/paginated", params=[("class", "C"), ("class", "D")])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["total"], 2)
        response = self.client.get("/listings/paginated", params={"brand": "Toyota", "class": "C"})
        self.assertEqual([item["id"] for item in response.json()["items"]], [1])
        response = self.client.get("/listings/paginated", params={
            "brand": "Toyota", "model": "Wrong model", "same_model": "false",
        })
        self.assertEqual(response.json()["total"], 0)
        response = self.client.get("/listings/paginated", params={
            "brand": "Toyota", "model": "Auris", "generation": "II",
        })
        self.assertEqual([item["id"] for item in response.json()["items"]], [1])

    def test_marketplace_options_are_complete_and_cascade(self):
        with self.engine.begin() as connection:
            connection.execute(insert(Listing.__table__), [
                {"id": 100 + index, "brand": f"Zbrand {index:02}", "model": "Example", "engine": "1.4", "generation": None}
                for index in range(30)
            ] + [
                {"id": 200 + index, "brand": "Toyota", "model": "Auris",
                 "generation": f"Generation ({index})", "engine": "1.4"}
                for index in range(30)
            ])
        response = self.client.get("/listings/options")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()["brand"]), 32)
        self.assertIn("Zbrand 29", response.json()["brand"])
        self.assertEqual(self.client.get("/listings/options?brand=Toyota").json()["model"], ["Auris"])
        generations = self.client.get("/listings/options?brand=Toyota&model=Auris").json()["generation"]
        self.assertEqual(len(generations), 31)
        self.assertIn("Generation (29)", generations)
        self.assertNotIn("F30", generations)

    def test_historical_search_remains_editable_and_retired_flag_does_not_broaden_it(self):
        original = self.create_search()
        with self.engine.begin() as connection:
            connection.execute(update(SavedSearch).where(SavedSearch.id == original["id"]).values(filters={
                "brand": ["Toyota"], "model": ["Auris"], "class": ["D"], "same_model": False,
            }))
        path = f"/saved-searches/{original['id']}"
        self.assertEqual(self.client.get(path).status_code, 200)
        self.assertEqual(self.client.get(path + "/results").status_code, 422)
        self.assertEqual(self.client.patch(path, json={"name": "Still editable"}).status_code, 200)
        response = self.client.patch(path, json={"filters": {
            "brand": ["Toyota"], "model": ["Wrong model"], "same_model": False,
        }})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertNotIn("same_model", response.json()["filters"])
        self.assertEqual(self.client.get(path + "/results").json()["total"], 0)

    def test_pagination_and_search_delete(self):
        first = self.create_search()
        second = self.create_search(name="Other")
        page = self.client.get("/saved-searches?page=1&limit=1").json()
        self.assertEqual((page["total"], page["pages"]), (2, 2))
        self.assertEqual(page["items"][0]["id"], second["id"])
        self.assertEqual(self.client.get("/saved-searches?page=0").status_code, 422)
        self.assertEqual(self.client.get("/favourites?limit=101").status_code, 422)
        response = self.client.delete(f"/saved-searches/{first['id']}")
        self.assertEqual((response.status_code, response.content), (204, b""))
        self.assertEqual(self.client.delete(f"/saved-searches/{first['id']}").status_code, 404)

    def test_assessment_is_generated_then_frozen_and_can_be_renamed(self):
        item = self.create_risk()
        self.assertEqual(item["input"]["price"], 7600)
        self.assertEqual(item["result"]["model_version"], "test-model")
        self.risk_engine.result["anomaly_score"] = 90
        self.risk_engine.fail = True
        loaded = self.client.get(f"/saved-risk-assessments/{item['id']}").json()
        self.assertEqual(loaded["result"]["anomaly_score"], 10)
        self.assertEqual(self.risk_engine.calls, 1)
        renamed = self.client.patch(f"/saved-risk-assessments/{item['id']}", json={"name": "Renamed"})
        self.assertEqual(renamed.json()["name"], "Renamed")
        self.assertEqual(renamed.json()["result"], loaded["result"])
        self.assertEqual(self.client.patch(f"/saved-risk-assessments/{item['id']}", json={
            "name": "Fake", "input": VEHICLE,
        }).status_code, 422)

    def test_reanalysis_creates_new_record_and_keeps_original(self):
        item = self.create_risk()
        self.risk_engine.result["anomaly_score"] = 20
        response = self.client.post(f"/saved-risk-assessments/{item['id']}/reanalyse")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertNotEqual(response.json()["id"], item["id"])
        self.assertEqual(response.json()["result"]["anomaly_score"], 20)
        self.assertEqual(self.client.get(f"/saved-risk-assessments/{item['id']}").json()["result"]["anomaly_score"], 10)
        self.assertEqual(self.client.delete(f"/saved-risk-assessments/{item['id']}").status_code, 204)

    def test_failed_assessment_saves_nothing(self):
        self.risk_engine.fail = True
        response = self.client.post("/saved-risk-assessments", json={"name": "Fail", "input": VEHICLE})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private diagnostic", response.text)
        self.assertEqual(self.client.get("/saved-risk-assessments").json()["total"], 0)

    def test_favourite_is_unique_per_user_and_notes_are_editable(self):
        item = self.create_favourite()
        self.assertEqual(self.client.post("/favourites", json={"listing_id": 1}).status_code, 409)
        self.assertEqual(self.client.post("/favourites", json={"listing_id": 999}).status_code, 404)
        response = self.client.patch(f"/favourites/{item['id']}", json={"notes": "See on Friday"})
        self.assertEqual(response.json()["notes"], "See on Friday")
        self.assertEqual(self.client.patch(f"/favourites/{item['id']}", json={"notes": None}).status_code, 200)
        self.login(2)
        self.create_favourite()
        self.assertEqual(self.client.get("/favourites").json()["total"], 1)

    def test_favourite_survives_listing_removal_and_id_reuse(self):
        item = self.create_favourite()
        with self.engine.begin() as connection:
            connection.execute(delete(Listing.__table__).where(Listing.id == 1))
        detail = self.client.get(f"/favourites/{item['id']}").json()
        self.assertFalse(detail["available"])
        self.assertIsNone(detail["current_listing"])
        self.assertEqual(float(detail["snapshot"]["price_eur"]), 7600)
        with self.engine.begin() as connection:
            connection.execute(insert(Listing.__table__), {"id": 1, "url": "https://example.test/other",
                                                          "brand": "Ford", "model": "Focus"})
        self.assertFalse(self.client.get(f"/favourites/{item['id']}").json()["available"])
        self.assertEqual(self.client.delete(f"/favourites/{item['id']}").status_code, 204)

    def test_favourite_finds_same_url_after_id_change_and_keeps_snapshot(self):
        item = self.create_favourite()
        with self.engine.begin() as connection:
            connection.execute(update(Listing.__table__).where(Listing.id == 1).values(id=10, price_eur=7000))
        detail = self.client.get(f"/favourites/{item['id']}").json()
        self.assertTrue(detail["available"])
        self.assertEqual(detail["current_listing"]["id"], 10)
        self.assertEqual(float(detail["snapshot"]["price_eur"]), 7600)
        self.assertEqual(float(detail["current_listing"]["price_eur"]), 7000)
        self.assertEqual(self.client.post("/favourites", json={"listing_id": 10}).status_code, 409)

    def test_deleting_user_cascades_all_saved_items(self):
        self.create_search()
        self.create_risk()
        self.create_favourite()
        with self.engine.begin() as connection:
            connection.execute(delete(User.__table__).where(User.id == 1))
        with Session(self.engine) as db:
            for model in (SavedSearch, SavedRiskAssessment, FavouriteListing):
                self.assertEqual(db.scalars(select(model)).all(), [])

    def test_openapi_documents_all_three_resources(self):
        schema = self.client.get("/openapi.json").json()
        for path in ("/saved-searches", "/saved-risk-assessments", "/favourites"):
            self.assertIn("post", schema["paths"][path])
            self.assertIn("get", schema["paths"][path])
            self.assertIn("delete", schema["paths"][path + "/{item_id}"])


if __name__ == "__main__":
    unittest.main()
