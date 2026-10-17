"use client";

import { usePlayer } from "@/context/PlayerContext";
import { formatTime } from "@/lib/utils";
import { ChevronUp, Next, Pause, Play, Prev } from "./Icons";

export function MiniPlayer() {
  const { current, playing, toggle, next, prev, position, duration, seek, setExpanded, loading, error } =
    usePlayer();

  if (!current) return null;
  const pct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-16 z-30 px-2 pb-2 md:bottom-0 md:px-4 md:pb-4">
      <div className="mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-[#141420]/95">
        <button
          onClick={() => setExpanded(true)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-200 dark:bg-white/10">
            {current.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.thumbnail} alt="" className="h-full w-full object-cover" />
            ) : null}
            {loading ? (
              <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{current.title}</span>
            <span className="block truncate text-xs text-slate-500">
              {error ? error : current.uploader || "SyncTune"}
            </span>
          </span>
        </button>

        <div className="hidden items-center gap-1 sm:flex">
          <button onClick={prev} className="st-btn-ghost !px-2" aria-label="Bài trước">
            <Prev width={18} height={18} />
          </button>
          <button
            onClick={toggle}
            className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-500"
            aria-label="Phát/Tạm dừng"
          >
            {playing ? <Pause width={18} height={18} /> : <Play width={18} height={18} />}
          </button>
          <button onClick={next} className="st-btn-ghost !px-2" aria-label="Bài kế">
            <Next width={18} height={18} />
          </button>
        </div>

        <button onClick={toggle} className="st-btn-ghost !px-2 sm:hidden" aria-label="Phát/Tạm dừng">
          {playing ? <Pause width={20} height={20} /> : <Play width={20} height={20} />}
        </button>

        <span className="hidden text-xs tabular-nums text-slate-500 md:block">
          {formatTime(position)} / {formatTime(duration)}
        </span>

        <button onClick={() => setExpanded(true)} className="st-btn-ghost !px-2" aria-label="Mở rộng">
          <ChevronUp width={18} height={18} />
        </button>
      </div>

      <div className="mx-auto mt-1 h-1 max-w-4xl overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.5}
        value={Math.min(position, duration || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        className="sr-only"
        aria-label="Tua"
      />
    </div>
  );
}
