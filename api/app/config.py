from __future__ import annotations

import os

DEFAULT_PROXY_HOSTS = (
    "googlevideo.com,ytimg.com,tiktokcdn.com,tiktokcdn-us.com,"
    "ttwstatic.com,ibytedtos.com,akamaized.net,bc.googleusercontent.com"
)


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    def __init__(self) -> None:
        self.host: str = os.getenv("HOST", "0.0.0.0")
        self.port: int = int(os.getenv("PORT", "8000"))
        self.cors_origins: list[str] = _split_csv(os.getenv("CORS_ORIGINS", "*"))
        self.cache_ttl: int = int(os.getenv("CACHE_TTL", "1800"))
        self.cookies_from_browser: str = os.getenv("YTDLP_COOKIES_FROM_BROWSER", "").strip()
        self.cookiefile: str = os.getenv("YTDLP_COOKIEFILE", "").strip()
        self.cookies_text: str = os.getenv("YTDLP_COOKIES", "")
        self.player_clients: list[str] = _split_csv(
            os.getenv("YTDLP_PLAYER_CLIENT", "")
        )
        self.js_runtime_path: str = os.getenv("YTDLP_JS_RUNTIME", "").strip()
        self.remote_components: list[str] = _split_csv(
            os.getenv("YTDLP_REMOTE_COMPONENTS", "")
        )
        self.debug_token: str = os.getenv("DEBUG_TOKEN", "").strip()
        self.proxy_allowed_hosts: list[str] = _split_csv(
            os.getenv("PROXY_ALLOWED_HOSTS", DEFAULT_PROXY_HOSTS)
        )


settings = Settings()
