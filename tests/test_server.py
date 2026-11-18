import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from dcf import server, webdata

ROOT = Path(__file__).resolve().parents[1]


class Api(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.data = Path(cls.temp.name) / "data"
        reference = webdata.from_reference(ROOT / "configs/tropical-5mw.json", ROOT / "artifacts/reference")
        webdata.export(reference, cls.data, ROOT)
        cls.web = Path(cls.temp.name) / "dist"
        cls.web.mkdir()
        (cls.web / "index.html").write_text("<html>app</html>")
        cls.httpd = server.make_server("127.0.0.1", 0, ROOT / "configs/tropical-5mw.json",
                                       ROOT / "data/site-candidates.csv", cls.data, cls.web)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.temp.cleanup()

    def call(self, path, body=None):
        url = f"http://127.0.0.1:{self.port}{path}"
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request) as reply:
                return reply.status, reply.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def test_health_and_parameters(self):
        status, body = self.call("/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["engine"], "dcf python model")
        status, body = self.call("/api/scenario/parameters")
        self.assertEqual(status, 200)
        self.assertGreater(len(json.loads(body)["parameters"]), 10)

    def test_valid_run_returns_comparison(self):
        status, body = self.call("/api/scenario/run", {"overrides": {"pv_kwp": 2000}})
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["changes"][0]["key"], "pv_kwp")
        self.assertTrue(result["comparison"])

    def test_invalid_run_is_a_400_with_message(self):
        status, body = self.call("/api/scenario/run", {"overrides": {"pv_kwp": -5}})
        self.assertEqual(status, 400)
        self.assertIn("pv_kwp", json.loads(body)["error"])
        status, _ = self.call("/api/scenario/run", {"overrides": "nope"})
        self.assertEqual(status, 400)

    def test_reference_files_are_unchanged_after_runs(self):
        before = (ROOT / "configs/tropical-5mw.json").read_bytes()
        self.call("/api/scenario/run", {"overrides": {"rack_kw": 20}})
        self.assertEqual(before, (ROOT / "configs/tropical-5mw.json").read_bytes())

    def test_static_data_and_spa_fallback(self):
        status, body = self.call("/data/core.json")
        self.assertEqual(status, 200)
        self.assertIn("kpis", json.loads(body))
        status, body = self.call("/some/route")
        self.assertEqual(status, 200)
        self.assertIn(b"app", body)

    def test_path_traversal_is_refused(self):
        status, _ = self.call("/data/..%2f..%2fpyproject.toml")
        self.assertEqual(status, 404)
        status, _ = self.call("/data/../../pyproject.toml")
        self.assertIn(status, (400, 404))


if __name__ == "__main__":
    unittest.main()
