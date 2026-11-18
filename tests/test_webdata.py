import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from dcf.config import load
from dcf import webdata

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / "artifacts/reference"


class WebData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c = load(ROOT / "configs/tropical-5mw.json")
        cls.ref = webdata.from_reference(ROOT / "configs/tropical-5mw.json", REF)
        cls.live = webdata.from_model(cls.c, ROOT / "data/site-candidates.csv")

    def test_reference_matches_live_model(self):
        # same numbers both ways
        for key in ("pue", "facility_kwh", "grid_kwh", "operational_grid_tco2e"):
            a = self.ref["core"]["energy"][key]
            b = self.live["core"]["energy"][key]
            self.assertAlmostEqual(a, b, delta=abs(a) * 1e-9)
        self.assertAlmostEqual(self.ref["core"]["finance"]["npv_usd"],
                               self.live["core"]["finance"]["npv_usd"], places=4)
        self.assertEqual(len(self.ref["twin"]["racks"]), len(self.live["twin"]["racks"]))

    def test_every_kpi_traces_to_a_source(self):
        docs = self.ref["sources"]
        for kpi in self.ref["core"]["kpis"]:
            with self.subTest(kpi=kpi["id"]):
                self.assertIn(kpi["provenance"], webdata.PROVENANCE_CLASSES)
                values = [webdata.resolve(p, docs) for p in kpi["sources"]]
                if kpi.get("formula") == "sum":
                    self.assertAlmostEqual(sum(values), kpi["value"], places=4)
                else:
                    self.assertEqual(len(values), 1)
                    self.assertAlmostEqual(values[0], kpi["value"], places=6)

    def test_kpis_cover_the_brief(self):
        ids = {k["id"] for k in self.ref["core"]["kpis"]}
        needed = {"design_it_kw", "design_facility_kw", "halls", "racks", "rack_design_kw",
                  "annual_it_kwh", "annual_facility_kwh", "annual_grid_kwh", "pue", "wue",
                  "annual_grid_tco2e", "capex_usd", "annual_opex_usd", "npv_usd", "irr",
                  "payback_years", "availability"}
        self.assertTrue(needed <= ids, needed - ids)

    def test_twin_identity_matches_artifacts(self):
        import csv
        with (REF / "rack-assets.csv").open() as s:
            rack_ids = [r["asset_id"] for r in csv.DictReader(s)]
        with (REF / "equipment-schedule.csv").open() as s:
            equipment_ids = [r["asset_id"] for r in csv.DictReader(s)]
        twin = self.ref["twin"]
        self.assertEqual([r["asset_id"] for r in twin["racks"]], rack_ids)
        self.assertEqual([e["asset_id"] for e in twin["equipment"]], equipment_ids)
        self.assertEqual(len(twin["halls"]), 4)

    def test_twin_relations_point_at_real_assets(self):
        twin = self.ref["twin"]
        equipment = {e["asset_id"] for e in twin["equipment"]}
        halls = {h["id"] for h in twin["halls"]}
        for rack in twin["racks"]:
            self.assertIn(rack["hall_id"], halls)
            for key in ("path_a_equipment", "path_b_equipment", "cdu_ids", "chiller_ids"):
                self.assertTrue(rack["relations"][key])
                self.assertTrue(set(rack["relations"][key]) <= equipment)
            self.assertAlmostEqual(rack["liquid_design_kw"] + rack["air_design_kw"], rack["design_kw"])
        for item in twin["equipment"]:
            self.assertEqual(item["display_position"]["placement"], "schematic")
            self.assertTrue(set(item["serves_halls"]) <= halls)

    def test_aisles_follow_rack_facing(self):
        twin = self.live["twin"]
        by_id = {r["asset_id"]: r for r in twin["racks"]}
        for hall in twin["halls"]:
            self.assertTrue(hall["aisles"])
            for aisle in hall["aisles"]:
                top = [r for r in twin["racks"] if r["hall_id"] == hall["id"]
                       and abs(r["y"] + r["depth"] - aisle["y"]) < 1e-9]
                bottom = [r for r in twin["racks"] if r["hall_id"] == hall["id"]
                          and abs(r["y"] - (aisle["y"] + aisle["depth"])) < 1e-9]
                self.assertTrue(top and bottom)
                want = ("+y", "-y") if aisle["kind"] == "cold" else ("-y", "+y")
                self.assertEqual({r["facing"] for r in top}, {want[0]})
                self.assertEqual({r["facing"] for r in bottom}, {want[1]})
                self.assertEqual(aisle["contained"], aisle["kind"] == "hot")
                self.assertAlmostEqual(aisle["depth"], 1.8)
        self.assertEqual(len(by_id), 200)

    def test_aisle_plan_does_not_move_racks(self):
        from dcf.geometry import layout
        _, racks = layout(self.c)
        for rack in self.live["twin"]["racks"]:
            src = next(r for r in racks if r["asset_id"] == rack["asset_id"])
            self.assertEqual((rack["x"], rack["y"]), (src["x"], src["y"]))

    def test_telemetry_is_marked_synthetic(self):
        racks = self.ref["twin"]["racks"]
        with_data = [r for r in racks if r["telemetry"]]
        self.assertEqual(len(with_data), 200)
        for rack in with_data:
            for record in rack["telemetry"]:
                self.assertEqual(record["quality"], "synthetic")
                self.assertEqual(record["asset_id"], rack["asset_id"])
        self.assertTrue(all(e["telemetry"] == [] for e in self.ref["twin"]["equipment"]))

    def test_hourly_columns_reconcile_with_energy(self):
        hourly = self.ref["hourly"]
        self.assertEqual(hourly["hours"], 8760)
        for name, column in hourly["columns"].items():
            self.assertEqual(len(column), 8760, name)
        facility = sum(hourly["columns"]["facility_kw"])
        reported = self.ref["core"]["energy"]["facility_kwh"]
        self.assertAlmostEqual(facility, reported, delta=reported * 1e-6)

    def test_export_writes_hashed_files(self):
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder)
            webdata.export(self.ref, out, ROOT)
            manifest = json.loads((out / "manifest.json").read_text())
            for name in ("core.json", "hourly.json", "twin.json", "docs.json"):
                digest = hashlib.sha256((out / name).read_bytes()).hexdigest()
                self.assertEqual(manifest["files"][name], digest)
            self.assertEqual(manifest["source_manifest"], json.loads((REF / "manifest.json").read_text()))

    def test_docs_index_has_disciplines(self):
        docs = webdata.docs_index(ROOT)
        paths = {d["path"] for d in docs}
        self.assertIn("docs/model-methodology.md", paths)
        self.assertIn("05_electrical/README.md", paths)
        self.assertTrue(all(d["title"] and d["text"] for d in docs))

    def test_tampered_artifact_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            copy_dir = Path(folder) / "ref"
            copy_dir.mkdir()
            for item in REF.iterdir():
                (copy_dir / item.name).write_bytes(item.read_bytes())
            (copy_dir / "report.json").write_text((REF / "report.json").read_text() + " ")
            with self.assertRaises(ValueError):
                webdata.from_reference(ROOT / "configs/tropical-5mw.json", copy_dir)


