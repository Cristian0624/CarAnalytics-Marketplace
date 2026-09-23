"""Run the untouched-style v2 scripts in their required order."""
import subprocess
import sys
from pathlib import Path


SCRIPTS = (
    "scraper6_v2.py",
    "CAR_Scraper3_v2.py",
    "listing_data_cleaner_v2.py",
    "model_class_scraper2_v2.py",
    "add_class_to_listings_v2.py",
    "update_market_trends_v2.py",
)


def main():
    folder = Path(__file__).resolve().parent
    for script in SCRIPTS:
        print(f"\n{'=' * 70}\nRUNNING: {script}\n{'=' * 70}")
        subprocess.run([sys.executable, str(folder / script)], check=True)


if __name__ == "__main__":
    main()
