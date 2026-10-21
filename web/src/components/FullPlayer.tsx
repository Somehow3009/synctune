"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { cn, formatTime } from "@/lib/utils";
import {
  ChevronDown,
  Headphones,
  Next,
  Pause,
  Play,
  Prev,
  Queue,
  Repeat,
  RepeatOne,
  Shuffle,
  VideoIcon,
  Volume,
  VolumeX,
} from "./Icons";
import { QueuePanel } from "./QueuePanel";
import { YouTubePlayer } from "./YouTubePlayer";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export function FullPlayer() {
  const {
    mediaRef,
    embedRef,
    isEmbed,
    embedVideoId,
    embedStart,
    onEmbedReady,
    onEmbedState,
    onEmbedProgress,
    onEmbedError,
    current,
    resolved,
    expanded,
    setExpanded,
    playing,
    toggle,
    next,
    prev,
    position,
    duration,
    seek,
    speed,
    setSpeed,
    volume,
    setVolume,
    muted,
    toggleMute,
    shuffle,
    toggleShuffle,
    repeat,
    cycleRepeat,
    audioOnly,
    setAudioOnly,
    loading,
    error,
  } = usePlayer();

  const [queueOpen, setQueueOpen] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);

  useEffect(() => {
    if (!expanded) setSpeedOpen(false);
  }, [expanded]);

  const showArtwork = audioOnly || (!isEmbed && !resolved?.video);
  const pct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-slate-900 via-[#0e0e17] to-black text-white transition-all duration-300",
        expanded ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      )}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={() => setExpanded(false)} className="st-btn-ghost !text-white/80 hover:!bg-white/10" aria-label="Thu nhỏ">
          <ChevronDown />
        </button>
        <p className="text-xs uppercase tracking-widest text-white/50">Đang phát</p>
        <button onClick={() => setQueueOpen(true)} className="st-btn-ghost !text-white/80 hover:!bg-white/10" aria-label="Hàng đợi">
          <Queue />
        </button>
      </div>

      {/* Surface */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-4">
        <div className="relative flex aspect-video w-full max-w-3xl items-center justify-center overflow-hidden rounded-3xl bg-black/60 shadow-2xl">
          <video
            ref={mediaRef}
            playsInline
            className={cn(
              "h-full w-full object-contain",
              (showArtwork || isEmbed || (audioOnly && !!resolved?.audio?.url)) && "opacity-0"
            )}
          />
          {isEmbed ? (
            <YouTubePlayer
              ref={embedRef}
              videoId={embedVideoId}
              startSeconds={embedStart}
              className={cn(
                "absolute inset-0 h-full w-full",
                audioOnly && "pointer-events-none opacity-0"
              )}
              onReady={onEmbedReady}
              onState={onEmbedState}
              onProgress={onEmbedProgress}
              onError={onEmbedError}
            />
          ) : null}
          {showArtwork ? (
            <div className="absolute inset-0 grid place-items-center p-8">
              {current?.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.thumbnail}
                  alt=""
                  className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
                />
              ) : (
                <span className="grid h-40 w-40 place-items-center rounded-3xl bg-white/5 text-white/30">
                  <Headphones width={64} height={64} />
                </span>
              )}
            </div>
          ) : null}
          {loading ? (
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          ) : null}
          {error && !loading ? (
            <div className="absolute inset-x-4 bottom-4 rounded-xl bg-red-500/20 px-3 py-2 text-center text-xs text-red-200">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      {/* Track info + controls */}
      <div className="mx-auto w-full max-w-3xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 text-center">
          <h1 className="line-clamp-2 text-lg font-semibold">{current?.title || "Chưa chọn bài"}</h1>
          <p className="truncate text-sm text-white/60">{current?.uploader || "SyncTune"}</p>
          {isEmbed && audioOnly ? (
            <p className="mx-auto mt-1 max-w-md text-xs text-amber-300/80">
              YouTube không cho phát nền trên iPhone: nhạc sẽ dừng khi khoá màn hình hoặc chuyển app. Muốn nghe nền,
              hãy dùng nguồn có link audio trực tiếp.
            </p>
          ) : null}
        </div>

        <div className="mb-1 flex items-center gap-3">
          <span className="w-10 text-right text-xs tabular-nums text-white/60">{formatTime(position)}</span>
          <input
            type="range"
            className="st-range flex-1"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.5}
            value={Math.min(position, duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Tua"
          />
          <span className="w-10 text-xs tabular-nums text-white/60">{formatTime(duration)}</span>
        </div>

        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            onClick={() => toggleShuffle()}
            className={cn("st-btn-ghost !text-white/70 hover:!bg-white/10", shuffle && "!text-brand-400")}
            title="Phát ngẫu nhiên"
          >
            <Shuffle />
          </button>
          <button onClick={prev} className="st-btn-ghost !text-white hover:!bg-white/10" title="Bài trước">
            <Prev width={26} height={26} />
          </button>
          <button
            onClick={toggle}
            className="grid h-16 w-16 place-items-center rounded-full bg-brand-600 text-white transition hover:bg-brand-500"
            aria-label="Phát/Tạm dừng"
          >
            {playing ? <Pause width={26} height={26} /> : <Play width={26} height={26} />}
          </button>
          <button onClick={next} className="st-btn-ghost !text-white hover:!bg-white/10" title="Bài kế">
            <Next width={26} height={26} />
          </button>
          <button
            onClick={cycleRepeat}
            className={cn("st-btn-ghost !text-white/70 hover:!bg-white/10", repeat !== "off" && "!text-brand-400")}
            title="Lặp lại"
          >
            {repeat === "one" ? <RepeatOne /> : <Repeat />}
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setAudioOnly(!audioOnly)}
            className={cn("st-chip !bg-white/10 !text-white/80", audioOnly && "!bg-brand-600/30 !text-brand-200")}
            title="Chế độ"
          >
            {audioOnly ? <Headphones width={14} height={14} /> : <VideoIcon width={14} height={14} />}
            {audioOnly ? "Chỉ nghe" : "Video"}
          </button>

          <div className="relative">
            <button onClick={() => setSpeedOpen((s) => !s)} className="st-chip !bg-white/10 !text-white/80">
              {speed}x
            </button>
            {speedOpen ? (
              <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-xl border border-white/10 bg-[#16161f] p-1 shadow-xl">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSpeed(s);
                      setSpeedOpen(false);
                    }}
                    className={cn(
                      "block w-20 rounded-lg px-3 py-1.5 text-center text-sm hover:bg-white/10",
                      s === speed && "text-brand-400"
                    )}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="st-btn-ghost !text-white/70 hover:!bg-white/10" title="Tắt tiếng">
              {muted || volume === 0 ? <VolumeX width={18} height={18} /> : <Volume width={18} height={18} />}
            </button>
            <input
              type="range"
              className="st-range w-24"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Âm lượng"
            />
          </div>
        </div>
      </div>

      <QueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  );
}
