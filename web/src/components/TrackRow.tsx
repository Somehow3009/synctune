"use client";

import { usePlayer } from "@/context/PlayerContext";
import { cn, formatTime } from "@/lib/utils";
import { ChevronDown, ChevronUp, Grip } from "./Icons";
import { TrackMenu } from "./TrackMenu";
import type { Track } from "@/lib/types";

export function TrackRow({
  track,
  index,
  active,
  onPlay,
  onRemove,
  removeLabel,
  draggable,
  dragProps,
  onMoveUp,
  onMoveDown,
}: {
  track: Track;
  index?: number;
  active?: boolean;
  onPlay(): void;
  onRemove?(): void;
  removeLabel?: string;
  draggable?: boolean;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { playing } = usePlayer();

  return (
    <div
      {...(dragProps || {})}
      draggable={draggable}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-slate-100 dark:hover:bg-white/5",
        active && "bg-brand-600/10"
      )}
    >
      {draggable ? (
        <span className="hidden cursor-grab text-slate-400 sm:block">
          <Grip width={16} height={16} />
        </span>
      ) : index != null ? (
        <span className="w-5 text-center text-xs tabular-nums text-slate-400">{index + 1}</span>
      ) : null}

      <button onClick={onPlay} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-white/10">
          {track.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : null}
          <span
            className={cn(
              "absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100",
              active && playing && "opacity-100"
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm",
              active ? "font-semibold text-brand-600 dark:text-brand-300" : "font-medium"
            )}
          >
            {track.title}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {track.uploader || "—"}
            {track.source !== "other" ? ` · ${track.source === "youtube" ? "YouTube" : "TikTok"}` : ""}
          </span>
        </span>
      </button>

      <span className="hidden text-xs tabular-nums text-slate-500 sm:block">{formatTime(track.duration)}</span>

      {onMoveUp || onMoveDown ? (
        <div className="flex flex-col">
          <button
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="grid h-5 w-6 place-items-center rounded text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
            title="Lên"
          >
            <ChevronUp width={15} height={15} />
          </button>
          <button
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="grid h-5 w-6 place-items-center rounded text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
            title="Xuống"
          >
            <ChevronDown width={15} height={15} />
          </button>
        </div>
      ) : null}

      <TrackMenu track={track} onRemove={onRemove} removeLabel={removeLabel} />
    </div>
  );
}
