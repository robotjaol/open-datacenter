# Web application

Stack: Vite, TypeScript (strict), three.js, hand written SVG charts, Vitest, ESLint. No UI framework.

| Module (route) | Pattern | Main content |
| --- | --- | --- |
| Executive Overview (`#/overview`) | Dashboard | KPIs with provenance, facility summary |
| Facility Digital Twin (`#/twin`) | Split pane | 3D halls, racks, plant; equipment inspector |
| Electrical (`#/electrical`) | Detail | Clickable single line diagram, capacity and N+1 checks |
| Mechanical and Cooling (`#/mechanical`) | Detail | Cooling flow, COP against ambient, daily profile |
| Energy and Sustainability (`#/energy`) | Analytics | Hour, day, month, year views; PUE, carbon, PV, balance |
| Reliability and Capacity (`#/reliability`) | Analytics | Availability interval, FMEA, maintenance, offline cases |
| Financial Analysis (`#/finance`) | Analytics | Cash flow, components, NPV sensitivity, assumptions, CSV |
| Scenario Explorer (`#/scenario`) | Form with results | Presets, sliders, run, baseline against scenario, JSON and CSV export |
| Engineering Documentation (`#/docs`) | Split pane | Repository documents, safe Markdown rendering |
| Project Information (`#/project`) | Detail | Scope, maturity, limits, sources |

Provenance chips use shape and text, not colour alone. Amber marks synthetic and scenario values. A top bar always shows the concept status, synthetic inputs, active dataset and API state.

3D scene (`web/src/twin3d.ts`): instanced racks, raycast picking, orbit controls, layer toggles, colour modes (hall, telemetry, neutral), zone fly to. Plant positions are schematic display positions; rack positions come from `dcf.geometry`.

Models (`web/src/models/`): `kit.ts` merges boxes and cylinders into one vertex coloured geometry. `rack.ts` builds a 42U rack (4,424 triangles). `plant.ts` builds UPS, transformer, generator, chiller and CDU (852 to 4,564 triangles). Racks use three levels by distance from the hall centre: full detail under 35 m, a medium model (silhouette, faceplates, vent fields, PDUs and manifold without ports or fittings) to 70 m, and a box beyond that. Hall labels hide when the camera is within 30 m. `tray.ts` builds the overhead cable tray. The 3D loop draws only when something changed (camera, selection, layers, colour mode, resize), so an idle view costs no GPU work. Three.js is loaded by a dynamic import when the Twin page opens. Trays and aisle layers are merged by material. Shadows come from one directional light and are rendered once, then again only when layers or models change. `external.ts` can replace any model with a local GLB from `web/public/models/` (listed by `GET /api/models`, git ignored). All shipped models are generic.

Rack LEDs (`leds.ts`): one status LED per rack unit, drawn by a small shader so the blink costs one uniform update, not a per-instance rewrite. Blink rate per rack follows the synthetic rack telemetry, normalised between the lowest and highest value, between 0.6 and 2.4 Hz (under 3 flashes per second). The LEDs are an illustration of load, not a real status signal, and show only at full and medium detail. Redraws are limited to about 20 per second while LEDs are visible. With `prefers-reduced-motion` the LEDs stay on and nothing animates. The Rack LEDs layer toggle hides them.

Test hook: `window.__twin` exposes `select`, `screenOf`, `selected`, `flyTo` for browser checks.

## 3D performance (measured)

Headless Chrome with a software renderer, 1440 x 900, reference scenario. Draw calls and triangles are for the last drawn frame.

| Measure | Before | After |
| --- | --- | --- |
| Frames drawn in 3 s with no input | 12 | 0 |
| Overview: draw calls | 125 | 77 |
| Overview: triangles | 74,036 | 56,276 |
| Hall oblique view: draw calls | 48 | 35 |
| Inside a hot aisle: draw calls | 27 | 19 |
| Hall oblique view (22 m): triangles | 486,038 | 298,038 |
| JS on first page load (gzip) | 196.7 kB | 26.0 kB |
| Twin page JS, loaded on demand (gzip) | included above | 171.6 kB |

Triangle counts in a hall view stay near 0.3 million because plant (about 83 thousand) and nearby racks are drawn in detail. Frame time on a real GPU was not measured. A distance level of detail for plant was tried and removed, because it saved little and made the overview look plain.
