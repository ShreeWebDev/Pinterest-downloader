import re
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urljoin, urlparse
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


def _safe_ascii_filename(value: str) -> str:
    value = _safe_filename(value)
    value = value.encode("ascii", errors="ignore").decode("ascii")
    value = re.sub(r"[^A-Za-z0-9\s\-\(\)\[\]\.]", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = value[:80].strip()
    return value or "pinterest-video"


def _content_disposition(filename: str, filename_utf8: str) -> str:
    safe_ascii = _safe_ascii_filename(filename)
    safe_utf8 = _safe_filename(filename_utf8)
    encoded = quote(safe_utf8 + ".ts", safe="")
    return f'attachment; filename="{safe_ascii}.ts"; filename*=UTF-8\'\'{encoded}'


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
        if line.lower().endswith(".m3u8"):
            continue
        yield urljoin(m3u8_url, line)


def _pick_variant_playlist(master_url: str, playlist: str) -> str:
    lines = [l.strip() for l in playlist.splitlines()]
    variants = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("#EXT-X-STREAM-INF"):
            attrs = line.split(":", 1)[1] if ":" in line else ""
            bandwidth = 0
            for part in attrs.split(","):
                part = part.strip()
                if part.upper().startswith("BANDWIDTH="):
                    try:
                        bandwidth = int(part.split("=", 1)[1].strip())
                    except Exception:
                        bandwidth = 0
                    break
            j = i + 1
            while j < len(lines) and (not lines[j] or lines[j].startswith("#")):
                j += 1
            if j < len(lines):
                uri = lines[j]
                variants.append((bandwidth, urljoin(master_url, uri)))
                i = j
        i += 1
    if not variants:
        return ""
    variants.sort(key=lambda x: x[0], reverse=True)
    return variants[0][1]


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

        if "#EXT-X-KEY" in playlist:
            self.send_response(422)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Encrypted HLS is not supported")
            return

        for _ in range(3):
            if "#EXT-X-STREAM-INF" not in playlist:
                break
            next_url = _pick_variant_playlist(m3u8_url, playlist)
            if not next_url:
                break
            m3u8_url = next_url
            try:
                playlist = _fetch_text(m3u8_url)
            except (HTTPError, URLError):
                self.send_response(502)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"Failed to fetch variant playlist")
                return
            except Exception:
                self.send_response(500)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"Unexpected server error")
                return
            if "#EXT-X-KEY" in playlist:
                self.send_response(422)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"Encrypted HLS is not supported")
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

        disposition = _content_disposition(title, title)

        self.send_response(200)
        self.send_header("Content-Type", "video/mp2t")
        self.send_header("Content-Disposition", disposition)
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
