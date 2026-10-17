"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL, SUPABASE_ENABLED } from "@/lib/config";
import { checkHealth } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useLibrary } from "@/context/LibraryContext";
import { downloadJson } from "@/lib/utils";
import { Download, Logout, Moon, Sun } from "@/components/Icons";

export default function SettingsPage() {
  const { user, mode, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { playlists } = useLibrary();
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    let active = true;
    checkHealth().then((ok) => active && setHealth(ok ? "ok" : "down"));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Cài đặt</h1>

      <section className="st-card divide-y divide-slate-200 dark:divide-white/10">
        <Row label="Tài khoản" value={user?.email || user?.name || "—"} />
        <Row label="Chế độ dữ liệu" value={mode === "supabase" ? "Supabase (đồng bộ)" : "Local (trình duyệt)"} />
        <Row label="Backend API" value={API_URL} />
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-slate-500">Trạng thái backend</span>
          <span
            className={
              health === "ok"
                ? "text-sm font-medium text-emerald-500"
                : health === "down"
                  ? "text-sm font-medium text-red-500"
                  : "text-sm text-slate-400"
            }
          >
            {health === "checking" ? "Đang kiểm tra..." : health === "ok" ? "Hoạt động" : "Không kết nối"}
          </span>
        </div>
      </section>

      <section className="st-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Giao diện</h2>
        <button onClick={toggle} className="st-btn-ghost w-full justify-between">
          <span className="flex items-center gap-2">
            {theme === "dark" ? <Moon width={16} height={16} /> : <Sun width={16} height={16} />}
            Chế độ {theme === "dark" ? "tối" : "sáng"}
          </span>
          <span className="st-chip">Bấm để đổi</span>
        </button>
      </section>

      <section className="st-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Dữ liệu</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              downloadJson(`synctune-backup-${Date.now()}.json`, {
                app: "SyncTune",
                version: 1,
                exportedAt: new Date().toISOString(),
                playlists,
              })
            }
            className="st-btn-ghost"
            disabled={!playlists.length}
          >
            <Download width={16} height={16} /> Xuất toàn bộ playlist
          </button>
          <Link href="/library" className="st-btn-ghost">
            Nhập / quản lý ở Thư viện
          </Link>
        </div>
      </section>

      <section className="st-card p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Cài như ứng dụng (PWA)</h2>
        <p className="text-sm text-slate-500">
          Trên iPhone: mở bằng Safari → nút Chia sẻ → “Thêm vào Màn hình chính”. Trên máy tính: bấm biểu tượng cài đặt
          trên thanh địa chỉ. Sau khi cài, nhạc tiếp tục phát khi tắt màn hình.
        </p>
      </section>

      <section className="st-card p-4">
        <button onClick={() => void signOut()} className="st-btn-ghost w-full justify-center !text-red-500">
          <Logout width={16} height={16} /> Đăng xuất
        </button>
      </section>

      {!SUPABASE_ENABLED ? (
        <p className="text-center text-xs text-slate-500">
          Đang chạy chế độ Local. Điền NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY để đồng bộ 2 người.
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}
