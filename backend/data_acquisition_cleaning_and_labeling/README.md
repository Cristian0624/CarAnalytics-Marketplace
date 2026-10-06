# Vehicle scraping pipeline

All stages use the same configuration and durable PostgreSQL checkpoints. Run commands below
from the repository root with the project virtual environment activated. Chrome must be installed
for discovery; Selenium manages ChromeDriver.

On this Windows checkout, open PowerShell and prepare the terminal:

```powershell
cd D:\Code\python\999-project
.\.venv\Scripts\Activate.ps1
```

The backend web server does not need to be running. These scripts connect to PostgreSQL directly.

## Setup

Install the normal backend requirements and the additional scraper dependencies:

```powershell
python -m pip install -r requirements.txt
python -m pip install -r backend/data_acquisition_cleaning_and_labeling/requirements.txt
```

Database configuration is read from `backend/.env` (or the repository `.env` if that file does
not exist), independent of the terminal's working directory. Existing environment variables
take precedence. Use `SCRAPER_DATABASE_URL` for a deliberate scraper override; otherwise the
pipeline uses `DATABASE_URL`. PostgreSQL SQLAlchemy driver suffixes are accepted. A complete
set of `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` is also supported.
No credentials need to be pasted into individual scripts. The scraper uses Psycopg 3.

Use the existing database settings if they are already correct. Do not change the destination
between stages or retries: the data and checkpoints must belong to the same database/schema.

The configured role needs permission to create the checkpoint/archive tables and alter/write
the listing tables. Existing table ownership, grants, constraints, and indexes are retained.
New tables receive the database's normal owner/default privileges; grant teammates access
using the project's database-role policy. An incompatible schema or insufficient permission
stops the stage instead of dropping constraints or using `CASCADE`.

## Run or resume everything

```powershell
python -u backend/data_acquisition_cleaning_and_labeling/superfile_v2.py
```

The first invocation starts a batch. Later invocations resume it, skipping completed stages.
After a whole batch finishes, explicitly start the next one:

```powershell
python -u backend/data_acquisition_cleaning_and_labeling/superfile_v2.py --new-run
```

**After an interruption, rerun without `--new-run`.** This also applies when the interrupted
run originally used that flag. Only one stage can run at a time, enforced by a database lock.

## Run stages individually

These are the same stages used by the superfile. Run them in this order; each enforces its
prerequisites and skips work already completed in the current batch:

```powershell
python -u backend/data_acquisition_cleaning_and_labeling/scraper6_v2.py
python -u backend/data_acquisition_cleaning_and_labeling/CAR_Scraper3_v2.py
python -u backend/data_acquisition_cleaning_and_labeling/listing_data_cleaner_v2.py
python -u backend/data_acquisition_cleaning_and_labeling/model_class_scraper2_v2.py
python -u backend/data_acquisition_cleaning_and_labeling/add_class_to_listings_v2.py
python -u backend/data_acquisition_cleaning_and_labeling/update_market_trends_v2.py
```

For a subsequent batch, add `--new-run` to `scraper6_v2.py` only. You can switch between
individual scripts and the superfile while resuming the same batch.

## Where each stage writes

| Order | Script | Destination and purpose |
| --- | --- | --- |
| 1 | `scraper6_v2.py` | Records discovered IDs/page checkpoints in `scrape_pipeline_*`; prepares `listings_temp` and copies surviving current raw ads. |
| 2 | `CAR_Scraper3_v2.py` | Fetches new/retry advert pages into `listings_temp`; commits detail checkpoints together with the rows. |
| 3 | `listing_data_cleaner_v2.py` | Builds `listings_cleaned_temp` from raw staging using the existing cleaning rules. |
| 4 | `model_class_scraper2_v2.py` | Resolves models from the incoming cleaned batch and updates the persistent `model_class` cache. |
| 5 | `add_class_to_listings_v2.py` | Assigns classes, preserves scores, archives outgoing/incoming raw and cleaned rows, then publishes `listings` and `listings_cleaned` atomically. |
| 6 | `update_market_trends_v2.py` | Updates `market_trends` and `listing_price_history` from the published cleaned inventory. |

The application keeps using the previous current inventory during stages 1–4. After stage 5
commits, current inventory changes to the new batch. Archive/checkpoint tables are created by
the pipeline when needed; you do not need to create them manually. The pipeline preserves
scores but does not calculate new listing scores itself.

## What is collected

- Existing vehicle fields: brand, model, generation, year, mileage, engine, horsepower,
  fuel, gearbox, drivetrain, body, condition, registration, doors, seats, price/currency,
  offer type, seller type, URL, and scrape timestamp.
- Optional advert fields: VIN, title, Romanian/Russian description, availability, country
  of origin, steering-wheel position, color, region, EV range/battery/charging duration.
- Public seller metadata: account ID, username, account creation date, verification status,
  business ID/plan, avatar reference, contact person/company/email/phone numbers if published.
- Source posting/update/expiry values, status, negotiable-price information, down payment,
  old-price data, and **one image URL**. Image files are not downloaded.

Absent optional values stay `NULL`; a VIN is not invented or extracted from arbitrary prose.
Structured miles are converted to kilometres. Comfort/safety equipment such as ABS and
air conditioning is not collected. Only explicitly listed fields are retained from the
page payload. Useful metadata continues through raw, cleaned, and historical tables.

## Preservation and recovery

1. Discovery commits IDs and the next page after every verified results page. Missing cards,
   inconsistent pagination, and exhausted retries stop discovery; they do not imply an empty
   market. An explicitly disabled next-page button marks completion.
