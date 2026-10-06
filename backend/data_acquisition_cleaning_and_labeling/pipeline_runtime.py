"""Shared configuration, durable checkpoints and safe staging for the v2 pipeline."""
import argparse
import os
import re
import sys
import traceback
import uuid
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote, quote_plus

import psycopg
from psycopg import sql
from dotenv import load_dotenv


FOLDER = Path(__file__).resolve().parent
STAGES = ("discover", "details", "clean", "classes", "publish", "trends")
LOCK_KEY = 999602061

# Only useful listing/vehicle/seller metadata. No equipment flags are collected.
RAW_COLUMNS = {
    "id": "BIGINT", "url": "TEXT", "brand": "TEXT", "model": "TEXT",
    "price": "NUMERIC", "currency": "TEXT", "generation": "TEXT", "year": "INTEGER",
    "mileage": "INTEGER", "engine": "TEXT", "horsepower": "INTEGER", "fuel_type": "TEXT",
    "gearbox": "TEXT", "state": "TEXT", "registration_country": "TEXT", "drivetrain": "TEXT",
    "body_type": "TEXT", "offer_type": "TEXT", "seller_type": "TEXT", "doors": "INTEGER",
    "seats": "INTEGER", "scraped_at": "TIMESTAMPTZ", "score": "DOUBLE PRECISION",
    "vin": "TEXT", "title": "TEXT", "description_ro": "TEXT", "description_ru": "TEXT",
    "availability": "TEXT", "origin_country": "TEXT", "steering_wheel": "TEXT",
    "color": "TEXT", "range_km": "NUMERIC", "battery_kwh": "NUMERIC",
    "fast_charge_minutes": "NUMERIC", "region": "TEXT", "seller_id": "TEXT",
    "seller_username": "TEXT", "seller_account_created": "TEXT", "seller_verified": "BOOLEAN",
    "seller_business_id": "TEXT", "seller_business_plan": "TEXT", "seller_avatar": "TEXT",
    "contact_person": "TEXT", "company": "TEXT", "contact_email": "TEXT",
    "phone_numbers": "JSONB", "image_url": "TEXT", "posted_at_source": "TEXT",
    "updated_at_source": "TEXT", "expires_at_source": "TEXT", "source_state": "TEXT",
    "source_is_expired": "BOOLEAN", "price_negotiable": "BOOLEAN", "price_mode": "TEXT",
    "down_payment": "NUMERIC", "old_price": "JSONB",
}


class PipelineError(RuntimeError):
    pass


def log(message):
    print(f"[PIPELINE] {message}", flush=True)


def database_dsn():
    # Same configuration for every stage, independent of the terminal directory.
    env_path = FOLDER.parent / ".env"
    load_dotenv(env_path if env_path.exists() else FOLDER.parents[1] / ".env")
    value = os.getenv("SCRAPER_DATABASE_URL") or os.getenv("DATABASE_URL")
    if value:
        for driver in ("+psycopg2", "+psycopg", "+pg8000"):
            value = value.replace("postgresql" + driver + ":", "postgresql:", 1)
        return value
    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    if not all(os.getenv(name) for name in required):
        raise PipelineError("Set SCRAPER_DATABASE_URL, DATABASE_URL, or all DB_* values in backend/.env.")
    return psycopg.conninfo.make_conninfo(
        host=os.environ["DB_HOST"], port=os.environ["DB_PORT"], dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"], sslmode="require",
    )


def connect():
    return psycopg.connect(database_dsn(), connect_timeout=15, application_name="car_scrape_pipeline")


def columns(cur, table):
    cur.execute("""SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)
        FROM pg_attribute a WHERE a.attrelid=to_regclass(%s)
        AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum""", (table,))
    return dict(cur.fetchall())


def names(items):
    return sql.SQL(", ").join(sql.Identifier(item) for item in items)


def ensure_columns(cur, table, definitions):
    """Add missing columns; never drop existing columns or silently change types."""
    cur.execute(sql.SQL("CREATE TABLE IF NOT EXISTS {} (id BIGINT)").format(sql.Identifier(table)))
    existing = columns(cur, table)
    for name, data_type in definitions.items():
        if name not in existing:
            cur.execute(sql.SQL("ALTER TABLE {} ADD COLUMN {} {}").format(
                sql.Identifier(table), sql.Identifier(name), sql.SQL(data_type)))


