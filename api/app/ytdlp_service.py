from __future__ import annotations

import json
import os
import shutil
import sysconfig
import tempfile
import threading
import time
from datetime import datetime, timezone
from typing import Any

import yt_dlp

from .config import settings


class ExtractionError(Exception):
    pass


def _json_cookies_to_netscape(text: str) -> str | None:
    try:
        data = json.loads(text)
    except Exception:  # noqa: BLE001
        return None
    if isinstance(data, dict):
        data = data.get("cookies")
    if not isinstance(data, list):
        return None
    rows = [
        "# Netscape HTTP Cookie File",
        "# Converted from a JSON cookie export by SyncTune",
    ]
    for cookie in data:
        if not isinstance(cookie, dict):
            continue
        name = cookie.get("name") or ""
        domain = cookie.get("domain") or ""
        if not name or not domain:
            continue
        value = cookie.get("value")
        value = "" if value is None else str(value)
        path = cookie.get("path") or "/"
        secure = "TRUE" if cookie.get("secure") else "FALSE"
        include = "TRUE" if domain.startswith(".") else "FALSE"
        expiry = int(cookie.get("expirationDate") or cookie.get("expires") or 0)
        rows.append("\t".join([domain, include, path, secure, str(expiry), name, value]))
    if len(rows) <= 2:
        return None
    return "\n".join(rows) + "\n"


def _normalize_cookie_text(text: str) -> str:
    """Make third-party cookie exports usable by yt-dlp.

    Handles: literal ``\\n``/``\\t`` escapes, CRLF, JSON exports and lines whose
    tab separators were replaced by spaces (e.g. pasted into a web form).
    """
    text = text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", "\t")
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""
    if text[0] in "[{":
        converted = _json_cookies_to_netscape(text)
        if converted:
            text = converted
    lines: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "\t" in line:
            lines.append(stripped)
            continue
        tokens = stripped.split()
        if len(tokens) < 6:
            lines.append(stripped)
            continue
        if len(tokens) == 7:
            parts = tokens
        elif len(tokens) > 7:
            parts = tokens[:6] + [" ".join(tokens[6:])]
        else:
            parts = tokens + [""]
        lines.append("\t".join(parts))
    return "\n".join(lines).strip("\n") + "\n"


_cookie_file_path: str | None = None
_cookie_lock = threading.Lock()
_TEMP_COOKIE_PATH = os.path.join(tempfile.gettempdir(), "synctune_cookies.txt")


def _cookie_file() -> str | None:
    """Return a path to a writable cookies.txt file, or None.

    Supports:
      - YTDLP_COOKIEFILE: path to an existing file (e.g. a Render Secret File)
      - YTDLP_COOKIES: the raw Netscape cookie text

    The cookies are always copied into a writable temp file because yt-dlp
    saves the cookie jar back to ``cookiefile`` (which is read-only for
    mounted secret files).
    """
    global _cookie_file_path
    if _cookie_file_path:
        return _cookie_file_path
    with _cookie_lock:
        if _cookie_file_path:
            return _cookie_file_path
        text = ""
        if settings.cookiefile and os.path.exists(settings.cookiefile):
            with open(settings.cookiefile, "r", encoding="utf-8", errors="replace") as handle:
                text = handle.read()
        if not text.strip():
            text = settings.cookies_text
        text = _normalize_cookie_text(text)
        if not text:
            return None
        with open(_TEMP_COOKIE_PATH, "w", encoding="utf-8") as handle:
            handle.write(text)
        _cookie_file_path = _TEMP_COOKIE_PATH
        return _cookie_file_path


def cookies_configured() -> bool:
    if settings.cookies_from_browser:
        return True
    try:
        return _cookie_file() is not None
    except OSError:
        return False


_API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_js_runtime_cache: dict[str, Any] | None = None


