# Engineering model assessment

Scope: what the Python model does and does not support. Findings are facts from reading `dcf/` and the reference report unless marked.

## What the model covers

Rack to hall sizing, N+1 power and cooling equipment counts, 8,760 hour energy with weather and load profiles, PV, PUE, direct water, operational grid carbon, a 15 year cash flow, an availability estimate with common cause, and six offline supervisory cases.

## Limits that matter to a reader

| Limit | Evidence | Consequence |
| --- | --- | --- |
| CAPEX does not scale with rack density or IT load | Dense racks 35 kW scenario: IT +40.0 %, CAPEX unchanged at 57.60 M USD | Dense rack NPV is optimistic. The scenario output is an energy and revenue effect, not a capital plan. Inference from `finance.py`: `base_capex_usd` is a fixed input. |
| PV scenarios carry no PV investment cost | `docs/verification.md` | PV runs show energy effect only. |
| Climate and load are synthetic | Config and `hourly-energy.csv` header | No result is a measurement. |
| Availability is an estimate from assumed rates | `reliability.py` | Not an operating record. |
| Reference NPV is negative (about -0.33 M USD) | `report.json` | Kept as is. Assumptions were not adjusted to improve it. |
| Plant has no source geometry | `dcf/geometry.py` places racks only | Plant positions in the 3D view are labelled schematic. |

## Not modeled

CFD airflow, BIM geometry, structural, fire protection design, protection coordination, real utility tariffs, live controls.
