"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Sidebar, useNavItems } from "./Sidebar";
import { MiniPlayer } from "./MiniPlayer";
import { FullPlayer } from "./FullPlayer";
import { Moon, Sun } from "./Icons";

function MobileTopBar() {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-[#0b0b12]/80 md:hidden">
      <Link href="/" className="flex items-center gap-2 font-bold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        SyncTune
      </Link>
      <button onClick={toggle} className="st-btn-ghost !px-2" aria-label="Đổi giao diện">
        {theme === "dark" ? <Sun width={18} height={18} /> : <Moon width={18} height={18} />}
      </button>
    </header>
  );
}

function MobileNav() {
  const pathname = usePathname();
  const items = useNavItems();
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 px-1 backdrop-blur dark:border-white/10 dark:bg-[#0b0b12]/95 md:hidden">
      {items.map(({ href, label, icon: Icon, badge }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium",
              active ? "text-brand-600 dark:text-brand-300" : "text-slate-500"
            )}
          >
            <Icon width={20} height={20} />
            {label}
            {badge ? (
              <span className="absolute right-1/4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[9px] font-bold text-white">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="flex-1 px-4 pb-40 pt-4 md:px-8 md:pb-32 md:pt-8">{children}</main>
      </div>
      <MiniPlayer />
      <FullPlayer />
      <MobileNav />
    </div>
  );
}
