# SyncTune

Trình nghe nhạc / truyện / podcast cá nhân từ **YouTube** và **TikTok**: không quảng cáo, playlist
tuỳ chỉnh, phát nền, chia sẻ cho nhau, và **xem/nghe chung có chat chữ + chat thoại**.

Dành cho 1–2 người, chạy với chi phí **$0**.

```
Người dùng (Laptop / iPhone PWA)
        │
        ▼
┌───────────────────┐        ┌──────────────────────────┐
│  Web (Next.js)    │  HTTP  │  API (FastAPI + yt-dlp)  │
│  Player + Chat    │ ─────▶ │  /search /resolve /stream│
└─────────┬─────────┘        └──────────────────────────┘
          │
          ▼
┌───────────────────────────────────────────────┐
│ Supabase (tuỳ chọn): Auth · DB · Realtime     │
│ - Realtime: chat, đồng bộ phòng, báo hiệu RTC  │
└───────────────────────────────────────────────┘
```

- Không tải video về lưu trữ — chỉ **stream khi phát** (qua proxy của API).
- Playlist/dữ liệu trên Supabase, hoặc lưu ngay trong trình duyệt (**chế độ Local**).
- Voice chat dùng **WebRTC peer-to-peer**; Supabase/`BroadcastChannel` chỉ làm nhiệm vụ báo hiệu.

## Cấu trúc repo

```
synctune/
├── api/                 # Backend FastAPI lấy luồng YouTube/TikTok (yt-dlp)
│   ├── main.py
│   ├── requirements.txt
│   └── app/{config,routes,ytdlp_service}.py
└── web/                 # PWA Next.js 14 + Tailwind
    ├── src/app/…        # Trang: home, search, library, playlist, add, shared, party, settings, login
    ├── src/components/  # Player, MiniPlayer, FullPlayer, TrackMenu, PartyRoom…
    ├── src/context/     # Auth, Library, Player, Theme
    ├── src/hooks/       # useParty, useVoiceChat, useProfiles
    ├── src/lib/         # api, db, realtime, supabase, track, utils, types
    ├── public/          # manifest + service worker (PWA)
    └── supabase/schema.sql
```

## 1) Chạy Backend (API)

Yêu cầu: Python 3.10+.

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -U yt-dlp          # khuyến nghị: yt-dlp cập nhật thường xuyên
copy .env.example .env
uvicorn main:app --reload --port 8000
```

Mở http://localhost:8000/docs để xem API.

Biến môi trường (`api/.env`):

| Biến | Ý nghĩa |
| --- | --- |
| `CORS_ORIGINS` | Danh sách origin được phép, ví dụ `http://localhost:3000` (mặc định `*`) |
| `CACHE_TTL` | Giây cache kết quả trích xuất luồng (mặc định `1800`) |
| `YTDLP_COOKIES_FROM_BROWSER` | Tuỳ chọn (dev), ví dụ `chrome` — dùng khi YouTube chặn bot |
| `YTDLP_COOKIEFILE` | Tuỳ chọn (deploy), đường dẫn tới `cookies.txt` xuất từ trình duyệt |
| `PROXY_ALLOWED_HOSTS` | Danh sách host CDN được phép qua proxy stream |

> **YouTube/TikTok thỉnh thoảng yêu cầu xác minh.** Gặp lỗi `resolve` 502 thì cập nhật yt-dlp
> (`pip install -U yt-dlp`) hoặc đặt `YTDLP_COOKIES_FROM_BROWSER=chrome` (máy local). Trên cloud
> (Render…) không có trình duyệt nên dùng **`YTDLP_COOKIEFILE`** trỏ tới file `cookies.txt`.

## 2) Chạy Web (PWA)

Yêu cầu: Node 18+.

```powershell
cd web
npm install
copy .env.example .env.local
npm run dev
```

Mở http://localhost:3000.

Biến môi trường (`web/.env.local`):

| Biến | Ý nghĩa |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Địa chỉ API, mặc định `http://localhost:8000` |
| `NEXT_PUBLIC_SUPABASE_URL` | (tuỳ chọn) URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (tuỳ chọn) anon key |
| `NEXT_PUBLIC_TURN_URL` | (tuỳ chọn) TURN server cho thoại khi NAT khó |
| `NEXT_PUBLIC_TURN_USERNAME` | (tuỳ chọn) user TURN |
| `NEXT_PUBLIC_TURN_CREDENTIAL` | (tuỳ chọn) mật khẩu TURN |

