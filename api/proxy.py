import re
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def _is_allowed_target(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    if host == "pinimg.com" or host.endswith(".pinimg.com"):
        return True
    if host == "pinterest.com" or host.endswith(".pinterest.com"):
        return True
    return False


def _guess_content_type(path: str) -> str:
    p = (path or "").lower()
    if p.endswith(".m3u8"):
        return "application/vnd.apple.mpegurl"
    if p.endswith(".ts"):
        return "video/mp2t"
    if p.endswith(".mp4"):
        return "video/mp4"
    if p.endswith(".jpg") or p.endswith(".jpeg"):
        return "image/jpeg"
    if p.endswith(".png"):
        return "image/png"
    if p.endswith(".webp"):
        return "image/webp"
    if p.endswith(".gif"):
        return "image/gif"
    return "application/octet-stream"


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        qs = parse_qs(parsed_path.query or "")
        target = (qs.get("url", [""])[0] or "").strip()

        if not target:
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b"Missing url")
            return

        if not _is_allowed_target(target):
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b"Blocked url")
            return

        try:
            req = Request(
                target,
                headers={
                    "User-Agent": _USER_AGENT,
                    "Accept": "*/*",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                method="GET",
            )
            with urlopen(req, timeout=25) as resp:
                body = resp.read()
                content_type = resp.headers.get("Content-Type") or ""
                if not content_type:
                    content_type = _guess_content_type(urlparse(target).path)
                content_type = re.sub(r"\s+", " ", content_type).strip()

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "public, max-age=3600, immutable")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except HTTPError as e:
            self.send_response(e.code or 502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b"Upstream error")
        except URLError:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b"Upstream error")
        except Exception:
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(b"Proxy error")

    def log_message(self, format, *args):
        return

