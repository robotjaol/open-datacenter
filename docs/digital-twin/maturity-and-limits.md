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
