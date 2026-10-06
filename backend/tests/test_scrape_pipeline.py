"""Offline parser tests plus opt-in PostgreSQL tests in isolated temporary schemas.

Run: python -m unittest backend.tests.test_scrape_pipeline -v
Set PIPELINE_TEST_DATABASE_URL to a LOCAL disposable PostgreSQL database for integration tests.
"""
import json
import os
import subprocess
import sys
import unittest
import uuid
from contextlib import redirect_stdout
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from unittest.mock import Mock, patch

import psycopg
from psycopg import sql

PIPELINE = Path(__file__).resolve().parents[1] / "data_acquisition_cleaning_and_labeling"
sys.path.insert(0, str(PIPELINE))
import pipeline_runtime as runtime
import listing_payload
import scraper6_v2 as discovery
import add_class_to_listings_v2 as publisher
import listing_data_cleaner_v2 as cleaner
import CAR_Scraper3_v2 as details
import superfile_v2 as superfile


def flight_html(ad, text_records=None):
    payload = ""
    for key, value in (text_records or {}).items():
        payload += f"{key}:T{len(value.encode('utf-8')):x}," + value
    payload += "48:" + json.dumps(["$", "component", None, {"adView": ad}]) + "\n"
    # Split a record across scripts to exercise streamed responses.
    middle = len(payload) // 2
    return "".join("<script>self.__next_f.push(" + json.dumps([1, part]) + ")</script>"
                   for part in (payload[:middle], payload[middle:]))


