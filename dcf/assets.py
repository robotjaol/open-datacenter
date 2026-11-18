"""Equipment schedule and telemetry rows shared by the CLI and web export."""
from __future__ import annotations

# group key, sizing key, unit
EQUIPMENT_GROUPS = [("UPS", "ups_per_path_kw", "kW"),
                    ("TX", "transformers_per_path_kva", "kVA"),
                    ("GEN", "generators_per_path_kw", "kW"),
                    ("CHL", "chillers_shared_kwth", "kWth"),
                    ("CDU", "cdus_per_hall_kwth", "kWth")]


def group_paths(kind: str, c: dict) -> list[str]:
    if kind in ("UPS", "TX", "GEN"):
        return ["A", "B"]
    if kind == "CHL":
        return ["SHARED"]
    return [f"H{h+1:02}" for h in range(c["halls"])]


def equipment_rows(c: dict, sizing: dict) -> list[dict]:
    rows = []
    for kind, key, unit in EQUIPMENT_GROUPS:
        for path in group_paths(kind, c):
            for n in range(sizing[key]["installed_units"]):
                rows.append({"asset_id": f"{kind}-{path}-{n+1:02}", "system": kind, "path": path,
                             "nameplate": sizing[key]["unit_rating"], "unit": unit,
                             "derating": sizing[key]["derating"], "status": "concept allowance"})
    return rows


def telemetry_rows(c: dict, racks: list[dict]) -> list[dict]:
    return [{"timestamp": "2025-01-01T00:00:00+07:00", "asset_id": r["asset_id"],
             "metric": "active_power_kw", "value": c["rack_kw"]*c["mean_draw_fraction"],
             "unit": "kW", "quality": "synthetic", "source": "offline-example"} for r in racks]
