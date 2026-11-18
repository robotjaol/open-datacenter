"""Local web server: static app, exported data and the scenario API.

Standard library only. It binds to localhost by default and never writes
to the repository.
"""
from __future__ import annotations
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
from urllib.parse import unquote, urlparse
from . import __version__
from .config import load
from . import scenario, webdata

MAX_BODY = 65536


def make_server(host: str, port: int, config_path: Path, sites_path: Path,
                data_dir: Path, web_dir: Path) -> ThreadingHTTPServer:
    base = load(config_path)
    state = {"baseline": None}
    lock = threading.Lock()

    def baseline_kpis():
        if state["baseline"] is None:
            state["baseline"] = webdata.from_model(base, sites_path)["core"]["kpis"]
        return state["baseline"]

    class Handler(BaseHTTPRequestHandler):
        server_version = "dcf-web/" + __version__

        def log_message(self, fmt, *args):
            pass

        def send_bytes(self, status, body, kind):
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def send_json(self, status, obj):
            body = json.dumps(obj, allow_nan=False).encode("utf-8")
            self.send_bytes(status, body, "application/json")

        def send_file(self, root: Path, relative: str):
            target = (root / relative).resolve()
            if root.resolve() not in target.parents or not target.is_file():
                return False
            kind = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if target.suffix == ".js":
                kind = "text/javascript"
            self.send_bytes(200, target.read_bytes(), kind)
            return True

        def do_GET(self):
            path = unquote(urlparse(self.path).path)
            if path == "/api/health":
                return self.send_json(200, {"status": "ok", "engine": "dcf python model",
                                            "model_version": __version__})
            if path == "/api/scenario/parameters":
                return self.send_json(200, {"parameters": scenario.parameter_table(base),
                                            "baseline_config": base})
            if path.startswith("/api/"):
                return self.send_json(404, {"error": "unknown API route"})
            if path.startswith("/data/"):
                if self.send_file(data_dir, path[len("/data/"):]):
                    return
                return self.send_json(404, {"error": "data file not found"})
            relative = path.lstrip("/") or "index.html"
            if self.send_file(web_dir, relative):
                return
            if "." not in Path(relative).name and self.send_file(web_dir, "index.html"):
                return
            self.send_json(404, {"error": "not found"})

        def do_POST(self):
            path = unquote(urlparse(self.path).path)
            if path != "/api/scenario/run":
                return self.send_json(404, {"error": "unknown API route"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= MAX_BODY:
                    raise ValueError("request body must be 1 to 65536 bytes")
                request = json.loads(self.rfile.read(length))
                if not isinstance(request, dict):
                    raise ValueError("request must be a JSON object")
                with lock:
                    result = scenario.run(base, request.get("overrides", {}), sites_path, baseline_kpis())
                return self.send_json(200, result)
            except (ValueError, KeyError, TypeError) as error:
                return self.send_json(400, {"error": str(error)})

    return ThreadingHTTPServer((host, port), Handler)
