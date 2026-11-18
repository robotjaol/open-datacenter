# Data and artifact assessment

| Artifact | Format | Status | Used by web |
| --- | --- | --- | --- |
| `report.json` | JSON | Verified by hash | `core.json` KPIs, energy, finance, reliability |
| `hourly-energy.csv` | CSV, 8,760 rows | Verified | `hourly.json` (16 columns) |
| `monthly-energy.csv` | CSV | Verified | Monthly charts |
| `cashflows.csv`, `sensitivity.csv` | CSV | Verified | Finance module |
| `rack-assets.csv`, `equipment-schedule.csv` | CSV | Verified | `twin.json` identity |
| `telemetry-sample.json` | JSON | Synthetic | Inspector telemetry |
| `hall-layout.svg/.dxf`, `facility-massing.usda` | CAD like | Rack massing only | Not loaded; layout comes from `dcf.geometry` |
| `manifest.json` | JSON | SHA-256 of all of the above | Checked before export; tampering raises an error (tested) |

Findings

- The reference set is complete enough to drive a viewer without new modeling.
- The USD and DXF are not a facility BIM. They are not used for plant placement.
- Data provenance classes in the contract: design, modeled, simulated, financial, each with a `synthetic` flag.
