"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { uid } from "@/lib/utils";
import { Users } from "@/components/Icons";

export default function PartyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6">
      <header className="text-center">
        <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600/10 text-brand-600 dark:text-brand-300">
          <Users width={28} height={28} />
        </span>
        <h1 className="text-2xl font-bold">Xem / Nghe chung</h1>
        <p className="text-sm text-slate-500">
          Cùng xem một video, đồng bộ play/pause/tua, trò chuyện bằng chữ và giọng nói.
        </p>
      </header>

      <div className="st-card space-y-4 p-5">
        <button
          onClick={() => router.push(`/party/${uid().slice(0, 8)}`)}
          className="st-btn-primary w-full !py-3"
        >
          <Plus /> Tạo phòng mới
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
          hoặc
          <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim();
            if (c) router.push(`/party/${c}`);
          }}
          className="flex gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Nhập mã phòng"
            className="st-input"
          />
          <button type="submit" className="st-btn-ghost shrink-0">
            Vào phòng
          </button>
        </form>

        <p className="text-xs text-slate-500">
          Sau khi vào phòng, bấm “Chép link phòng” và gửi cho người kia. Bật thoại để nói chuyện. Kết nối thoại
          dùng WebRTC ngang hàng; nếu mạng khó (NAT), hãy thử lại hoặc dùng mạng khác.
        </p>
      </div>
    </div>
  );
}

function Plus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}
