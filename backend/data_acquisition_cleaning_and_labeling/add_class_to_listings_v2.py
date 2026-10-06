"""Classify staging, preserve outgoing records, and publish one atomic batch."""
import psycopg
from psycopg import sql

from pipeline_runtime import PipelineError, columns, ensure_columns, log, names, parser, run_cli, stage_session


def preserve_current_fields(cur, target, staged):
    """Carry application-owned columns (including scores) over by stable listing ID."""
    target_fields = columns(cur, target)
    stage_fields = columns(cur, staged)
    ensure_columns(cur, staged, target_fields)
    for field in target_fields:
        if field == "id":
            continue
        if field in {"Score", "score"}:
            # Scoring may run while discovery/details are in progress. Prefer the latest live score.
            cur.execute(sql.SQL("""UPDATE {} AS pending SET {}=current.{} FROM {} AS current
                WHERE current.id=pending.id AND current.{} IS NOT NULL""").format(
                    sql.Identifier(staged), sql.Identifier(field), sql.Identifier(field),
                    sql.Identifier(target), sql.Identifier(field)))
            continue
        if field not in stage_fields or field in {"Score", "score", "class"}:
            cur.execute(sql.SQL("""UPDATE {} AS pending SET {}=current.{} FROM {} AS current
                WHERE current.id=pending.id AND pending.{} IS NULL""").format(
                    sql.Identifier(staged), sql.Identifier(field), sql.Identifier(field),
                    sql.Identifier(target), sql.Identifier(field)))


def archive(cur, run, source, destination, phase):
    """Append the complete snapshot once, with source types and no unique constraint on ad ID."""
    cur.execute("SELECT 1 FROM scrape_pipeline_archives WHERE run_id=%s AND table_name=%s AND phase=%s",
                (run.id, destination, phase))
    if cur.fetchone():
        return
    definitions = columns(cur, source)
    if not definitions:
        return
    # No LIKE INCLUDING ALL: listing IDs intentionally repeat across snapshots.
    ensure_columns(cur, destination, definitions)
    ensure_columns(cur, destination, {
        "archive_id": "BIGSERIAL", "snapshot_at": "TIMESTAMPTZ",
        "batch_id": "UUID", "snapshot_phase": "TEXT",
    })
    field_names = names(definitions)
    cur.execute(sql.SQL("""INSERT INTO {} ({},snapshot_at,batch_id,snapshot_phase)
        SELECT {},NOW(),%s,%s FROM {}""").format(
            sql.Identifier(destination), field_names, field_names, sql.Identifier(source)), (run.id, phase))
    log(f"Staged archive: {cur.rowcount:,} {phase} rows in {destination}, including scores; awaiting commit.")
    cur.execute("INSERT INTO scrape_pipeline_archives(run_id,table_name,phase) VALUES (%s,%s,%s)",
                (run.id, destination, phase))
    cur.execute(sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} (id,snapshot_at DESC,archive_id DESC)").format(
        sql.Identifier(f"idx_{destination}_latest_listing"), sql.Identifier(destination)))


def replace_current(cur, target, staged):
    log(f"Preparing current-table schema: {target}.")
    definitions = columns(cur, staged)
    ensure_columns(cur, target, definitions)
    # New ads have not been scored yet. Preserve existing values and represent unknown as NULL.
    for score in ("Score", "score"):
        if score in definitions:
            cur.execute(sql.SQL("ALTER TABLE {} ALTER COLUMN {} DROP NOT NULL").format(
                sql.Identifier(target), sql.Identifier(score)))
    log(f"Replacing {target} from {staged} inside the publication transaction.")
    cur.execute(sql.SQL("TRUNCATE TABLE {}").format(sql.Identifier(target)))
    field_names = names(definitions)
    cur.execute(sql.SQL("INSERT INTO {} ({}) SELECT {} FROM {}").format(
        sql.Identifier(target), field_names, field_names, sql.Identifier(staged)))
    log(f"Prepared {cur.rowcount:,} rows for {target}; awaiting transaction commit.")


def table_count(cur, table):
    if not columns(cur, table):
        return 0
    cur.execute(sql.SQL("SELECT COUNT(*) FROM {}").format(sql.Identifier(table)))
    return cur.fetchone()[0]


