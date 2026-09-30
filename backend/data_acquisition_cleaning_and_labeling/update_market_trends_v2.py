"""
Automated Market Trends & Historical Pricing update script.
Part of the v2 data acquisition & cleaning pipeline.
Runs after add_class_to_listings_v2.py to aggregate new scrape batches.
"""
import sys
import time
from pathlib import Path

# Add backend directory to sys.path
backend_dir = str(Path(__file__).resolve().parents[1])
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import SessionLocal
from services.trends import sync_all_unprocessed_trends


def main():
    print("=" * 60)
    print("STARTING: Market Trends Aggregation (v2)")
    print("=" * 60)
    start_time = time.perf_counter()

    with SessionLocal() as db:
        print("[TRENDS] Checking for un-aggregated scrape dates in listings_cleaned...")
        results = sync_all_unprocessed_trends(db)

        if not results:
            print("[TRENDS] All scrape dates are already synchronized. Everything is up to date!")
        else:
            for r in results:
                print(f"[TRENDS] Synced date {r.snapshot_date}: {r.trends_records_processed} cohorts aggregated, {r.observations_recorded} price observations logged.")

    elapsed = time.perf_counter() - start_time
    print(f"[TRENDS] COMPLETE in {elapsed:.2f} seconds.")
    print("=" * 60)


if __name__ == "__main__":
    main()
