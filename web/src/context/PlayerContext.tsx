"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { resolveStream } from "@/lib/api";
import { proxyStreamUrl, shuffleArray, youtubeVideoId } from "@/lib/utils";
import type { YouTubePlayerHandle } from "@/components/YouTubePlayer";
import type { ResolvedStream, RepeatMode, StreamFormat, Track } from "@/lib/types";

interface PlayerContextValue {
  mediaRef: React.RefObject<HTMLVideoElement>;
  audioRef: React.RefObject<HTMLAudioElement>;
  embedRef: React.RefObject<YouTubePlayerHandle>;
  isEmbed: boolean;
  embedVideoId: string | null;
  embedStart: number;
  onEmbedReady(): void;
  onEmbedState(state: number): void;
  onEmbedProgress(time: number, duration: number): void;
  onEmbedError(message: string): void;
  current: Track | null;
  resolved: ResolvedStream | null;
  queue: Track[];
  index: number;
  playing: boolean;
  loading: boolean;
  error: string | null;
  expanded: boolean;
  audioOnly: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  speed: number;
  volume: number;
  muted: boolean;
  position: number;
  duration: number;
  history: Track[];
  playTrack(track: Track, queue?: Track[]): void;
  playQueue(tracks: Track[], startIndex?: number): void;
  playHistory(track: Track): void;
  toggle(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  setSpeed(v: number): void;
  setVolume(v: number): void;
  toggleMute(): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  setAudioOnly(v: boolean): void;
  setExpanded(v: boolean): void;
  addToQueue(track: Track): void;
  removeFromQueue(i: number): void;
  moveInQueue(from: number, to: number): void;
  clearQueue(): void;
  playNext(track: Track): void;
  isCurrent(track: Track): boolean;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const VOLUME_KEY = "synctune:volume";
const HISTORY_KEY = "synctune:history";
const posKey = (id: string) => `synctune:pos:${id}`;

function loadNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  const n = raw == null ? NaN : Number(raw);
  return isNaN(n) ? fallback : n;
}

function loadHistory(): Track[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]") as Track[];
  } catch {
    return [];
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const embedRef = useRef<YouTubePlayerHandle>(null);
  const pendingPlayRef = useRef(false);
  const requestRef = useRef(0);
  const lastPositionSyncRef = useRef(0);

  const [current, setCurrent] = useState<Track | null>(null);
  const [resolved, setResolved] = useState<ResolvedStream | null>(null);
  const [embedVideoId, setEmbedVideoId] = useState<string | null>(null);
  const [embedStart, setEmbedStart] = useState(0);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [audioOnly, setAudioOnlyState] = useState(true);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [speed, setSpeedState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [history, setHistory] = useState<Track[]>([]);

  useEffect(() => {
    setVolumeState(loadNumber(VOLUME_KEY, 1));
    setHistory(loadHistory());
  }, []);

  const getActiveMedia = useCallback((): HTMLAudioElement | HTMLVideoElement | null => {
    const useAudio = !!resolved?.audio?.url && (audioOnly || !resolved.video?.url);
    return useAudio ? audioRef.current : mediaRef.current;
  }, [audioOnly, resolved]);

  const pushHistory = useCallback((track: Track) => {
    setHistory((prev) => {
      const next = [track, ...prev.filter((t) => t.url !== track.url)].slice(0, 50);
      try {
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const stopMedia = useCallback(() => {
    for (const el of [mediaRef.current, audioRef.current]) {
      if (!el) continue;
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const resolveCurrent = useCallback(
    (track: Track) => {
      const reqId = ++requestRef.current;

      stopMedia();
      setError(null);
      setResolved(null);

      const videoId = youtubeVideoId(track.url);
      if (videoId) {
        const saved = loadNumber(posKey(track.id), 0);
        setEmbedVideoId(videoId);
        setEmbedStart(saved > 5 ? saved : 0);
        setLoading(false);
        pendingPlayRef.current = true;
        return;
      }

      setEmbedVideoId(null);
      setEmbedStart(0);
      setLoading(true);
      resolveStream(track.url)
        .then((data) => {
          if (requestRef.current !== reqId) return;
          if (!data.audio && !data.video) {
            setError("Không tìm thấy luồng phát cho nội dung này");
            setLoading(false);
            return;
          }
          setResolved(data);
          setLoading(false);
        })
        .catch((e: Error) => {
          if (requestRef.current !== reqId) return;
          setError(e.message);
          setLoading(false);
        });
    },
    [stopMedia]
  );

  const startTrack = useCallback(
    (track: Track, q?: Track[], at?: number) => {
      pendingPlayRef.current = true;
      if (q) setQueue(q);
      if (at != null) setIndex(at);
      setCurrent(track);
      pushHistory(track);
      resolveCurrent(track);
    },
    [pushHistory, resolveCurrent]
  );

  const playTrack = useCallback(
    (track: Track, q?: Track[]) => {
      const list = q ?? [track];
      const at = list.findIndex((t) => t.url === track.url);
      startTrack(track, list, at < 0 ? 0 : at);
    },
    [startTrack]
  );

  const playQueue = useCallback(
    (tracks: Track[], startIndex = 0) => {
      if (!tracks.length) return;
      const i = Math.max(0, Math.min(startIndex, tracks.length - 1));
      startTrack(tracks[i], tracks, i);
    },
    [startTrack]
  );

  const playHistory = useCallback(
    (track: Track) => {
      startTrack(track, [track], 0);
    },
    [startTrack]
  );

  const restart = useCallback(() => {
    if (embedVideoId) {
      embedRef.current?.seek(0);
      embedRef.current?.play();
      return;
    }
    const el = getActiveMedia();
    if (el) {
      el.currentTime = 0;
      void el.play().catch((e) => setError(e.message));
    }
  }, [embedVideoId, getActiveMedia]);

  const pauseCurrent = useCallback(() => {
    if (embedVideoId) {
      embedRef.current?.pause();
      return;
    }
    getActiveMedia()?.pause();
  }, [embedVideoId, getActiveMedia]);

  const advance = useCallback(
    (dir: 1 | -1, auto = false) => {
      if (repeat === "one" && auto) {
        restart();
        return;
      }
      if (!queue.length) return;
      let nextIdx = index + dir;
      if (nextIdx >= queue.length) nextIdx = repeat === "all" || !auto ? 0 : index;
      if (nextIdx < 0) nextIdx = queue.length - 1;
      if (nextIdx === index) {
        if (auto && repeat === "all") restart();
        else if (auto) pauseCurrent();
        return;
      }
      const track = queue[nextIdx];
      pendingPlayRef.current = true;
      setCurrent(track);
      setIndex(nextIdx);
      pushHistory(track);
      resolveCurrent(track);
    },
    [queue, index, repeat, pushHistory, resolveCurrent, restart, pauseCurrent]
  );

  const next = useCallback(() => advance(1, false), [advance]);
  const prev = useCallback(() => advance(-1, false), [advance]);

  const toggle = useCallback(() => {
    if (!current) return;
    if (embedVideoId) {
      const yt = embedRef.current;
      if (!yt) return;
      const state = yt.getState();
      if (state === 1 || state === 3) yt.pause();
      else yt.play();
      return;
    }
    const el = getActiveMedia();
    if (!el) return;
    if (el.paused) {
      pendingPlayRef.current = true;
      void el.play().catch((e) => {
        pendingPlayRef.current = false;
        setError(e.message);
      });
    } else {
      el.pause();
    }
  }, [current, embedVideoId, getActiveMedia]);

  const seek = useCallback(
    (seconds: number) => {
      if (embedVideoId) {
        embedRef.current?.seek(seconds);
        setPosition(seconds);
        return;
      }
      const el = getActiveMedia();
      if (el) el.currentTime = seconds;
      setPosition(seconds);
    },
    [embedVideoId, getActiveMedia]
  );

  const setSpeed = useCallback(
    (v: number) => {
      setSpeedState(v);
      if (embedVideoId) {
        embedRef.current?.setRate(v);
        return;
      }
      const el = getActiveMedia();
      if (el) el.playbackRate = v;
    },
    [embedVideoId, getActiveMedia]
  );

  const setVolume = useCallback(
    (v: number) => {
      setVolumeState(v);
      if (embedVideoId) {
        embedRef.current?.setVolume(v);
        embedRef.current?.mute(v === 0);
      } else {
        const el = getActiveMedia();
        if (el) {
          el.volume = v;
          el.muted = v === 0;
        }
      }
      setMuted(v === 0);
      try {
        window.localStorage.setItem(VOLUME_KEY, String(v));
      } catch {
        /* ignore */
      }
    },
    [embedVideoId, getActiveMedia]
  );

  const toggleMute = useCallback(() => {
    const nextMuted = !muted;
    if (embedVideoId) {
      embedRef.current?.mute(nextMuted);
    } else {
      const el = getActiveMedia();
      if (el) el.muted = nextMuted;
    }
    setMuted(nextMuted);
  }, [muted, embedVideoId, getActiveMedia]);

  const isEmbed = embedVideoId !== null;

  const onEmbedReady = useCallback(() => {
    const yt = embedRef.current;
    if (!yt) return;
    yt.setVolume(volume);
    yt.mute(muted || volume === 0);
    yt.setRate(speed);
    if (pendingPlayRef.current) {
      pendingPlayRef.current = false;
      yt.play();
    }
  }, [volume, muted, speed]);

  const onEmbedState = useCallback(
    (state: number) => {
      if (state === 1) setPlaying(true);
      else if (state === 0 || state === 2) setPlaying(false);
      if (state === 0) advance(1, true);
    },
    [advance]
  );

  const onEmbedProgress = useCallback((time: number, dur: number) => {
    setPosition(time);
    if (dur && isFinite(dur)) setDuration(dur);
  }, []);

  const onEmbedError = useCallback((message: string) => {
    setError(message);
    setLoading(false);
  }, []);

  const toggleShuffle = useCallback(() => {
    const turningOn = !shuffle;
    if (turningOn && queue.length > 1) {
      const cur = current;
      const shuffled = shuffleArray(queue);
      setQueue(shuffled);
      if (cur) {
        const i = shuffled.findIndex((t) => t.url === cur.url);
        if (i >= 0) setIndex(i);
      }
    }
    setShuffle(turningOn);
  }, [shuffle, queue, current]);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  const setAudioOnly = useCallback((v: boolean) => setAudioOnlyState(v), []);

  const addToQueue = useCallback((track: Track) => {
    setQueue((q) => [...q, track]);
  }, []);

  const playNext = useCallback((track: Track) => {
    setQueue((q) => {
      const copy = [...q];
      copy.splice(index + 1, 0, track);
      return copy;
    });
  }, [index]);

  const removeFromQueue = useCallback((i: number) => {
    setQueue((q) => q.filter((_, idx) => idx !== i));
    setIndex((cur) => (i < cur ? cur - 1 : cur));
  }, []);

  const moveInQueue = useCallback((from: number, to: number) => {
    setQueue((q) => {
      const copy = [...q];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue(current ? [current] : []);
    setIndex(current ? 0 : -1);
  }, [current]);

  const isCurrent = useCallback((track: Track) => current?.url === track.url, [current]);

  /* Apply the resolved stream to the active media element */
  useEffect(() => {
    if (embedVideoId || !resolved) return;

    const useAudio = !!resolved.audio?.url && (audioOnly || !resolved.video?.url);
    const fmt: StreamFormat | null | undefined = useAudio ? resolved.audio : resolved.video || resolved.audio;
    const el = useAudio ? audioRef.current : mediaRef.current;
    const other = useAudio ? mediaRef.current : audioRef.current;

    if (!fmt?.url || !el) {
      setError("Không tìm thấy luồng phát phù hợp");
      return;
    }

    const wasPlaying =
      pendingPlayRef.current ||
      [mediaRef.current, audioRef.current].some((m) => m && !m.paused && m.readyState > 0);

    if (other) {
      other.pause();
      other.removeAttribute("src");
      other.load();
    }

    el.src = proxyStreamUrl(fmt.url);
    el.playbackRate = speed;
    el.volume = volume;
    el.muted = muted;
    el.load();

    if (wasPlaying) {
      pendingPlayRef.current = false;
      el.play().catch((e) => setError(e.message || "Không thể tự động phát. Hãy nhấn Phát."));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, audioOnly, embedVideoId]);

  /* Media element event wiring */
  useEffect(() => {
    const elements = [mediaRef.current, audioRef.current].filter(
      (el): el is HTMLMediaElement => el !== null
    );

    const isActive = (el: HTMLMediaElement) => el === getActiveMedia();

    const onPlay = (event: Event) => {
      if (isActive(event.currentTarget as HTMLMediaElement)) setPlaying(true);
    };
    const onPause = (event: Event) => {
      if (isActive(event.currentTarget as HTMLMediaElement)) setPlaying(false);
    };
    const onTime = (event: Event) => {
      const el = event.currentTarget as HTMLMediaElement;
      if (!isActive(el)) return;
      setPosition(el.currentTime);
      if (el.duration && isFinite(el.duration)) setDuration(el.duration);
    };
    const onMeta = (event: Event) => {
      const el = event.currentTarget as HTMLMediaElement;
      if (!isActive(el)) return;
      setDuration(el.duration || 0);
      if (current) {
        const saved = loadNumber(posKey(current.id), 0);
        if (saved > 5 && el.duration && saved < el.duration - 5) el.currentTime = saved;
      }
    };
    const onEnded = (event: Event) => {
      if (isActive(event.currentTarget as HTMLMediaElement)) advance(1, true);
    };
    const onError = (event: Event) => {
      const el = event.currentTarget as HTMLMediaElement;
      if (isActive(el) && el.currentSrc) {
        setError("Lỗi phát nội dung (nguồn có thể đã hết hạn, thử phát lại)");
      }
    };

    for (const el of elements) {
      el.addEventListener("play", onPlay);
      el.addEventListener("pause", onPause);
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("loadedmetadata", onMeta);
      el.addEventListener("ended", onEnded);
      el.addEventListener("error", onError);
    }
    return () => {
      for (const el of elements) {
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("loadedmetadata", onMeta);
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("error", onError);
      }
    };
  }, [advance, current, getActiveMedia]);

  /* Persist playback position */
  useEffect(() => {
    if (!current) return;
    const id = current.id;
    const save = () => {
      const seconds = embedVideoId
        ? embedRef.current?.getCurrentTime() ?? 0
        : getActiveMedia()?.currentTime ?? 0;
      if (seconds > 3) window.localStorage.setItem(posKey(id), String(Math.floor(seconds)));
    };
    const t = setInterval(save, 5000);
    return () => {
      clearInterval(t);
      save();
    };
  }, [current, embedVideoId, getActiveMedia]);

  /* Media Session (lock screen / control center) */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !current) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: current.title,
        artist: current.uploader || "SyncTune",
        album: "SyncTune",
        artwork: current.thumbnail ? [{ src: current.thumbnail, sizes: "480x360", type: "image/jpeg" }] : [],
      });
      ms.setActionHandler("play", () => {
        if (embedVideoId) {
          embedRef.current?.play();
          return;
        }
        const el = getActiveMedia();
        if (el) void el.play().catch((e) => setError(e.message));
      });
      ms.setActionHandler("pause", () => {
        if (embedVideoId) {
          embedRef.current?.pause();
          return;
        }
        getActiveMedia()?.pause();
      });
      ms.setActionHandler("previoustrack", () => prev());
      ms.setActionHandler("nexttrack", () => next());
      ms.setActionHandler("seekbackward", (d) => seek(Math.max(0, position - (d.seekOffset || 10))));
      ms.setActionHandler("seekforward", (d) => seek(position + (d.seekOffset || 10)));
      ms.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) seek(d.seekTime);
      });
    } catch {
      /* unsupported action */
    }
    return () => {
      try {
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("previoustrack", null);
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("seekbackward", null);
        ms.setActionHandler("seekforward", null);
        ms.setActionHandler("seekto", null);
      } catch {
        /* ignore */
      }
    };
  }, [current, position, next, prev, seek, embedVideoId, getActiveMedia]);

  /* Keep the OS media session state in sync (lock screen / control center) */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch {
      /* ignore */
    }
  }, [playing]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (!("setPositionState" in ms)) return;
    if (!duration || !isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (now - lastPositionSyncRef.current < 1000) return;
    lastPositionSyncRef.current = now;
    try {
      ms.setPositionState({
        duration,
        position: Math.max(0, Math.min(position, duration)),
        playbackRate: speed,
      });
    } catch {
      /* ignore */
    }
  }, [position, duration, speed]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      mediaRef,
      audioRef,
      embedRef,
      isEmbed,
      embedVideoId,
      embedStart,
      onEmbedReady,
      onEmbedState,
      onEmbedProgress,
      onEmbedError,
      current,
      resolved,
      queue,
      index,
      playing,
      loading,
      error,
      expanded,
      audioOnly,
      shuffle,
      repeat,
      speed,
      volume,
      muted,
      position,
      duration,
      history,
      playTrack,
      playQueue,
      playHistory,
      toggle,
      next,
      prev,
      seek,
      setSpeed,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setAudioOnly,
      setExpanded,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      clearQueue,
      playNext,
      isCurrent,
    }),
    [
      embedVideoId,
      embedStart,
      isEmbed,
      onEmbedReady,
      onEmbedState,
      onEmbedProgress,
      onEmbedError,
      current,
      resolved,
      queue,
      index,
      playing,
      loading,
      error,
      expanded,
      audioOnly,
      shuffle,
      repeat,
      speed,
      volume,
      muted,
      position,
      duration,
      history,
      playTrack,
      playQueue,
      playHistory,
      toggle,
      next,
      prev,
      seek,
      setSpeed,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      setAudioOnly,
      addToQueue,
      removeFromQueue,
      moveInQueue,
      clearQueue,
      playNext,
      isCurrent,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer phải được dùng bên trong PlayerProvider");
  return ctx;
}
