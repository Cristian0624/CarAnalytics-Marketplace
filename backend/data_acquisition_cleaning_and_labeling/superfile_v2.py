"""Run or resume the pipeline. Each script can also be run individually."""
import subprocess
import sys
from pathlib import Path

from pipeline_runtime import log, parser, run_cli

SCRIPTS = (
    "scraper6_v2.py",
    "CAR_Scraper3_v2.py",
    "listing_data_cleaner_v2.py",
    "model_class_scraper2_v2.py",
    "add_class_to_listings_v2.py",
    "update_market_trends_v2.py",
)


def main():
    args_parser = parser("Resume a batch, or start another with --new-run.")
    args_parser.add_argument("--new-run", action="store_true")
    args_parser.add_argument("--allow-large-drop", action="store_true")
    args = args_parser.parse_args()
    folder = Path(__file__).resolve().parent
    for index, script in enumerate(SCRIPTS, 1):
        command = [sys.executable, "-u", str(folder / script)]
        if index == 1 and args.new_run:
            command.append("--new-run")
        if script == "add_class_to_listings_v2.py" and args.allow_large_drop:
            command.append("--allow-large-drop")
        log(f"Stage {index}/{len(SCRIPTS)}: {script}")
        result = subprocess.run(command, cwd=folder)
        if result.returncode:
            raise SystemExit(result.returncode)
    log("All stages complete. Use --new-run for the next scrape; otherwise completed work is skipped.")


if __name__ == "__main__":
    run_cli(main)
