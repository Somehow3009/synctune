"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLibrary } from "@/context/LibraryContext";
import { usePlayer } from "@/context/PlayerContext";
import { formatTime, timeAgo } from "@/lib/utils";
import { Library, Plus, Search, Users } from "@/components/Icons";

export default function HomePage() {
  const { user } = useAuth();
  const { playlists } = useLibrary();
  const { history, playHistory } = usePlayer();
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Chào {user?.name?.split(" ")[0] || "bạn"} 👋</h1>
        <p className="text-sm text-slate-500">Nghe đúng gu của bạn, không quảng cáo.</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width={18} height={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm trên YouTube..."
            className="st-input !pl-10"
          />
        </div>
        <button type="submit" className="st-btn-primary">
          Tìm
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/search" className="st-card group flex items-center gap-3 p-4 transition hover:border-brand-500/50">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600/10 text-brand-600 dark:text-brand-300">
            <Search width={20} height={20} />
          </span>
          <div>
            <p className="font-medium">Tìm kiếm YouTube</p>
            <p className="text-xs text-slate-500">Phát ngay hoặc lưu lại</p>
          </div>
        </Link>
        <Link href="/add" className="st-card group flex items-center gap-3 p-4 transition hover:border-brand-500/50">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600/10 text-brand-600 dark:text-brand-300">
            <Plus width={20} height={20} />
          </span>
          <div>
            <p className="font-medium">Dán link TikTok / YouTube</p>
            <p className="text-xs text-slate-500">Tự lấy tiêu đề &amp; thumbnail</p>
          </div>
        </Link>
        <Link href="/party" className="st-card group flex items-center gap-3 p-4 transition hover:border-brand-500/50">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600/10 text-brand-600 dark:text-brand-300">
            <Users width={20} height={20} />
          </span>
          <div>
            <p className="font-medium">Xem chung</p>
            <p className="text-xs text-slate-500">Đồng bộ + chat + thoại</p>
          </div>
        </Link>
      </div>

      {history.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Nghe gần đây</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {history.slice(0, 12).map((t) => (
              <button
                key={`${t.id}-${t.addedAt}`}
                onClick={() => playHistory(t)}
                className="w-36 shrink-0 text-left"
              >
                <span className="block aspect-square overflow-hidden rounded-xl bg-slate-200 dark:bg-white/10">
                  {t.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="mt-1.5 block truncate text-sm font-medium">{t.title}</span>
                <span className="block truncate text-xs text-slate-500">
                  {t.uploader || formatTime(t.duration)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Playlist của bạn</h2>
          <Link href="/library" className="text-sm text-brand-600 dark:text-brand-300">
            Xem tất cả
          </Link>
        </div>
        {playlists.length === 0 ? (
          <div className="st-card flex flex-col items-center gap-2 p-8 text-center">
            <Library className="text-slate-400" width={28} height={28} />
            <p className="text-sm text-slate-500">Chưa có playlist nào. Tạo cái đầu tiên nhé!</p>
            <Link href="/library" className="st-btn-primary mt-1">
              <Plus width={16} height={16} /> Tạo playlist
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {playlists.slice(0, 8).map((p) => (
              <Link
                key={p.id}
                href={`/playlist/${p.id}`}
                className="st-card overflow-hidden transition hover:border-brand-500/50"
              >
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
