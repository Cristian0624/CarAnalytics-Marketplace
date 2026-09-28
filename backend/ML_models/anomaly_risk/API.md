# Anomaly risk API

`POST /anomaly-risk` reads current comparisons from `listings_cleaned`.
It does not run CatBoost, load calibration/prediction files, or use training statistics.

## Comparison group

Brand and model match exactly. A supplied generation restricts the group to that
same generation. Without generation, all generations of the model are included.
There is no pagination, year window, mileage range or configuration filter.
An optional `listing_id` excludes the listing from its own comparisons.
Missing mileage/specification values do not contribute to their field statistics.

## Input

Required: `brand`, `model`, positive EUR `price`.
Optional: `generation`, `listing_id`, `year`, `mileage`, `engine`, `fuel_type`,
`gearbox`, `drivetrain`, `body_type`. Omit optional fields or send null.
Invalid input returns 422; database/configuration failures return 503.

## Scoring

- Price: NumPy P10/P25/P50/P75/P90 of existing `price_eur`. Below 10 listings,
  no price score or percentiles. 10-19 gives limited support; 20+ gives normal
  support. Score: P50=0, P25/P75 approximately 20, P10/P90 approximately 60,
  smooth tails toward 100. These are asking-price statistics, not predictions.
- Mileage: same selected group, no year narrowing. Median requires 10 usable
  values; score requires 20. P50=0, P25/P75=10, P10/P90=20, P05/P95=40,
  smooth tails toward 100. This does not establish odometer fraud.
- Specifications: 25 usable observations per supplied field. Scores use value
  frequency, engine tolerance and observed year range. The component takes the
  largest supported field score. Missing inputs are not evaluated.

Weights: price 75%, mileage 10%, specifications 15%, proportionally reweighted
among available components. No available components means no overall score.
Rarity alone never creates a score.

Selected-group support: 0-4 means very rare with no overall score and low
confidence; 5-14 means rare with low confidence and a 4-8 point adjustment;
15-29 means limited with confidence capped at medium and roughly 0.27-4 points;
30+ means normal support without an adjustment. Adjustments require a score.

Confidence uses only the selected group's evidence, observed price spread,
field availability and unsupported specifications. Other generations do not
increase confidence when a generation is selected. Price spread represents
market variation, not ML prediction uncertainty.

Anomaly scores identify unusual listings; they are not fraud probabilities.
Historical ML accuracy figures do not describe this endpoint.

## Runtime

The service still reads scoring constants and feature definitions from
`artifacts/model_metadata.json`, or `ANOMALY_RISK_ARTIFACT_DIR`. No `.cbm` or
`.pkl.gz` file is loaded. Notebook, training code and artifacts remain unchanged.
The legacy `model_version` identifies configuration provenance;
`scoring_policy_version` identifies runtime rules.

From the repository root:

```powershell
python -m uvicorn main:app --app-dir backend --reload
```

Tests use isolated database/HTTP fixtures and unit checks:

```powershell
python -m unittest discover -s backend/tests -p "test_anomaly*.py" -v
```

Saved assessments preserve their original result. Reanalyse to use current rules
and database contents; historical results are never silently rewritten.
