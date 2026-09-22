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

The service keeps all eligible direct references. With fewer than eight, it adds
up to 25 highest-weight fallback references of the same class, body, and powertrain
group, within the effective year and mileage ranges and a 0.3 L engine tolerance.
Fallback queries have no brand, model, or generation constraint. The fixed weight
is 50% model, 20% mileage, 10% year, 10% drivetrain, 5% engine, and 5% gearbox.
The model bonus compares brand/model only, including when a fallback listing has
another generation; the eight-reference threshold still requires the selected
generation. Fuel mapping includes all observed database values; unknown fuels are
rejected as targets and excluded as candidates. Romanian drivetrain labels are
mapped for scoring; `4x2` remains unspecified front/rear drive.

The response contains:

- `currency`: EUR; only normalized `price_eur` is used.
- `estimate`: weighted P50 `market_price`, `sell_fast` P20–P30, `normal` P40–P60,
  and `higher_asking` P70–P80, each range with `min`, `max`, and `percentile_range`.
- `comparison`: cleaned same/similar model counts, `total_used`, `same_model_only`,
  `fetched` (raw comparison responses including duplicates), `eligible` (unique
  eligible comparisons before the fallback cap), `direct_comparables_available`
  (before outlier removal), `outliers_removed`, and an explanatory message.
- `search`: requested/effective year boundaries, target identity, year/mileage,
  and mileage boundaries.
- `market_stats`: unweighted average/median/min/max price and average year/mileage.
- `distribution`: a nice `interval`, `bar_count` (4–8), and `bars` containing price
  bounds, actual listing count/percentage, and average year/mileage. Empty bins
  have null averages. A single-price pool gets six surrounding bins.

IQR cleanup runs after fallback selection. All counts and distribution statistics
describe the cleaned pool unless explicitly described above. Weights are neither
squared nor used to change individual prices. Asking prices do not guarantee sale
prices or time to sell.

Invalid selections/ranges or a missing/ambiguous fallback class return 422. No
usable comparisons return 404. An internal listings API failure returns 502.
The endpoint follows the public read access of `GET /listings`.

Run the unit and integration tests with:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

Tests use mocked internal responses and an isolated SQLite database, including
an assertion that estimate requests execute only SELECT statements.
