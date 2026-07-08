# Cyclic IO Model Health

Model health is the primary developer-facing signal for whether the cyclic IO
model still works or has degraded. Do not rely only on training loss. The model
must be judged by whether it can quickly, smoothly, and reliably converge to the
correct snapshots under noisy runtime IO.

## Health Gates

Every model/prediction validation path should report these five gates:

```txt
1. Snapshot Match
2. Phase Tracking
3. Endpoint Error
4. Smoothness / Jerk
5. Inference Latency
```

Initial thresholds:

```txt
snapshot_match_rate >= 0.99
phase_error_p95 <= 0.05
final_snapshot_error <= configured tolerance
max_jerk <= configured threshold
inference_latency_p95_ms <= 10.0
preferred_inference_latency_p95_ms <= 5.0
```

## Health Score

Health score is a 0-100 developer signal. It should not hide failed gates, but
it makes regressions easy to see.

Initial weighting:

```txt
snapshot_match_rate: 35%
endpoint_error: 25%
phase_error: 20%
smoothness: 10%
latency: 10%
```

Status levels:

```txt
90-100: PASS
75-89: WARN
<75: FAIL
```

Any hard gate failure can force overall `FAIL`, even if the weighted score is
high.

## JSON Format

```json
{
  "format": "cyclic_io_model_health_v1",
  "status": "PASS",
  "health_score": 96.4,
  "gates": {
    "snapshot_match_rate": {
      "value": 0.996,
      "threshold": 0.99,
      "status": "PASS"
    },
    "phase_error_p95": {
      "value": 0.031,
      "threshold": 0.05,
      "status": "PASS"
    },
    "final_snapshot_error": {
      "value": 0.0008,
      "threshold": 0.001,
      "status": "PASS"
    },
    "max_jerk": {
      "value": 0.021,
      "threshold": 0.05,
      "status": "PASS"
    },
    "inference_latency_p95_ms": {
      "value": 4.7,
      "threshold": 10.0,
      "status": "PASS"
    }
  }
}
```

## CLI Display

All future model-health checks should use a display similar to:

```txt
MODEL HEALTH: PASS 96.4/100

PASS snapshot_match_rate      99.6%   >= 99.0%
PASS phase_error_p95          0.031   <= 0.050
PASS final_snapshot_error     0.0008  <= 0.0010
PASS max_jerk                 0.021   <= 0.050
PASS inference_latency_p95    4.7ms   <= 10.0ms
```

Failure example:

```txt
MODEL HEALTH: FAIL 61.2/100

FAIL snapshot_match_rate      82.0%   < 99.0%
FAIL phase_error_p95          0.140   > 0.050
PASS inference_latency_p95    4.1ms   <= 10.0ms
```

## Regression Check

Health checks should support comparing a current report with a baseline:

```txt
baseline_health.json
current_health.json
```

Suggested regression rules:

```txt
score drop > 3: WARN
score drop > 8: FAIL
any gate flips PASS -> FAIL: FAIL
```

## Practical Rule

The intuitive question is:

```txt
Can the model still converge to the correct snapshot under noisy runtime IO,
with smooth output and low latency?
```

If the answer is not clearly yes, model health should warn or fail.
