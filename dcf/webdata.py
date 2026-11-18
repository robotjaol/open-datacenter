"""Web data contract: one payload built from model outputs, never from the browser.

Two loaders feed one builder. from_reference reads the committed evidence in
artifacts/reference after checking its hashes. from_model runs the Python model.
"""
from __future__ import annotations
import csv
import hashlib
import json
from pathlib import Path
from . import __version__
from .assets import equipment_rows, telemetry_rows
from .config import load
from .controls import commission
from .energy import annual, hourly
from .engineering import size
from .finance import model, sensitivity
from .geometry import layout
from .reliability import evaluate
from .site import rank

SCHEMA = "odc-web-data/1"
PROVENANCE_CLASSES = ("design", "modeled", "simulated", "financial")
STATUS = "concept study; synthetic inputs; not certified or construction-ready"
HOURLY_COLUMNS = ["ambient_c", "it_kw", "distribution_loss_kw", "ups_loss_kw", "fan_kw",
                  "cooling_kwth", "cop", "compressor_kw", "pump_kw", "other_kw",
                  "transformer_loss_kw", "facility_kw", "pv_potential_kw", "pv_used_kw",
                  "pv_curtailed_kw", "grid_kw"]
DOC_FOLDERS = ["00_executive", "01_requirements", "02_site-selection", "03_financial-model",
               "04_architecture", "05_electrical", "06_mechanical", "07_energy", "08_cad-bim",
               "09_cfd", "10_control-system", "11_digital-twin", "12_dcim", "13_reliability",
               "14_sustainability", "15_commissioning", "16_operations", "17_delivery",
               "18_assurance", "docs", "research", "integrations"]
SIZING_KEYS = {"UPS": "ups_per_path_kw", "TX": "transformers_per_path_kva",
               "GEN": "generators_per_path_kw", "CHL": "chillers_shared_kwth",
               "CDU": "cdus_per_hall_kwth"}


# ---------- source pointers ----------

def resolve(pointer: str, docs: dict):
    """Follow 'name:/a/b/0' into docs. '#count' returns a list length."""
    name, _, path = pointer.partition(":")
    node = docs[name]
    if path == "#count":
        return len(node)
    for part in [p for p in path.split("/") if p]:
        node = node[int(part)] if isinstance(node, list) else node[part]
    return node


# ---------- KPI table ----------

