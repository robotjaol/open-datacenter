# Architecture assessment

**Verdict.** The Python core was sound as a calculation layer: pure functions over one validated configuration, deterministic outputs, hashed artifacts. It had no presentation or integration layer, so nothing outside a file reader could use the results.

## Strengths (observed)

- One configuration drives sizing, energy, finance and reliability. `dcf.config.validate` rejects inconsistent input.
- Outputs are reproducible and verified by SHA-256 in `artifacts/reference/manifest.json`.
- Standard library only. No dependency risk.

## Gaps (observed)

1. `dcf/cli.py` built equipment rows and telemetry inline. A viewer would have had to copy that logic. Fixed by extracting `dcf/assets.py`; CLI output stays byte identical (checked by `scripts/verify_repository.py`).
2. No stable machine contract. Fixed by `odc-web-data/1`.
3. No safe way to vary inputs. Fixed by a whitelist in `dcf/scenario.py` that reuses `dcf.config.validate`.

## Design decisions

| Decision | Reason | Cost |
| --- | --- | --- |
| Python stays the only calculation engine | One source of truth; the browser cannot disagree with the model | Scenario runs need the local server |
| Reference mode reads verified artifacts, not recomputed values | The reference is what was hashed and reviewed | Reference must be regenerated when the model changes |
| Standard library HTTP server | Keeps the zero dependency property | Not a production server; bound to localhost by default |
| Derived values (energy balance, monthly carbon, N+1 utilisation) computed in Python | Browser does no engineering arithmetic | Contract grows |

See `docs/architecture/` for the data flow and contract.
