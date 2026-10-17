import { getSupabase } from "./supabase";
import { SUPABASE_ENABLED } from "./config";
import { uid } from "./utils";
import type { Playlist, Profile, Share, Track } from "./types";

export interface DataStore {
  mode: "supabase" | "local";
  listPlaylists(userId: string): Promise<Playlist[]>;
  createPlaylist(userId: string, name: string, items?: Track[]): Promise<Playlist>;
  renamePlaylist(id: string, name: string): Promise<void>;
  deletePlaylist(id: string): Promise<void>;
  addTrack(playlistId: string, track: Track): Promise<void>;
  removeTrack(playlistId: string, trackId: string): Promise<void>;
  reorderTracks(playlistId: string, orderedIds: string[]): Promise<void>;
  listShares(userId: string): Promise<Share[]>;
  createShare(input: Omit<Share, "id" | "createdAt" | "read">): Promise<Share>;
  markShareRead(id: string): Promise<void>;
  deleteShare(id: string): Promise<void>;
  listProfiles(): Promise<Profile[]>;
}

const now = () => new Date().toISOString();

/* ----------------------------- Supabase store ----------------------------- */

interface PlaylistRow {
  id: string;
  owner_id: string;
  name: string;
  items: Track[] | null;
  created_at: string;
  updated_at: string;
}

interface ShareRow {
  id: string;
  from_user: string;
  from_name: string;
  to_user: string | null;
  kind: "track" | "playlist";
  payload: Track | Playlist;
  created_at: string;
  read: boolean;
}

function rowToPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    items: Array.isArray(row.items) ? row.items : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToShare(row: ShareRow): Share {
  return {
    id: row.id,
    fromUserId: row.from_user,
    fromName: row.from_name,
    toUserId: row.to_user,
    kind: row.kind,
    payload: row.payload,
    createdAt: row.created_at,
    read: row.read,
  };
}

function supabaseStore(): DataStore {
  const sb = () => getSupabase();

  async function mutatePlaylist(id: string, fn: (items: Track[]) => Track[]): Promise<void> {
    const { data, error } = await sb().from("playlists").select("items").eq("id", id).single();
    if (error) throw error;
    const items = Array.isArray(data?.items) ? (data.items as Track[]) : [];
    const { error: upErr } = await sb()
      .from("playlists")
      .update({ items: fn(items), updated_at: now() })
      .eq("id", id);
    if (upErr) throw upErr;
  }

  return {
    mode: "supabase",
    async listPlaylists(userId) {
      const { data, error } = await sb()
        .from("playlists")
        .select("*")
        .eq("owner_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as PlaylistRow[]).map(rowToPlaylist);
    },
    async createPlaylist(userId, name, items) {
      const { data, error } = await sb()
        .from("playlists")
        .insert({ owner_id: userId, name, items: items ?? [] })
        .select("*")
        .single();
      if (error) throw error;
      return rowToPlaylist(data as PlaylistRow);
    },
    async renamePlaylist(id, name) {
      const { error } = await sb().from("playlists").update({ name, updated_at: now() }).eq("id", id);
      if (error) throw error;
    },
    async deletePlaylist(id) {
      const { error } = await sb().from("playlists").delete().eq("id", id);
      if (error) throw error;
    },
    addTrack(playlistId, track) {
      return mutatePlaylist(playlistId, (items) => [...items, track]);
    },
    removeTrack(playlistId, trackId) {
      return mutatePlaylist(playlistId, (items) => items.filter((t) => t.id !== trackId));
    },
    reorderTracks(playlistId, orderedIds) {
      return mutatePlaylist(playlistId, (items) => {
        const map = new Map(items.map((t) => [t.id, t]));
        const ordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Track[];
        const missing = items.filter((t) => !orderedIds.includes(t.id));
        return [...ordered, ...missing];
      });
    },
    async listShares(userId) {
      const { data, error } = await sb()
        .from("shares")
        .select("*")
        .or(`to_user.eq.${userId},to_user.is.null`)
        .neq("from_user", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as ShareRow[]).map(rowToShare);
    },
    async createShare(input) {
      const { data, error } = await sb()
        .from("shares")
        .insert({
          from_user: input.fromUserId,
          from_name: input.fromName,
          to_user: input.toUserId ?? null,
          kind: input.kind,
          payload: input.payload,
          read: false,
        })
        .select("*")
        .single();
      if (error) throw error;
      return rowToShare(data as ShareRow);
    },
    async markShareRead(id) {
      const { error } = await sb().from("shares").update({ read: true }).eq("id", id);
      if (error) throw error;
    },
    async deleteShare(id) {
      const { error } = await sb().from("shares").delete().eq("id", id);
      if (error) throw error;
    },
    async listProfiles() {
      const { data, error } = await sb().from("profiles").select("id,name,email");
      if (error) throw error;
      return (data as Profile[]) || [];
    },
  };
}

/* ------------------------------ Local store ------------------------------- */

interface LocalDb {
  playlists: Playlist[];
  shares: Share[];
  profiles: Profile[];
}

const LOCAL_KEY = "synctune:db";

function readLocal(): LocalDb {
  if (typeof window === "undefined") return { playlists: [], shares: [], profiles: [] };
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return { playlists: [], shares: [], profiles: [] };
    const parsed = JSON.parse(raw) as LocalDb;
    return {
      playlists: parsed.playlists || [],
      shares: parsed.shares || [],
      profiles: parsed.profiles || [],
    };
  } catch {
    return { playlists: [], shares: [], profiles: [] };
  }
}

