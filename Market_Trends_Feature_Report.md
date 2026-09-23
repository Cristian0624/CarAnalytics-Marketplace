# Market Trends & Historical Pricing Feature Report

**Feature Name:** Market Trends & Price History Analysis  
**Branch:** `market_treds`  
**Target Environment:** FastAPI Backend & Aiven PostgreSQL  
**Date:** September 2026  

---

## 1. Executive Summary & Purpose

The **Market Trends & Historical Pricing** feature equips CarAnalytics-Marketplace with the intelligence to track vehicle valuations over time, detect price fluctuations, analyze multi-year depreciation, and monitor price drops on specific car listings.

Previously, the platform only analyzed static vehicle snapshots. With this feature:
- Users and buyers can see whether a specific car make/model/year is depreciating, appreciating, or maintaining value over time.
- The system automatically captures and compares vehicle prices every time new scraper batches run.
- Individual car listings track price cuts ("price drops") across scrape dates.
- Dropdown selectors show real-time market medians and listing counts for each production year.

---

## 2. Key Capabilities & Endpoints

### A. Automatic Baseline-to-Present Trend History
* **Endpoint:** `GET /trends?brand={brand}&model={model}&year={year}`
* **Description:** Returns the complete valuation timeline for a cohort from the earliest baseline date to the most recent observation. No manual date inputs are needed.
* **Returned Insights:**
  - `data_points`: Chronological snapshots with median price, average price, min/max price, and listing counts.
  - `overall_change_eur` & `overall_change_pct`: Net change from the initial baseline to the latest date.
  - `trend_direction`: Categorized as `up`, `down`, or `stable` (within a ±1% threshold).

### B. Yearly Price Distribution & Depreciation Overview
* **Endpoint:** `GET /trends/options?brand={brand}&model={model}`
* **Description:** Delivers cascading filter options for dropdown UI selectors. When a user selects a brand and model, the endpoint returns all manufacturing years paired with their current median price, average price, and listing volume.
* **Use Case:** Enables users to instantly visualize year-over-year depreciation without sending extra queries.

### C. Individual Car Listing Price History & Price Drop Detection
* **Endpoint:** `GET /trends/listings/{listing_id}`
* **Description:** Inspects a single car's timeline across all scrape passes.
* **Returned Insights:**
  - `first_observed_price` vs `latest_price`
  - `price_change_eur` and `price_change_pct`
  - `is_price_drop`: A boolean flag (`true`/`false`) signaling if the car's current price is lower than its initial or previous price.

### D. Multi-Date Synchronization Pipeline
* **Endpoint:** `POST /trends/sync?target_date=YYYY-MM-DD`
* **Description:** Ingests raw listings from `listings_cleaned`, aggregates cohort medians/averages, and updates both trend tables.

---

## 3. Database Architecture

Two dedicated tables were designed and deployed to PostgreSQL:

```
                                  [listings_cleaned]
                                           |
                    +----------------------+----------------------+
                    | (Aggregation)                               | (Raw Snapshot)
                    v                                             v
         [market_trends]                              [listing_price_history]
  +-------------------------------+             +-------------------------------+
  | id (PK)                       |             | id (PK)                       |
  | brand                         |             | listing_id (FK / indexed)     |
  | model                         |             | brand, model, year            |
  | year                          |             | price_eur                     |
  | snapshot_date                 |             | scraped_at                    |
  | avg_price, median_price       |             +-------------------------------+
  | min_price, max_price          |             Tracks individual car price
  | listing_count                 |             cuts across scrape runs.
  +-------------------------------+
  Aggregates (brand, model, year)
  per scrape date.
```

1. **`market_trends`**:
   - Stores pre-computed aggregate statistics per cohort `(brand, model, year, snapshot_date)`.
   - Indexed uniquely on `(brand, model, year, snapshot_date)` for fast query execution and idempotency.

2. **`listing_price_history`**:
   - Records every individual price observation for each car listing across scrape dates.
   - Indexed on `listing_id` and `(brand, model, year)` for price-drop detection.

---

## 4. Automated Synchronization

The system updates automatically without requiring manual intervention:

1. **Scraping Pipeline Hook (`superfile_v2.py`)**:
   - `update_market_trends_v2.py` is integrated into the final execution step of `superfile_v2.py`.
   - Whenever the automated scrapers run and clean new data, market trends and price histories update instantly.

2. **Server Startup Reconciliation (`main.py`)**:
   - On application startup (`lifespan`), a background task runs `sync_all_unprocessed_trends()`.
   - It identifies any scrape dates in `listings_cleaned` that have not yet been aggregated into `market_trends` and computes them automatically.

---

## 5. Verification & Test Coverage

- **Baseline Data:** Successfully synchronized **59,461 listing observations** and **7,442 trend cohorts** from the September 2026 baseline dataset.
- **Unit Test Suite (`backend/tests/test_trends.py`):**
  - `test_get_trends_success_single_point` (baseline single-point verification)
  - `test_get_trends_multi_points_trend_direction` (multi-date movement and direction calculation)
  - `test_get_trends_not_found` (validation of 404 behavior)
  - `test_get_trend_options` (cascading filters and yearly median prices)
  - `test_get_listing_price_history_with_price_drop` (observation timeline and price drop flags)
- All 5 test suites pass cleanly.
