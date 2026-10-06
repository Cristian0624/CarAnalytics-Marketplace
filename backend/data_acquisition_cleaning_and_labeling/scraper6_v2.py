"""Discover current advert IDs and commit a durable checkpoint after each page."""
import re
import time

from pipeline_runtime import PipelineError, log, parser, prepare_staging, run_cli, stage_session
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from bs4 import BeautifulSoup


# ============================================================
# 999.MD
# ============================================================

SEARCH_URL = (
    "https://999.md/ro/list/transport/cars?page={page}"
)

MAX_SEARCH_PAGES = 5000

SEARCH_WAIT_SECONDS = 2.0
SCROLL_COUNT = 2
SCROLL_DELAY_SECONDS = 0.75

# ============================================================
# SELENIUM
# ============================================================

def create_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1440,1000")

    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(60)

    return driver


def capture_listing_ids(driver, page_number):
    """Return IDs and whether a successfully rendered page explicitly has no next page."""
    log(f"Opening search page {page_number}.")
    driver.get(SEARCH_URL.format(page=page_number))
    time.sleep(SEARCH_WAIT_SECONDS)
    for _ in range(SCROLL_COUNT):
        driver.execute_script("window.scrollTo(0, document.documentElement.scrollHeight)")
        time.sleep(SCROLL_DELAY_SECONDS)
    WebDriverWait(driver, 30).until(
        lambda browser: browser.find_elements("css selector", '[class*="__pagination"] [class*="__next"]')
    )
    # Read the verified pagination state and actual car cards, never infer the end from missing traffic.
    return search_page_state(driver.page_source, page_number)


def search_page_state(html, expected_page):
    soup = BeautifulSoup(html, "html.parser")
    pagination = soup.select_one('div[class*="__pagination"]')
    if pagination is None:
        raise PipelineError("Pagination is missing; page will be retried.")
    active = pagination.select_one('a[class*="__active"]')
    next_button = pagination.select_one('button[class*="__next"]')
    if active is None or active.get_text(strip=True) != str(expected_page) or next_button is None:
        raise PipelineError("Search page/pagination does not match the requested page.")
    ids = []
    for link in soup.select('div[class*="__list__container"] a[href]'):
        match = re.fullmatch(r"/ro/(\d+)(?:\?.*)?", link["href"])
        if match:
            ids.append(int(match[1]))
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise PipelineError("No car cards on a verified page; refusing an empty/incomplete result.")
    return ids, not next_button.has_attr("disabled")


def collect_ids(run):
    state = run.state()
    if state["discovery_finished"]:
        log("Discovery checkpoint already complete; preparing staging.")
        return
    driver = None
    try:
        driver = create_driver()
        collect_pages(driver, run, state["next_page"])
    finally:
        if driver is not None:
            driver.quit()


def collect_pages(driver, run, page):
    # Keep ownership of the browser in collect_ids so every exit closes it.
    while page <= MAX_SEARCH_PAGES:
        for attempt in range(1, 4):
            try:
                ids, has_next = capture_listing_ids(driver, page)
                break
            except Exception as exc:
                log(f"Page {page}, attempt {attempt}/3 failed ({type(exc).__name__}).")
                if attempt == 3:
                    raise PipelineError(f"Page {page} could not be verified. Rerun to resume this page.") from exc
                time.sleep(2 * attempt)
        run.checkpoint_page(page, ids, finished=not has_next)
        if not has_next:
            log("Explicit final search page reached; discovery complete.")
            return
        page += 1
    raise PipelineError("Search page safety limit reached before the final page. No batch will be published.")


def main():
    args_parser = parser("Discover all current IDs, or resume an interrupted discovery.")
    args_parser.add_argument("--new-run", action="store_true", help="Start a new batch after the previous one completed.")
    args = args_parser.parse_args()
    with stage_session("discover", new_run=args.new_run) as run:
        if run is None:
            return
        collect_ids(run)
        prepare_staging(run)


if __name__ == "__main__":
    run_cli(main)
