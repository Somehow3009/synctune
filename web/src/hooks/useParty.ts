"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createChannel, type Channel, type PresenceState } from "@/lib/realtime";
import { uid } from "@/lib/utils";
import type { ChatMessage, PartyParticipant, PartyQueueItem, PartySync, Profile } from "@/lib/types";

interface PresenceInfo {
  userId: string;
  name: string;
  muted: boolean;
  joinedAt: number;
  [key: string]: unknown;
}

export function useParty({
  roomId,
  user,
  peerId,
}: {
  roomId: string;
  user: Profile;
  peerId: string;
}) {
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<PartyParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [queue, setQueue] = useState<PartyQueueItem[]>([]);
  const [sync, setSync] = useState<PartySync | null>(null);
  const [muted, setMutedState] = useState(false);

  const channelRef = useRef<Channel | null>(null);
  const syncRef = useRef<PartySync | null>(null);
  const queueRef = useRef<PartyQueueItem[]>([]);
  const knownPeers = useRef<Set<string>>(new Set());
  const joinedAtRef = useRef(Date.now());
  const mutedRef = useRef(false);

  const broadcastState = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    if (syncRef.current) ch.send("sync", syncRef.current);
    if (queueRef.current.length) ch.send("queue", queueRef.current);
  }, []);

  useEffect(() => {
    const ch = createChannel(`party:${roomId}`);
    channelRef.current = ch;

    const myPresence = (): PresenceInfo => ({
      userId: user.id,
      name: user.name,
      muted: mutedRef.current,
      joinedAt: joinedAtRef.current,
    });

    const offPresence = ch.onPresence((states: PresenceState) => {
      const list: PartyParticipant[] = [];
      let newPeer = false;
      for (const key of Object.keys(states)) {
        const entry = states[key] as unknown as { peerId: string; state: PresenceInfo };
        const st = entry.state || ({} as PresenceInfo);
        list.push({
          peerId: entry.peerId,
          userId: st.userId || entry.peerId,
          name: st.name || "Ẩn danh",
          muted: !!st.muted,
          joinedAt: st.joinedAt || 0,
        });
        if (!knownPeers.current.has(entry.peerId)) {
          knownPeers.current.add(entry.peerId);
          if (entry.peerId !== peerId) newPeer = true;
        }
      }
      list.sort((a, b) => a.joinedAt - b.joinedAt);
      setParticipants(list);

      if (newPeer) {
        const oldest = list[0];
        if (oldest && oldest.peerId === peerId) broadcastState();
      }
    });

    const offChat = ch.on("chat", (payload: ChatMessage) => {
      setMessages((prev) => [...prev, payload].slice(-500));
    });
    const offQueue = ch.on("queue", (payload: PartyQueueItem[]) => {
      if (!Array.isArray(payload)) return;
      queueRef.current = payload;
      setQueue(payload);
    });
    const offSync = ch.on("sync", (payload: PartySync) => {
      if (!payload) return;
      syncRef.current = payload;
      setSync(payload);
    });
    const offSys = ch.on("sys", (payload: { name: string; type: "join" | "leave" }) => {
      if (!payload) return;
      setMessages((prev) =>
        [
          ...prev,
          {
            id: uid(),
            name: "Hệ thống",
            userId: "system",
            text: `${payload.name} đã ${payload.type === "join" ? "tham gia" : "rời"} phòng`,
            at: Date.now(),
          },
        ].slice(-500)
      );
    });

    ch.subscribe();
    setConnected(true);
    ch.track(myPresence());

    const joinTimer = setTimeout(() => ch.send("sys", { name: user.name, type: "join" }), 500);

    return () => {
      clearTimeout(joinTimer);
      ch.send("sys", { name: user.name, type: "leave" });
      offPresence();
      offChat();
      offQueue();
      offSync();
      offSys();
      ch.unsubscribe();
      channelRef.current = null;
      setConnected(false);
    };
  }, [roomId, user.id, user.name, peerId, broadcastState]);

  const sendChat = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      const msg: ChatMessage = { id: uid(), name: user.name, userId: user.id, text: t, at: Date.now() };
      setMessages((prev) => [...prev, msg].slice(-500));
      channelRef.current?.send("chat", msg);
    },
    [user.name, user.id]
  );

  const pushSync = useCallback((next: PartySync) => {
    syncRef.current = next;
    setSync(next);
    channelRef.current?.send("sync", next);
  }, []);

  const updateSync = useCallback(
    (partial: Partial<PartySync>) => {
      const next: PartySync = {
        url: partial.url ?? syncRef.current?.url ?? "",
        title: partial.title ?? syncRef.current?.title ?? null,
        thumbnail: partial.thumbnail ?? syncRef.current?.thumbnail ?? null,
        position: partial.position ?? syncRef.current?.position ?? 0,
        playing: partial.playing ?? syncRef.current?.playing ?? false,
        at: Date.now(),
        by: peerId,
      };
      pushSync(next);
    },
    [peerId, pushSync]
  );

  const setQueueAndBroadcast = useCallback((items: PartyQueueItem[]) => {
    queueRef.current = items;
    setQueue(items);
    channelRef.current?.send("queue", items);
  }, []);

  const addToQueue = useCallback(
    (item: Omit<PartyQueueItem, "id" | "addedBy">) => {
      const full: PartyQueueItem = { ...item, id: uid(), addedBy: user.name };
      setQueueAndBroadcast([...queueRef.current, full]);
      return full;
    },
    [setQueueAndBroadcast, user.name]
  );

  const removeFromQueue = useCallback(
    (id: string) => {
      setQueueAndBroadcast(queueRef.current.filter((q) => q.id !== id));
    },
    [setQueueAndBroadcast]
  );

  const moveInQueue = useCallback(
    (from: number, to: number) => {
      const items = [...queueRef.current];
      if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return;
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved);
      setQueueAndBroadcast(items);
    },
    [setQueueAndBroadcast]
  );

  const clearQueue = useCallback(() => setQueueAndBroadcast([]), [setQueueAndBroadcast]);

  const setMuted = useCallback(
    (m: boolean) => {
      mutedRef.current = m;
      setMutedState(m);
      channelRef.current?.track({
        userId: user.id,
        name: user.name,
        muted: m,
        joinedAt: joinedAtRef.current,
      });
    },
    [user.id, user.name]
  );

  return {
    connected,
    participants,
    messages,
    queue,
    sync,
    muted,
    sendChat,
    updateSync,
    setQueueAndBroadcast,
    addToQueue,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setMuted,
    broadcastState,
    channelRef,
  };
}