def check_publishable(cur, run, allow_large_drop=False):
    cur.execute("""SELECT outcome,COUNT(*) FROM scrape_pipeline_ids WHERE run_id=%s GROUP BY outcome""", (run.id,))
    outcomes = dict(cur.fetchall())
    if not outcomes or outcomes.get("pending", 0) or outcomes.get("failed", 0):
        raise PipelineError("Unresolved discovery/detail work exists. Publication refused.")
    cur.execute("SELECT discovery_finished,staging_ready FROM scrape_pipeline_runs WHERE id=%s", (run.id,))
    if cur.fetchone() != (True, True):
        raise PipelineError("Discovery/staging is not complete. Publication refused.")
    expected = outcomes.get("copied", 0) + outcomes.get("scraped", 0)
    if table_count(cur, "listings_temp") != expected:
        raise PipelineError("Raw staging count differs from the detail checkpoints. Publication refused.")
    for current, staged in (("listings", "listings_temp"), ("listings_cleaned", "listings_cleaned_temp")):
        before, after = table_count(cur, current), table_count(cur, staged)
        log(f"Pre-publication check: {current}: {before:,} current -> {after:,} staged.")
        if after == 0:
            raise PipelineError("Empty staging cannot replace current inventory.")
        if before and after < before * 0.80 and not allow_large_drop:
            raise PipelineError("Inventory would shrink by more than 20%. Inspect the batch; use --allow-large-drop only if expected.")
        cur.execute(sql.SQL("SELECT COUNT(*)-COUNT(DISTINCT id) FROM {}").format(sql.Identifier(staged)))
        if cur.fetchone()[0]:
            raise PipelineError(f"Duplicate or NULL IDs in {staged}; publication refused.")
    # Count alone is not enough: ensure the raw rows belong to this exact batch.
    cur.execute("""SELECT COUNT(*) FROM listings_temp t WHERE NOT EXISTS (
        SELECT 1 FROM scrape_pipeline_ids i WHERE i.run_id=%s AND i.listing_id=t.id
        AND i.outcome IN ('copied','scraped'))""", (run.id,))
    if cur.fetchone()[0]:
        raise PipelineError("Staging contains rows outside the active batch.")
    cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp c WHERE NOT EXISTS (SELECT 1 FROM listings_temp r WHERE r.id=c.id)")
    if cur.fetchone()[0]:
        raise PipelineError("Cleaned staging contains rows outside raw staging.")


def publish(run, allow_large_drop=False):
    conn = run.connection
    try:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL lock_timeout='15s'")
            # Block concurrent inventory/scoring writes while taking backups and replacing rows.
            for table in ("listings", "listings_cleaned"):
                if columns(cur, table):
                    cur.execute(sql.SQL("LOCK TABLE {} IN ACCESS EXCLUSIVE MODE").format(sql.Identifier(table)))
            check_publishable(cur, run, allow_large_drop)
            log("Applying model classes to cleaned staging.")
            ensure_columns(cur, "listings_cleaned_temp", {"class": "TEXT", "Score": "NUMERIC"})
            cur.execute("""UPDATE listings_cleaned_temp AS listing SET class=mc.market_segment
                FROM model_class AS mc WHERE LOWER(TRIM(listing.brand))=LOWER(TRIM(mc.brand))
                AND LOWER(TRIM(listing.model))=LOWER(TRIM(mc.model)) AND mc.market_segment IS NOT NULL""")
            for current, staged, history in (
                ("listings", "listings_temp", "listings_alltime"),
                ("listings_cleaned", "listings_cleaned_temp", "listings_cleaned_alltime"),
            ):
                log(f"Preserving existing fields and latest scores for {current}.")
                preserve_current_fields(cur, current, staged)
                # Initial baseline and every outgoing batch are archived before replacement.
                archive(cur, run, current, history, "outgoing")
                archive(cur, run, staged, history, "incoming")
                replace_current(cur, current, staged)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_id ON listings_cleaned(id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_brand_model ON listings_cleaned(brand,model)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_price_eur ON listings_cleaned(price_eur)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_mileage ON listings_cleaned(mileage)")
            run.finish(cur, "publish")
        conn.commit()
    except BaseException:
        try:
            conn.rollback()
        except psycopg.Error:
            log("Database connection lost; rerun will check the stored publication checkpoint.")
        log("Publication interrupted. Uncommitted changes roll back; a committed batch is skipped on retry.")
        raise
    log("COMMITTED: current tables, archives, scores and publication checkpoint are consistent.")


def main():
    args_parser = parser("Publish a validated batch atomically, retaining history and scores.")
    args_parser.add_argument("--allow-large-drop", action="store_true", help="Accept a reviewed >20%% inventory decline; other checks remain mandatory.")
    args = args_parser.parse_args()
    with stage_session("publish") as run:
        if run is not None:
            publish(run, args.allow_large_drop)


if __name__ == "__main__":
    run_cli(main)