def initialize(cur):
    cur.execute("""CREATE TABLE IF NOT EXISTS scrape_pipeline_runs (
        id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_stages TEXT[] NOT NULL DEFAULT '{}', next_page INTEGER NOT NULL DEFAULT 1,
        discovery_finished BOOLEAN NOT NULL DEFAULT FALSE,
        staging_ready BOOLEAN NOT NULL DEFAULT FALSE, published_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ)
    """)
    cur.execute("""CREATE TABLE IF NOT EXISTS scrape_pipeline_ids (
        run_id UUID NOT NULL REFERENCES scrape_pipeline_runs(id), listing_id BIGINT NOT NULL,
        outcome TEXT NOT NULL DEFAULT 'pending', error TEXT,
        PRIMARY KEY(run_id, listing_id))""")
    cur.execute("""CREATE TABLE IF NOT EXISTS scrape_pipeline_archives (
        run_id UUID NOT NULL, table_name TEXT NOT NULL, phase TEXT NOT NULL,
        PRIMARY KEY(run_id, table_name, phase))""")


def check_legacy_staging(cur):
    """Do not overwrite work left by the scripts that predate durable checkpoints."""
    for table in ("listings_temp", "listings_cleaned_temp"):
        if columns(cur, table):
            cur.execute(sql.SQL("SELECT EXISTS(SELECT 1 FROM {})").format(sql.Identifier(table)))
            if cur.fetchone()[0]:
                raise PipelineError(
                    f"Untracked staging data exists in {table}. Back it up or rename the table "
                    "before starting the first tracked batch; it has not been changed."
                )


class Run:
    def __init__(self, connection, run_id):
        self.connection = connection
        self.id = run_id

    def state(self):
        with self.connection.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("SELECT * FROM scrape_pipeline_runs WHERE id=%s", (self.id,))
            result = cur.fetchone()
        self.connection.commit()
        return result

    def finish(self, cur, stage):
        # Called in the SAME transaction as the stage's final data changes.
        cur.execute("""UPDATE scrape_pipeline_runs
            SET completed_stages=array_append(completed_stages,%s),
                published_at=CASE WHEN %s='publish' THEN NOW() ELSE published_at END,
                completed_at=CASE WHEN %s='trends' THEN NOW() ELSE completed_at END
            WHERE id=%s AND NOT (%s=ANY(completed_stages))""",
            (stage, stage, stage, self.id, stage))

    def pending_ids(self):
        with self.connection.cursor() as cur:
            cur.execute("""SELECT listing_id FROM scrape_pipeline_ids
                WHERE run_id=%s AND outcome IN ('pending','failed') ORDER BY listing_id""", (self.id,))
            result = [row[0] for row in cur.fetchall()]
        self.connection.commit()
        return result

    def checkpoint_page(self, page, ids, finished=False):
        with self.connection.cursor() as cur:
            cur.executemany("""INSERT INTO scrape_pipeline_ids(run_id,listing_id)
                VALUES (%s,%s) ON CONFLICT DO NOTHING""", [(self.id, int(item)) for item in ids])
            cur.execute("""UPDATE scrape_pipeline_runs SET next_page=%s,discovery_finished=%s
                WHERE id=%s""", (page + 1, finished, self.id))
        self.connection.commit()
        log(f"Discovery page {page} saved ({len(ids)} IDs); checkpoint committed.")


@contextmanager
def stage_session(stage, new_run=False):
    connection = connect()
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_KEY,))
            if not cur.fetchone()[0]:
                raise PipelineError("Another pipeline stage is running. Wait for it to finish.")
            initialize(cur)
            cur.execute("SELECT id,completed_stages FROM scrape_pipeline_runs ORDER BY created_at DESC LIMIT 1")
            previous = cur.fetchone()
            if new_run and previous and "trends" not in previous[1]:
                raise PipelineError("An unfinished batch exists. Rerun without --new-run to resume it first.")
            if previous is None or new_run:
                if stage != "discover":
                    raise PipelineError("No batch exists. Run scraper6_v2.py first.")
                if previous is None:
                    check_legacy_staging(cur)
                run_id = uuid.uuid4()
                cur.execute("INSERT INTO scrape_pipeline_runs(id) VALUES (%s)", (run_id,))
                completed = []
            else:
                run_id, completed = previous
            if stage not in completed:
                required = STAGES[:STAGES.index(stage)]
                if any(item not in completed for item in required):
                    raise PipelineError(f"Run the earlier stages first: {', '.join(required)}.")
        connection.commit()
        if stage in completed:
            log(f"Batch {run_id}: {stage} already complete; no work repeated. Use --new-run for a new scrape.")
            yield None
        else:
            log(f"Batch {run_id}: starting/resuming {stage}.")
            yield Run(connection, run_id)
    finally:
        # Closing also releases the session lock, including on Ctrl+C or exceptions.
        connection.close()