def kpi_list(c: dict, report: dict, racks: list[dict]) -> list[dict]:
    peak = max(c["occupancy"])
    steady = c["occupancy"].index(peak)
    year = f"finance/years/{steady}"
    energy, finance = report["energy"], report["finance"]
    opex = sum(finance["years"][steady][k] for k in ("fixed_opex_usd", "maintenance_usd", "electricity_usd"))

    def kpi(id, label, value, unit, category, provenance, sources, description,
            formula=None, synthetic=False):
        return {"id": id, "label": label, "value": value, "unit": unit, "category": category,
                "provenance": provenance, "synthetic": synthetic, "sources": sources,
                "formula": formula, "description": description}

    return [
        kpi("design_it_kw", "Design IT capacity", c["it_kw"], "kW", "Capacity", "design",
            ["scenario:/it_kw"], "Installed IT load the facility is sized for: halls x racks x rack allowance."),
        kpi("design_facility_kw", "Design facility power", report["sizing"]["design_balance"]["facility_kw"],
            "kW", "Capacity", "modeled", ["report:/sizing/design_balance/facility_kw"],
            "Steady-state utility demand at full IT load and design ambient temperature, from the power balance."),
        kpi("halls", "Data halls", c["halls"], "count", "Capacity", "design", ["scenario:/halls"],
            "Number of data halls in the layout."),
        kpi("racks", "Total racks", len(racks), "count", "Capacity", "design", ["racks:#count"],
            "Rack asset identities in the geometry and asset schedule."),
        kpi("rack_design_kw", "Rack design allowance", c["rack_kw"], "kW/rack", "Capacity", "design",
            ["scenario:/rack_kw"], "Design allowance per rack. It is not a measured rack draw."),
        kpi("annual_it_kwh", "Annual IT energy", energy["it_kwh"], "kWh/yr", "Energy", "simulated",
            ["report:/energy/it_kwh"], "Sum of 8,760 synthetic hourly IT loads.", synthetic=True),
        kpi("annual_facility_kwh", "Annual facility energy", energy["facility_kwh"], "kWh/yr", "Energy",
            "simulated", ["report:/energy/facility_kwh"],
            "Gross facility energy before any PV offset.", synthetic=True),
        kpi("annual_grid_kwh", "Annual grid energy", energy["grid_kwh"], "kWh/yr", "Energy", "simulated",
            ["report:/energy/grid_kwh"], "Facility energy minus PV energy used on site.", synthetic=True),
        kpi("pue", "PUE", energy["pue"], "ratio", "Efficiency", "simulated", ["report:/energy/pue"],
            "Energy-weighted: annual facility kWh divided by annual IT kWh. PV does not change it.",
            synthetic=True),
        kpi("wue", "WUE (direct site water)", energy["direct_wue_l_kwh"], "L/kWh IT", "Efficiency",
            "modeled", ["report:/energy/direct_wue_l_kwh"],
            "Direct on-site water per IT kWh. It is an input allowance, not a metered value."),
        kpi("annual_grid_tco2e", "Annual grid carbon", energy["operational_grid_tco2e"], "tCO2e/yr",
            "Sustainability", "simulated", ["report:/energy/operational_grid_tco2e"],
            "Grid energy times the configured grid emission factor. Operational scope only.", synthetic=True),
        kpi("capex_usd", "Initial CAPEX", finance["capex_usd"], "USD", "Finance", "financial",
            ["report:/finance/capex_usd"], "Base CAPEX allowance plus contingency."),
        kpi("annual_opex_usd", "Annual OPEX", opex, "USD/yr", "Finance", "financial",
            [f"report:/{year}/fixed_opex_usd", f"report:/{year}/maintenance_usd",
             f"report:/{year}/electricity_usd"],
            f"Fixed OPEX, maintenance and electricity in year {steady + 1}, the first year at peak "
            f"occupancy ({peak:.0%}). Escalated nominal USD.", formula="sum", synthetic=True),
        kpi("npv_usd", "NPV", finance["npv_usd"], "USD", "Finance", "financial", ["report:/finance/npv_usd"],
            "Net present value, pre-tax and unlevered, at the configured discount rate."),
        kpi("irr", "IRR", finance["irr"], "ratio", "Finance", "financial", ["report:/finance/irr"],
            "Internal rate of return. Empty when the cash-flow sign pattern has no unique IRR."),
        kpi("payback_years", "Simple payback", finance["simple_payback_years"], "years", "Finance",
            "financial", ["report:/finance/simple_payback_years"],
            "Years until cumulative undiscounted cash flow turns positive."),
        kpi("availability", "Availability estimate", report["reliability"]["exact_availability"], "ratio",
            "Reliability", "modeled", ["report:/reliability/exact_availability"],
            "Two aggregate paths plus one common event. Not a Tier rating or an SLA."),
    ]


# ---------- twin ----------

def plant_positions(equipment: list[dict], halls: list[dict]) -> dict:
    """Display positions only. The source geometry does not place plant."""
    sizes = {"UPS": (2.4, 1.2, 2.2, 3.2), "TX": (3.0, 2.4, 2.4, 4.0), "GEN": (6.0, 2.5, 2.8, 7.0),
             "CHL": (5.0, 2.4, 2.8, 6.5)}
    rows = {"GEN": 0, "TX": 1, "UPS": 2, "CHL": 3}
    top = max(h["y"] + h["depth"] for h in halls) + 12
    left = min(h["x"] for h in halls)
    positions, counts = {}, {}
    for item in equipment:
        kind, path = item["system"], item["path"]
        if kind == "CDU":
            hall = next(h for h in halls if h["id"] == path)
            n = counts.get((kind, path), 0)
            counts[(kind, path)] = n + 1
            x, y, w, d, hgt = hall["x"] + 4 + n * 2.0, hall["y"] + 19, 1.2, 0.8, 2.0
        else:
            width, depth, height, step = sizes[kind]
            n = counts.get((kind, path), 0)
            counts[(kind, path)] = n + 1
            offset = 32 if path == "B" else 0
            x, y, w, d, hgt = left + offset + n * step, top + rows[kind] * 6, width, depth, height
        positions[item["asset_id"]] = {"x": x, "y": y, "width": w, "depth": d, "height": hgt,
                                       "placement": "schematic"}
    return positions


