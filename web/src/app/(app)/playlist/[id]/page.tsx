"use client";

import { useParams, useRouter } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayer } from "@/context/PlayerContext";
import { TrackRow } from "@/components/TrackRow";
import { Popover } from "@/components/Popover";
import { useProfiles } from "@/hooks/useProfiles";
import { downloadJson, timeAgo } from "@/lib/utils";
import { Download, Library, Plus, Share, Shuffle } from "@/components/Icons";
import type { Track } from "@/lib/types";

export default function PlaylistPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { playlists, renamePlaylist, deletePlaylist, removeTrack, reorder, sendShare } = useLibrary();
  const { playQueue, current, toggleShuffle } = usePlayer();
  const profiles = useProfiles();

  const playlist = playlists.find((p) => p.id === id);

  if (!playlist) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center text-sm text-slate-500">
        Không tìm thấy playlist.{" "}
        <button onClick={() => router.push("/library")} className="text-brand-500">
          Về thư viện
        </button>
      </div>
    );
  }

  const items = playlist.items;

  function move(from: number, to: number) {
    const ids = items.map((t) => t.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void reorder(playlist!.id, ids);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <span className="grid h-28 w-28 place-items-center rounded-2xl bg-gradient-to-br from-brand-600/30 to-brand-400/10">
          <Library className="text-brand-600 dark:text-brand-300" width={40} height={40} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-widest text-slate-500">Playlist</p>
          <h1 className="truncate text-2xl font-bold md:text-3xl">{playlist.name}</h1>
          <p className="text-sm text-slate-500">
            {items.length} bài · cập nhật {timeAgo(playlist.updatedAt)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => playQueue(items, 0)}
              disabled={!items.length}
              className="st-btn-primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Phát tất cả
            </button>
            <button
              onClick={() => {
                toggleShuffle();
                playQueue(items, Math.floor(Math.random() * Math.max(items.length, 1)));
              }}
              disabled={!items.length}
              className="st-btn-ghost"
            >
              <Shuffle width={16} height={16} /> Ngẫu nhiên
            </button>
            <button
              onClick={() => {
                const n = prompt("Đổi tên playlist", playlist.name);
                if (n && n.trim()) void renamePlaylist(playlist.id, n.trim());
              }}
              className="st-btn-ghost"
            >
              <Plus width={16} height={16} /> Đổi tên
            </button>
            <button
              onClick={() =>
                downloadJson(`synctune-${playlist.name.replace(/\s+/g, "-").toLowerCase()}.json`, {
                  app: "SyncTune",
                  version: 1,
                  playlists: [playlist],
                })
              }
              className="st-btn-ghost"
            >
              <Download width={16} height={16} /> Xuất
            </button>
            <Popover
              trigger={
                <span className="st-btn-ghost" role="button">
                  <Share width={16} height={16} /> Chia sẻ
                </span>
              }
            >
              {(close) => (
                <div className="text-sm">
                  <button
                    onClick={async () => {
                      await sendShare("playlist", playlist, null);
                      close();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    Gửi cho tất cả
                  </button>
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        await sendShare("playlist", playlist, p.id);
                        close();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <button
              onClick={() => {
                if (confirm(`Xoá playlist “${playlist.name}”?`)) {
                  void deletePlaylist(playlist.id).then(() => router.push("/library"));
                }
              }}
              className="st-btn-ghost !text-red-500 hover:!bg-red-500/10"
            >
              Xoá
            </button>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="st-card p-10 text-center text-sm text-slate-500">
          Playlist trống. Thêm bài từ Tìm kiếm hoặc Thêm link.
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((t: Track, i: number) => (
            <TrackRow
              key={t.id}
              track={t}
              index={i}
              active={current?.url === t.url}
              onPlay={() => playQueue(items, i)}
              onRemove={() => void removeTrack(playlist.id, t.id)}
              onMoveUp={i > 0 ? () => move(i, i - 1) : undefined}
              onMoveDown={i < items.length - 1 ? () => move(i, i + 1) : undefined}
              draggable
              dragProps={{
                onDragStart: (e) => e.dataTransfer.setData("text/plain", String(i)),
                onDragOver: (e) => e.preventDefault(),
                onDrop: (e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  if (!isNaN(from) && from !== i) move(from, i);
                },
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
