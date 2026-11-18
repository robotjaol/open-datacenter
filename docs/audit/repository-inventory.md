# Repository inventory

Audit of `robotjaol/open-datacenter` at the start of this work (main, commit 9559f23), plus what this change adds. Counts come from `git ls-files`.

## What the repository was

| Area | Path | Files | Role |
| --- | --- | --- | --- |
| Python toolkit | `dcf/` | 14 | Config, sizing, energy, finance, reliability, controls, geometry, site screen, CLI. Standard library only. |
| Unit tests | `tests/` | 4 | 14 tests at audit start. |
| Reference configuration | `configs/tropical-5mw.json` | 1 | Single source of facility inputs. |
| Reference artifacts | `artifacts/reference/` | 16 | Outputs of one verified run, hashed in `manifest.json`. |
| Scripts | `scripts/` | 4 | Repository verification, scenario comparison, PDF typography check. |
| Deliverables | `deliverables/` | 3 | Workbook and PDF portfolio. |
| Discipline folders | `00_executive` to `18_assurance` | numbered | Narrative engineering documentation. |
| Research | `research/` | 5 | Source register, search log, evidence gaps. |
| Schema | `schemas/project.schema.json` | 1 | Project metadata schema. |
| CI | `.github/workflows/ci.yml` | 1 | Python 3.11 and 3.12 on Linux and Windows. |

Facility concept (observed in config and reference report): 5 MW IT, 4 halls, 200 racks at 25 kW, A and B power paths, air and liquid cooling, synthetic tropical climate, 15 year pre-tax unlevered finance.

## What this change adds

| Path | Purpose |
| --- | --- |
| `dcf/assets.py` | Equipment and telemetry rows shared by the CLI and the web export. |
| `dcf/webdata.py` | Builds the `odc-web-data/1` contract from verified artifacts or a live run. |
| `dcf/scenario.py` | Whitelisted scenario overrides and baseline comparison. |
| `dcf/server.py` | Local HTTP API and static host. |
| `web/` | Vite, TypeScript, three.js interface with ten modules. |
| `tests/test_webdata.py`, `test_scenario.py`, `test_server.py` | 31 new Python tests. |
| `web/tests/` | 35 frontend tests. |
| `docs/audit`, `docs/architecture`, `docs/digital-twin`, `docs/validation` | This documentation set. |
| `assets/screenshots/` | Real captures from the running application. |

## Not present at audit start

No web interface, no scenario runner, no API, no machine readable contract for a viewer, no screenshot, no frontend test or build job.
