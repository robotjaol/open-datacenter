# Final acceptance report

Evidence recorded on the build machine (Linux, CPython 3.x, Node 22.23.5, Chrome headless with software GL). Remote CI has **not** run at the time of writing.

| Criterion | Evidence | Result |
| --- | --- | --- |
| Python tests | `python -m unittest discover -s tests` | 45 tests OK |
| Repository verification | `python scripts/verify_repository.py` | PASS (hashes, schema, costs, asset IDs, six offline cases, local links) |
| Typecheck | `npm run typecheck` (tsc strict) | 0 errors |
| Lint | `npm run lint` | 0 errors |
| Frontend tests | `npx vitest run` | 22 passed |
| Build | `npm run build` | exit 0 |
| Ten modules render | Headless Chrome visits every route | No page errors, no console errors |
| Real click selects a rack | Playwright mouse click on `screenOf('H02-R017')` | selected `H02-R017` |
| Scenario runs real model | Dense racks 35 kW preset | Comparison returned, config digest shown |
| Export | CSV and JSON download from the page | Both files saved |
| Reference unchanged | `test_reference_files_are_unchanged_after_runs` | Pass |
| No horizontal overflow | 7 widths (375, 390, 768, 1280, 1366, 1440, 1920) × 10 routes | 0 overflow routes |
| Reference NPV preserved | `contract.test.ts` | Negative, equals report |

## Not verified

- Remote GitHub Actions run.
- Real GPU rendering. Screenshots use a software renderer.
- Screen reader behaviour. Keyboard and labels were built in; no assistive technology test was run.
- Firefox and Safari.
- Contrast ratios were not measured with a tool.
