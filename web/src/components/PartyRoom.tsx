"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveStream } from "@/lib/api";
import { getPeerId } from "@/lib/realtime";
import { proxyStreamUrl, formatTime, isSupportedUrl } from "@/lib/utils";
import { useParty } from "@/hooks/useParty";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import {
  ChevronDown,
  ChevronUp,
  Headphones,
  Link as LinkIcon,
  Mic,
  MicOff,
  Next,
  Pause,
  Play,
  Plus,
  Send,
  Trash,
  Users,
} from "@/components/Icons";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

export function PartyRoom({ roomId, user }: { roomId: string; user: Profile }) {
  const peerId = getPeerId();
  const party = useParty({ roomId, user, peerId });
  const {
    connected,
    participants,
    messages,
    queue,
    sync,
    sendChat,
    updateSync,
    addToQueue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setMuted,
    channelRef,
  } = party;

  const videoRef = useRef<HTMLVideoElement>(null);
  const loadedUrlRef = useRef<string | null>(null);
  const syncRef = useRef(sync);
  const resolvingRef = useRef<string | null>(null);

  const [urlInput, setUrlInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [copied, setCopied] = useState(false);

  const peers = participants.map((p) => p.peerId).filter((p) => p !== peerId);
  const voice = useVoiceChat({ channel: channelRef.current, peerId, peers, enabled: voiceEnabled });

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  useEffect(() => {
    setMuted(!voiceEnabled);
  }, [voiceEnabled, setMuted]);

  const applySync = useCallback((s: NonNullable<typeof sync>) => {
    const el = videoRef.current;
    if (!el) return;
    const target = s.position + (s.playing ? (Date.now() - s.at) / 1000 : 0);
    if (Number.isFinite(target) && Math.abs(el.currentTime - target) > 0.8) {
      el.currentTime = Math.max(0, target);
    }
    if (s.playing && el.paused) el.play().catch(() => undefined);
    if (!s.playing && !el.paused) el.pause();
  }, []);

  /* load media when the shared url changes */
  useEffect(() => {
    if (!sync?.url) return;
    if (loadedUrlRef.current === sync.url) {
      applySync(sync);
      return;
    }
    if (resolvingRef.current === sync.url) return;
    resolvingRef.current = sync.url;
    const el = videoRef.current;
    setStatus("Đang tải luồng...");
    resolveStream(sync.url)
      .then((data) => {
        if (resolvingRef.current !== sync.url) return;
        const fmt = data.video || data.audio;
        if (!fmt?.url) throw new Error("Không có luồng phát");
        if (el) {
          el.src = proxyStreamUrl(fmt.url);
          loadedUrlRef.current = sync.url;
        }
        setStatus(null);
        setTimeout(() => applySync(syncRef.current!), 300);
      })
      .catch((e: Error) => setStatus(e.message));
  }, [sync, applySync]);

  /* periodic drift correction against the latest shared state */
  useEffect(() => {
    const t = setInterval(() => {
      const el = videoRef.current;
      const s = syncRef.current;
      if (!el || !s || !loadedUrlRef.current) return;
      if (!s.playing) return;
      const target = s.position + (Date.now() - s.at) / 1000;
      if (Number.isFinite(target) && Math.abs(el.currentTime - target) > 1.5) {
        el.currentTime = Math.max(0, target);
      }
    }, 4000);
    return () => clearInterval(t);
  }, []);

  function togglePlay() {
    const el = videoRef.current;
    if (!el || !sync?.url) return;
    if (el.paused) {
      void el.play();
      updateSync({ url: sync.url, playing: true, position: el.currentTime });
    } else {
      el.pause();
      updateSync({ url: sync.url, playing: false, position: el.currentTime });
    }
  }

  function seekBy(delta: number) {
    const el = videoRef.current;
    if (!el || !sync?.url) return;
    const pos = Math.max(0, el.currentTime + delta);
    el.currentTime = pos;
    updateSync({ url: sync.url, position: pos, playing: !el.paused });
  }

  function playQueueItem(index: number) {
    const item = queue[index];
    if (!item) return;
    updateSync({ url: item.url, title: item.title, thumbnail: item.thumbnail ?? null, position: 0, playing: true });
  }

  async function addVideo(url: string, playNow: boolean) {
    const u = url.trim();
    if (!u || !isSupportedUrl(u)) {
      setStatus("Link không hợp lệ");
      return;
    }
    setStatus("Đang lấy thông tin...");
    try {
      const data = await resolveStream(u);
      const item = addToQueue({
        url: data.webpage_url,
        title: data.title,
        thumbnail: data.thumbnail ?? null,
      });
      setUrlInput("");
      setStatus(null);
      if (playNow || !sync?.url) {
        updateSync({
          url: item.url,
          title: item.title,
          thumbnail: item.thumbnail ?? null,
          position: 0,
          playing: true,
        });
      }
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  const roomLink = typeof window !== "undefined" ? `${window.location.origin}/party/${roomId}` : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg">
          <video ref={videoRef} playsInline className="h-full w-full object-contain" />
          {!sync?.url ? (
            <div className="absolute inset-0 grid place-items-center text-center text-white/60">
              <div className="space-y-2 p-6">
                <Users width={36} height={36} className="mx-auto" />
                <p className="text-sm">Chưa có video. Dán link hoặc chọn từ hàng đợi bên dưới.</p>
              </div>
            </div>
          ) : null}
          {status ? (
            <div className="absolute inset-x-4 bottom-4 rounded-xl bg-black/70 px-3 py-2 text-center text-xs text-white">
              {status}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => seekBy(-10)} className="st-btn-ghost">
            -10s
          </button>
          <button onClick={togglePlay} className="grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white">
            {sync?.playing ? <Pause /> : <Play />}
          </button>
          <button onClick={() => seekBy(10)} className="st-btn-ghost">
            +10s
          </button>
        </div>

        <div className="st-card p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width={16} height={16} />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Dán link YouTube/TikTok để thêm vào phòng"
                className="st-input !pl-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addVideo(urlInput, false);
                }}
              />
            </div>
            <button onClick={() => void addVideo(urlInput, false)} className="st-btn-ghost shrink-0">
              <Plus width={16} height={16} /> Hàng đợi
            </button>
            <button onClick={() => void addVideo(urlInput, true)} className="st-btn-primary shrink-0">
              Phát ngay
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hàng đợi chung</p>
            {queue.length ? (
              <button onClick={clearQueue} className="st-btn-ghost !px-2 !py-1 !text-xs">
                <Trash width={14} height={14} /> Xoá
              </button>
            ) : null}
          </div>
          <div className="mt-1 max-h-48 space-y-1 overflow-y-auto">
            {queue.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">Trống</p>
            ) : (
              queue.map((q, i) => (
                <div
                  key={q.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5",
                    sync?.url === q.url ? "bg-brand-600/10" : "hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <button onClick={() => playQueueItem(i)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="h-9 w-12 shrink-0 overflow-hidden rounded bg-slate-200 dark:bg-white/10">
                      {q.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={q.thumbnail} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{q.title}</span>
                      <span className="block truncate text-xs text-slate-500">bởi {q.addedBy}</span>
                    </span>
                  </button>
                  <div className="flex flex-col">
                    <button
                      onClick={() => i > 0 && moveInQueue(i, i - 1)}
                      disabled={i === 0}
                      className="grid h-5 w-6 place-items-center rounded text-slate-400 hover:bg-slate-200/70 disabled:opacity-30 dark:hover:bg-white/10"
                      title="Lên"
                    >
                      <ChevronUp width={15} height={15} />
                    </button>
                    <button
                      onClick={() => i < queue.length - 1 && moveInQueue(i, i + 1)}
                      disabled={i === queue.length - 1}
                      className="grid h-5 w-6 place-items-center rounded text-slate-400 hover:bg-slate-200/70 disabled:opacity-30 dark:hover:bg-white/10"
                      title="Xuống"
                    >
                      <ChevronDown width={15} height={15} />
                    </button>
                  </div>
                  <button onClick={() => removeFromQueue(q.id)} className="st-btn-ghost !px-1.5 !py-1">
                    <Trash width={14} height={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="st-card flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setVoiceEnabled((v) => !v)}
              className={cn("st-btn", voiceEnabled ? "bg-emerald-600 text-white" : "st-btn-primary")}
            >
              {voiceEnabled ? <Mic width={16} height={16} /> : <MicOff width={16} height={16} />}
              {voiceEnabled ? "Đang bật thoại" : "Bật thoại"}
            </button>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(roomLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="st-btn-ghost"
            >
              {copied ? "Đã chép link!" : "Chép link phòng"}
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-500" : "bg-amber-500")} />
            <span className="text-xs text-slate-500">{participants.length} người</span>
          </div>
          {voice.error ? <p className="w-full text-xs text-red-500">{voice.error}</p> : null}
        </div>
      </div>

      <div className="st-card flex h-[70vh] flex-col lg:h-[calc(100vh-9rem)]">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <p className="text-sm font-semibold">Trong phòng</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {participants.map((p) => (
              <span key={p.peerId} className="st-chip">
                {p.muted ? <MicOff width={12} height={12} /> : <Mic width={12} height={12} />}
                {p.name}
                {p.peerId === peerId ? " (bạn)" : ""}
              </span>
            ))}
            {participants.length === 0 ? <span className="text-xs text-slate-500">Đang kết nối...</span> : null}
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Chưa có tin nhắn</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col", m.userId === user.id && "items-end")}>
                <span className="text-[10px] text-slate-500">{m.name}</span>
                <span
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm",
                    m.userId === user.id
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 dark:bg-white/10"
                  )}
                >
                  {m.text}
                </span>
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendChat(chatInput);
            setChatInput("");
          }}
          className="flex gap-2 border-t border-slate-200 p-3 dark:border-white/10"
        >
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Nhập tin nhắn..."
            className="st-input"
          />
          <button type="submit" className="st-btn-primary shrink-0 !px-3">
            <Send width={16} height={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

export function PartyHint() {
  return (
    <div className="st-card flex items-center gap-3 p-4 text-sm text-slate-500">
      <Headphones width={20} height={20} />
      Mẹo: bật thoại để nói chuyện với nhau trong khi xem.
    </div>
  );
}

export function PartyProgress({ position, duration }: { position: number; duration: number }) {
  return (
    <span className="text-xs tabular-nums text-slate-500">
      {formatTime(position)} / {formatTime(duration)}
    </span>
  );
}

export function PartyNextButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="st-btn-ghost">
      <Next width={16} height={16} />
    </button>
  );
}