def _resolve_deno_path() -> str | None:
    scripts_dir = sysconfig.get_path("scripts") or ""
    candidates = [
        settings.js_runtime_path,
        "/usr/local/bin/deno",
        os.path.join(_API_DIR, "bin", "deno"),
        os.path.join(_API_DIR, ".deno", "bin", "deno"),
        os.path.join(os.path.dirname(_API_DIR), ".venv", "bin", "deno"),
        os.path.join(scripts_dir, "deno") if scripts_dir else "",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        path = candidate if os.path.isabs(candidate) else os.path.join(_API_DIR, candidate)
        if os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    return shutil.which("deno")


def js_runtimes() -> dict[str, Any]:
    global _js_runtime_cache
    if _js_runtime_cache is None:
        path = _resolve_deno_path()
        _js_runtime_cache = {"deno": {"path": path}} if path else {}
    return _js_runtime_cache


class TTLCache:
    def __init__(self, ttl: int) -> None:
        self._ttl = ttl
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at < time.time():
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = (time.time() + self._ttl, value)


_search_cache = TTLCache(settings.cache_ttl)
_resolve_cache = TTLCache(settings.cache_ttl)

_AUDIO_MIME = {
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "webm": "audio/webm",
    "mp3": "audio/mpeg",
    "aac": "audio/aac",
    "opus": "audio/ogg",
    "ogg": "audio/ogg",
}

_VIDEO_MIME = {
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mkv": "video/x-matroska",
    "3gp": "video/3gpp",
    "flv": "video/x-flv",
}


def parse_extractor_args(raw: str) -> dict[str, dict[str, list[str]]]:
    """Parse ``youtube:key=value;key2=value2`` into yt-dlp extractor_args."""
    result: dict[str, dict[str, list[str]]] = {}
    current = "youtube"
    for token in (raw or "").split(";"):
        token = token.strip()
        if not token:
            continue
        if ":" in token:
            ie, _, rest = token.partition(":")
            current = ie.strip().lower() or current
            token = rest.strip()
        if not token or "=" not in token:
            continue
        key, _, value = token.partition("=")
        result.setdefault(current, {}).setdefault(key.strip(), []).append(
            value.strip()
        )
    return result


def merge_extractor_args(*sources: dict[str, dict[str, list[str]]]) -> dict[str, dict[str, list[str]]]:
    merged: dict[str, dict[str, list[str]]] = {}
    for source in sources:
        for ie, values in (source or {}).items():
            merged.setdefault(ie, {}).update(values)
    return merged


def _bgutil_plugin_available() -> bool:
    try:
        import importlib.util

        return (
            importlib.util.find_spec(
                "yt_dlp_plugins.extractor.getpot_bgutil_script"
            )
            is not None
        )
    except Exception:  # noqa: BLE001
        return False


def _bgutil_server_home() -> str | None:
    candidates = [
        settings.pot_server_home,
        os.path.join(_API_DIR, "bgutil", "server"),
        os.path.join(
            os.path.expanduser("~"), "bgutil-ytdlp-pot-provider", "server"
        ),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if os.path.isfile(os.path.join(candidate, "src", "generate_once.ts")):
            return candidate
    return None


def base_opts() -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "nocheckcertificate": True,
    }
    if settings.cookies_from_browser:
        parts = settings.cookies_from_browser.split(":")
        padded = (parts + [None, None, None, None])[:4]
        opts["cookiesfrombrowser"] = tuple(padded)
    else:
        cookie_file = _cookie_file()
        if cookie_file:
            opts["cookiefile"] = cookie_file
    extractor_args = parse_extractor_args(settings.extractor_args)
    if settings.player_clients:
        extractor_args.setdefault("youtube", {})["player_client"] = list(
            settings.player_clients
        )
    if _bgutil_plugin_available():
        home = _bgutil_server_home()
        if home:
            extractor_args.setdefault("youtubepot-bgutilscript", {})[
                "server_home"
            ] = [home]
            extractor_args.setdefault("youtube", {})["fetch_pot"] = [
                settings.fetch_pot or "always"
            ]
    if extractor_args:
        opts["extractor_args"] = extractor_args
    runtimes = js_runtimes()
    if runtimes:
        opts["js_runtimes"] = runtimes
    if settings.remote_components:
        opts["remote_components"] = list(settings.remote_components)
    return opts


IMPORTANT_COOKIE_NAMES = (
    "SID",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "LOGIN_INFO",
    "__Secure-1PSID",
    "__Secure-3PSID",
    "__Secure-1PAPISID",
    "__Secure-3PAPISID",
    "SIDCC",
)


def cookie_report() -> dict[str, Any]:
    if settings.cookies_from_browser:
        report: dict[str, Any] = {
            "source": "browser",
            "value": settings.cookies_from_browser,
        }
    elif settings.cookiefile or settings.cookies_text.strip():
        source = "file" if settings.cookiefile else "inline"
        path = _cookie_file()
        report = {"source": source, "source_path": settings.cookiefile or None}
        text = ""
        if path and os.path.exists(path):
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                text = handle.read()
        lines = [ln for ln in text.splitlines() if ln.strip()]
        data_lines = [ln for ln in lines if not ln.startswith("#")]
        names: set[str] = set()
        domains: set[str] = set()
        for line in data_lines:
            parts = line.split("\t")
            if len(parts) >= 7:
                domains.add(parts[0].lstrip("."))
                names.add(parts[5])
        report.update(
            {
                "bytes": len(text),
                "lines": len(lines),
                "cookie_count": len(data_lines),
                "domains": sorted(domains),
                "present": [n for n in IMPORTANT_COOKIE_NAMES if n in names],
                "first_line": lines[0][:80] if lines else "",
            }
        )
    else:
        report = {"source": "none"}

    try:
        with yt_dlp.YoutubeDL(base_opts()) as ydl:
            jar = list(ydl.cookiejar)
            report["jar_total"] = len(jar)
            report["jar_youtube"] = len(
                [c for c in jar if "youtube.com" in (c.domain or "")]
            )
    except Exception as exc:  # noqa: BLE001
        report["jar_error"] = f"{type(exc).__name__}: {exc}"

    report["ytdlp_version"] = getattr(yt_dlp.version, "__version__", "unknown")
    report["player_clients_env"] = list(settings.player_clients)
    report["js_runtime"] = _resolve_deno_path()
    report["remote_components_env"] = list(settings.remote_components)
    report["bgutil_plugin"] = _bgutil_plugin_available()
    report["bgutil_server_home"] = _bgutil_server_home()
    return report


class LogCapture:
    def __init__(self) -> None:
        self.lines: list[str] = []

    def debug(self, message: str) -> None:
        self.lines.append(str(message))

    def info(self, message: str) -> None:
        self.lines.append(str(message))

    def warning(self, message: str) -> None:
        self.lines.append(f"WARNING: {message}")

    def error(self, message: str) -> None:
        self.lines.append(f"ERROR: {message}")


def probe(
    url: str,
    clients: list[str],
    verbose: bool = False,
    extra_args: dict[str, dict[str, list[str]]] | None = None,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for client in clients:
        opts = base_opts()
        override: dict[str, dict[str, list[str]]] = {}
        if client != "default":
            override = {"youtube": {"player_client": [client]}}
        if extra_args:
            override = merge_extractor_args(override, extra_args)
        if override:
            opts["extractor_args"] = merge_extractor_args(
                opts.get("extractor_args", {}), override
            )
        capture = LogCapture() if verbose else None
        if capture is not None:
            opts["verbose"] = True
            opts["quiet"] = False
            opts["no_warnings"] = False
            opts["logger"] = capture
        entry: dict[str, Any] = {"client": client}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            formats = (info or {}).get("formats") or []
            entry["ok"] = True
            entry["title"] = (info or {}).get("title")
            entry["formats"] = len(formats)
            audio = [
                f
                for f in formats
                if f.get("vcodec") == "none" and f.get("acodec") not in (None, "none")
            ]
            entry["audio_formats"] = len(audio)
        except Exception as exc:  # noqa: BLE001
            entry["ok"] = False
            entry["error"] = str(exc)[:300]
        if capture is not None:
            entry["log"] = capture.lines[-70:]
        results.append(entry)
    return results


def _detect_source(url: str) -> str:
    low = url.lower()
    if "youtube.com" in low or "youtu.be" in low:
        return "youtube"
    if "tiktok.com" in low:
        return "tiktok"
    return "other"


def _pick_thumbnail(info: dict[str, Any]) -> str | None:
    thumb = info.get("thumbnail")
    if thumb:
        return thumb
    thumbnails = info.get("thumbnails") or []
    if thumbnails:
        last = thumbnails[-1]
        if isinstance(last, dict):
            return last.get("url")
    return None


def _filesize(fmt: dict[str, Any]) -> int | None:
    return fmt.get("filesize") or fmt.get("filesize_approx")


def _pick_audio(formats: list[dict[str, Any]]) -> dict[str, Any] | None:
    audio_only = [
        fmt
        for fmt in formats
        if fmt.get("vcodec") == "none" and fmt.get("acodec") not in (None, "none")
    ]
    candidates = audio_only or [
        fmt for fmt in formats if fmt.get("acodec") not in (None, "none")
    ]
    if not candidates:
        return None

    def score(fmt: dict[str, Any]) -> tuple[int, float, float]:
        is_m4a = 1 if fmt.get("ext") == "m4a" else 0
        return (is_m4a, fmt.get("abr") or 0, fmt.get("tbr") or 0)

    best = max(candidates, key=score)
    ext = best.get("ext")
    return {
        "url": best.get("url"),
        "ext": ext,
        "mime": _AUDIO_MIME.get(ext or "", "audio/mp4"),
        "abr": best.get("abr"),
        "filesize": _filesize(best),
    }


def _pick_video(formats: list[dict[str, Any]]) -> dict[str, Any] | None:
    muxed = [
        fmt
        for fmt in formats
        if fmt.get("vcodec") not in (None, "none")
        and fmt.get("acodec") not in (None, "none")
    ]
    if not muxed:
        return None

    def score(fmt: dict[str, Any]) -> tuple[int, int, int]:
        is_mp4 = 1 if fmt.get("ext") == "mp4" else 0
        height = fmt.get("height") or 0
        under_720 = 1 if 0 < height <= 720 else 0
        return (is_mp4, under_720, height)

    best = max(muxed, key=score)
    ext = best.get("ext")
    return {
        "url": best.get("url"),
        "ext": ext,
        "mime": _VIDEO_MIME.get(ext or "", "video/mp4"),
        "height": best.get("height"),
        "filesize": _filesize(best),
    }


def search(query: str, limit: int = 20) -> list[dict[str, Any]]:
    key = f"search:{limit}:{query}"
    cached = _search_cache.get(key)
    if cached is not None:
        return cached

    opts = base_opts()
    opts["extract_flat"] = "in_playlist"
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
    except Exception as exc:
        raise ExtractionError(f"Search failed: {exc}") from exc

    entries = []
    if isinstance(info, dict):
        entries = info.get("entries") or []

    results: list[dict[str, Any]] = []
    for entry in entries:
        if not entry:
            continue
        video_id = entry.get("id")
        thumbnail = entry.get("thumbnail")
        if not thumbnail and video_id:
            thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
        results.append(
            {
                "id": video_id,
                "title": entry.get("title"),
                "uploader": entry.get("uploader") or entry.get("channel"),
                "thumbnail": thumbnail,
                "duration": entry.get("duration"),
                "url": f"https://www.youtube.com/watch?v={video_id}" if video_id else None,
                "source": "youtube",
            }
        )

    _search_cache.set(key, results)
    return results


def resolve(url: str) -> dict[str, Any]:
    key = f"resolve:{url}"
    cached = _resolve_cache.get(key)
    if cached is not None:
        return cached

    opts = base_opts()
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise ExtractionError(f"Resolve failed: {exc}") from exc

    if not isinstance(info, dict):
        raise ExtractionError("Unexpected extraction result")

    formats = info.get("formats") or []
    result: dict[str, Any] = {
        "id": info.get("id"),
        "title": info.get("title"),
        "uploader": info.get("uploader") or info.get("channel"),
        "thumbnail": _pick_thumbnail(info),
        "duration": info.get("duration"),
        "source": _detect_source(url),
        "webpage_url": info.get("webpage_url") or url,
        "audio": _pick_audio(formats),
        "video": _pick_video(formats),
        "resolvedAt": datetime.now(timezone.utc).isoformat(),
        "expiresIn": settings.cache_ttl,
    }

    _resolve_cache.set(key, result)
    return result
