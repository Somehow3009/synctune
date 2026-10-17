"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useLibrary } from "@/context/LibraryContext";
import { useProfiles } from "@/hooks/useProfiles";
import { downloadJson, timeAgo, uid } from "@/lib/utils";
import { Library, Plus, Download, Upload, Share, Trash } from "@/components/Icons";
import { Popover } from "@/components/Popover";
import type { Playlist, Track } from "@/lib/types";

export default function LibraryPage() {
  const { playlists, createPlaylist, renamePlaylist, deletePlaylist, importPlaylist, sendShare, loading, error } =
    useLibrary();
  const profiles = useProfiles();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleCreate() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await createPlaylist(n);
      setName("");
    } finally {
      setBusy(false);
    }
  }

  function handleExport() {
    downloadJson(`synctune-playlists-${Date.now()}.json`, {
      app: "SyncTune",
      version: 1,
      exportedAt: new Date().toISOString(),
      playlists,
    });
  }

  async function handleImport(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const list: Playlist[] = Array.isArray(data) ? data : data.playlists || [];
      for (const p of list) {
        const items: Track[] = (p.items || []).map((t) => ({ ...t, id: t.id || uid() }));
        await importPlaylist(p.name || "Playlist nhập", items);
      }
    } catch (e) {
      alert(`Nhập thất bại: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Thư viện</h1>
          <p className="text-sm text-slate-500">{playlists.length} playlist</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="st-btn-ghost" disabled={!playlists.length}>
            <Download width={16} height={16} /> Xuất JSON
          </button>
          <button onClick={() => fileRef.current?.click()} className="st-btn-ghost" disabled={busy}>
            <Upload width={16} height={16} /> Nhập JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="st-card flex gap-2 p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên playlist mới (Nhạc TikTok, Truyện, Hài...)"
          className="st-input"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <button onClick={() => void handleCreate()} className="st-btn-primary shrink-0" disabled={busy}>
          <Plus width={16} height={16} /> Tạo
        </button>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {loading && !playlists.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="st-card h-40 animate-pulse" />
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <div className="st-card flex flex-col items-center gap-2 p-10 text-center">
          <Library className="text-slate-400" width={30} height={30} />
          <p className="text-sm text-slate-500">Thư viện trống. Tạo playlist ở trên để bắt đầu.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {playlists.map((p) => (
            <div key={p.id} className="st-card group relative overflow-hidden">
              <Link href={`/playlist/${p.id}`} className="block">
                <span className="flex h-24 items-center justify-center bg-gradient-to-br from-brand-600/20 to-brand-400/10">
                  <Library className="text-brand-600 dark:text-brand-300" width={26} height={26} />
                </span>
                <span className="block p-3">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-slate-500">
                    {p.items.length} bài · {timeAgo(p.updatedAt)}
                  </span>
                </span>
              </Link>
              <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Popover
                  align="right"
                  trigger={
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-black/40 text-white" role="button">
                      <Share width={16} height={16} />
                    </span>
                  }
                >
                  {(close) => (
                    <div className="text-sm">
                      <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Chia sẻ playlist
                      </p>
                      <button
                        onClick={async () => {
                          await sendShare("playlist", p, null);
                          close();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                      >
                        <Share width={16} height={16} /> Gửi cho tất cả
                      </button>
                      {profiles.map((pr) => (
                        <button
                          key={pr.id}
                          onClick={async () => {
                            await sendShare("playlist", p, pr.id);
                            close();
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                          {pr.name}
                        </button>
                      ))}
                    </div>
                  )}
                </Popover>
                <button
                  onClick={() => {
                    const n = prompt("Đổi tên playlist", p.name);
                    if (n && n.trim()) void renamePlaylist(p.id, n.trim());
                  }}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-black/40 text-white"
                  title="Đổi tên"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Xoá playlist “${p.name}”?`)) void deletePlaylist(p.id);
                  }}
                  className="grid h-8 w-8 place-items-center rounded-lg bg-black/40 text-white"
                  title="Xoá"
                >
                  <Trash width={16} height={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
