# CarAnalytics-Marketplace
A handy app that ensures the trustability over a car market in Republic in Molodova.

## Stateless price estimate API

`POST /price-estimate` returns an asking-price estimate in EUR. Its standalone
router delegates to `PriceEstimateService`, which calls the existing `GET /listings`
endpoint using an in-process HTTPX ASGI client. No public API URL or second server
is required, and neither requests nor results are persisted. Install the backend
dependencies with `pip install -r requirements.txt`.

Load exact database selections with `GET /listings/options`:

- No parameters: all brands and global fuel, engine, gearbox, drivetrain and body options.
- `?brand=BMW`: also returns models for that brand.
- `?brand=BMW&model=320`: also returns generations for that brand/model.
- Add `generation` to narrow the returned `class` options used internally for fallback.

The JSON keys are `brand`, `model`, `generation`, `fuel_type`, `engine`, `gearbox`,
`drivetrain`, `body_type`, and `class`; each contains a distinct, sorted array.
Configuration options remain global. Pass returned values unchanged. The estimate
validates the brand/model/generation combination and each categorical selection.
The request uses the existing listing field names:

```json
{
  "brand": "BMW",
  "model": "320",
  "generation": "II (2011 - 2020)",
  "year": 2018,
  "mileage": 120000,
  "fuel_type": "Benzină",
  "engine": 2.0,
  "gearbox": "Automată",
  "drivetrain": "Din spate",
  "body_type": "Sedan",
  "year_min": 2015,
  "year_max": 2023,
  "mileage_min": 80000,
  "mileage_max": 160000
}
```

These are illustrative values; use options available in your current inventory.
EV requests can omit `engine` or set it to `null`; ICE/hybrid requests require a
positive database displacement. Year ranges must contain the target year and
stay between 1886 and next calendar year. Mileage ranges must contain the target
mileage and stay between 0 and 10,000,000 km. Production ranges including
`(2019 - prezent)` are supported; unrecognized generation ranges return 422.

The service keeps all eligible direct references with the original 0.3 L engine
tolerance. Eight or more direct references stop further retrieval. Otherwise it
searches for normal fallback references. If the combined, deduplicated eligible
pool has fewer than five vehicles, it makes one final engine-only fallback search.
There is no fourth listings query. EVs skip the third query because displacement
cannot be broadened. A separate options request validates input before retrieval.

Both fallback stages require the same class, body, powertrain group, effective year
range, and requested mileage range. Fallback queries have no brand, model, or
generation constraint. Only the displacement tolerance varies:

| Target engine | Normal fallback | Emergency fallback |
| --- | --- | --- |
| ≤ 1.6 L | ±0.3 L | ±0.3 L |
| > 1.6–2.0 L | ±0.4 L | ±0.4 L |
| > 2.0–2.5 L | ±0.5 L | ±0.6 L |
| > 2.5–3.0 L | ±0.6 L | ±0.8 L |
| > 3.0–4.0 L | ±0.8 L | ±1.2 L |
| > 4.0 L | ±1.2 L | ±2.0 L |

EVs have no displacement filter in either stage. For small combustion/hybrid
engines the third search intentionally has the same bounds as the second.
All direct references and up to 25 highest-weight fallback references across both
stages are retained, followed by the existing IQR cleanup. Duplicate listings keep
their strongest origin: direct, then normal fallback, then emergency fallback.
The engine score still uses its original 0.3 L denominator regardless of retrieval
tolerance. The fixed weight
is 50% model, 20% mileage, 10% year, 10% drivetrain, 5% engine, and 5% gearbox.
The model bonus compares brand/model only, including when a fallback listing has
another generation; the eight-reference threshold still requires the selected
generation. Fuel mapping includes all observed database values; unknown fuels are
rejected as targets and excluded as candidates. Romanian drivetrain labels are
mapped for scoring; `4x2` remains unspecified front/rear drive.

The response contains:

- `currency`: EUR; only normalized `price_eur` is used.
- `estimate_available`: true with at least two cleaned comparables; false with zero or one.
- `reference_price`: the sole listing's asking price when exactly one remains; otherwise null.
- `estimate`: weighted P50 `market_price`, `sell_fast` P20–P30, `normal` P40–P60,
  and `higher_asking` P70–P80, each range with `min`, `max`, and `percentile_range`.
  Null with zero or one comparable; one seller's asking price is not a market estimate.
- `comparison`: cleaned same/similar model counts, `total_used`, `same_model_only`,
  `fetched` (raw comparison responses including duplicates), `eligible` (unique
  eligible comparisons before the fallback cap), `direct_comparables_available`
  (before outlier removal), `outliers_removed`, and an explanatory message.
  Also includes `comparison_mode`, `limited_market_data`, and final source counts
  `direct_count`, `normal_fallback_added`, and `emergency_fallback_added`. These
  source counts exclude duplicates, candidates beyond the cap, and outliers, and
  always sum to `total_used`. Same-model counts still refer to brand/model identity,
  while source counts indicate the search that contributed a listing.
- `search`: requested/effective year boundaries, target identity, year/mileage,
  and mileage boundaries.
- `market_stats`: unweighted average/median/min/max price and average year/mileage.
- `distribution`: a nice `interval`, `bar_count` (4–8), and `bars` containing price
  bounds, actual listing count/percentage, and average year/mileage. Empty bins
  have null averages. A single-price pool gets six surrounding bins.

`market_stats` and `distribution` are null with zero or one comparable.
Comparison modes describe the result:

| Mode | Meaning |
| --- | --- |
| `direct` | At least eight eligible direct references avoided fallback. |
| `normal_fallback` | Normal fallback was needed; at least five cleaned comparables remain. |
| `emergency_fallback` | The final engine search was needed; at least five cleaned comparables remain. |
| `very_limited` | Only 2–4 cleaned comparables remain; estimates retain their actual variance and include a warning. |
| `single_comparable` | One reference asking price, with no statistical estimate. |
| `no_comparables` | No usable market evidence; no estimate or reference price. |

`limited_market_data` is true for emergency and all sparse-result modes. Emergency
results with five or more vehicles explain the expanded search without claiming
the estimate is unreliable. Messages do not claim engine widening for EVs or when
normal and emergency tolerances are identical. Query thresholds use unique eligible
records before IQR cleanup; response availability, source counts, and sparse modes
use the cleaned pool. If cleanup leaves fewer than five, the result reports that
limitation without restarting retrieval or changing the outlier algorithm.

IQR cleanup runs after fallback selection. All counts and distribution statistics
describe the cleaned pool unless explicitly described above. Weights are neither
squared nor used to change individual prices. Asking prices do not guarantee sale
prices or time to sell.

Invalid selections/ranges or a missing/ambiguous fallback class return 422. Zero
or one usable comparable is a valid analytical result and returns HTTP 200.
An internal listings API failure returns 502.
The endpoint follows the public read access of `GET /listings`.

Run the unit and integration tests with:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

Tests use mocked internal responses and an isolated SQLite database, including
an assertion that estimate requests execute only SELECT statements.
