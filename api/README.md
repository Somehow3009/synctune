# SyncTune API

Personal FastAPI backend that searches YouTube and resolves/proxies YouTube & TikTok
media streams via `yt-dlp`.

## Setup

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

```powershell
uvicorn main:app --reload
```

Then open http://localhost:8000/docs

## Environment variables

Copy `.env.example` to `.env` and adjust. Variables are read from the process
environment (e.g. set them in your shell or with a process manager):

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Bind host |
| `PORT` | `8000` | Bind port |
| `CORS_ORIGINS` | `*` | Comma separated allowed origins |
| `CACHE_TTL` | `1800` | Seconds to cache yt-dlp extraction results |
| `YTDLP_COOKIES_FROM_BROWSER` | *(empty)* | e.g. `chrome` or `firefox:default` to bypass bot checks |
| `PROXY_ALLOWED_HOSTS` | see `.env.example` | Comma separated host suffixes allowed through `/api/stream` |

## Endpoints

- `GET /api/health`
- `GET /api/search?q=<query>&limit=20`
- `GET /api/resolve?url=<url>`
- `GET /api/info?url=<url>` (alias, also accepts `src`)
- `GET /api/stream?src=<direct-media-url>`

Media streams are proxied through `/api/stream` to keep direct googlevideo/tiktok
URLs out of the browser and to satisfy CORS.

## Notes

YouTube/TikTok frequently require authentication or trigger bot checks. Set
`YTDLP_COOKIES_FROM_BROWSER` (e.g. `chrome`) so yt-dlp can reuse your browser
session cookies.
