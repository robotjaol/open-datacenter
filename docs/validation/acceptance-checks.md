# Reproduce the checks

```bash
python -m unittest discover -s tests -v
python -m dcf.cli validate
python scripts/verify_repository.py
python -m dcf.cli web-data
cd web && npm ci && npm run typecheck && npm run lint && npx vitest run && npm run build
cd .. && python -m dcf.cli serve     # http://127.0.0.1:8765
```

Browser checks used Playwright with Chrome. The route sweep, rack click, scenario run, export and overflow scripts are described in `final-acceptance-report.md`.
