import re
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlparse
from urllib.request import Request, urlopen


_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def _safe_filename(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return "pinterest-video"
    value = re.sub(r"[^\w\s\-\(\)\[\]\.]", "", value, flags=re.UNICODE)
    value = re.sub(r"\s+", " ", value).strip()
    value = value[:80].strip()
    return value or "pinterest-video"


def _is_allowed_m3u8(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("https", "http"):
        return False
    host = (parsed.hostname or "").lower()
    if not host.endswith(".pinimg.com") and host != "pinimg.com":
        return False
    if not parsed.path.lower().endswith(".m3u8"):
        return False
    return True


def _fetch_text(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/vnd.apple.mpegurl,application/x-mpegurl,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
        },
        method="GET",
    )
    with urlopen(req, timeout=20) as resp:
        raw = resp.read()
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("utf-8", errors="ignore")


def _iter_segments(m3u8_url: str, playlist: str):
    for line in playlist.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        yield urljoin(m3u8_url, line)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        m3u8_url = (query.get("url") or [""])[0].strip()
        title = (query.get("title") or [""])[0]

        if not m3u8_url:
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Missing url")
            return

        if not _is_allowed_m3u8(m3u8_url):
            self.send_response(400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Invalid HLS URL")
            return

        try:
            playlist = _fetch_text(m3u8_url)
        except (HTTPError, URLError):
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Failed to fetch playlist")
            return
        except Exception:
            self.send_response(500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Unexpected server error")
            return

        segments = list(_iter_segments(m3u8_url, playlist))
        if not segments:
            self.send_response(422)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"No segments found")
            return

        if len(segments) > 400:
            self.send_response(422)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Too many segments")
            return

        filename = _safe_filename(title) + ".ts"

        self.send_response(200)
        self.send_header("Content-Type", "video/mp2t")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        try:
            for seg_url in segments:
                req = Request(seg_url, headers={"User-Agent": _USER_AGENT}, method="GET")
                with urlopen(req, timeout=30) as resp:
                    while True:
                        chunk = resp.read(1024 * 128)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
        except Exception:
            return

    def log_message(self, format, *args):
        return

