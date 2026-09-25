# V2 experiment results

Completed on 23 September 2026. All 18 notebook code cells executed successfully,
including scoring checks, calibration checks and production artifact reload.

## Selected model

One CatBoost MultiQuantile model with depth 8, learning rate 0.05 and L2 penalty 5.
Early stopping retained 1,472 trees from a maximum of 2,000. The model uses the
original ten vehicle features. No derived features or additional models were kept.

Model and feature selection used the same 4,711 validation rows throughout.
P10 and P90 were then calibrated from validation residuals scaled by predicted
interval width. Calibration leaves P25, P50 and P75 unchanged. The test set was
used for baseline diagnosis and final evaluation, not model selection.

The grouped split stayed identical to V1: 42,528 fitting rows, 4,711 validation
rows and 11,779 test rows. Exact duplicate rows were removed before splitting.

## Held-out test results

| Metric | Baseline | V2 |
|---|---:|---:|
| P50 MAE | EUR 2,360.98 | EUR 2,305.96 |
| P50 RMSE | EUR 5,833.09 | EUR 5,687.15 |
| P50 R2 | 0.8780 | 0.8840 |
| P10-P90 coverage | 75.94% | 79.82% |
| Mean interval width | EUR 6,716.91 | EUR 7,309.13 |
| Median interval width | EUR 4,200.67 | EUR 4,558.32 |
| Mean relative interval width | 46.50% | 51.60% |

MAE improved by EUR 55.02 (2.33%) and RMSE by EUR 145.94 (2.50%). The accuracy
gain is modest. Coverage is much closer to its 80% target, with an 8.82% increase
in mean width compared with baseline.

| Quantile | Expected coverage | Observed test coverage |
|---|---:|---:|
| P10 | 10% | 10.51% |
| P25 | 25% | 27.94% |
| P50 | 50% | 49.81% |
| P75 | 75% | 72.35% |
| P90 | 90% | 90.33% |

P25 and P75 remain somewhat miscalibrated. Raw quantile crossings occurred on
3.78% of test predictions; the inference ordering step repairs them. Aggregate
coverage does not guarantee accuracy for every model or generation. Errors remain
largest for expensive cars and sparsely represented vehicles.

## Validation experiments

Fourteen candidate fits were completed, in addition to the preserved baseline.
Full calibration, interval and error-breakdown tables are saved in the notebook.

| Candidate | Validation P50 MAE (EUR) |
|---|---:|
| Original baseline | 2,255.57 |
| MultiQuantile depth 6, learning rate 0.08, L2 3 | 2,242.63 |
| MultiQuantile depth 7, learning rate 0.03, L2 5 | 2,238.51 |
| MultiQuantile depth 8, learning rate 0.05, L2 5 | 2,209.07 |
| MultiQuantile depth 9, learning rate 0.08, L2 10 | 2,220.88 |
| MultiQuantile depth 10, learning rate 0.08, L2 10 | 2,239.50 |
| Dedicated median, MAE loss | 2,226.63 |
| Five separate quantiles, after ordering | 2,222.77 |
| Added vehicle age | 2,208.19 |
| Added mileage per year | 2,222.45 |
| Added engine bucket | 2,217.61 |

The age gain was below the predeclared 1% threshold; the other derived features
worsened validation MAE. Dedicated median and separate quantile models also had
worse MAE than the chosen MultiQuantile model, so their complexity was rejected.

## Running it locally

The folder's isolated `.runtime/` uses Python 3.12.14 and the versions in
`requirements.txt`. Windows security settings were not changed. Some compiled
modules used by the original Python 3.14 environment and scikit-learn import
chain are blocked by Smart App Control. CatBoost's required native code runs in
the local Python 3.12 environment. NumPy handles the grouped split and metric
calculations, reproducing the original split and saved validation results.

From the repository root:

```powershell
.\backend\ML_models\anomaly_risk\.runtime\Scripts\python.exe backend\ML_models\anomaly_risk\run_notebook.py
```

The runner explicitly launches its own Python interpreter as the notebook kernel,
reuses compatible fits from `.experiment_cache/` and saves outputs after each cell.
A fresh environment needs Python 3.12 and the packages in `requirements.txt`.

`artifacts/` contains only the selected `price_quantile_model.cbm`, calibration
and training metadata in `model_metadata.json`, and compact mileage/specification/
market statistics. The original baseline and rejected models remain recoverable
in the ignored experiment cache. Runtime, cache, dataset and artifacts are local
files excluded from Git.

Mileage, specification, confidence and combined scoring logic remain unchanged.
No FastAPI, frontend or unrelated ML files were modified by this work.
