from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any

import yt_dlp

from .config import settings


class ExtractionError(Exception):
    pass


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
    if settings.cookiefile:
        opts["cookiefile"] = settings.cookiefile
    return opts


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