function writeLocal(db: LocalDb): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
}

function localStore(): DataStore {
  function findIndex(db: LocalDb, id: string): number {
    return db.playlists.findIndex((p) => p.id === id);
  }

  return {
    mode: "local",
    async listPlaylists(userId) {
      return readLocal()
        .playlists.filter((p) => p.ownerId === userId)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },
    async createPlaylist(userId, name, items) {
      const db = readLocal();
      const playlist: Playlist = {
        id: uid(),
        name,
        ownerId: userId,
        items: items ?? [],
        createdAt: now(),
        updatedAt: now(),
      };
      db.playlists.push(playlist);
      writeLocal(db);
      return playlist;
    },
    async renamePlaylist(id, name) {
      const db = readLocal();
      const i = findIndex(db, id);
      if (i >= 0) {
        db.playlists[i].name = name;
        db.playlists[i].updatedAt = now();
        writeLocal(db);
      }
    },
    async deletePlaylist(id) {
      const db = readLocal();
      db.playlists = db.playlists.filter((p) => p.id !== id);
      writeLocal(db);
    },
    async addTrack(playlistId, track) {
      const db = readLocal();
      const i = findIndex(db, playlistId);
      if (i >= 0) {
        db.playlists[i].items.push(track);
        db.playlists[i].updatedAt = now();
        writeLocal(db);
      }
    },
    async removeTrack(playlistId, trackId) {
      const db = readLocal();
      const i = findIndex(db, playlistId);
      if (i >= 0) {
        db.playlists[i].items = db.playlists[i].items.filter((t) => t.id !== trackId);
        db.playlists[i].updatedAt = now();
        writeLocal(db);
      }
    },
    async reorderTracks(playlistId, orderedIds) {
      const db = readLocal();
      const i = findIndex(db, playlistId);
      if (i >= 0) {
        const items = db.playlists[i].items;
        const map = new Map(items.map((t) => [t.id, t]));
        const ordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Track[];
        const missing = items.filter((t) => !orderedIds.includes(t.id));
        db.playlists[i].items = [...ordered, ...missing];
        db.playlists[i].updatedAt = now();
        writeLocal(db);
      }
    },
    async listShares(userId) {
      return readLocal()
        .shares.filter((s) => s.fromUserId !== userId && (s.toUserId == null || s.toUserId === userId))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async createShare(input) {
      const db = readLocal();
      const share: Share = { ...input, id: uid(), createdAt: now(), read: false };
      db.shares.push(share);
      writeLocal(db);
      return share;
    },
    async markShareRead(id) {
      const db = readLocal();
      const s = db.shares.find((x) => x.id === id);
      if (s) {
        s.read = true;
        writeLocal(db);
      }
    },
    async deleteShare(id) {
      const db = readLocal();
      db.shares = db.shares.filter((s) => s.id !== id);
      writeLocal(db);
    },
    async listProfiles() {
      return readLocal().profiles;
    },
  };
}

/* -------------------------------- Registry -------------------------------- */

let store: DataStore | null = null;

export function getDataStore(): DataStore {
  if (!store) store = SUPABASE_ENABLED ? supabaseStore() : localStore();
  return store;
}

export function setLocalProfiles(profiles: Profile[]): void {
  const db = readLocal();
  db.profiles = profiles;
  writeLocal(db);
}

export { LOCAL_KEY };
