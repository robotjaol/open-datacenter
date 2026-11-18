"""Scenario overrides: validate, derive, run the Python model, compare to baseline."""
from __future__ import annotations
import copy
import hashlib
import json
import math
import time
from pathlib import Path
from . import __version__
from .config import validate
from . import webdata

# key, label, unit, group, min, max, step, kind
PARAMETERS = [
    ("occupancy_scale", "Occupancy ramp scale", "x reference", "Load", 0.2, 1.05, 0.05, "derived"),
    ("rack_kw", "Rack design allowance", "kW/rack", "Load", 5, 50, 1, "config"),
    ("mean_draw_fraction", "Mean IT draw fraction", "fraction", "Load", 0.3, 0.9, 0.05, "config"),
    ("design_ambient_c", "Design ambient", "degC", "Climate", 25, 45, 1, "config"),
    ("weather_mean_c", "Mean ambient", "degC", "Climate", 20, 38, 0.5, "config"),
    ("pv_kwp", "PV capacity", "kWp", "Energy", 0, 10000, 250, "config"),
    ("electricity_usd_per_kwh", "Energy tariff", "USD/kWh", "Energy", 0.03, 0.3, 0.01, "config"),
    ("demand_usd_per_kw_month", "Demand charge", "USD/kW-month", "Energy", 0, 20, 0.5, "config"),
    ("grid_kgco2e_per_kwh", "Grid emission factor", "kgCO2e/kWh", "Energy", 0, 1.2, 0.05, "config"),
    ("liquid_fraction", "Liquid-cooled fraction", "fraction", "Cooling", 0, 0.8, 0.05, "config"),
    ("cop_at_30c", "Chiller COP at 30 degC", "ratio", "Cooling", 3, 7, 0.1, "config"),
    ("fan_fraction", "Fan power fraction", "fraction of air IT", "Cooling", 0.005, 0.05, 0.005, "config"),
    ("pump_fraction", "Pump power fraction", "fraction of heat", "Cooling", 0.005, 0.03, 0.001, "config"),
    ("base_capex_usd", "Base CAPEX", "USD", "Finance", 30e6, 80e6, 1e6, "config"),
    ("contingency_fraction", "Contingency", "fraction", "Finance", 0, 0.4, 0.05, "config"),
    ("capacity_usd_kw_month", "Capacity price", "USD/kW-month", "Finance", 120, 260, 5, "config"),
    ("discount_rate", "Discount rate", "fraction", "Finance", 0.04, 0.16, 0.01, "config"),
    ("path_unavailability", "Path unavailability", "fraction", "Reliability", 0.001, 0.1, 0.001, "config"),
    ("common_cause_unavailability", "Common-cause unavailability", "fraction", "Reliability", 0, 0.01, 0.0005, "config"),
]
BY_KEY = {p[0]: p for p in PARAMETERS}
COMPARED = ["design_facility_kw", "annual_it_kwh", "annual_facility_kwh", "annual_grid_kwh", "pue",
            "annual_grid_tco2e", "capex_usd", "annual_opex_usd", "npv_usd", "irr", "payback_years",
            "availability"]


def baseline_value(base: dict, key: str):
    if key == "occupancy_scale":
        return 1.0
    return base[key]


def parameter_table(base: dict) -> list[dict]:
    return [{"key": k, "label": label, "unit": unit, "group": group, "min": low, "max": high,
             "step": step, "kind": kind, "baseline": baseline_value(base, k)}
            for k, label, unit, group, low, high, step, kind in PARAMETERS]


def apply_overrides(base: dict, overrides: dict) -> tuple[dict, list[dict]]:
    if not isinstance(overrides, dict):
        raise ValueError("overrides must be an object")
    config = copy.deepcopy(base)
    changes = []
    for key, value in overrides.items():
        if key not in BY_KEY:
            raise ValueError(f"{key} is not an adjustable parameter")
        _, label, unit, _, low, high, _, kind = BY_KEY[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f"{key} must be a finite number in [{low}, {high}] {unit}")
        if kind == "derived":
            config["occupancy"] = [min(1, round(v * value, 6)) for v in base["occupancy"]]
        else:
            config[key] = value
        if key == "rack_kw":
            config["it_kw"] = config["halls"] * config["racks_per_hall"] * value
        changes.append({"key": key, "label": label, "unit": unit,
                        "baseline": baseline_value(base, key), "scenario": value})
    return validate(config), changes


def compare(baseline_kpis: list[dict], scenario_kpis: list[dict]) -> list[dict]:
    base = {k["id"]: k for k in baseline_kpis}
    rows = []
    for kpi in scenario_kpis:
        if kpi["id"] not in COMPARED:
            continue
        a, b = base[kpi["id"]]["value"], kpi["value"]
        delta = None if a is None or b is None else b - a
        # percent is not meaningful across a sign change
        crosses_zero = a is not None and b is not None and a * b < 0
        percent = None if delta is None or a == 0 or crosses_zero else delta / abs(a)
        rows.append({"id": kpi["id"], "label": kpi["label"], "unit": kpi["unit"], "baseline": a,
                     "scenario": b, "delta": delta, "delta_pct": percent})
    return rows


def run(base: dict, overrides: dict, sites_path: Path, baseline_kpis: list[dict] | None = None) -> dict:
    config, changes = apply_overrides(base, overrides)
    started = time.perf_counter()
    payload = webdata.from_model(config, sites_path)
    seconds = time.perf_counter() - started
    if baseline_kpis is None:
        baseline_kpis = webdata.from_model(base, sites_path)["core"]["kpis"]
    digest = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    return {"changes": changes, "comparison": compare(baseline_kpis, payload["core"]["kpis"]),
            "execution": {"engine": "dcf python model", "model_version": __version__,
                          "seconds": round(seconds, 3), "config_sha256": digest,
                          "status": "executed", "kind": "live run"},
            "payload": {"core": payload["core"], "hourly": payload["hourly"], "twin": payload["twin"]}}
