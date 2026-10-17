"use client";

import { useEffect, useState } from "react";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayer } from "@/context/PlayerContext";
import { TrackMenu } from "@/components/TrackMenu";
import { timeAgo } from "@/lib/utils";
import { Heart, Plus, Trash } from "@/components/Icons";
import type { Playlist, Track } from "@/lib/types";

export default function SharedPage() {
  const { shares, reloadShares, markShareRead, deleteShare, importPlaylist, loading } = useLibrary();
  const { playTrack } = usePlayer();
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    const unread = shares.filter((s) => !s.read);
    unread.forEach((s) => void markShareRead(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares.length]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Đã nhận</h1>
          <p className="text-sm text-slate-500">Nội dung người kia chia sẻ cho bạn</p>
        </div>
        <button onClick={() => void reloadShares()} className="st-btn-ghost">
          Làm mới
        </button>
      </header>

      {loading && shares.length === 0 ? (
        <div className="st-card h-24 animate-pulse" />
      ) : shares.length === 0 ? (
        <div className="st-card flex flex-col items-center gap-2 p-10 text-center">
          <Heart className="text-slate-400" width={28} height={28} />
          <p className="text-sm text-slate-500">Chưa có nội dung nào được chia sẻ cho bạn.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shares.map((s) => {
            const isTrack = s.kind === "track";
            const track = isTrack ? (s.payload as Track) : null;
            const playlist = !isTrack ? (s.payload as Playlist) : null;
            return (
              <div key={s.id} className="st-card animate-fade-in p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{s.fromName}</span> chia sẻ{" "}
                    {isTrack ? "một bài" : "một playlist"} · {timeAgo(s.createdAt)}
                  </p>
                  {!s.read ? <span className="st-chip !bg-brand-600/15 !text-brand-500">Mới</span> : null}
                </div>

                {isTrack && track ? (
                  <div className="flex items-center gap-3">
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-white/10">
                      {track.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{track.title}</p>
                      <p className="truncate text-xs text-slate-500">{track.uploader || "—"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => playTrack(track, [track])} className="st-btn-primary !px-3">
                        Phát
                      </button>
                      <TrackMenu track={track} removeLabel="Bỏ qua" onRemove={() => void deleteShare(s.id)} />
                    </div>
                  </div>
                ) : playlist ? (
                  <div className="flex items-center gap-3">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-brand-600/10">
                      <Heart className="text-brand-500" width={20} height={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{playlist.name}</p>
                      <p className="text-xs text-slate-500">{playlist.items?.length || 0} bài</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={async () => {
                          setImporting(s.id);
                          try {
                            await importPlaylist(playlist.name, playlist.items || []);
                            await deleteShare(s.id);
                          } finally {
                            setImporting(null);
                          }
                        }}
                        disabled={importing === s.id}
                        className="st-btn-primary !px-3"
                      >
                        <Plus width={16} height={16} /> Nhập
                      </button>
                      <button
                        onClick={() => void deleteShare(s.id)}
                        className="st-btn-ghost !px-2 !text-red-500"
                        title="Xoá"
                      >
                        <Trash width={16} height={16} />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
