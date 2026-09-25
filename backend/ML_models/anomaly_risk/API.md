# Anomaly risk API

`POST /anomaly-risk` assesses an asking price in EUR. It loads the saved V2 model
once per worker. Requests do not train the model, read the CSV, or write to the database.
The route is registered in the main backend and appears in `/docs`.

Install the repository `requirements.txt` into the environment running the backend.
CatBoost 1.2.10 and SciPy 1.18.1 are now included. The tested ML runtime uses Python 3.12.

From the repository root:

```powershell
python -m pip install -r requirements.txt
python -m uvicorn main:app --app-dir backend --reload
```

Send JSON to `http://127.0.0.1:8000/anomaly-risk`:

```json
{
  "brand": "Toyota",
  "model": "Auris",
  "generation": "II (2012 - 2018)",
  "year": 2013,
  "mileage": 315000,
  "engine": 1.4,
  "fuel_type": "Diesel",
  "gearbox": "Mecanică",
  "drivetrain": "Din față",
  "body_type": "Universal",
  "price": 7600
}
```

`brand`, `model`, and `price` are required. Other vehicle fields can be omitted or
null, which can reduce confidence or leave individual components unsupported.
Use database spelling for familiar categories. Unknown categories are accepted
and reduce confidence. Invalid ranges, empty categories, unexpected fields and
non-finite numbers return 422. Missing or incompatible model files return 503.

The response contains the model version, scoring policy version, EUR currency, assessment status,
market support, anomaly and confidence scores, risk level, component scores, calibrated price
quantiles, evidence counts, effective component weights and reasons. Scores measure unusualness,
not fraud probability.
Held-out price MAE is EUR 2,305.96 and P10-P90 coverage is 79.82%; rare and expensive
vehicles have larger errors. No sale-price or fraud accuracy is claimed.

## Deploying artifacts

The default folder is `backend/ML_models/anomaly_risk/artifacts`. Alternatively set
`ANOMALY_RISK_ARTIFACT_DIR` to an absolute directory before starting the backend.
Deploy these files together from the same trained V2 run:

- `price_quantile_model.cbm`
- `model_metadata.json`
- `mileage_stats.pkl.gz`
- `spec_stats.pkl.gz`
- `market_stats.pkl.gz`

Only load trusted application artifacts; the statistics use Python pickle.
Artifacts are currently ignored by Git and must be copied separately on a new deployment.
Neither the training CSV nor experiment cache is needed for inference. Restart
workers after changing the model bundle or its configured directory.

## Scoring policy

The combined score uses 75% price, 10% mileage and 15% specification signals.
Mileage is deliberately a supporting signal because usage varies greatly between
owners. Its score is 0 at P50, 10 at P25/P75, 20 at P10/P90 and 40 at P05/P95.
Beyond P05 or P95 it rises smoothly toward 100 using the observed tail width.
This allows genuinely extreme mileage to stand out without treating a modest P95
exceedance as near-certainly anomalous.

Exact `brand + model + generation` training support is assessed before producing an
overall verdict. This is an inference policy and does not retrain or alter CatBoost.

- 0-4 observations: `assessment_status` is `very_rare`, confidence is low, and
  `anomaly_score` and `risk_level` are `null`. Price information remains available
  as a low-reliability signal.
- 5-14 observations: `assessment_status` is `limited_support`, `support_level` is
  `rare`, confidence is low, and a bounded 4-8 point adjustment is added to the
  combined score.
- 15-29 observations: `assessment_status` is `limited_support`, `support_level` is
  `limited`, confidence is capped at medium, and a bounded 0.27-4 point adjustment
  is added to the combined score.
- 30 or more observations: `assessment_status` is `full`, `support_level` is
  `normal`, and no rarity adjustment is applied.

The `market_support` object exposes the observation count, level, and exact
adjustment. Very rare vehicles never reassign missing mileage or specification
weights to price; they return a limited-support result instead.

## Held-out support check

The notebook evaluates price predictions on the unchanged 11,779-row test split
using the same exact model-generation support buckets as the API policy:

| Training observations | Test rows | Final price MAE (EUR) |
| --- | ---: | ---: |
| 0 | 96 | 5,888 |
| 1-4 | 478 | 3,702 |
| 5-14 | 945 | 2,853 |
| 15-29 | 1,178 | 2,625 |
| 30+ | 9,082 | 2,096 |

Sparse groups have larger price errors in this split, which supports limiting
confidence. These are price-model errors, not a measured fraud or risk accuracy;
the cutoffs remain policy choices rather than optimized thresholds.

## Verification

```powershell
python -m unittest discover -s backend/tests -p test_anomaly_risk.py -v
```

The tests cover inputs, artifact failures, price and mileage behavior, specification
signals, confidence, support boundaries, suppressed very-rare verdicts, the real
router-to-artifact HTTP flow, and model reuse. With the local artifacts present, they
compare price-model output with the notebook functions. With the CSV present, they
also reproduce the original 11,779-row test split and its MAE and coverage.
Real-artifact tests explicitly skip when the model is not deployed.
