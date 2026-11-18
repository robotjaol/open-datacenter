"""Command line orchestration with deterministic outputs and source hashes."""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys
from . import __version__
from .config import load, schema
from .engineering import size
from .energy import annual, hourly
from .finance import model, sensitivity
from .reliability import evaluate
from .controls import commission
from .geometry import write_geometry
from .site import rank
from .assets import equipment_rows, telemetry_rows

def write_json(path: Path, obj):
    path.write_text(json.dumps(obj, indent=2, allow_nan=False)+"\n", encoding="utf-8", newline="\n")

def write_csv(path: Path, rows: list[dict]):
    if not rows:
        raise ValueError("CSV rows cannot be empty")
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

def run(config_path: Path, out: Path, site_path: Path) -> dict:
    c = load(config_path)
    # Validate external inputs before creating deliverables.
    sites = rank(site_path)
    sizing = size(c)
    rows = list(hourly(c))
    energy = annual(c, rows=rows)
    finance = model(c)
    reliability = evaluate(c["path_unavailability"], c["common_cause_unavailability"], c["reliability_samples"], c["seed"])
    tests = commission()
    report = {"model_version": __version__, "scenario": c["name"],
              "status": "concept study; synthetic inputs; not certified or construction-ready",
              "config_sha256": hashlib.sha256(config_path.read_bytes()).hexdigest(),
              "sizing": sizing, "energy": energy, "finance": finance, "reliability": reliability,
              "commissioning": tests, "sites": sites}
    out.mkdir(parents=True, exist_ok=True)
    write_json(out/"report.json", report)
    write_json(out/"scenario.json", c)
    write_json(out/"commissioning-results.json", tests)
    write_csv(out/"hourly-energy.csv", rows)
    write_csv(out/"monthly-energy.csv", energy["monthly"])
    write_csv(out/"cashflows.csv", finance["years"])
    write_csv(out/"sensitivity.csv", sensitivity(c))
    write_csv(out/"site-ranking.csv", sites)
    racks = write_geometry(c, out)
    write_csv(out/"rack-assets.csv", racks)
    equipment = equipment_rows(c, sizing)
    write_csv(out/"equipment-schedule.csv", equipment)
    telemetry = telemetry_rows(c, racks)
    write_json(out/"telemetry-sample.json", telemetry)
    # Hash generated evidence (not the manifest itself); no nondeterministic timestamps.
    names = ["report.json", "scenario.json", "commissioning-results.json", "hourly-energy.csv", "monthly-energy.csv",
             "cashflows.csv", "sensitivity.csv", "site-ranking.csv", "rack-assets.csv", "hall-layout.svg",
             "hall-layout.dxf", "facility-massing.usda", "equipment-schedule.csv", "telemetry-sample.json"]
    manifest = {name: hashlib.sha256((out/name).read_bytes()).hexdigest() for name in names}
    write_json(out/"manifest.json", manifest)
    return report

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Open Data Center Facility concept toolkit")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "run"):
        cmd = sub.add_parser(name)
        cmd.add_argument("--config", type=Path, default=Path("configs/tropical-5mw.json"))
        if name == "run":
            cmd.add_argument("--output", type=Path, default=Path("build/reference"))
            cmd.add_argument("--sites", type=Path, default=Path("data/site-candidates.csv"))
    sub.add_parser("schema")
    export = sub.add_parser("web-data")
    export.add_argument("--config", type=Path, default=Path("configs/tropical-5mw.json"))
    export.add_argument("--reference", type=Path, default=Path("artifacts/reference"))
    export.add_argument("--output", type=Path, default=Path("build/web-data"))
    serve = sub.add_parser("serve")
    serve.add_argument("--config", type=Path, default=Path("configs/tropical-5mw.json"))
    serve.add_argument("--sites", type=Path, default=Path("data/site-candidates.csv"))
    serve.add_argument("--data", type=Path, default=Path("build/web-data"))
    serve.add_argument("--web", type=Path, default=Path("web/dist"))
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    args = parser.parse_args(argv)
    try:
        if args.command == "schema":
            print(json.dumps(schema(), indent=2))
        elif args.command == "web-data":
            from . import webdata
            payload = webdata.from_reference(args.config, args.reference)
            webdata.export(payload, args.output, Path.cwd())
            print(f"Created web data in {args.output.resolve()}")
        elif args.command == "serve":
            from .server import make_server
            httpd = make_server(args.host, args.port, args.config, args.sites, args.data, args.web)
            print(f"Serving http://{args.host}:{httpd.server_address[1]}  (Ctrl+C to stop)")
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("Stopped")
        elif args.command == "validate":
            c = load(args.config)
            print(f"VALID: {c['name']} ({c['it_kw']:,.0f} kW design IT)")
        else:
            report = run(args.config, args.output, args.sites)
            print(f"Created {args.output.resolve()}")
            pue = report["energy"]["pue"]
            print(f"Annual PUE: {pue:.3f}" if pue is not None else "Annual PUE: undefined (zero IT energy)")
            print(f"Concept CAPEX: USD {report['finance']['capex_usd']:,.0f}")
            print(f"Pre-tax unlevered NPV: USD {report['finance']['npv_usd']:,.0f}")
        return 0
    except (ValueError, KeyError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
