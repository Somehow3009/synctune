"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Headphones, Mail, Moon, Sun } from "@/components/Icons";

type Mode = "signin" | "signup" | "magic";

export default function LoginPage() {
  const { user, loading, signIn, signUp, signInWithMagicLink, mode } = useAuth();
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const [tab, setTab] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (tab === "signin") {
        await signIn(email.trim(), password);
      } else if (tab === "signup") {
        await signUp(email.trim(), password, name.trim());
      } else {
        await signInWithMagicLink(email.trim());
        if (mode === "supabase") {
          setInfo("Đã gửi magic link. Kiểm tra hộp thư để đăng nhập.");
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4 dark:from-[#0b0b12] dark:to-[#141428]">
      <button onClick={toggle} className="st-btn-ghost absolute right-4 top-4 !px-2" aria-label="Đổi giao diện">
        {theme === "dark" ? <Sun width={18} height={18} /> : <Moon width={18} height={18} />}
      </button>

      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg">
            <Headphones width={28} height={28} />
          </span>
          <h1 className="text-2xl font-bold">SyncTune</h1>
          <p className="text-center text-sm text-slate-500">
            Nghe YouTube &amp; TikTok theo cách của bạn
          </p>
        </div>

        <div className="st-card p-5 shadow-xl">
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
            {(["signin", "signup", "magic"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setTab(m);
                  setError(null);
                  setInfo(null);
                }}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                  tab === m ? "bg-white shadow dark:bg-white/10" : "text-slate-500"
                )}
              >
                {m === "signin" ? "Đăng nhập" : m === "signup" ? "Đăng ký" : "Magic link"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {tab === "signup" ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Tên hiển thị</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="st-input"
                  placeholder="Ví dụ: Khang"
                  autoComplete="name"
                />
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="st-input"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>

            {tab !== "magic" ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Mật khẩu</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="st-input"
                  placeholder="Ít nhất 6 ký tự"
                  autoComplete={tab === "signup" ? "new-password" : "current-password"}
                />
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {info ? <p className="text-sm text-emerald-500">{info}</p> : null}

            <button type="submit" disabled={busy} className="st-btn-primary w-full">
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : tab === "signin" ? (
                "Đăng nhập"
              ) : tab === "signup" ? (
                "Tạo tài khoản"
              ) : (
                <>
                  <Mail width={16} height={16} /> Gửi magic link
                </>
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            Chế độ dữ liệu:{" "}
            <span className={cn("font-medium", mode === "supabase" ? "text-emerald-500" : "text-amber-500")}>
              {mode === "supabase" ? "Supabase" : "Local (trình duyệt)"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