def build_twin(c: dict, sizing: dict, rack_rows: list[dict], equipment: list[dict],
               telemetry: list[dict]) -> dict:
    rooms, _ = layout(c)
    hall_ids = [r["id"] for r in rooms]
    positions = plant_positions(equipment, rooms)
    by_system = {}
    for item in equipment:
        by_system.setdefault((item["system"], item["path"]), []).append(item["asset_id"])
    path_ids = {p: sum((by_system.get((k, p), []) for k in ("UPS", "TX", "GEN")), []) for p in ("A", "B")}
    chillers = by_system.get(("CHL", "SHARED"), [])
    halls = []
    for room in rooms:
        count = sum(1 for r in rack_rows if r["hall_id"] == room["id"])
        halls.append({**room, "rack_count": count, "design_kw": sum(r["design_kw"] for r in rack_rows
                                                                     if r["hall_id"] == room["id"]),
                      "cdu_ids": by_system.get(("CDU", room["id"]), [])})
    lookup = {}
    for record in telemetry:
        lookup.setdefault(record["asset_id"], []).append(record)
    racks = []
    for rack in rack_rows:
        liquid = rack["design_kw"] * c["liquid_fraction"]
        racks.append({**rack, "liquid_design_kw": liquid, "air_design_kw": rack["design_kw"] - liquid,
                      "relations": {"path_a_equipment": path_ids["A"], "path_b_equipment": path_ids["B"],
                                    "cdu_ids": by_system.get(("CDU", rack["hall_id"]), []),
                                    "chiller_ids": chillers,
                                    "note": "Path-level relation. No rack-level branch circuit is modeled."},
                      "telemetry": lookup.get(rack["asset_id"], [])})
    items = []
    for item in equipment:
        group = {k: v for k, v in sizing[SIZING_KEYS[item["system"]]].items()}
        serves = [item["path"]] if item["system"] == "CDU" else hall_ids
        items.append({**item, "group": group, "serves_halls": serves,
                      "display_position": positions[item["asset_id"]], "telemetry": []})
    return {"halls": halls, "racks": racks, "equipment": items,
            "notes": ["Rack positions come from dcf.geometry. Plant positions are schematic display "
                      "positions only; the source geometry does not place plant.",
                      "Rack telemetry is a synthetic offline example. Equipment has no telemetry."]}


# ---------- derived values and tables ----------

BALANCE_PARTS = {"it_kw": "it", "distribution_loss_kw": "distribution_loss", "ups_loss_kw": "ups_loss",
                 "fan_kw": "fans", "compressor_kw": "compressors", "pump_kw": "pumps",
                 "other_kw": "other_facility", "transformer_loss_kw": "transformer_loss"}


def derived_block(c: dict, report: dict, rows: list[dict]) -> dict:
    balance = {name: sum(float(r[col]) for r in rows) for col, name in BALANCE_PARTS.items()}
    design = report["sizing"]["design_balance"]
    factor = c["grid_kgco2e_per_kwh"]
    return {"annual_energy_balance_kwh": balance,
            "monthly_grid_tco2e": [m["grid_kwh"] * factor / 1000 for m in report["energy"]["monthly"]],
            "design_heat_rejection_kwth": design["cooling_kwth"] + design["compressor_kw"],
            "basis": "Sums and unit conversions of model outputs; no new engineering calculation."}


TABLE_FILES = {"fmea": "13_reliability/fmea.csv", "maintenance_matrix": "13_reliability/maintenance-matrix.csv",
               "cost_allowances": "03_financial-model/cost-allowances.csv",
               "traceability": "01_requirements/traceability.csv",
               "accommodation": "08_cad-bim/accommodation-schedule.csv",
               "control_points": "10_control-system/points.csv"}


def reference_tables(root: Path) -> dict:
    tables = {}
    for name, relative in TABLE_FILES.items():
        with (root / relative).open(encoding="utf-8", newline="") as stream:
            tables[name] = list(csv.DictReader(stream))
    return tables


# ---------- builder ----------

def hourly_block(rows: list[dict]) -> dict:
    if len(rows) != 8760:
        raise ValueError("hourly data must have 8760 rows")
    columns = {name: [round(float(r[name]), 4) for r in rows] for name in HOURLY_COLUMNS}
    columns["month"] = [int(r["month"]) for r in rows]
    return {"start": "2025-01-01T00:00:00", "step_hours": 1, "hours": 8760, "calendar": "synthetic non-leap 2025",
            "unit_note": "kW per hour, so one sample equals kWh; kWth for cooling_kwth; degC for ambient_c",
            "transport_rounding": "4 decimals; full precision stays in hourly-energy.csv", "columns": columns}