if __name__ == "__main__":
    unittest.main()


class Derived(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ref = webdata.from_reference(ROOT / "configs/tropical-5mw.json", REF)

    def test_annual_energy_balance_closes(self):
        derived = self.ref["core"]["derived"]
        balance = derived["annual_energy_balance_kwh"]
        total = sum(balance.values())
        facility = self.ref["core"]["energy"]["facility_kwh"]
        self.assertAlmostEqual(total, facility, delta=facility * 1e-6)

    def test_monthly_carbon_sums_to_annual(self):
        derived = self.ref["core"]["derived"]
        annual_value = self.ref["core"]["energy"]["operational_grid_tco2e"]
        self.assertAlmostEqual(sum(derived["monthly_grid_tco2e"]), annual_value, delta=annual_value * 1e-9)
        self.assertEqual(len(derived["monthly_grid_tco2e"]), 12)

    def test_heat_rejection_is_cooling_plus_compressor(self):
        balance = self.ref["core"]["sizing"]["design_balance"]
        expected = balance["cooling_kwth"] + balance["compressor_kw"]
        self.assertAlmostEqual(self.ref["core"]["derived"]["design_heat_rejection_kwth"], expected)

    def test_reference_tables_are_exported(self):
        tables = webdata.reference_tables(ROOT)
        self.assertTrue({"fmea", "maintenance_matrix", "cost_allowances", "traceability"} <= set(tables))
        self.assertEqual(tables["fmea"][0]["id"], "F01")
        total = sum(float(r["usd"]) for r in tables["cost_allowances"])
        self.assertEqual(total, self.ref["core"]["config"]["base_capex_usd"])


class Checks(unittest.TestCase):
    def test_n_plus_one_checks_pass_and_have_utilisation(self):
        ref = webdata.from_reference(ROOT / "configs/tropical-5mw.json", REF)
        checks = ref["core"]["derived"]["n_plus_one_checks"]
        self.assertEqual({c["key"] for c in checks}, {"ups_per_path_kw", "transformers_per_path_kva",
                                                      "generators_per_path_kw", "chillers_shared_kwth",
                                                      "cdus_per_hall_kwth"})
        for check in checks:
            self.assertTrue(check["passes"])
            self.assertAlmostEqual(check["utilisation_after_loss"], check["required"] / check["remaining_capacity_after_one_loss"])
            self.assertLessEqual(check["utilisation_after_loss"], 1)
