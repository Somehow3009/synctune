"use client";

import { useState } from "react";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayer } from "@/context/PlayerContext";
import { useProfiles } from "@/hooks/useProfiles";
import { cn } from "@/lib/utils";
import { Popover } from "./Popover";
import { Plus, Queue, Share, Trash } from "./Icons";
import type { Track } from "@/lib/types";

type View = "main" | "share";

export function TrackMenu({
  track,
  onRemove,
  removeLabel = "Xoá khỏi playlist",
  trigger,
}: {
  track: Track;
  onRemove?: () => void;
  removeLabel?: string;
  trigger?: React.ReactNode;
}) {
  const { playlists, addTrack, createPlaylist, sendShare } = useLibrary();
  const { playNext, addToQueue } = usePlayer();
  const profiles = useProfiles();
  const [view, setView] = useState<View>("main");
  const [newName, setNewName] = useState("");
  const [added, setAdded] = useState<string | null>(null);

  async function handleAdd(playlistId: string, name: string) {
    await addTrack(playlistId, track);
    setAdded(name);
    setTimeout(() => setAdded(null), 1500);
  }

  async function handleCreateAndAdd() {
    const name = newName.trim();
    if (!name) return;
    const created = await createPlaylist(name);
    if (created) {
      await addTrack(created.id, track);
      setNewName("");
      setAdded(created.name);
      setTimeout(() => setAdded(null), 1500);
    }
  }

  return (
    <Popover
      align="right"
      trigger={
        trigger ?? (
          <span className="st-btn-ghost !px-2" role="button" aria-label="Tuỳ chọn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </span>
        )
      }
    >
      {(close) => (
        <div className="text-sm">
          {added ? (
            <p className="px-3 py-2 text-xs text-emerald-500">Đã thêm vào “{added}”</p>
          ) : null}

          {view === "main" ? (
            <>
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Thêm vào playlist
              </p>
              <div className="max-h-40 overflow-y-auto">
                {playlists.length === 0 ? (
                  <p className="px-3 py-1 text-xs text-slate-500">Chưa có playlist nào</p>
                ) : (
                  playlists.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => void handleAdd(p.id, p.name)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-xs text-slate-400">{p.items.length}</span>
                    </button>
                  ))
                )}
              </div>

              <div className="mt-1 flex items-center gap-1 border-t border-slate-200 px-2 py-1.5 dark:border-white/10">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Playlist mới..."
                  className="st-input !py-1.5 !text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreateAndAdd();
                  }}
                />
                <button onClick={() => void handleCreateAndAdd()} className="st-btn-primary !px-2 !py-1.5">
                  <Plus width={14} height={14} />
                </button>
              </div>

              <div className="mt-1 border-t border-slate-200 pt-1 dark:border-white/10">
                <button
                  onClick={() => {
                    playNext(track);
                    close();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <Play size={16} />
                  Phát tiếp theo
                </button>
                <button
                  onClick={() => {
                    addToQueue(track);
                    close();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <Queue width={16} height={16} />
                  Thêm vào hàng đợi
                </button>
                <button
                  onClick={() => setView("share")}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <Share width={16} height={16} />
                  Chia sẻ
                </button>
                {onRemove ? (
                  <button
                    onClick={() => {
                      onRemove();
                      close();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-500 hover:bg-red-500/10"
                  >
                    <Trash width={16} height={16} />
                    {removeLabel}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <div>
              <button
                onClick={() => setView("main")}
                className="mb-1 px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                ← Quay lại
              </button>
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Gửi cho
              </p>
              <button
                onClick={async () => {
                  await sendShare("track", track, null);
                  close();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <Share width={16} height={16} />
                Gửi cho tất cả
              </button>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={async () => {
                    await sendShare("track", track, p.id);
                    close();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <span
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-full bg-brand-600/20 text-xs font-semibold text-brand-600 dark:text-brand-300"
                    )}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}

function Play({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