def build(c, report, hourly_rows, sensitivity_rows, rack_rows, equipment, telemetry, origin, extra=None):
    docs = {"report": report, "scenario": c, "racks": rack_rows}
    core = {"schema": SCHEMA,
            "provenance": {"model_version": report["model_version"], "scenario": c["name"],
                           "status": report["status"], "config_sha256": report["config_sha256"],
                           "origin": origin, "synthetic_inputs": True,
                           "classes": {"design": "Configured design basis",
                                       "modeled": "Closed-form screening result",
                                       "simulated": "Result on the synthetic 8,760-hour profile",
                                       "financial": "Result of illustrative financial assumptions"}},
            "kpis": kpi_list(c, report, rack_rows), "config": c, "sizing": report["sizing"],
            "energy": report["energy"], "finance": report["finance"], "sensitivity": sensitivity_rows,
            "reliability": report["reliability"], "commissioning": report["commissioning"],
            "sites": report["sites"], "derived": derived_block(c, report, hourly_rows)}
    twin = build_twin(c, report["sizing"], rack_rows, equipment, telemetry)
    return {"core": core, "hourly": hourly_block(hourly_rows), "twin": twin, "sources": docs, **(extra or {})}


# ---------- loaders ----------

def _numbers(row: dict) -> dict:
    out = {}
    for key, value in row.items():
        try:
            out[key] = float(value)
        except ValueError:
            out[key] = value
    return out


def _read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as stream:
        return [_numbers(r) for r in csv.DictReader(stream)]


def check_manifest(ref_dir: Path) -> dict:
    manifest = json.loads((ref_dir / "manifest.json").read_text(encoding="utf-8"))
    for name, digest in manifest.items():
        if hashlib.sha256((ref_dir / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f"Artifact hash mismatch: {name}")
    return manifest


def from_reference(config_path: Path, ref_dir: Path) -> dict:
    manifest = check_manifest(ref_dir)
    c = load(config_path)
    report = json.loads((ref_dir / "report.json").read_text(encoding="utf-8"))
    rows = _read_csv(ref_dir / "hourly-energy.csv")
    racks = _read_csv(ref_dir / "rack-assets.csv")
    equipment = _read_csv(ref_dir / "equipment-schedule.csv")
    telemetry = json.loads((ref_dir / "telemetry-sample.json").read_text(encoding="utf-8"))
    payload = build(c, report, rows, _read_csv(ref_dir / "sensitivity.csv"), racks, equipment,
                    telemetry, "artifacts/reference", {"source_manifest": manifest})
    return payload


def from_model(c: dict, sites_path: Path, config_bytes: bytes | None = None) -> dict:
    sites = rank(sites_path)
    sizing = size(c)
    rows = list(hourly(c))
    energy = annual(c, rows=rows)
    finance = model(c)
    reliability = evaluate(c["path_unavailability"], c["common_cause_unavailability"],
                           c["reliability_samples"], c["seed"])
    digest = hashlib.sha256(config_bytes if config_bytes is not None
                            else json.dumps(c, sort_keys=True).encode()).hexdigest()
    report = {"model_version": __version__, "scenario": c["name"], "status": STATUS,
              "config_sha256": digest, "sizing": sizing, "energy": energy, "finance": finance,
              "reliability": reliability, "commissioning": commission(), "sites": sites}
    rooms, racks = layout(c)
    return build(c, report, rows, sensitivity(c), racks, equipment_rows(c, sizing),
                 telemetry_rows(c, racks), "live model run")


# ---------- docs and export ----------

def docs_index(root: Path) -> list[dict]:
    items = []
    for folder in DOC_FOLDERS:
        for path in sorted((root / folder).rglob("*.md")) if (root / folder).exists() else []:
            text = path.read_text(encoding="utf-8")
            title = next((line[2:].strip() for line in text.splitlines() if line.startswith("# ")), path.stem)
            items.append({"path": path.relative_to(root).as_posix(), "folder": folder,
                          "title": title, "text": text})
    return items


def write_json(path: Path, obj):
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")


def export(payload: dict, out: Path, root: Path) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    write_json(out / "core.json", payload["core"])
    write_json(out / "hourly.json", payload["hourly"])
    write_json(out / "twin.json", payload["twin"])
    write_json(out / "docs.json", docs_index(root))
    write_json(out / "tables.json", reference_tables(root))
    files = {name: hashlib.sha256((out / name).read_bytes()).hexdigest()
             for name in ("core.json", "hourly.json", "twin.json", "docs.json", "tables.json")}
    manifest = {"schema": SCHEMA, "model_version": __version__, "files": files,
                "source_manifest": payload.get("source_manifest", {}),
                "note": "Generated from artifacts/reference after hash verification."}
    write_json(out / "manifest.json", manifest)
    return manifest