- **Không cấu hình Supabase** → app chạy **chế độ Local**: dữ liệu lưu trong trình duyệt,
  realtime qua `BroadcastChannel` (nhiều tab cùng máy). Dùng ngay để thử.
- **Có Supabase** → đăng nhập 2 tài khoản, đồng bộ dữ liệu và xem chung giữa 2 thiết bị.

## 3) Cấu hình Supabase (để dùng thật cho 2 người)

1. Tạo project tại https://supabase.com.
2. Vào **SQL Editor**, dán nội dung `web/supabase/schema.sql` và chạy (bao gồm cả bật Realtime cho
   `playlists`/`shares` để app tự cập nhật khi có chia sẻ).
3. Vào **Project Settings → API**, lấy `URL` và `anon public key`.
4. Điền vào `web/.env.local` (mục `NEXT_PUBLIC_SUPABASE_*`) rồi chạy lại `npm run dev`.
5. Trong **Authentication → Providers**, bật **Email**. Nếu muốn magic link, bật email OTP và
   thêm `http://localhost:3000` (+ domain deploy) vào **Redirect URLs**.

Realtime broadcast dùng sẵn cho phòng xem chung và chat (không cần cấu hình thêm).

## Tính năng

**YouTube** – tìm kiếm, phát (ưu tiên audio-only), thêm vào playlist, hàng đợi, ngẫu nhiên, lặp, nhớ vị trí nghe,
sắp xếp kéo-thả (máy tính) hoặc nút lên/xuống (điện thoại).
**TikTok** – dán link, tự lấy tiêu đề/tác giả/thumbnail, phát lại, tổ chức theo playlist.
**Player** – mini + full, chế độ chỉ nghe/video, tốc độ 0.75×–2×, loop/shuffle/queue, phát nền,
điều khiển trên màn hình khoá (Media Session API).
**Hai tài khoản** – email + mật khẩu hoặc magic link, playlist riêng, chia sẻ bài/playlist cho nhau.
**Xem chung** – tạo phòng, đồng bộ play/pause/tua, hàng đợi chung, chat chữ realtime, chat thoại WebRTC.
**Khác** – dark mode, xuất/nhập playlist JSON, PWA cài lên màn hình chính.

## Cài thành ứng dụng (PWA)

- **iPhone**: mở bằng Safari → Chia sẻ → *Thêm vào Màn hình chính*.
- **Máy tính**: biểu tượng cài đặt trên thanh địa chỉ Chrome/Edge.

## Triển khai miễn phí (gợi ý)

- Web → **Vercel** hoặc **Cloudflare Pages** (đặt `NEXT_PUBLIC_*`, build `npm run build`).
- API → **Render** free: repo đã có sẵn `render.yaml` (Blueprint) và `api/Dockerfile`.
  Vào Render → *New → Blueprint* → chọn repo, hoặc *New → Web Service* với
  build `pip install -r requirements.txt && pip install -U yt-dlp`,
  start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
- DB/Auth/Realtime → **Supabase** free.
- Nhớ đặt `NEXT_PUBLIC_API_URL` trỏ về domain API, và `CORS_ORIGINS` trỏ về domain web.
- Sau khi deploy, vào Settings → kiểm tra “Trạng thái backend” báo **Hoạt động**.

## Scripts

```powershell
# web
npm run dev        # phát triển
npm run build      # build production
npm run start      # chạy production
npm run typecheck  # kiểm tra TypeScript
npm run icons      # sinh lại icon PNG (192/512/apple-touch)

# api
uvicorn main:app --reload     # chạy dev
docker build -t synctune-api .   # (trong api/) build image
```

## Hạn chế đã biết

- Phụ thuộc khả năng lấy luồng của yt-dlp — YouTube/TikTok đổi thường xuyên; cập nhật yt-dlp
  hoặc dùng cookie trình duyệt khi cần.
- Phát nền trên iPhone PWA tốt nhưng chưa bằng app native.
- Thoại WebRTC mặc định chỉ dùng STUN; điền `NEXT_PUBLIC_TURN_*` nếu cần kết nối sau NAT phức tạp.
- Free tier của Render sẽ "ngủ" khi không dùng → lần đầu có độ trễ khởi động.
