import copy
from pathlib import Path
import unittest
from dcf.config import load
from dcf import scenario

ROOT = Path(__file__).resolve().parents[1]
SITES = ROOT / "data/site-candidates.csv"


class Scenario(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = load(ROOT / "configs/tropical-5mw.json")

    def test_unknown_key_is_rejected(self):
        with self.assertRaises(ValueError):
            scenario.apply_overrides(self.base, {"halls": 6})

    def test_bool_nan_and_range_are_rejected(self):
        for bad in (True, float("nan"), "5", 99999, -1):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                scenario.apply_overrides(self.base, {"electricity_usd_per_kwh": bad})

    def test_base_is_never_changed(self):
        before = copy.deepcopy(self.base)
        scenario.apply_overrides(self.base, {"pv_kwp": 2000, "rack_kw": 20})
        self.assertEqual(before, self.base)

    def test_rack_kw_derives_it_kw(self):
        changed, record = scenario.apply_overrides(self.base, {"rack_kw": 20})
        self.assertEqual(changed["it_kw"], 4000)
        self.assertEqual(record[0]["key"], "rack_kw")
        self.assertEqual(record[0]["baseline"], 25)

    def test_occupancy_scale_is_capped_at_one(self):
        changed, _ = scenario.apply_overrides(self.base, {"occupancy_scale": 1.05})
        self.assertEqual(max(changed["occupancy"]), 0.9975)
        self.assertTrue(all(v <= 1 for v in changed["occupancy"]))

    def test_inconsistent_profile_is_rejected(self):
        with self.assertRaises(ValueError):
            scenario.apply_overrides(self.base, {"mean_draw_fraction": 0.95})

    def test_parameter_table_lists_units_and_bounds(self):
        table = scenario.parameter_table(self.base)
        keys = {p["key"] for p in table}
        self.assertTrue({"occupancy_scale", "rack_kw", "weather_mean_c", "pv_kwp",
                         "electricity_usd_per_kwh", "liquid_fraction", "base_capex_usd",
                         "capacity_usd_kw_month", "path_unavailability"} <= keys)
        for p in table:
            self.assertTrue(p["unit"] != "" or p["key"] in {"occupancy_scale"})
            self.assertLess(p["min"], p["max"])
            self.assertTrue(p["min"] <= p["baseline"] <= p["max"])

    def test_no_change_reproduces_baseline(self):
        result = scenario.run(self.base, {}, SITES)
        by_id = {row["id"]: row for row in result["comparison"]}
        self.assertEqual(by_id["pue"]["delta"], 0)
        self.assertEqual(by_id["npv_usd"]["delta"], 0)
        self.assertEqual(result["changes"], [])

    def test_tariff_moves_cost_and_pv_moves_grid(self):
        high = scenario.run(self.base, {"electricity_usd_per_kwh": 0.2}, SITES)
        by_id = {row["id"]: row for row in high["comparison"]}
        self.assertGreater(by_id["annual_opex_usd"]["delta"], 0)
        pv = scenario.run(self.base, {"pv_kwp": 3000}, SITES)
        by_id = {row["id"]: row for row in pv["comparison"]}
        self.assertLess(by_id["annual_grid_kwh"]["delta"], 0)
        self.assertEqual(by_id["pue"]["delta"], 0)

    def test_result_has_execution_record(self):
        result = scenario.run(self.base, {"weather_mean_c": 31}, SITES)
        self.assertEqual(result["execution"]["engine"], "dcf python model")
        self.assertEqual(len(result["execution"]["config_sha256"]), 64)
        self.assertEqual(result["changes"][0]["key"], "weather_mean_c")
        self.assertIn("hourly", result["payload"])


if __name__ == "__main__":
    unittest.main()
