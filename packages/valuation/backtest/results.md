# Valuation backtest

Synthetic pools with a known decay rate and multiplicative noise. The model fits a
weighted log-linear decay on the first 30 days and forecasts the next 30 days
of fees. Errors are (predicted - realized) / realized.

| Pool | True lambda | Fitted lambda | Predicted 30d | Realized 30d | Error |
|---|---|---|---|---|---|
| meme-graduated | 0.080 | 0.081 | 8798 | 8704 | 1.1% |
| ai-token | 0.050 | 0.051 | 9462 | 11322 | -16.4% |
| stock-quoted | 0.020 | 0.015 | 22396 | 19091 | 17.3% |
| slow-burn | 0.010 | 0.014 | 8816 | 11678 | -24.5% |
| fast-decay | 0.120 | 0.129 | 1748 | 2966 | -41.1% |
| flat-blue-chip | 0.000 | -0.008 | 92108 | 70824 | 30.1% |

- Mean absolute error: **21.7%**
- Calibration (mean predicted / mean realized): **1.150**

Calibration near 1.0 means the model is unbiased on average; individual-pool error
is the tightness of the fitted decay rate against the true one. Real series carry
regime changes that this synthetic set does not model, so treat these numbers as an
upper bound on accuracy.
