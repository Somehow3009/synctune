"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { searchYouTube } from "@/lib/api";
import { trackFromSearch } from "@/lib/track";
import { usePlayer } from "@/context/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { Search } from "@/components/Icons";
import type { Track } from "@/lib/types";

function SearchContent() {
  const params = useSearchParams();
  const initialQ = params.get("q") || "";
  const [q, setQ] = useState(initialQ);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { playQueue, current, playing } = usePlayer();

  const run = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const results = await searchYouTube(query.trim(), 25);
      setTracks(results.map(trackFromSearch));
    } catch (e) {
      setError((e as Error).message);
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQ) void run(initialQ);
  }, [initialQ, run]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width={18} height={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm bài hát, video, kênh trên YouTube..."
            className="st-input !pl-10"
            autoFocus
          />
        </div>
        <button type="submit" className="st-btn-primary" disabled={loading}>
          Tìm
        </button>
      </form>

      {error ? (
        <div className="st-card border-red-500/30 bg-red-500/5 p-4 text-sm text-red-500">{error}</div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <span className="h-12 w-12 animate-pulse rounded-lg bg-slate-200 dark:bg-white/10" />
              <span className="flex-1 space-y-2">
                <span className="block h-3 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
                <span className="block h-3 w-1/3 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
              </span>
            </div>
          ))}
        </div>
      ) : tracks.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{tracks.length} kết quả</p>
            <button onClick={() => playQueue(tracks, 0)} className="st-btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Phát tất cả
            </button>
          </div>
          <div className="space-y-1">
            {tracks.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                index={i}
                active={current?.url === t.url}
                onPlay={() => playQueue(tracks, i)}
              />
            ))}
          </div>
        </>
      ) : !loading && initialQ && !error ? (
        <p className="py-12 text-center text-sm text-slate-500">Không có kết quả</p>
      ) : !initialQ ? (
        <p className="py-12 text-center text-sm text-slate-500">
          Nhập từ khoá để tìm trên YouTube. Kết quả phát ngay, thêm vào playlist hoặc chia sẻ.
        </p>
      ) : null}

      {playing && current ? null : null}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Đang tải...</div>}>
      <SearchContent />
    </Suspense>
  );
}
