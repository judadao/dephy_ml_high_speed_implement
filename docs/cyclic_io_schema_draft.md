# Cyclic IO Schema Draft

This draft records the first IO schema decisions for the cyclic IO prediction
engine.

## Core Decisions

Analog values are normalized before training and inference:

```txt
AI -> normalized AI vector
AO -> normalized AO vector
```

The model predicts a complete normalized IO vector. It does not directly emit a
single case-specific slot/channel write format. The repository converts the
predicted vector into the target case's concrete IO point values and metadata.

## Raw Event Rows

Raw event rows preserve point identity and original values:

```csv
sample_id,t_ms,cycle_id,phase,io_type,slot,channel,value,status,source
```

Example:

```csv
p001,120.0,3,0.240,AI,2,1,4.82,ok,positive_clean
p001,120.0,3,0.240,DI,1,4,1,ok,positive_clean
p001,120.0,3,0.240,Relay,5,2,0,ok,positive_clean
```

Raw values are kept so each case can recover engineering units and downstream IO
formats after prediction.

## Normalized Model Frames

Training and inference should use fixed-width frames:

```csv
sample_id,t_ms,cycle_id,phase,di_1_1,di_1_2,do_2_1,ai_3_1,ao_4_1,relay_5_1,...
```

Rules:

```txt
DI / DO / Relay:
  Binary values normalized to 0 or 1.

AI / AO:
  Normalize using case metadata, such as min/max, mean/std, or engineering-unit
  bounds.

Missing values:
  Preserve an explicit mask or status field. Do not silently convert unknown
  values into valid zero values.

Channel identity:
  Vector column names must include IO type, slot, and channel so the same model
  frame can be converted back to concrete IO points.
```

## Prediction Output

The model output is:

```txt
1000 x complete normalized IO vector
```

Each prediction frame should contain:

```txt
frame_index
phase
t_ms
normalized DI vector
normalized DO vector
normalized AI vector
normalized AO vector
normalized Relay vector
target_snapshot
confidence
optional masks / status / uncertainty
```

## Case Output Conversion

After prediction, repository code converts the normalized vector to case-specific
IO point values:

```txt
normalized prediction vector
  -> case IO map
  -> denormalized engineering values
  -> slot/channel point records
  -> prediction metadata
```

The converter owns:

```txt
slot/channel mapping
analog denormalization
binary thresholding if needed
confidence / uncertainty metadata
status fields
case-specific output filtering
```

This keeps the model generic and keeps deployment-specific IO formatting outside
the learned model.
