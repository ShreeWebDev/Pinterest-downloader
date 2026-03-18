import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


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


def _pick_best_mp4_url(info: dict) -> str:
    formats = info.get("formats") or []
    candidates = []
    for f in formats:
        if not isinstance(f, dict):
            continue
        if f.get("ext") != "mp4":
            continue
        url = f.get("url")
        if not url:
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
        if ext == "mp4" or direct_url.endswith(".mp4"):
            return direct_url
    return ""


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

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "format": "best[ext=mp4]/best",
        }

        try:
            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except DownloadError:
            return _json_response(
                self,
                422,
                {
                    "error": "EXTRACTION_FAILED",
                    "message": "Failed to extract a video from that Pinterest URL.",
                },
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

