from flask import Flask, Response, jsonify, request
from flask_cors import CORS

import download
import hls
import proxy

app = Flask(__name__)
CORS(app)


@app.get("/")
def root():
    return jsonify({"ok": True})


@app.post("/download")
def download_route():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        body = {}
    status, payload = download.handle_download(body)
    return jsonify(payload), status


@app.get("/hls")
def hls_route():
    m3u8_url = (request.args.get("url") or "").strip()
    title = request.args.get("title") or ""
    fmt = (request.args.get("format") or "").strip().lower()
    client_ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.remote_addr or "")

    status, headers, body = hls.handle_hls(m3u8_url=m3u8_url, title=title, fmt=fmt, client_ip=client_ip)
    if isinstance(body, (bytes, bytearray)):
        return Response(bytes(body), status=status, headers=headers)
    return Response(body, status=status, headers=headers)


@app.get("/proxy")
def proxy_route():
    target = (request.args.get("url") or "").strip()
    status, headers, body = proxy.handle_proxy(target)
    return Response(body, status=status, headers=headers)

