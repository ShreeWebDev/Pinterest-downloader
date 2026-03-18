import json
import re
from http.server import BaseHTTPRequestHandler
from html import unescape
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0.0.0 Safari/537.36"
)


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length_header = handler.headers.get("content-length")
    if not length_header:
        return {}
    try:
        length = int(length_header)
    except ValueError:
        return {}
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def _normalize_url(raw_url: str) -> str:
    raw_url = (raw_url or "").strip()
    if not raw_url:
        return ""
    parsed = urlparse(raw_url)
    if parsed.scheme:
        return raw_url
    return f"https://{raw_url}"


def _is_pinterest_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    return host == "pin.it" or host.endswith(".pin.it") or host == "pinterest.com" or host.endswith(".pinterest.com")


def _looks_like_direct_mp4(u: str) -> bool:
    if not isinstance(u, str) or not u:
        return False
    ul = u.lower()
    if ".m3u8" in ul:
        return False
    return bool(re.search(r"\.mp4(\?|$)", ul))


def _pick_best_mp4_url(info: dict) -> str:
    formats = info.get("formats") or []
    candidates = []
    for f in formats:
        if not isinstance(f, dict):
            continue
        url = f.get("url")
        if not url:
            continue
        ext = (f.get("ext") or "").lower()
        mime_type = (f.get("mime_type") or "").lower()
        if ext != "mp4" and "video/mp4" not in mime_type and not _looks_like_direct_mp4(url):
            continue
        if ".m3u8" in str(url).lower():
            continue
        height = f.get("height") or 0
        tbr = f.get("tbr") or 0
        filesize = f.get("filesize") or f.get("filesize_approx") or 0
        has_audio = 1 if (f.get("acodec") and f.get("acodec") != "none") else 0
        has_video = 1 if (f.get("vcodec") and f.get("vcodec") != "none") else 0
        score = (has_video, has_audio, height, tbr, filesize)
        candidates.append((score, url))
    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]
    direct_url = info.get("url")
    if isinstance(direct_url, str) and direct_url:
        ext = info.get("ext")
        if ext == "mp4" or _looks_like_direct_mp4(direct_url):
            return direct_url
    return ""


def _fetch_html(url: str) -> str:
    req = Request(
        url,
        headers={
            "User-Agent": _USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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


def _extract_meta(html: str, key: str) -> str:
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{re.escape(key)}["\']',
        rf'<meta[^>]+name=["\']{re.escape(key)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']{re.escape(key)}["\']',
    ]
    for pat in patterns:
        m = re.search(pat, html, flags=re.IGNORECASE)
        if m:
            return unescape(m.group(1)).strip()
    return ""


def _score_mp4_url(u: str) -> tuple:
    m = re.search(r"(\d{3,4})p", u)
    p = int(m.group(1)) if m else 0
    return (p, len(u))


def _extract_from_html(url: str) -> dict:
    html = _fetch_html(url)

    title = _extract_meta(html, "og:title") or _extract_meta(html, "twitter:title")
    thumbnail = _extract_meta(html, "og:image") or _extract_meta(html, "twitter:image")
    og_video = _extract_meta(html, "og:video") or _extract_meta(html, "og:video:secure_url")

    candidates = []
    if og_video and ".mp4" in og_video:
        candidates.append(og_video)

    for m in re.finditer(r"https:\\/\\/[^\"'\\s<>]+?\\.mp4[^\"'\\s<>]*", html, flags=re.IGNORECASE):
        candidates.append(m.group(0))
    for m in re.finditer(r"https://[^\"'\\s<>]+?\\.mp4[^\"'\\s<>]*", html, flags=re.IGNORECASE):
        candidates.append(m.group(0))

    normalized = []
    for u in candidates:
        u = unescape(u)
        u = u.replace("\\/", "/")
        u = u.strip()
        if u.startswith("https://"):
            normalized.append(u)

    normalized = list(dict.fromkeys(normalized))
    normalized.sort(key=_score_mp4_url, reverse=True)

    video_url = normalized[0] if normalized else ""
    if not video_url:
        return {}

    return {
        "title": title or "Pinterest Video",
        "thumbnail": thumbnail or None,
        "video_url": video_url,
    }


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_POST(self):
        try:
            body = _read_json_body(self)
        except Exception:
            return _json_response(self, 400, {"error": "INVALID_JSON", "message": "Request body must be valid JSON."})

        url = _normalize_url(body.get("url") if isinstance(body, dict) else "")
        if not url:
            return _json_response(self, 400, {"error": "MISSING_URL", "message": "Provide a Pinterest URL in the 'url' field."})
        if not _is_pinterest_url(url):
            return _json_response(self, 400, {"error": "INVALID_DOMAIN", "message": "Only Pinterest URLs are supported."})

        ydl_opts_primary = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "format": "best[ext=mp4]/best",
        }
        ydl_opts_secondary = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
        }

        try:
            with YoutubeDL(ydl_opts_primary) as ydl:
                info = ydl.extract_info(url, download=False)
        except DownloadError as e:
            try:
                with YoutubeDL(ydl_opts_secondary) as ydl:
                    info = ydl.extract_info(url, download=False)
            except DownloadError:
                try:
                    fallback = _extract_from_html(url)
                    if fallback.get("video_url"):
                        return _json_response(self, 200, fallback)
                except (HTTPError, URLError):
                    pass
                except Exception:
                    pass
                message = str(e) or "Failed to extract a video from that Pinterest URL."
                if "Requested format is not available" in message:
                    message = (
                        "This Pinterest link didn't expose a direct MP4 format. "
                        "Try a different pin or use a share link from the Pinterest app."
                    )
                return _json_response(
                    self,
                    422,
                    {
                        "error": "EXTRACTION_FAILED",
                        "message": message,
                    },
                )
            except Exception:
                return _json_response(
                    self,
                    500,
                    {"error": "INTERNAL_ERROR", "message": "Unexpected server error while extracting the video."},
                )

        except Exception:
            return _json_response(
                self,
                500,
                {"error": "INTERNAL_ERROR", "message": "Unexpected server error while extracting the video."},
            )

        if isinstance(info, dict) and info.get("_type") == "playlist" and info.get("entries"):
            entries = [e for e in info.get("entries") if isinstance(e, dict)]
            if entries:
                info = entries[0]

        if not isinstance(info, dict):
            return _json_response(
                self,
                422,
                {"error": "EXTRACTION_FAILED", "message": "No usable video metadata was returned by the extractor."},
            )

        video_url = _pick_best_mp4_url(info)
        if not video_url:
            formats = info.get("formats") if isinstance(info, dict) else None
            if isinstance(formats, list):
                for f in formats:
                    if not isinstance(f, dict):
                        continue
                    u = f.get("url")
                    if isinstance(u, str) and ".m3u8" in u.lower():
                        return _json_response(
                            self,
                            422,
                            {
                                "error": "NO_DIRECT_MP4",
                                "message": "This Pinterest video appears to be streaming-only (HLS) and does not provide a direct MP4 download link.",
                            },
                        )
            return _json_response(
                self,
                422,
                {
                    "error": "NO_MP4",
                    "message": "No direct MP4 URL could be found for that Pinterest video.",
                },
            )

        title = info.get("title") or "Pinterest Video"
        thumbnail = info.get("thumbnail")
        return _json_response(self, 200, {"title": title, "thumbnail": thumbnail, "video_url": video_url})

    def log_message(self, format, *args):
        return