class PayloadTests(unittest.TestCase):
    def test_database_error_reports_connection_reason_and_redacts_credentials(self):
        error = psycopg.OperationalError(
            "SSL connection has been closed unexpectedly; "
            "postgresql://user:secret-pass@localhost/db password='secret-pass'"
        )
        with patch.object(runtime, "database_dsn", return_value="postgresql://user:secret-pass@localhost/db"):
            detail = runtime.database_error_detail(error)
        self.assertIn("SSL connection has been closed unexpectedly", detail)
        self.assertNotIn("secret-pass", detail)
        self.assertIn("[redacted]", detail)

    def test_optional_fields_and_equipment_exclusion(self):
        ad = {
            "id": "12", "title": "Example car", "vinCode": {"value": "TESTVIN123"},
            "body": {"value": {"ro": "$4b"}},
            "groups": [{"controls": [
                {"feature": {"id": 20, "value": {"translated": "Toyota", "value": 99}}},
                {"feature": {"id": 2553, "value": {"translated": "1.5 l"}}},
                {"feature": {"id": 109, "type": "FEATURE_BOOLEAN", "value": True}},
                {"feature": {"id": 130, "type": "FEATURE_BOOLEAN", "value": True}},
            ]}],
            "owner": {"id": "seller-1", "login": "dealer", "verification": {"isVerified": False}},
            "images": {"value": ["picture.jpg?metadata=abc"]},
            "price": {"value": {"value": 12500, "unit": "UNIT_EUR", "bargain": True}},
        }
        result = listing_payload.public_metadata(flight_html(ad, {"4b": "Mașină bună\nDescriere"}), 12)
        self.assertEqual(result["description_ro"], "Mașină bună\nDescriere")
        self.assertEqual(result["vin"], "TESTVIN123")
        self.assertEqual(result["engine"], "1.5")
        self.assertEqual(result["seller_id"], "seller-1")
        self.assertFalse(result["seller_verified"])
        self.assertTrue(result["price_negotiable"])
        self.assertTrue(result["image_url"].endswith("/picture.jpg"))
        self.assertNotIn("109", str(result))
        self.assertNotIn("130", str(result))
        self.assertEqual(listing_payload.public_metadata(flight_html(ad), 999), {})

    def test_missing_optional_data_does_not_fail(self):
        result = listing_payload.public_metadata(flight_html({"id": "1", "groups": []}), 1)
        self.assertIsNone(result["vin"])
        self.assertIsNone(result["seller_id"])
        self.assertEqual(listing_payload.public_metadata("<html>Blocked</html>", 1), {})

    def test_miles_nested_values_and_structured_only_advert(self):
        ad = {"id": "1", "body": "unexpected optional value", "owner": None,
              "company": {"value": {"value": "Dealer"}}, "groups": [{"controls": [
                  {"feature": {"id": 20, "value": {"value": "Toyota"}}},
                  {"feature": {"id": 104, "value": {"value": 100000, "unit": "UNIT_MILE"}}},
                  {"feature": {"id": 2554, "value": {"value": "not available"}}},
              ]}]}
        result = details.parse_listing_html(flight_html(ad), 1)
        self.assertEqual(result["mileage"], 160934)
        self.assertEqual(result["brand"], "Toyota")
        self.assertEqual(result["company"], "Dealer")
        self.assertIsNone(result.get("battery_kwh"))

    def test_verified_pagination_and_wrong_page(self):
        html = '<div class="x__list__container"><a href="/ro/123">Car</a></div>'
        html += '<div class="x__pagination"><a class="x__active">2</a><button class="x__next" disabled></button></div>'
        self.assertEqual(discovery.search_page_state(html, 2), ([123], False))
        self.assertEqual(discovery.search_page_state(html.replace(" disabled", ""), 2), ([123], True))
        with self.assertRaises(runtime.PipelineError):
            discovery.search_page_state(html, 3)
        with self.assertRaises(runtime.PipelineError):
            discovery.search_page_state("<html>Timeout or challenge</html>", 1)

    def test_browser_is_closed_if_discovery_fails(self):
        driver = Mock()
        run = Mock()
        run.state.return_value = {"next_page": 2, "discovery_finished": False}
        with patch.object(discovery, "create_driver", return_value=driver), \
                patch.object(discovery, "collect_pages", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                discovery.collect_ids(run)
        driver.quit.assert_called_once()

    def test_superfile_forwards_flags_and_stops_at_failed_stage(self):
        with patch.object(sys, "argv", ["superfile_v2.py", "--new-run", "--allow-large-drop"]), \
                patch.object(superfile.subprocess, "run", return_value=Mock(returncode=0)) as command, \
                redirect_stdout(StringIO()):
            superfile.main()
        calls = command.call_args_list
        self.assertEqual(len(calls), 6)
        self.assertIn("--new-run", calls[0].args[0])
        self.assertIn("--allow-large-drop", calls[4].args[0])
        self.assertTrue(all(Path(call.args[0][2]).is_absolute() for call in calls))
        with patch.object(sys, "argv", ["superfile_v2.py"]), \
                patch.object(superfile.subprocess, "run", side_effect=[Mock(returncode=0), Mock(returncode=1)]) as command, \
                redirect_stdout(StringIO()):
            with self.assertRaises(SystemExit) as error:
                superfile.main()
        self.assertEqual(error.exception.code, 1)
        self.assertEqual(command.call_count, 2)


TEST_DSN = os.getenv("PIPELINE_TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DSN, "Set PIPELINE_TEST_DATABASE_URL to a local test database")
class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = psycopg.conninfo.conninfo_to_dict(TEST_DSN)
        if settings.get("host") not in {"127.0.0.1", "localhost", "::1"}:
            raise RuntimeError("Integration tests refuse non-local databases.")

    def setUp(self):
        self.schema = "pipeline_test_" + uuid.uuid4().hex
        self.admin = psycopg.connect(TEST_DSN, autocommit=True)
        self.admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
        def connect():
            conn = psycopg.connect(TEST_DSN)
            conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
            conn.commit()
            return conn
        self.connect = connect
        self.patch = patch.object(runtime, "connect", connect)
        self.patch.start()
        self.conn = connect()
        self.output = redirect_stdout(StringIO())
        self.output.__enter__()

    def tearDown(self):
        self.output.__exit__(None, None, None)
        self.conn.close()
        self.patch.stop()
        # Only the uniquely named test schema is removed, never public/current user data.
        self.admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))
        self.admin.close()

    def seed_current(self):
        with self.conn.cursor() as cur:
            runtime.ensure_columns(cur, "listings", runtime.RAW_COLUMNS)
            cur.execute("ALTER TABLE listings ADD PRIMARY KEY(id)")
            for listing_id in (1, 2):
                row = self.car(listing_id)
                cur.execute("""INSERT INTO listings(id,url,brand,model,generation,year,mileage,price,currency,
                    engine,offer_type,registration_country,state,scraped_at,score)
                    VALUES (%s,%s,'Toyota','Yaris','I',2002,%s,3000,'EUR','1.0','Vând','Republica Moldova','Cu rulaj',NOW(),%s)""",
                    (listing_id,row["url"],row["mileage"],listing_id * 10))
            cur.execute("""CREATE TABLE listings_cleaned AS SELECT *,price::double precision AS price_eur,
                'B'::text AS class,42.5::numeric(5,2) AS "Score",'keep me'::text AS app_note FROM listings""")
            cur.execute('ALTER TABLE listings_cleaned ALTER COLUMN "Score" SET NOT NULL')
            cur.execute("CREATE TABLE favourite_listings(id BIGINT PRIMARY KEY,listing_id BIGINT,snapshot JSONB)")
            cur.execute("INSERT INTO favourite_listings VALUES (1,2,'{\"brand\":\"Toyota\"}')")
            cur.execute("CREATE TABLE model_class(brand TEXT,model TEXT,market_segment TEXT)")
            cur.execute("INSERT INTO model_class VALUES ('Toyota','Yaris','B')")
        self.conn.commit()

    @staticmethod
    def car(listing_id):
        return {"id": listing_id, "url": f"https://999.md/ro/{listing_id}", "brand": "Toyota",
                "model": "Yaris", "generation": "I", "year": 2002, "mileage": 100000 + listing_id * 1000,
                "engine": "1.0", "price": 3000, "currency": "EUR", "offer_type": "Vând",
                "registration_country": "Republica Moldova", "state": "Cu rulaj",
                "scraped_at": datetime.now(timezone.utc), "vin": "VIN-" + str(listing_id),
                "seller_username": "seller", "image_url": "https://example.test/car.jpg"}

    def prepare_batch(self):
        self.seed_current()
        with runtime.stage_session("discover") as run:
            self.run_id = run.id
            run.checkpoint_page(1, [1, 3], finished=True)
            runtime.prepare_staging(run)
        with runtime.stage_session("details") as run:
            self.assertEqual(run.pending_ids(), [3])
            details.save_batch(run.connection, [self.car(3)], run)
            with run.connection.cursor() as cur:
                run.finish(cur,"details")
            run.connection.commit()
        cleaner.main()
        with runtime.stage_session("classes") as run:
            with run.connection.cursor() as cur:
                run.finish(cur,"classes")
            run.connection.commit()

    def test_publication_keeps_scores_history_metadata_and_favourites(self):
        self.prepare_batch()
        # Scores updated during a scrape must supersede the staging copy.
        self.conn.execute('UPDATE listings SET score=77 WHERE id=1')
        self.conn.execute('UPDATE listings_cleaned SET "Score"=78 WHERE id=1')
        self.conn.commit()
        with runtime.stage_session("publish") as run:
            publisher.publish(run)
        rows = self.conn.execute('SELECT id,"Score",app_note,vin FROM listings_cleaned ORDER BY id').fetchall()
        self.assertEqual(rows[0], (1, 78, "keep me", None))
        self.assertEqual(rows[1], (3, None, None, "VIN-3"))
        self.assertEqual(self.conn.execute('SELECT "Score" FROM listings_cleaned_alltime WHERE id=2').fetchone()[0],42.5)
        self.assertEqual(self.conn.execute('SELECT score FROM listings_alltime WHERE id=2').fetchone()[0],20)
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM favourite_listings').fetchone()[0],1)
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM listings_cleaned_alltime').fetchone()[0],4)
        self.assertEqual(self.conn.execute('SELECT score FROM listings WHERE id=1').fetchone()[0],77)
        self.assertEqual(self.conn.execute("SELECT vin,seller_username,image_url FROM listings_cleaned_alltime WHERE id=3").fetchone(),
                         ("VIN-3", "seller", "https://example.test/car.jpg"))
        self.conn.commit()
        with runtime.stage_session("publish") as run:
            self.assertIsNone(run)
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM listings_cleaned_alltime').fetchone()[0],4)

    def test_error_mid_publication_rolls_back_everything_then_retry_succeeds(self):
        self.prepare_batch()
        original = publisher.replace_current
        def fail_second(cur, target, staged):
            if target == "listings_cleaned":
                raise RuntimeError("Simulated database failure after raw replacement")
            return original(cur,target,staged)
        with runtime.stage_session("publish") as run:
            with patch.object(publisher,"replace_current",fail_second):
                with self.assertRaises(RuntimeError):
                    publisher.publish(run)
        self.assertEqual(self.conn.execute('SELECT id FROM listings ORDER BY id').fetchall(),[(1,),(2,)])
        self.assertEqual(self.conn.execute("SELECT to_regclass('listings_alltime')").fetchone()[0],None)
        self.conn.commit()
        with runtime.stage_session("publish") as run:
            publisher.publish(run)

    def test_interruption_resumes_pages_and_details_and_blocks_out_of_order(self):
        self.seed_current()
        with self.assertRaises(KeyboardInterrupt):
            with runtime.stage_session("discover") as run:
                run.checkpoint_page(1,[1])
                raise KeyboardInterrupt()
        with self.assertRaises(runtime.PipelineError):
            with runtime.stage_session("clean"):
                pass
        with runtime.stage_session("discover") as run:
            self.assertEqual(run.state()["next_page"],2)
            run.checkpoint_page(2,[3,4],finished=True)
            runtime.prepare_staging(run)
        with runtime.stage_session("details") as run:
            details.save_batch(run.connection,[self.car(3)],run)
            details.record_failure(run.connection,run,4,{"kind":"timeout","error":"retry"})
        with runtime.stage_session("details") as run:
            self.assertEqual(run.pending_ids(),[4])
            details.record_failure(run.connection,run,4,{"kind":"404","error":"gone"})
            self.assertEqual(run.pending_ids(),[])
        self.assertEqual(self.conn.execute('SELECT COUNT(*) FROM listings').fetchone()[0],2)

    def test_count_guard_pending_ids_and_concurrent_run(self):
        self.prepare_batch()
        with runtime.stage_session("publish") as run:
            with self.assertRaises(runtime.PipelineError):
                with runtime.stage_session("publish"):
                    pass
            with self.assertRaises(runtime.PipelineError):
                with runtime.stage_session("discover",new_run=True):
                    pass
            with run.connection.cursor() as cur:
                cur.execute('DELETE FROM listings_cleaned_temp WHERE id=3')
            run.connection.commit()
            with self.assertRaises(runtime.PipelineError):
                publisher.publish(run)
            publisher.publish(run,allow_large_drop=True)

    def test_schema_mismatch_preserves_live_data(self):
        self.prepare_batch()
        self.conn.execute("ALTER TABLE listings_cleaned ADD CONSTRAINT reject_new CHECK(id<>3)")
        self.conn.commit()
        with runtime.stage_session("publish") as run:
            with self.assertRaises(psycopg.errors.CheckViolation):
                publisher.publish(run)
        self.assertEqual(self.conn.execute('SELECT id FROM listings_cleaned ORDER BY id').fetchall(),[(1,),(2,)])

    def test_legacy_staging_is_not_overwritten(self):
        self.conn.execute("CREATE TABLE listings_temp(id BIGINT)")
        self.conn.execute("INSERT INTO listings_temp VALUES (123)")
        self.conn.commit()
        with self.assertRaisesRegex(runtime.PipelineError, "Untracked staging data"):
            with runtime.stage_session("discover"):
                pass
        self.assertEqual(self.conn.execute("SELECT id FROM listings_temp").fetchall(), [(123,)])

    def test_preparing_staging_twice_does_not_erase_committed_details(self):
        self.seed_current()
        with runtime.stage_session("discover") as run:
            run.checkpoint_page(1, [1,3], finished=True)
            runtime.prepare_staging(run)
            details.save_batch(run.connection, [self.car(3)], run)
            runtime.prepare_staging(run)
            self.assertEqual(run.pending_ids(), [])
        self.assertEqual(self.conn.execute("SELECT vin FROM listings_temp WHERE id=3").fetchone()[0], "VIN-3")

    def test_detail_rows_and_checkpoints_roll_back_together(self):
        self.seed_current()
        with runtime.stage_session("discover") as run:
            run.checkpoint_page(1, [3,4], finished=True)
            runtime.prepare_staging(run)
        with runtime.stage_session("details") as run:
            broken = self.car(4)
            broken["year"] = "invalid integer"
            with self.assertRaises(psycopg.Error):
                details.save_batch(run.connection, [self.car(3), broken], run)
            run.connection.rollback()
            self.assertEqual(run.pending_ids(), [3,4])
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM listings_temp").fetchone()[0], 0)

    def test_invalid_publication_inputs_never_touch_current_tables(self):
        self.prepare_batch()
        bad_changes = (
            "UPDATE scrape_pipeline_ids SET outcome='failed' WHERE listing_id=3",
            "DELETE FROM listings_cleaned_temp",
            "UPDATE listings_cleaned_temp SET id=999 WHERE id=3",
            "UPDATE listings_temp SET id=999 WHERE id=3",
        )
        with runtime.stage_session("publish") as run:
            for statement in bad_changes:
                with self.subTest(statement=statement):
                    run.connection.execute(statement)
                    with self.assertRaises(runtime.PipelineError):
                        publisher.publish(run)
                    self.assertEqual(run.connection.execute("SELECT id FROM listings ORDER BY id").fetchall(), [(1,),(2,)])
                    run.connection.commit()

    def test_failed_cleaning_restores_previous_staging(self):
        self.seed_current()
        with runtime.stage_session("discover") as run:
            run.checkpoint_page(1, [1,2], finished=True)
            runtime.prepare_staging(run)
        with runtime.stage_session("details") as run:
            with run.connection.cursor() as cur:
                run.finish(cur, "details")
            run.connection.commit()
        self.conn.execute("CREATE TABLE listings_cleaned_temp(id BIGINT)")
        self.conn.execute("INSERT INTO listings_cleaned_temp VALUES (987)")
        self.conn.execute("UPDATE listings_temp SET price=0")
        self.conn.commit()
        with self.assertRaisesRegex(runtime.PipelineError, "zero rows"):
            cleaner.main()
        self.assertEqual(self.conn.execute("SELECT id FROM listings_cleaned_temp").fetchall(), [(987,)])

    def test_next_batch_keeps_prior_history_and_requires_completed_run(self):
        self.prepare_batch()
        with self.assertRaises(runtime.PipelineError):
            with runtime.stage_session("discover", new_run=True):
                pass
        with runtime.stage_session("publish") as run:
            publisher.publish(run)
        with runtime.stage_session("trends") as run:
            with run.connection.cursor() as cur:
                run.finish(cur, "trends")
            run.connection.commit()
        with runtime.stage_session("discover", new_run=True) as run:
            self.assertNotEqual(run.id, self.run_id)
            run.checkpoint_page(1, [1,3], finished=True)
            runtime.prepare_staging(run)
        with runtime.stage_session("details") as run:
            self.assertEqual(run.pending_ids(), [])
            with run.connection.cursor() as cur:
                run.finish(cur, "details")
            run.connection.commit()
        cleaner.main()
        with runtime.stage_session("classes") as run:
            with run.connection.cursor() as cur:
                run.finish(cur, "classes")
            run.connection.commit()
        with runtime.stage_session("publish") as run:
            publisher.publish(run)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM listings_cleaned_alltime").fetchone()[0], 8)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM listings_cleaned_alltime WHERE id=2").fetchone()[0], 1)

    def test_individual_scripts_then_superfile_resume_with_real_trends(self):
        self.prepare_batch()
        self.conn.execute("UPDATE scrape_pipeline_runs SET completed_stages=ARRAY['discover','details']")
        self.conn.execute("ALTER TABLE model_class ADD COLUMN status TEXT DEFAULT 'success'")
        self.conn.execute("""CREATE TABLE market_trends (
            id SERIAL PRIMARY KEY, brand TEXT, model TEXT, year INTEGER, snapshot_date DATE,
            avg_price DOUBLE PRECISION, median_price DOUBLE PRECISION, min_price DOUBLE PRECISION,
            max_price DOUBLE PRECISION, listing_count INTEGER, UNIQUE(brand,model,year,snapshot_date))""")
        self.conn.execute("""CREATE TABLE listing_price_history (
            id SERIAL PRIMARY KEY, listing_id BIGINT, brand TEXT, model TEXT, year INTEGER,
            price_eur DOUBLE PRECISION, scraped_at TIMESTAMPTZ, UNIQUE(listing_id,scraped_at))""")
        self.conn.commit()
        environment = dict(os.environ)
        environment["SCRAPER_DATABASE_URL"] = psycopg.conninfo.make_conninfo(
            TEST_DSN, options=f"-c search_path={self.schema}")
        # Imported backend model definitions must not configure a production connection either.
        environment["DATABASE_URL"] = "sqlite:///:memory:"
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        for script in ("listing_data_cleaner_v2.py", "model_class_scraper2_v2.py", "superfile_v2.py", "superfile_v2.py"):
            result = subprocess.run([sys.executable, "-B", "-u", str(PIPELINE / script)],
                                    cwd=PIPELINE.parent.parent, env=environment,
                                    capture_output=True, text=True, encoding="utf-8", timeout=60)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIsNotNone(self.conn.execute("SELECT completed_at FROM scrape_pipeline_runs").fetchone()[0])
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM listings_cleaned_alltime").fetchone()[0], 4)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM listing_price_history").fetchone()[0], 2)
        self.assertEqual(self.conn.execute("SELECT listing_count FROM market_trends").fetchone()[0], 2)


if __name__ == "__main__":
    unittest.main()
