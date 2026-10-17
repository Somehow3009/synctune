"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { getDataStore } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import { SUPABASE_ENABLED } from "@/lib/config";
import type { Playlist, Share, Track } from "@/lib/types";

interface LibraryContextValue {
  playlists: Playlist[];
  shares: Share[];
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  reloadShares(): Promise<void>;
  createPlaylist(name: string): Promise<Playlist | null>;
  renamePlaylist(id: string, name: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  addTrack(playlistId: string, track: Track): Promise<void>;
  removeTrack(playlistId: string, trackId: string): Promise<void>;
  reorder(playlistId: string, orderedIds: string[]): Promise<void>;
  importPlaylist(name: string, tracks: Track[]): Promise<Playlist | null>;
  sendShare(kind: "track" | "playlist", payload: Track | Playlist, toUserId?: string | null): Promise<void>;
  markShareRead(id: string): Promise<void>;
  deleteShare(id: string): Promise<void>;
  unreadShares: number;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setPlaylists([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await getDataStore().listPlaylists(user.id);
      setPlaylists(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const reloadShares = useCallback(async () => {
    if (!user) {
      setShares([]);
      return;
    }
    try {
      const list = await getDataStore().listShares(user.id);
      setShares(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);

  useEffect(() => {
    void reload();
    void reloadShares();
  }, [reload, reloadShares]);

  /* Live updates from Supabase (shares + own playlists across devices) */
  useEffect(() => {
    if (!SUPABASE_ENABLED || !user) return;
    const sb = getSupabase();
    const channel = sb
      .channel(`synctune-lib-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shares" }, () => {
        void reloadShares();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "playlists", filter: `owner_id=eq.${user.id}` },
        () => {
          void reload();
        }
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [user, reload, reloadShares]);

  const createPlaylist = useCallback(
    async (name: string, items?: Track[]) => {
      if (!user) return null;
      const created = await getDataStore().createPlaylist(user.id, name, items);
      setPlaylists((prev) => [created, ...prev]);
      return created;
    },
    [user]
  );

  const renamePlaylist = useCallback(async (id: string, name: string) => {
    await getDataStore().renamePlaylist(id, name);
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }, []);

  const deletePlaylist = useCallback(async (id: string) => {
    await getDataStore().deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addTrack = useCallback(async (playlistId: string, track: Track) => {
    await getDataStore().addTrack(playlistId, track);
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, items: [...p.items, track] } : p))
    );
  }, []);

  const removeTrack = useCallback(async (playlistId: string, trackId: string) => {
    await getDataStore().removeTrack(playlistId, trackId);
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, items: p.items.filter((t) => t.id !== trackId) } : p))
    );
  }, []);

  const reorder = useCallback(async (playlistId: string, orderedIds: string[]) => {
    await getDataStore().reorderTracks(playlistId, orderedIds);
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== playlistId) return p;
        const map = new Map(p.items.map((t) => [t.id, t]));
        const ordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Track[];
        const missing = p.items.filter((t) => !orderedIds.includes(t.id));
        return { ...p, items: [...ordered, ...missing] };
      })
    );
  }, []);

  const importPlaylist = useCallback(
    async (name: string, tracks: Track[]) => {
      if (!user) return null;
      const created = await createPlaylist(name, tracks);
      return created;
    },
    [user, createPlaylist]
  );

  const sendShare = useCallback(
    async (kind: "track" | "playlist", payload: Track | Playlist, toUserId?: string | null) => {
      if (!user) return;
      const share = await getDataStore().createShare({
        fromUserId: user.id,
        fromName: user.name,
        toUserId: toUserId ?? null,
        kind,
        payload,
      });
      setShares((prev) => (prev.some((s) => s.id === share.id) ? prev : prev));
    },
    [user]
  );

  const markShareRead = useCallback(async (id: string) => {
    await getDataStore().markShareRead(id);
    setShares((prev) => prev.map((s) => (s.id === id ? { ...s, read: true } : s)));
  }, []);

  const deleteShare = useCallback(async (id: string) => {
    await getDataStore().deleteShare(id);
    setShares((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const unreadShares = useMemo(() => shares.filter((s) => !s.read).length, [shares]);

  const value = useMemo<LibraryContextValue>(
    () => ({
      playlists,
      shares,
      loading,
      error,
      reload,
      reloadShares,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addTrack,
      removeTrack,
      reorder,
      importPlaylist,
      sendShare,
      markShareRead,
      deleteShare,
      unreadShares,
    }),
    [
      playlists,
      shares,
      loading,
      error,
      reload,
      reloadShares,
      createPlaylist,
      renamePlaylist,
      deletePlaylist,
      addTrack,
      removeTrack,
      reorder,
      importPlaylist,
      sendShare,
      markShareRead,
      deleteShare,
      unreadShares,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary phải được dùng bên trong LibraryProvider");
  return ctx;
}
