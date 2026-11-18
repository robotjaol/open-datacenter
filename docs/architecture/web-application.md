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

Test hook: `window.__twin` exposes `select`, `screenOf`, `selected`, `flyTo` for browser checks.
