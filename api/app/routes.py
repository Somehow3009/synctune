from __future__ import annotations

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from .config import settings
from .ytdlp_service import (
    USER_AGENT,
    ExtractionError,
    _cookie_header,
    cookie_report,
    cookies_configured,
    parse_extractor_args,
    probe,
    resolve,
    search,
)

router = APIRouter()

FORWARD_HEADERS = (
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
    "cache-control",
)


def _host_allowed(src: str) -> bool:
    parsed = urlparse(src)
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    for suffix in settings.proxy_allowed_hosts:
        suffix = suffix.lower().lstrip(".")
        if suffix and (host == suffix or host.endswith("." + suffix)):
            return True
    return False


async def _resolve_or_502(url: str) -> dict:
    try:
        return await run_in_threadpool(resolve, url)
    except ExtractionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def _dltest(url: str) -> dict:
    try:
        from yt_dlp.utils import Request, urlopen
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"import failed: {exc}"}
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Accept-Language": "en-us,en;q=0.5",
    }
    cookie = _cookie_header()
    if cookie:
        headers["Cookie"] = cookie
    try:
        response = urlopen(Request(url, headers=headers))
        data = response.read(2048)
        return {
            "ok": True,
            "status": getattr(response, "status", None),
            "bytes": len(data),
            "content_type": response.headers.get("Content-Type"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:400]}


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "cookies": cookies_configured()}


@router.get("/debug")
async def debug_endpoint(
    token: str = Query(""),
    url: str = Query("https://www.youtube.com/watch?v=m4J3nlTnDh4"),
    clients: str = Query(
        "default,web,web_safari,mweb,tv,android_vr,visionos,ios,web_embedded,tv_simply"
    ),
    verbose: bool = Query(False),
    extractor_args: str = Query(""),
    remote_components: str = Query(""),
) -> dict:
    if settings.debug_token and token != settings.debug_token:
        raise HTTPException(status_code=404, detail="Not found")
    report = await run_in_threadpool(cookie_report)
    client_list = [c.strip() for c in clients.split(",") if c.strip()]
    extra = parse_extractor_args(extractor_args)
    components = [c.strip() for c in remote_components.split(",") if c.strip()]
    attempts = await run_in_threadpool(
        probe, url, client_list, verbose, extra, components
    )
    return {"cookies": report, "probe": attempts}


@router.get("/dltest")
async def dltest_endpoint(url: str = Query(..., min_length=1)) -> dict:
    return await run_in_threadpool(_dltest, url)


@router.get("/search")
async def search_endpoint(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
) -> dict:
    query = q.strip()
    if not query:
        raise HTTPException(status_code=422, detail="Query must not be empty")
    try:
        results = await run_in_threadpool(search, query, limit)
    except ExtractionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"results": results}


@router.get("/resolve")
async def resolve_endpoint(url: str = Query(..., min_length=1)) -> dict:
    return await _resolve_or_502(url)


@router.get("/info")
async def info_endpoint(
    url: str | None = Query(None),
    src: str | None = Query(None),
) -> dict:
    target = url or src
    if not target:
        raise HTTPException(
            status_code=422, detail="Provide a 'url' or 'src' query parameter"
        )
    return await _resolve_or_502(target)


@router.get("/stream")
async def stream_endpoint(request: Request, src: str = Query(..., min_length=1)):
    if not _host_allowed(src):
        raise HTTPException(status_code=400, detail="Host not allowed for proxying")

    upstream_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-us,en;q=0.5",
        "Sec-Fetch-Mode": "navigate",
    }
    host = (urlparse(src).hostname or "").lower()
    if "youtube" in host or "googlevideo" in host or "ytimg" in host:
        cookie = _cookie_header()
        if cookie:
            upstream_headers["Cookie"] = cookie
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    client = httpx.AsyncClient(follow_redirects=True, timeout=None)
    try:
        upstream_request = client.build_request("GET", src, headers=upstream_headers)
        upstream_response = await client.send(upstream_request, stream=True)
    except httpx.HTTPError as exc:
        await client.aclose()
        raise HTTPException(
            status_code=502, detail=f"Upstream fetch failed: {exc}"
        ) from exc

    response_headers = {
        name: upstream_response.headers[name]
        for name in FORWARD_HEADERS
        if name in upstream_response.headers
    }
    response_headers["Access-Control-Allow-Origin"] = "*"
    response_headers["Access-Control-Expose-Headers"] = (
        "Content-Range, Accept-Ranges, Content-Length"
    )

    async def stream_body():
        try:
            async for chunk in upstream_response.aiter_bytes():
                yield chunk
        finally:
            await upstream_response.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_body(),
        status_code=upstream_response.status_code,
        headers=response_headers,
        media_type=upstream_response.headers.get("content-type"),
    )
