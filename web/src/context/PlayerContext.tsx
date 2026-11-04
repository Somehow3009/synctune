"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { resolveStream } from "@/lib/api";
import { proxyStreamUrl, shuffleArray, youtubeVideoId } from "@/lib/utils";
import { useLibrary } from "./LibraryContext";
import type { YouTubePlayerHandle } from "@/components/YouTubePlayer";
import type { QueueSource, ResolvedStream, RepeatMode, StreamFormat, Track } from "@/lib/types";

interface PlayerContextValue {
  mediaRef: React.RefObject<HTMLVideoElement>;
  audioRef: React.RefObject<HTMLAudioElement>;
  embedRef: React.RefObject<YouTubePlayerHandle>;
  isEmbed: boolean;
  embedVideoId: string | null;
  embedStart: number;
  /** Playlist nội bộ của YouTube: để nó tự chuyển bài / tự lặp khi chạy nền. */
  ytRequest: {
    ids: string[];
    index: number;
    start: number;
    key: number;
    autoPlay: boolean;
  } | null;
  onEmbedReady(): void;
  onEmbedState(state: number): void;
  onEmbedProgress(time: number, duration: number): void;
  onEmbedError(message: string): void;
  onEmbedVideoChange(videoId: string): void;
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
  /** Số giây còn lại của hẹn giờ ngủ; 0 = đang tắt. */
  sleepRemaining: number;
  sleepActive: boolean;
  setSleepTimer(minutes: number | null): void;
  playTrack(track: Track, queue?: Track[]): void;
  playQueue(tracks: Track[], startIndex?: number, source?: QueueSource | null): void;
  playShuffled(tracks: Track[], source?: QueueSource | null): void;
  playAt(queueIndex: number): void;
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
const SESSION_KEY = "synctune:session";
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
  const { playlists } = useLibrary();
  const mediaRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const embedRef = useRef<YouTubePlayerHandle>(null);
  const pendingPlayRef = useRef(false);
  const requestRef = useRef(0);
  const lastPositionSyncRef = useRef(0);
  const preShuffleRef = useRef<Track[] | null>(null);
  /** Danh sách YouTube đang nạp vào player, dùng để quy đổi index khi quay lại app. */
  const ytPoolRef = useRef<Track[]>([]);
  const currentRef = useRef<Track | null>(null);
  const queueRef = useRef<Track[]>([]);
  /** Vị trí gần nhất của từng bài, để lưu đúng bài khi YouTube tự chuyển. */
  const lastTickRef = useRef<{ id: string; seconds: number }>({ id: "", seconds: 0 });
  const volumeRef = useRef(1);
  const mutedRef = useRef(false);
  const sleepFadeRef = useRef(false);
  const preSleepVolumeRef = useRef(1);
  /* Tick hẹn giờ, được gọi thêm từ sự kiện tiến trình phát để vẫn chạy khi
     màn hình khoá (iOS bóp nghẹt setInterval nhưng media vẫn cập nhật). */
  const sleepTickRef = useRef<(() => void) | null>(null);

