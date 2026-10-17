"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { PartyRoom } from "@/components/PartyRoom";

export default function PartyRoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params?.id || "";
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Phòng xem chung</h1>
          <p className="truncate text-xs text-slate-500">Mã phòng: {roomId}</p>
        </div>
        <Link href="/party" className="st-btn-ghost">
          Rời phòng
        </Link>
      </header>
      <PartyRoom roomId={roomId} user={user} />
    </div>
  );
}
