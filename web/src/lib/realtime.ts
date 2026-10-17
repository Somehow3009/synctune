import { SUPABASE_ENABLED } from "./config";
import { getSupabase } from "./supabase";
import { uid } from "./utils";

export type PresenceState = Record<string, { peerId: string; state: Record<string, unknown>; at: number }>;
type Handler = (payload: any) => void;

export interface Channel {
  name: string;
  send(event: string, payload: unknown): void;
  on(event: string, handler: Handler): () => void;
  onPresence(handler: (states: PresenceState) => void): () => void;
  track(state: Record<string, unknown>): void;
  subscribe(): void;
  unsubscribe(): void;
}

export function getPeerId(): string {
  if (typeof window === "undefined") return "server";
  let id = window.sessionStorage.getItem("synctune:peer");
  if (!id) {
    id = uid();
    window.sessionStorage.setItem("synctune:peer", id);
  }
  return id;
}

/* --------------------------- Supabase channel ---------------------------- */

class SupabaseChannel implements Channel {
  name: string;
  private ch: ReturnType<ReturnType<typeof getSupabase>["channel"]>;
  private pendingPresence: Record<string, unknown> | null = null;
  private subscribed = false;

  constructor(name: string) {
    this.name = name;
    this.ch = getSupabase().channel(`synctune:${name}`, {
      config: {
        broadcast: { self: false },
        presence: { key: getPeerId() },
      },
    });
  }

  send(event: string, payload: unknown) {
    void this.ch.send({ type: "broadcast", event, payload });
  }

  on(event: string, handler: Handler): () => void {
    const cb = ({ payload }: { payload: any }) => handler(payload);
    this.ch.on("broadcast", { event }, cb);
    return () => {
      /* supabase v2 has no per-handler off; channel is torn down on unsubscribe */
    };
  }

  onPresence(handler: (states: PresenceState) => void): () => void {
    this.ch.on("presence", { event: "sync" }, () => {
      const raw = this.ch.presenceState() as Record<string, any[]>;
      const out: PresenceState = {};
      for (const key of Object.keys(raw)) {
        const list = raw[key];
        if (list && list.length) out[key] = list[0];
      }
      handler(out);
    });
    return () => {};
  }

  track(state: Record<string, unknown>) {
    if (this.subscribed) {
      void this.ch.track({ peerId: getPeerId(), state, at: Date.now() });
    } else {
      this.pendingPresence = state;
    }
  }

  subscribe() {
    this.ch.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        this.subscribed = true;
        if (this.pendingPresence) void this.ch.track({ peerId: getPeerId(), state: this.pendingPresence, at: Date.now() });
      }
    });
  }

  unsubscribe() {
    void getSupabase().removeChannel(this.ch);
  }
}

/* ----------------------------- Local channel ------------------------------ */

const PRESENCE_TTL = 6000;

class LocalChannel implements Channel {
  name: string;
  private bc: BroadcastChannel | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private presenceHandlers = new Set<(states: PresenceState) => void>();
  private presence = new Map<string, { peerId: string; state: Record<string, unknown>; at: number }>();
  private myState: Record<string, unknown> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private peerId = getPeerId();

  constructor(name: string) {
    this.name = name;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.bc = new BroadcastChannel(`synctune:${name}`);
      this.bc.onmessage = (ev: MessageEvent) => this.handle(ev.data);
    }
  }

  private handle(msg: { event: string; payload: any }) {
    if (!msg || typeof msg !== "object") return;
    if (msg.event === "__presence") {
      const { peerId, state, request } = msg.payload;
      if (peerId && peerId !== this.peerId) {
        this.presence.set(peerId, { peerId, state: state || {}, at: Date.now() });
        this.emitPresence();
        if (request) this.beat();
      }
      return;
    }
    const set = this.handlers.get(msg.event);
    if (set) set.forEach((h) => h(msg.payload));
  }

  private emitPresence() {
    const now = Date.now();
    for (const [k, v] of Array.from(this.presence.entries())) if (now - v.at > PRESENCE_TTL) this.presence.delete(k);
    const states: PresenceState = {};
    this.presence.forEach((v, k) => (states[k] = v));
    this.presenceHandlers.forEach((h) => h(states));
  }

  private beat() {
    this.bc?.postMessage({
      event: "__presence",
      payload: { peerId: this.peerId, state: this.myState, at: Date.now() },
    });
  }

  send(event: string, payload: unknown) {
    this.bc?.postMessage({ event, payload });
  }

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  onPresence(handler: (states: PresenceState) => void): () => void {
    this.presenceHandlers.add(handler);
    return () => this.presenceHandlers.delete(handler);
  }

  track(state: Record<string, unknown>) {
    this.myState = state;
    this.beat();
  }

  subscribe() {
    this.beat();
    this.bc?.postMessage({ event: "__presence", payload: { peerId: this.peerId, request: true } });
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.beat();
        this.emitPresence();
      }, 2000);
    }
  }

  unsubscribe() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.bc) {
      this.bc.postMessage({ event: "__presence", payload: { peerId: this.peerId, state: {}, gone: true } });
      this.bc.close();
      this.bc = null;
    }
    this.handlers.clear();
    this.presenceHandlers.clear();
  }
}

export function createChannel(name: string): Channel {
  return SUPABASE_ENABLED ? new SupabaseChannel(name) : new LocalChannel(name);
}

export function realtimeMode(): "supabase" | "local" {
  return SUPABASE_ENABLED ? "supabase" : "local";
}