def database_error_detail(exc):
    """Keep useful driver diagnostics without exposing credentials in terminal output."""
    detail = exc.diag.message_primary or str(exc)
    password = os.getenv("DB_PASSWORD")
    try:
        dsn = database_dsn()
        password = psycopg.conninfo.conninfo_to_dict(dsn).get("password") or password
        detail = detail.replace(dsn, "[database connection redacted]")
    except Exception:
        pass  # Reporting an error must not fail because configuration is incomplete.
    if password:
        for value in {password, quote(password, safe=""), quote_plus(password)}:
            detail = detail.replace(value, "[redacted]")
    detail = re.sub(r"(postgres(?:ql)?(?:\+\w+)?://[^:\s/@]+:)[^@\s]+@",
                    r"\1[redacted]@", detail)
    detail = re.sub(r"(password\s*=\s*)(?:'[^']*'|\"[^\"]*\"|\S+)",
                    r"\1[redacted]", detail, flags=re.IGNORECASE)
    return detail


def run_cli(action):
    # Windows pipes may otherwise use a legacy code page that cannot print Romanian text.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    try:
        action()
    except KeyboardInterrupt:
        log("Interrupted. Committed checkpoints are safe. Rerun without --new-run to resume.")
        raise SystemExit(130)
    except Exception as exc:
        # Never print connection strings/credentials from driver exceptions.
        message = str(exc) if isinstance(exc, PipelineError) else type(exc).__name__
        if isinstance(exc, psycopg.Error):
            if exc.sqlstate:
                message += f" (SQLSTATE {exc.sqlstate})"
            detail = database_error_detail(exc)
            if detail:
                message += f": {detail}"
        elif not isinstance(exc, PipelineError):
            frames = traceback.extract_tb(exc.__traceback__)
            if frames:
                frame = frames[-1]
                message += f" at {Path(frame.filename).name}:{frame.lineno} ({frame.name})"
        log(f"STOPPED: {message}. No incomplete batch is published. Rerun after resolving the cause.")
        raise SystemExit(1) from None


def parser(description):
    return argparse.ArgumentParser(description=description)


def prepare_staging(run):
    connection = run.connection
    state = run.state()
    if state["staging_ready"]:
        log("Staging is already prepared; committed details are retained.")
        return
    if not state["discovery_finished"]:
        raise PipelineError("Finish discovery before preparing staging.")
    with connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM scrape_pipeline_ids WHERE run_id=%s", (run.id,))
        if not cur.fetchone()[0]:
            raise PipelineError("Discovery found zero listings; current data will not be replaced.")
        # Only rebuild for a new batch after discovery has completed. Never truncate on resume.
        cur.execute("DROP TABLE IF EXISTS listings_temp")
        ensure_columns(cur, "listings_temp", RAW_COLUMNS)
        old_columns = columns(cur, "listings")
        ensure_columns(cur, "listings_temp", old_columns)
        cur.execute("ALTER TABLE listings_temp ADD PRIMARY KEY (id)")
        if old_columns:
            fields = names(old_columns)
            cur.execute(sql.SQL("""INSERT INTO listings_temp ({}) SELECT {} FROM listings
                WHERE id IN (SELECT listing_id FROM scrape_pipeline_ids WHERE run_id=%s)""")
                .format(fields, fields), (run.id,))
            log(f"Reused {cur.rowcount:,} current raw listings; existing details are retained.")
        cur.execute("""UPDATE scrape_pipeline_ids SET outcome='copied',error=NULL WHERE run_id=%s
            AND listing_id IN (SELECT id FROM listings_temp)""", (run.id,))
        cur.execute("UPDATE scrape_pipeline_runs SET staging_ready=TRUE WHERE id=%s", (run.id,))
        run.finish(cur, "discover")
    connection.commit()
    log(f"Staging ready. {len(run.pending_ids()):,} new/retry listing pages need fetching.")