  const [current, setCurrent] = useState<Track | null>(null);
  const [resolved, setResolved] = useState<ResolvedStream | null>(null);
  const [embedVideoId, setEmbedVideoId] = useState<string | null>(null);
  const [embedStart, setEmbedStart] = useState(0);
  const [ytRequest, setYtRequest] = useState<{
    ids: string[];
    index: number;
    start: number;
    key: number;
    autoPlay: boolean;
  } | null>(null);
  const ytKeyRef = useRef(0);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueSource, setQueueSource] = useState<QueueSource | null>(null);
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
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);

  currentRef.current = current;
  queueRef.current = queue;
  volumeRef.current = volume;
  mutedRef.current = muted;

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

  const buildYtRequest = useCallback(
    (track: Track, start: number, list?: Track[] | null, autoPlay = true) => {
      const pool = (list && list.length ? list : queue).filter((t) => youtubeVideoId(t.url));
      if (!pool.length) return null;
      ytPoolRef.current = pool;
      let idx = pool.findIndex((t) => t.id === track.id);
      if (idx < 0) {
        const vid = youtubeVideoId(track.url);
        idx = pool.findIndex((t) => youtubeVideoId(t.url) === vid);
      }
      if (idx < 0) idx = 0;
      return {
        ids: pool.map((t) => youtubeVideoId(t.url) as string),
        index: idx,
        start,
        key: ++ytKeyRef.current,
        autoPlay,
      };
    },
    [queue]
  );

  const resolveCurrent = useCallback(
    (track: Track, list?: Track[] | null, autoPlay = true) => {
      const reqId = ++requestRef.current;

      stopMedia();
      setError(null);
      setResolved(null);
      setPosition(0);
      setDuration(0);

      const videoId = youtubeVideoId(track.url);
      if (videoId) {
        const saved = loadNumber(posKey(track.id), 0);
        const start = saved > 5 ? saved : 0;
        setEmbedVideoId(videoId);
        setEmbedStart(start);
        /* Giao cả hàng đợi cho YouTube. Khi khoá máy, chính YouTube chuyển bài
           và lặp lại — không phụ thuộc JS của mình còn chạy hay không. */
        if (repeat === "one") {
          ytPoolRef.current = [track];
          setYtRequest({ ids: [videoId], index: 0, start, key: ++ytKeyRef.current, autoPlay });
        } else {
          setYtRequest(buildYtRequest(track, start, list, autoPlay));
        }
        setLoading(false);
        pendingPlayRef.current = autoPlay;
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
    [stopMedia, buildYtRequest, repeat]
  );

  const beginQueue = useCallback(
    (track: Track, list: Track[] | null, at: number | null, source: QueueSource | null) => {
      pendingPlayRef.current = true;
      if (list) setQueue(list);
      if (at != null) setIndex(at);
      setQueueSource(source);
      setCurrent(track);
      pushHistory(track);
      resolveCurrent(track, list);
    },
    [pushHistory, resolveCurrent]
  );

  const startTrack = useCallback(
    (track: Track, list?: Track[], at?: number, source: QueueSource | null = null, forceShuffle?: boolean) => {
      if (!list) {
        beginQueue(track, null, at ?? null, source);
        return;
      }
      const shouldShuffle = forceShuffle ?? shuffle;
      if (shouldShuffle) {
        if (list.length > 1) {
          preShuffleRef.current = list;
          const rest = shuffleArray(list.filter((t) => t.id !== track.id));
          beginQueue(track, [track, ...rest], 0, source);
          return;
        }
      }
      beginQueue(track, list, at ?? 0, source);
    },
    [beginQueue, shuffle]
  );

  const playTrack = useCallback(
    (track: Track, q?: Track[]) => {
      const list = q ?? [track];
      const at = list.findIndex((t) => t.id === track.id);
      startTrack(track, list, at < 0 ? 0 : at);
    },
    [startTrack]
  );

  const playQueue = useCallback(
    (tracks: Track[], startIndex = 0, source: QueueSource | null = null) => {
      if (!tracks.length) return;
      const i = Math.max(0, Math.min(startIndex, tracks.length - 1));
      startTrack(tracks[i], tracks, i, source);
    },
    [startTrack]
  );

  const playShuffled = useCallback(
    (tracks: Track[], source: QueueSource | null = null) => {
      if (!tracks.length) return;
      const first = tracks[Math.floor(Math.random() * tracks.length)];
      setShuffle(true);
      preShuffleRef.current = tracks;
      const rest = shuffleArray(tracks.filter((t) => t.id !== first.id));
      beginQueue(first, [first, ...rest], 0, source);
    },
    [beginQueue]
  );

  const playAt = useCallback(
    (queueIndex: number) => {
      const track = queue[queueIndex];
      if (!track) return;
      beginQueue(track, null, queueIndex, queueSource);
    },
    [queue, queueSource, beginQueue]
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
      const aligned = current ? queue.findIndex((t) => t.id === current.id) : -1;
      const base = aligned >= 0 ? aligned : index;
      let nextIdx = base + dir;
      if (nextIdx >= queue.length) nextIdx = repeat === "all" || !auto ? 0 : base;
      if (nextIdx < 0) nextIdx = queue.length - 1;
      if (nextIdx === base && queue.length === 1) {
        if (auto && repeat === "all") restart();
        else if (auto) setPlaying(false);
        return;
      }
      if (nextIdx === base) return;
      const track = queue[nextIdx];
      pendingPlayRef.current = true;
      setCurrent(track);
      setIndex(nextIdx);
      pushHistory(track);
      resolveCurrent(track);
    },
    [queue, index, current, repeat, pushHistory, resolveCurrent, restart, pauseCurrent]
  );

  const next = useCallback(() => {
    if (embedVideoId) {
      const allYoutube = queue.length > 0 && queue.every((t) => !!youtubeVideoId(t.url));
      if (repeat === "one" || !allYoutube) {
        advance(1, false);
        return;
      }
      embedRef.current?.next();
      return;
    }
    advance(1, false);
  }, [advance, embedVideoId, repeat, queue]);

  const prev = useCallback(() => {
    if (embedVideoId) {
      const allYoutube = queue.length > 0 && queue.every((t) => !!youtubeVideoId(t.url));
      if (repeat === "one" || !allYoutube) {
        advance(-1, false);
        return;
      }
      embedRef.current?.previous();
      return;
    }
    advance(-1, false);
  }, [advance, embedVideoId, repeat, queue]);

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

  /* ---- Hẹn giờ ngủ: giảm âm lượng dần trong 10 giây cuối rồi tạm dừng ---- */
  const applyOutputVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      if (embedVideoId) {
        embedRef.current?.setVolume(clamped);
        embedRef.current?.mute(clamped <= 0.001);
        return;
      }
      const el = getActiveMedia();
      if (el) {
        el.volume = clamped;
        el.muted = clamped <= 0.001;
      }
    },
    [embedVideoId, getActiveMedia]
  );

  const setSleepTimer = useCallback(
    (minutes: number | null) => {
      if (sleepFadeRef.current) {
        sleepFadeRef.current = false;
        applyOutputVolume(preSleepVolumeRef.current);
      }
      if (!minutes || minutes <= 0) {
        setSleepEndsAt(null);
        setSleepRemaining(0);
        return;
      }
      setSleepEndsAt(Date.now() + minutes * 60000);
      setSleepRemaining(minutes * 60);
    },
    [applyOutputVolume]
  );

  useEffect(() => {
    if (!sleepEndsAt) {
      sleepTickRef.current = null;
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.round((sleepEndsAt - Date.now()) / 1000));
      setSleepRemaining(left);

      if (left <= 0) {
        setSleepEndsAt(null);
        setSleepRemaining(0);
        if (sleepFadeRef.current) {
          sleepFadeRef.current = false;
          applyOutputVolume(preSleepVolumeRef.current);
        }
        pauseCurrent();
        return;
      }
      if (left > 10) {
        if (sleepFadeRef.current) {
          sleepFadeRef.current = false;
          applyOutputVolume(volumeRef.current);
        }
        return;
      }
      if (!sleepFadeRef.current) {
        sleepFadeRef.current = true;
        preSleepVolumeRef.current = mutedRef.current ? 0 : volumeRef.current;
      }
      applyOutputVolume(preSleepVolumeRef.current * (left / 10));
    };
    sleepTickRef.current = tick;
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      sleepTickRef.current = null;
      window.clearInterval(id);
    };
  }, [sleepEndsAt, applyOutputVolume, pauseCurrent]);

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

  /* YouTube tự chuyển bài trong playlist nội bộ. Chỉ cần đồng bộ lại UI,
     vì khi chạy nền chính player của YouTube mới là thứ giữ nhạc liên tục. */
  const onEmbedState = useCallback((state: number) => {
    if (state === 1) setPlaying(true);
    else if (state === 0 || state === 2) setPlaying(false);
  }, []);

  const onEmbedProgress = useCallback((time: number, dur: number) => {
    setPosition(time);
    if (dur && isFinite(dur)) setDuration(dur);
    const id = currentRef.current?.id;
    if (id && time > 3) lastTickRef.current = { id, seconds: time };
    sleepTickRef.current?.();
  }, []);

  const onEmbedVideoChange = useCallback(
    (videoId: string) => {
      const prev = currentRef.current;
      if (!prev || youtubeVideoId(prev.url) === videoId) return;
      const list = queueRef.current;
      const i = list.findIndex((t) => youtubeVideoId(t.url) === videoId);
      if (i < 0) return;
      const track = list[i];
      setIndex(i);
      setCurrent(track);
      pushHistory(track);
      setPosition(0);
    },
    [pushHistory]
  );

  const onEmbedError = useCallback((message: string) => {
    setError(message);
    setLoading(false);
  }, []);

  const toggleShuffle = useCallback(
    () => {
      const next = !shuffle;
      if (next === shuffle) return;

      const rebuildEmbed = (target: Track[]) => {
        if (!embedVideoId || !current) return;
        const start = embedRef.current?.getCurrentTime() ?? 0;
        const req = buildYtRequest(current, start, target);
        if (req) setYtRequest(req);
      };

      if (next) {
        preShuffleRef.current = queue;
        if (queue.length > 1) {
          const rest = shuffleArray(queue.filter((t) => t.id !== current?.id));
          const newQueue = current && queue.some((t) => t.id === current.id) ? [current, ...rest] : rest;
          setQueue(newQueue);
          setIndex(newQueue.length ? 0 : -1);
          rebuildEmbed(newQueue);
        }
      } else {
        const original = preShuffleRef.current;
        preShuffleRef.current = null;
        if (original && original.length) {
          setQueue(original);
          const i = current ? original.findIndex((t) => t.id === current.id) : -1;
          setIndex(i >= 0 ? i : 0);
          rebuildEmbed(original);
        }
      }
      setShuffle(next);
    },
    [shuffle, queue, current, embedVideoId, buildYtRequest]
  );

  /* Đổi chế độ lặp: đổi "playlist" nạp vào YouTube để nó tự lặp đúng cách. */
  const repeatRef = useRef(repeat);
  useEffect(() => {
    const was = repeatRef.current;
    repeatRef.current = repeat;
    if (!embedVideoId || !current) return;
    if (repeat !== "one" && was !== "one") return;
    const start = embedRef.current?.getCurrentTime() ?? 0;
    if (repeat === "one") {
      ytPoolRef.current = [current];
      setYtRequest({ ids: [embedVideoId], index: 0, start, key: ++ytKeyRef.current, autoPlay: true });
    } else {
      setYtRequest(buildYtRequest(current, start));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeat]);

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
      const id = currentRef.current?.id;
      if (id && el.currentTime > 3) lastTickRef.current = { id, seconds: el.currentTime };
      sleepTickRef.current?.();
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

  /* Persist playback position (theo đúng bài, kể cả khi YouTube tự chuyển bài) */
  useEffect(() => {
    if (!current) return;
    const id = current.id;
    const save = () => {
      const tick = lastTickRef.current;
      if (tick.id !== id || tick.seconds <= 3) return;
      try {
        window.localStorage.setItem(posKey(id), String(Math.floor(tick.seconds)));
      } catch {
        /* ignore */
      }
    };
    const t = setInterval(save, 5000);
    return () => {
      clearInterval(t);
      save();
    };
  }, [current]);

  /* Lưu phiên (bài đang nghe + hàng đợi) để iOS đóng tab vẫn mở lại đúng chỗ. */
  useEffect(() => {
    if (!current) return;
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ current, queue, index }));
    } catch {
      /* ignore */
    }
  }, [current, queue, index]);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === "undefined") return;
    let data: { current?: Track; queue?: Track[]; index?: number } | null = null;
    try {
      data = JSON.parse(window.localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      data = null;
    }
    if (!data?.current) return;
    const track = data.current;
    const list = Array.isArray(data.queue) && data.queue.length ? data.queue : [track];
    const at =
      typeof data.index === "number" && data.index >= 0 && data.index < list.length ? data.index : 0;
    setCurrent(track);
    setQueue(list);
    setIndex(at);
    /* Nạp sẵn nhưng không tự phát: iOS chặn autoplay, và người dùng có thể
       không muốn nhạc bật lên khi vừa mở app. */
    resolveCurrent(track, list, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Khi quay lại tab: YouTube có thể đã tự chuyển bài trong lúc chạy nền.
     Đọc lại index thật từ player để UI khớp (JS có thể đã bị treo trước đó). */
  const syncFromEmbed = useCallback(() => {
    if (!embedVideoId) return;
    const yt = embedRef.current;
    if (!yt) return;
    const i = yt.getIndex();
    if (i < 0) return;
    const track = ytPoolRef.current[i];
    if (track && currentRef.current?.id !== track.id) {
      const qi = queueRef.current.findIndex((t) => t.id === track.id);
      if (qi >= 0) setIndex(qi);
      setCurrent(track);
      pushHistory(track);
    }
    const t = yt.getCurrentTime();
    if (t > 0) {
      setPosition(t);
      const id = ytPoolRef.current[i]?.id;
      if (id) lastTickRef.current = { id, seconds: t };
    }
  }, [embedVideoId, pushHistory]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") syncFromEmbed();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncFromEmbed]);

  /* Media Session (lock screen / control center)
     Đăng ký handler một lần, đọc giá trị mới nhất qua ref để không bị
     tháo/gắn lại mỗi lần timeupdate. */
  const msHandlersRef = useRef({ prev, next, seek, position, embedVideoId, getActiveMedia });
  msHandlersRef.current = { prev, next, seek, position, embedVideoId, getActiveMedia };

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;

    const play = () => {
      const h = msHandlersRef.current;
      if (h.embedVideoId) {
        embedRef.current?.play();
        return;
      }
      const el = h.getActiveMedia();
      if (el) void el.play().catch((e: Error) => setError(e.message));
    };
    const pause = () => {
      const h = msHandlersRef.current;
      if (h.embedVideoId) {
        embedRef.current?.pause();
        return;
      }
      h.getActiveMedia()?.pause();
    };
    const previous = () => {
      const h = msHandlersRef.current;
      if (h.position > 3) {
        h.seek(0);
        return;
      }
      h.prev();
    };
    const nextTrack = () => msHandlersRef.current.next();
    const backward = (d: MediaSessionActionDetails) =>
      msHandlersRef.current.seek(Math.max(0, msHandlersRef.current.position - (d.seekOffset || 10)));
    const forward = (d: MediaSessionActionDetails) =>
      msHandlersRef.current.seek(msHandlersRef.current.position + (d.seekOffset || 10));
    const seekTo = (d: MediaSessionActionDetails) => {
      if (d.seekTime != null) msHandlersRef.current.seek(d.seekTime);
    };

    try {
      ms.setActionHandler("play", play);
      ms.setActionHandler("pause", pause);
      ms.setActionHandler("stop", pause);
      ms.setActionHandler("previoustrack", previous);
      ms.setActionHandler("nexttrack", nextTrack);
      ms.setActionHandler("seekbackward", backward);
      ms.setActionHandler("seekforward", forward);
      ms.setActionHandler("seekto", seekTo);
    } catch {
      /* unsupported action */
    }

    return () => {
      const actions = [
        "play",
        "pause",
        "stop",
        "previoustrack",
        "nexttrack",
        "seekbackward",
        "seekforward",
        "seekto",
      ] as const;
      for (const action of actions) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  /* Ảnh bìa / tiêu đề chỉ đổi khi đổi bài. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (!current) {
      try {
        ms.metadata = null;
        ms.playbackState = "none";
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      ms.metadata = new MediaMetadata({
        title: current.title,
        artist: current.uploader || "SyncTune",
        album: "SyncTune",
        artwork: current.thumbnail ? [{ src: current.thumbnail, sizes: "480x360", type: "image/jpeg" }] : [],
      });
    } catch {
      /* ignore */
    }
  }, [current]);

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
      ytRequest,
      onEmbedReady,
      onEmbedState,
      onEmbedProgress,
      onEmbedError,
      onEmbedVideoChange,
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
      sleepRemaining,
      sleepActive: sleepEndsAt !== null,
      setSleepTimer,
      playTrack,
      playQueue,
      playShuffled,
      playAt,
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
      ytRequest,
      isEmbed,
      onEmbedReady,
      onEmbedState,
      onEmbedProgress,
      onEmbedError,
      onEmbedVideoChange,
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
      sleepRemaining,
      sleepEndsAt,
      setSleepTimer,
      playTrack,
      playQueue,
      playShuffled,
      playAt,
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
