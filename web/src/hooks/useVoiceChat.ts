"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "@/lib/realtime";

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

function buildIceServers(): RTCIceServer[] {
  const servers = [...STUN_SERVERS];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME || undefined,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}

const RTC_CONFIG: RTCConfiguration = { iceServers: buildIceServers() };

interface Signal {
  to: string;
  from: string;
  kind: "offer" | "answer" | "ice";
  data: unknown;
}

export function useVoiceChat({
  channel,
  peerId,
  peers,
  enabled,
}: {
  channel: Channel | null;
  peerId: string;
  peers: string[];
  enabled: boolean;
}) {
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remotePeers, setRemotePeers] = useState<string[]>([]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const peersRef = useRef<string[]>(peers);
  const enablingRef = useRef(false);

  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const attachRemote = useCallback((remoteId: string, stream: MediaStream) => {
    let el = audioEls.current.get(remoteId);
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      audioEls.current.set(remoteId, el);
    }
    el.srcObject = stream;
    void el.play().catch(() => undefined);
    setRemotePeers(Array.from(audioEls.current.keys()));
  }, []);

  const createPeer = useCallback(
    (remoteId: string) => {
      const existing = pcs.current.get(remoteId);
      if (existing) return existing;
      const pc = new RTCPeerConnection(RTC_CONFIG);
      pcs.current.set(remoteId, pc);

      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((t) => pc.addTrack(t, local));

      pc.onicecandidate = (e) => {
        if (e.candidate && channel) {
          channel.send("rtc", { to: remoteId, from: peerId, kind: "ice", data: e.candidate.toJSON() } satisfies Signal);
        }
      };
      pc.ontrack = (e) => {
        if (e.streams[0]) attachRemote(remoteId, e.streams[0]);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          pc.close();
          pcs.current.delete(remoteId);
        }
      };
      return pc;
    },
    [attachRemote, channel, peerId]
  );

  const closePeer = useCallback((remoteId: string) => {
    pcs.current.get(remoteId)?.close();
    pcs.current.delete(remoteId);
    const el = audioEls.current.get(remoteId);
    if (el) {
      el.srcObject = null;
      audioEls.current.delete(remoteId);
      setRemotePeers(Array.from(audioEls.current.keys()));
    }
  }, []);

  const negotiate = useCallback(
    async (remoteId: string) => {
      if (!channel) return;
      const pc = createPeer(remoteId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send("rtc", { to: remoteId, from: peerId, kind: "offer", data: offer } satisfies Signal);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [channel, createPeer, peerId]
  );

  const start = useCallback(async () => {
    if (enablingRef.current) return;
    enablingRef.current = true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;
      setMicOn(true);
      const others = peersRef.current.filter((p) => p !== peerId);
      for (const remote of others) {
        if (peerId < remote) await negotiate(remote);
        else createPeer(remote);
      }
    } catch (e) {
      setError(`Không truy cập được micro: ${(e as Error).message}`);
      setMicOn(false);
    } finally {
      enablingRef.current = false;
    }
  }, [createPeer, negotiate, peerId]);

  const stop = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setMicOn(false);
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    audioEls.current.forEach((el) => (el.srcObject = null));
    audioEls.current.clear();
    setRemotePeers([]);
  }, []);

  const setMutedLocal = useCallback((muted: boolean) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    setMicOn((on) => (muted ? false : on));
  }, []);

  /* signaling */
  useEffect(() => {
    if (!channel) return;
    const off = channel.on("rtc", async (raw: unknown) => {
      const sig = raw as Signal;
      if (!sig || sig.to !== peerId || sig.from === peerId) return;
      const remoteId = sig.from;
      try {
        if (sig.kind === "offer") {
          const pc = createPeer(remoteId);
          await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channel.send("rtc", { to: remoteId, from: peerId, kind: "answer", data: answer } satisfies Signal);
        } else if (sig.kind === "answer") {
          const pc = pcs.current.get(remoteId);
          if (pc && pc.signalingState !== "stable") {
            await pc.setRemoteDescription(new RTCSessionDescription(sig.data as RTCSessionDescriptionInit));
          }
        } else if (sig.kind === "ice") {
          const pc = pcs.current.get(remoteId);
          if (pc) await pc.addIceCandidate(new RTCIceCandidate(sig.data as RTCIceCandidateInit)).catch(() => undefined);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    });
    return off;
  }, [channel, createPeer, peerId]);

  /* react to peer list changes (only when mic is live) */
  useEffect(() => {
    if (!micOn || !channel) return;
    const others = peers.filter((p) => p !== peerId);
    for (const remote of others) {
      if (pcs.current.has(remote)) continue;
      if (peerId < remote) void negotiate(remote);
      else createPeer(remote);
    }
    const active = new Set(others);
    for (const id of Array.from(pcs.current.keys())) {
      if (!active.has(id)) closePeer(id);
    }
  }, [peers, micOn, channel, peerId, negotiate, createPeer, closePeer]);

  useEffect(() => {
    if (enabled && !micOn) void start();
    if (!enabled && micOn) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcs.current.forEach((pc) => pc.close());
    };
  }, []);

  return { micOn, error, remotePeers, start, stop, setMutedLocal };
}
