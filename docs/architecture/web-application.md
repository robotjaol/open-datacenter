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

CAD tools (`cad.ts`, panel "CAD tools" beside the 3D view): standard views (plan, front, side, iso) keep the current target and distance. Orthographic mode uses a 4 degree field of view with the camera moved back by tan(21 deg)/tan(2 deg), which gives a parallel projection to within 0.1 percent while keeping the same camera object and LOD thresholds (distances are scaled back). A section plane clips the whole scene along X, Y or Z with a slider; models are surface shells without caps, so a cut rack shows its hollow inside, and the rack LEDs are hidden while a section is on because their shader is not clipped. The measure tool takes two surface points (ground plane as fallback) and reports the distance and its X, Y and Z parts. The dimension box draws the bounding box of the selected rack, hall or equipment and shows width, depth and height. Rack size comes from the data contract; equipment size is the generic model bounding box.

Component level (`models/rack-units.ts`, `rack.ts`): a click on the front face of a rack at full or medium detail resolves the hit point in the rack's local frame to a rack unit (U1 to U42) and marks it. The inspector shows slot, height (44.45 mm per U), faceplate and a unit selector. The unit stack (eight 2U servers, three 4U servers, four more 2U servers, switches, patch panel, fillers) is a generic configuration for illustration and is labelled that way; it is not source data and carries no per-unit telemetry. "Explode selected rack" replaces the instanced rack with separate parts (frame, side panels, PDU A and B, liquid manifold, each unit) that move apart, hides the neighbouring racks and containment while it is open, and highlights the selected unit. The parts are rebuilt from the same builders as the full rack, and a test checks that their triangle count equals the full rack.

End-to-end simulation (`sim.ts`, `flows.ts`, panel "End-to-end simulation" over the 3D view): an hour slider and a play control step through the 8,760 rows of `hourly.json` at 1 hour, 6 hours, 1 day or 1 week per second. Readouts for the selected hour are ambient temperature, IT load, facility load, instantaneous PUE (facility kW divided by IT kW), cooling load, chiller COP, grid import and PV used. Jump buttons go to the peak IT hour and the hottest and coolest hours. About 1,500 particles run along schematic routes: transformer to UPS and feeders to each hall tray for power paths A (red) and B (blue), and chilled water from the chiller group to each hall CDU and on to the row manifolds, with return lines (cyan and amber). Particle speed scales with the hour's IT load and cooling load between 35 and 100 percent of the scale and is illustrative, not a physical velocity; routes use display positions of the plant, which are schematic. Rack LED blink rate is also scaled by the hour's load. Generators are shown as standby because the scenario has no outage. Playing the simulation turns the Energy flows layer on; with the layer off or the simulation paused no frames are drawn, and with reduced motion the particles stay still. Nothing here is a live feed.

Semantic zoom, spotlight and guided tour (`levels.ts`, `tour.ts`, level card and tour card over the 3D view): the camera distance to the orbit target maps to five levels (site, hall, row, rack, unit) with limits in `LEVEL_LIMITS`; the level card shows the breadcrumb for the current selection and one line of facts taken from the same records as the side panel. The guided tour has six steps (overview, hall H02, hot aisle, rack, unit, exploded rack) and flies the camera with eased moves; Previous, Pause, Next and Stop are buttons and the tour never starts by itself. Spotlight is an optional SpotLight that follows the orbit target while the room lights are dimmed and a CSS vignette is shown; it is off by default and changes lighting only. The unit step uses a generic rack configuration, labelled as such. On screens up to 560 px wide the tour card sits above the simulation panel and the level card is hidden.

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
