# Data flow and web data contract

```
configs/tropical-5mw.json ──► dcf (Python model) ──► artifacts/reference/*  (SHA-256 in manifest.json)
                                   │                          │
                                   │ live run                 │ verified read
                                   ▼                          ▼
                              dcf.webdata  ──────────►  build/web-data/{core,hourly,twin,docs,tables,manifest}.json
                                   ▲                          │
         POST /api/scenario/run ───┘                          ▼
                 (dcf.scenario, dcf.server)             web/ (Vite, TypeScript, three.js)
```

## Rules

1. Python is the only calculation engine. The browser formats, filters and draws. It does not compute engineering results.
2. Reference mode reads verified artifacts. `from_reference` checks every hash in `manifest.json` and raises `ValueError` on a mismatch (test `test_tampered_artifact_is_rejected`).
3. `from_model` runs the model live. A test asserts both loaders agree (`test_reference_matches_live_model`).
4. Scenario runs never write the reference configuration (`test_reference_files_are_unchanged_after_runs`).

## Contract `odc-web-data/1`

| File | Content |
| --- | --- |
| `core.json` | 17 KPIs with `provenance`, `synthetic`, `sources`; config; sizing; energy; finance; sensitivity; reliability; commissioning; `derived` |
| `hourly.json` | 16 hourly columns plus month, rounded to 4 decimals |
| `twin.json` | halls, racks, equipment, plant display positions, relations, telemetry, notes |
| `docs.json` | documentation index by discipline |
| `tables.json` | FMEA, maintenance matrix, cost allowances, traceability, accommodation, control points |
| `manifest.json` | SHA-256 of each file above |

Each KPI carries a source pointer such as `report:/energy/pue`, `scenario:/it_kw` or `racks:#count`. `webdata.resolve` follows it; `test_every_kpi_traces_to_a_source` checks all of them.

## API

| Method and path | Purpose |
| --- | --- |
| GET `/api/health` | Engine and model version |
| GET `/api/scenario/parameters` | Whitelisted parameters with unit and range |
| POST `/api/scenario/run` | Apply overrides, run the model, return comparison and execution record. Invalid input returns 400 with a message. |
| GET `/data/*` | Contract files |
| GET `/*` | `web/dist` with single page fallback |

Body limit 64 KB. Path traversal is refused (tested). Default bind is 127.0.0.1.
