"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import {
  Heart,
  Home,
  Library,
  Link as LinkIcon,
  Logout,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
} from "./Icons";

const NAV = [
  { href: "/", label: "Trang chủ", icon: Home },
  { href: "/search", label: "Tìm kiếm", icon: Search },
  { href: "/library", label: "Thư viện", icon: Library },
  { href: "/add", label: "Thêm link", icon: LinkIcon },
  { href: "/shared", label: "Đã nhận", icon: Heart },
  { href: "/party", label: "Xem chung", icon: Users },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export interface NavItem {
  href: string;
  label: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element;
  badge?: number;
}

export function useNavItems(): NavItem[] {
  const { unreadShares } = useLibrary();
  return NAV.map((n) => (n.href === "/shared" ? { ...n, badge: unreadShares } : { ...n }));
}

export function Sidebar() {
  const pathname = usePathname();
  const items = useNavItems();
  const { user, signOut, mode } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white/60 px-4 py-5 dark:border-white/10 dark:bg-white/[0.02] md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-white">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <span className="text-lg font-bold tracking-tight">SyncTune</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-600/10 text-brand-600 dark:text-brand-300"
                  : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              <Icon width={18} height={18} />
              <span className="flex-1">{label}</span>
              {badge ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-white/10">
        <div className="mb-2 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600/20 text-sm font-semibold text-brand-600 dark:text-brand-300">
            {(user?.name || "?").charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">
              {user?.email} · {mode === "local" ? "Local" : "Supabase"}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={toggle} className="st-btn-ghost flex-1" title="Đổi giao diện">
            {theme === "dark" ? <Sun width={16} height={16} /> : <Moon width={16} height={16} />}
            <span className="text-xs">{theme === "dark" ? "Sáng" : "Tối"}</span>
          </button>
          <button onClick={() => void signOut()} className="st-btn-ghost flex-1" title="Đăng xuất">
            <Logout width={16} height={16} />
            <span className="text-xs">Thoát</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
