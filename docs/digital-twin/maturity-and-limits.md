# Digital twin maturity and limits

## What this is

A design time, browser based visual model of the concept facility. Every number comes from the Python model or its verified reference artifacts. Telemetry is a synthetic offline example.

## What this is not

- Not an operational digital twin. There is no connection to a real asset.
- Not certified engineering. This is concept engineering.
- Not a BIM model. The source OpenUSD and DXF are rack massing.
- Not CFD. Airflow and temperature fields are not simulated.
- Not a live control or monitoring system.

## Asset identity

Asset ID is the primary key: racks `H02-R017`, equipment `UPS-A-01`, `GEN-B-01`, `CHL-SHARED-01`, `CDU-H01-01`. The inspector links rack to its path A and B equipment, hall CDUs and shared chillers through these IDs. Missing values display "Not available in source data".

## Telemetry fields

Each record shows metric, value, unit, timestamp, source, quality and a synthetic flag.

## Path to a real twin (not done)

1. Replace synthetic telemetry with a historian feed and keep the same fields.
2. Map asset IDs to the owner's CMDB.
3. Add plant geometry from a BIM source.
4. Add validated dynamic models if control decisions will depend on them.

## 3D models

| Item | Fact |
| --- | --- |
| Origin | Original procedural models written for this repository. Generic shapes from common public dimensions. Not vendor models, not scans. |
| Rack | 42U class, 4,424 triangles, 200 racks about 0.9 million triangles at full detail; box stand-in beyond 70 m |
| Plant | UPS about 1.0 k triangles, transformer 4.2 k, generator 1.5 k, chiller 4.6 k, CDU 0.9 k |
| Cable tray | Generic ladder tray, 0.3 m wide, one per rack row at 2.75 m. Schematic: the source data has no cable routing. |
| Aisle containment | Not drawn. The source geometry has every rack facing the same way, so it defines no hot or cold aisles. Containment needs that to be added to the Python model first. |
| Placement | Racks from `dcf.geometry`. Plant is schematic. |
| NVIDIA assets | Not used. DSX sample data is licensed for evaluation only. SimReady Central assets are hosted by each OEM under its own licence. |
| Your own assets | Optional GLB override in `web/public/models/`, never committed. |

Generic models show configuration, not a specific product. They must not be read as a vendor design.
