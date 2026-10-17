"use client";

import { useState } from "react";
import { resolveStream } from "@/lib/api";
import { trackFromResolved } from "@/lib/track";
import { detectSource, formatTime, isSupportedUrl } from "@/lib/utils";
import { usePlayer } from "@/context/PlayerContext";
import { TrackMenu } from "@/components/TrackMenu";
import { Headphones, Link as LinkIcon, Plus, VideoIcon } from "@/components/Icons";
import type { ResolvedStream, Track } from "@/lib/types";

export default function AddPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedStream | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const { playTrack, playNext } = usePlayer();

  async function handleResolve(e?: React.FormEvent) {
    e?.preventDefault();
    const u = url.trim();
    if (!u) return;
    if (!isSupportedUrl(u)) {
      setError("Link không hợp lệ (phải bắt đầu bằng http/https)");
      return;
    }
    setLoading(true);
    setError(null);
    setResolved(null);
    setTrack(null);
    try {
      const data = await resolveStream(u);
      setResolved(data);
      setTrack(trackFromResolved(data));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Thêm từ link</h1>
        <p className="text-sm text-slate-500">
          Dán link YouTube hoặc TikTok. Hệ thống sẽ tự lấy tiêu đề, tác giả và ảnh thu nhỏ.
        </p>
      </header>

      <form onSubmit={handleResolve} className="st-card space-y-3 p-4">
        <div className="relative">
          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width={18} height={18} />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (resolved) {
                setResolved(null);
                setTrack(null);
              }
            }}
            placeholder="https://www.tiktok.com/@... hoặc https://youtu.be/..."
            className="st-input !pl-10"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="st-btn-primary">
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              "Lấy thông tin"
            )}
          </button>
          <button
            type="button"
            className="st-btn-ghost"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text) {
                  setUrl(text.trim());
                  setTimeout(() => void handleResolve(), 0);
                }
              } catch {
                setError("Không đọc được clipboard");
              }
            }}
          >
            Dán từ clipboard
          </button>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </form>

      {loading ? (
        <div className="st-card flex items-center gap-3 p-4">
          <span className="h-16 w-16 animate-pulse rounded-lg bg-slate-200 dark:bg-white/10" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
            <span className="block h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
          </span>
        </div>
      ) : null}

      {resolved && track ? (
        <div className="st-card animate-fade-in overflow-hidden">
          <div className="flex gap-3 p-4">
            {resolved.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolved.thumbnail} alt="" className="h-20 w-32 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="grid h-20 w-32 shrink-0 place-items-center rounded-lg bg-slate-200 dark:bg-white/10">
                <Headphones className="text-slate-400" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 font-semibold">{resolved.title}</h2>
              <p className="truncate text-sm text-slate-500">
                {resolved.uploader || "—"}
                {resolved.duration ? ` · ${formatTime(resolved.duration)}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="st-chip">
                  {detectSource(resolved.webpage_url) === "tiktok" ? "TikTok" : "YouTube"}
                </span>
                {resolved.audio ? (
                  <span className="st-chip">
                    <Headphones width={12} height={12} /> Chỉ nghe
                  </span>
                ) : null}
                {resolved.video ? (
                  <span className="st-chip">
                    <VideoIcon width={12} height={12} /> Video
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-3 dark:border-white/10">
            <button onClick={() => playTrack(track, [track])} className="st-btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Phát ngay
            </button>
            <button onClick={() => playNext(track)} className="st-btn-ghost">
              <Plus width={16} height={16} /> Phát tiếp theo
            </button>
            <TrackMenu
              track={track}
              trigger={
                <span className="st-btn-ghost" role="button">
                  <Plus width={16} height={16} /> Thêm vào playlist / Chia sẻ
                </span>
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