2. IDs still present in the previous raw table reuse their existing details. Only new IDs
   need individual advert requests. Successful details and their checkpoints commit together
   in batches of 25. Failed requests remain retryable; confirmed HTTP 404/410 responses are
   recorded as gone. Blocks, timeouts, and parsing failures prevent publication.
3. Cleaning runs transactionally in staging using the existing cleaning rules. An interrupted
   cleaning attempt leaves the previous staging table intact. Class lookup reads the incoming
   cleaned batch and retains its existing model-class cache/checkpoints.
4. Publication validates membership, counts, unique IDs, and completion. Empty batches and
   inventory drops greater than 20% are rejected. After inspecting a genuinely smaller batch,
   explicitly allow the decline using `--allow-large-drop` on the superfile or publisher.
   This flag does **not** bypass incomplete-work, empty-batch, or membership checks.
5. Within **one PostgreSQL transaction**, publication locks the current tables, preserves
   application-owned fields, archives the outgoing and incoming rows, replaces current rows,
   and marks publication complete. Failure before commit rolls back the whole publication.
   If the connection drops during commit, a retry reads the checkpoint to determine whether
   publication committed; it does not blindly append the same snapshots again.
6. `listings_alltime` and `listings_cleaned_alltime` are append-only snapshots, including the
   outgoing inventory on the **first run**. Removed adverts therefore remain in history.
   Repeated listing IDs across snapshots are intentional. `batch_id`, `snapshot_phase`
   (`outgoing`/`incoming`), `snapshot_at`, and `archive_id` identify each snapshot. An index
   supports looking up the latest version of an ID.
7. Existing `Score`/`score` values are retained in current and historical tables. Publication
   uses the latest live value even if scoring ran while the scrape was in progress. New ads
   start with a `NULL` score until scored; the publisher makes score columns nullable rather
   than inserting a misleading zero. Backend listing schemas already support absent scores.
8. Trends run after publication. A failed trends stage can be retried without republishing
   inventory. Existing trends calculations are reused.

Checkpoints live in `scrape_pipeline_runs`, `scrape_pipeline_ids`, and
`scrape_pipeline_archives`. Keep these tables; do not clear them between retries. If nonempty
staging tables from the old scripts exist before the first tracked run, startup stops and
identifies them. Back them up or rename them before proceeding; no old work is silently erased.

Terminal output includes batch ID, stage, saved discovery page, detail successes/failures,
request pacing and ETA, cleaning counts, publication counts, archive counts, and commit status.
Use `-u` for immediate output when running a stage individually. Ctrl+C stops new requests;
in-flight HTTP calls finish within their configured timeouts and committed work is retained.

## Do not do these during a batch

- Do not delete, truncate, or manually edit `scrape_pipeline_*`, `listings_temp`, or
  `listings_cleaned_temp` to solve a failure. They contain the work needed for a safe retry.
- Do not clear `listings_alltime` or `listings_cleaned_alltime`; they preserve outgoing adverts
  and their scores. Repeated IDs there are valid historical snapshots, not duplicate errors.
- Do not add `--new-run` when recovering an interrupted batch. Rerun the superfile without it;
  it finds the unfinished stage and skips completed work.
- Do not run two pipelines, mix these scripts with the older publishing scripts, or manually
  replace current/staging tables while a batch is active.
- Do not switch databases, schemas, or reset the model-class cache midway through a run.
- Do not use `--allow-large-drop` as a general error bypass. Review the reason for the decline
  first; unresolved requests and empty batches remain blocked even with that flag.

If a stage stops, keep its final error message, resolve that cause, and rerun the superfile.
If it says old/untracked staging exists, preserve or rename those old tables first rather
than deleting them. A failure in trends after publication only requires retrying trends;
current inventory does not need to be published again.

## Known limits

Cleaning normalizes engine values before comparing the existing 18 duplicate identity fields,
so `1.4 l`, `1.4`, and `1,4` do not create separate cleaned copies of otherwise identical rows.
Invalid optional engine text becomes `NULL`. Identity labels are trimmed; missing/placeholder
brands or models (`Altă marcă`, `Alt model`, `Altele`) are excluded from cleaned staging.
`Toate generațiile` becomes a `NULL` generation for a valid brand/model, retaining that advert
for model-level comparisons. Raw rows and historical snapshots keep their source values.
These changes apply to the next cleaning stage; completed batches are skipped on resume.

- The previously agreed reuse policy remains: existing ads are not re-fetched, so their
  price/details may be stale. Newly added metadata remains absent on reused rows unless they
  already had it. Snapshot time and original scrape/source timestamps are separate.
- Search results can change while discovery is running. Checkpoints and decline checks reduce
  incomplete-publication risk but cannot make a changing external website a consistent snapshot.
  Absence from a batch does not prove an advert was sold.
- Optional class lookup failures may leave class unknown; their diagnostics remain in
  `model_class`. Old class values for surviving listings are retained when no replacement is found.
- Transactions protect against interrupted writes, not disk loss or someone deleting the
  database. Continue normal PostgreSQL backups. History stores full snapshots and grows with
  each publication; it is never automatically pruned.
- This pipeline prepares listing history. Favourite-listing routes and UI are unchanged.

## Tests

Parser and orchestration tests run without database access; integration tests skip by default:

```powershell
python -B -m unittest backend.tests.test_scrape_pipeline -v
```

To run the transaction/recovery tests, set `PIPELINE_TEST_DATABASE_URL` to a **local disposable
PostgreSQL database**, then run the same command. Tests refuse remote hosts, create a unique
schema per test, and remove only that schema afterward. They never fall back to `DATABASE_URL`.
Coverage includes publication rollback, resumable discovery/details, latest-score preservation,
history across batches, unknown columns, favourites remaining intact, schema failures, legacy
staging protection, and stopping the superfile after a failed stage.
