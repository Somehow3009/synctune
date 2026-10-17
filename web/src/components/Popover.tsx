"use client";

import { useEffect, useRef, useState } from "react";

export function Popover({
  trigger,
  children,
  align = "right",
  className,
}: {
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <span onClick={() => setOpen((o) => !o)} className="inline-flex">
        {trigger}
      </span>
      {open ? (
        <div
          className={`absolute z-40 mt-1 w-56 origin-top rounded-xl border border-slate-200 bg-white p-1 shadow-2xl dark:border-white/10 dark:bg-[#16161f] ${
            align === "right" ? "right-0" : "left-0"
          } ${className || ""}`}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
