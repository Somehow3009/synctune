"use client";

import { usePlayer } from "@/context/PlayerContext";
import { cn, formatTime } from "@/lib/utils";
import { ChevronDown, ChevronUp, Close, Grip, Trash } from "./Icons";

export function QueuePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { queue, index, current, playQueue, removeFromQueue, moveInQueue, clearQueue } = usePlayer();

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-[60] bg-black/50 transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />
      <div
        className={cn(
          "fixed bottom-0 right-0 top-0 z-[61] flex w-full max-w-md flex-col border-l border-slate-200 bg-white transition-transform duration-300 dark:border-white/10 dark:bg-[#101018]",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
          <div>
            <h2 className="font-semibold">Hàng đợi</h2>
            <p className="text-xs text-slate-500">{queue.length} mục</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={clearQueue} className="st-btn-ghost !px-2" title="Xoá hàng đợi">
              <Trash width={16} height={16} />
            </button>
            <button onClick={onClose} className="st-btn-ghost !px-2" title="Đóng">
              <ChevronDown width={18} height={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {queue.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">Hàng đợi trống</p>
          ) : (
            queue.map((t, i) => (
              <div
                key={`${t.id}-${i}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  if (!isNaN(from) && from !== i) moveInQueue(from, i);
                }}
                className={cn(
                  "group flex items-center gap-2 rounded-xl px-2 py-1.5",
                  i === index ? "bg-brand-600/10" : "hover:bg-slate-100 dark:hover:bg-white/5"
                )}
              >
                <span className="cursor-grab text-slate-400">
                  <Grip width={16} height={16} />
                </span>
                <button
                  onClick={() => playQueue(queue, i)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-white/10">
                    {t.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm",
                        i === index ? "font-semibold text-brand-600 dark:text-brand-300" : "font-medium"
                      )}
                    >
                      {t.title}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{t.uploader || "—"}</span>
                  </span>
                </button>
                <span className="hidden text-xs tabular-nums text-slate-500 sm:block">
                  {formatTime(t.duration)}
                </span>
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
                <button
                  onClick={() => removeFromQueue(i)}
                  className="st-btn-ghost !px-1.5 opacity-60 transition-opacity hover:opacity-100"
                  title="Xoá khỏi hàng đợi"
                >
                  <Close width={16} height={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {current ? (
          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-white/10">
            Đang phát: <span className="font-medium text-slate-700 dark:text-slate-200">{current.title}</span>
          </div>
        ) : null}
      </div>
    </>
  );
}
