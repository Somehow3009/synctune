"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SUPABASE_ENABLED } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";
import { setLocalProfiles } from "@/lib/db";
import { uid } from "@/lib/utils";
import type { Profile } from "@/lib/types";

const USERS_KEY = "synctune:users";
const SESSION_KEY = "synctune:session";

interface LocalUser {
  id: string;
  email: string;
  name: string;
  password: string;
}

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  mode: "supabase" | "local";
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<void>;
  signInWithMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readUsers(): LocalUser[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) || "[]") as LocalUser[];
  } catch {
    return [];
  }
}

function writeUsers(users: LocalUser[]): void {
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
  setLocalProfiles(users.map((u) => ({ id: u.id, name: u.name, email: u.email })));
}

function toProfile(u: LocalUser): Profile {
  return { id: u.id, name: u.name, email: u.email };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mode: "supabase" | "local" = SUPABASE_ENABLED ? "supabase" : "local";

  useEffect(() => {
    if (SUPABASE_ENABLED) {
      const sb = getSupabase();
      let active = true;

      const applySession = async (session: Session | null) => {
        if (!active) return;
        if (!session?.user) {
          setUser(null);
          setLoading(false);
          return;
        }
        const meta = session.user.user_metadata || {};
        const name = (meta.name as string) || session.user.email?.split("@")[0] || "Người dùng";
        const email = session.user.email ?? null;
        setUser({ id: session.user.id, name, email });
        setLoading(false);
        await sb
          .from("profiles")
          .upsert({ id: session.user.id, name, email }, { onConflict: "id" })
          .then(() => undefined, () => undefined);
      };

      sb.auth.getSession().then(({ data }) => applySession(data.session));
      const { data: sub } = sb.auth.onAuthStateChange((_evt, session) => {
        void applySession(session);
      });
      return () => {
        active = false;
        sub.subscription.unsubscribe();
      };
    }

    const users = readUsers();
    writeUsers(users);
    const sessionId = window.localStorage.getItem(SESSION_KEY);
    const found = users.find((u) => u.id === sessionId);
    setUser(found ? toProfile(found) : null);
    setLoading(false);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (SUPABASE_ENABLED) {
        const { error } = await getSupabase().auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        return;
      }
      const users = readUsers();
      const found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (!found) throw new Error("Không tìm thấy tài khoản với email này");
      if (found.password !== password) throw new Error("Mật khẩu không đúng");
      window.localStorage.setItem(SESSION_KEY, found.id);
      setUser(toProfile(found));
    },
    []
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      if (SUPABASE_ENABLED) {
        const { error } = await getSupabase().auth.signUp({
          email,
          password,
          options: { data: { name } },
        });
        if (error) throw new Error(error.message);
        return;
      }
      const users = readUsers();
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("Email này đã được dùng");
      }
      const created: LocalUser = {
        id: uid(),
        email,
        name: name || email.split("@")[0],
        password,
      };
      writeUsers([...users, created]);
      window.localStorage.setItem(SESSION_KEY, created.id);
      setUser(toProfile(created));
    },
    []
  );

  const signInWithMagicLink = useCallback(async (email: string) => {
    if (SUPABASE_ENABLED) {
      const { error } = await getSupabase().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined },
      });
      if (error) throw new Error(error.message);
      return;
    }
    const users = readUsers();
    let found = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!found) {
      found = { id: uid(), email, name: email.split("@")[0], password: uid() };
      writeUsers([...users, found]);
    }
    window.localStorage.setItem(SESSION_KEY, found.id);
    setUser(toProfile(found));
  }, []);

  const signOut = useCallback(async () => {
    if (SUPABASE_ENABLED) {
      await getSupabase().auth.signOut();
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, mode, signIn, signUp, signInWithMagicLink, signOut }),
    [user, loading, mode, signIn, signUp, signInWithMagicLink, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải được dùng bên trong AuthProvider");
  return ctx;
}
