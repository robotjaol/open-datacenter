# Digital twin gap analysis

The term is used with care. This work delivers a **design time visual model with simulated data**. It is not an operational digital twin.

| Capability | Before | After | Still missing |
| --- | --- | --- | --- |
| Asset identity | CSV rows | Asset ID is the key across rack, equipment, telemetry, relations | Link to a CMDB or DCIM |
| Geometry | Rack massing in SVG, DXF, USD | Interactive 3D racks and halls from `dcf.geometry`; schematic plant | BIM, plant routing, structure |
| Telemetry | Sample JSON | Shown with value, timestamp, source, quality, synthetic flag | Live ingest, historian, time sync |
| Simulation | CLI only | Scenario runs of the real Python model with comparison | Dynamic thermal or electrical simulation |
| Control | Offline supervisory cases | Not exposed | Controls integration |
| Synchronisation with a real asset | None | None | Required for an operational twin |
