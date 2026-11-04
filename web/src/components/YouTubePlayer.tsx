"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  loadPlaylist(opts: { playlist: string[]; index?: number; startSeconds?: number }): void;
  cuePlaylist(opts: { playlist: string[]; index?: number; startSeconds?: number }): void;
  setLoop(loop: boolean): void;
  nextVideo(): void;
  previousVideo(): void;
  playVideoAt(index: number): void;
  getPlaylist(): string[] | undefined;
  getPlaylistIndex(): number;
  getVideoData(): { video_id?: string; title?: string; author?: string } | undefined;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayerHandle {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  mute(muted: boolean): void;
  setRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getState(): number;
  next(): void;
  previous(): void;
  playAt(index: number): void;
  getIndex(): number;
  setLoop(loop: boolean): void;
}

interface Props {
  videoId: string | null;
  startSeconds?: number;
  /** Danh sách video để YouTube tự chuyển bài / tự lặp kể cả khi JS bị treo. */
  playlist?: string[];
  playlistIndex?: number;
  /** Tăng số này để buộc nạp lại playlist (đổi thứ tự, đổi bài thủ công). */
  requestKey?: number;
  /** Lặp toàn bộ playlist (repeat all/one). */
  loop?: boolean;
  /** false = chỉ nạp bài (cue), chờ người dùng bấm phát. Dùng khi khôi phục phiên. */
  autoPlay?: boolean;
  className?: string;
  onReady?: () => void;
  onState?: (state: number) => void;
  onProgress?: (time: number, duration: number) => void;
  onError?: (message: string) => void;
  /** Bắn khi YouTube tự chuyển sang video khác (kể cả khi chạy nền). */
  onVideoChange?: (videoId: string) => void;
}

interface LoadRequest {
  videoId: string;
  start: number;
  playlist?: string[];
  index: number;
  autoPlay: boolean;
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT as YTNamespace);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
  return apiPromise;
}

function errorMessage(code: number): string {
  if (code === 2) return "Link video không hợp lệ";
  if (code === 5) return "Trình duyệt không phát được video này";
  if (code === 100) return "Video không tồn tại hoặc đã bị xoá";
  if (code === 101 || code === 150) return "Video này không cho phép phát nhúng. Hãy mở trên YouTube.";
  return "Không phát được video";
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, Props>(function YouTubePlayer(
  {
    videoId,
    startSeconds = 0,
    playlist,
    playlistIndex = 0,
    requestKey = 0,
    loop = false,
    autoPlay = true,
    className,
    onReady,
    onState,
    onProgress,
    onError,
    onVideoChange,
  },
  ref
) {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<LoadRequest | null>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  const cbRef = useRef({ onReady, onState, onProgress, onError, onVideoChange });
  cbRef.current = { onReady, onState, onProgress, onError, onVideoChange };

  const applyRequest = (req: LoadRequest) => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (req.playlist && req.playlist.length) {
        if (req.autoPlay) {
          player.loadPlaylist({ playlist: req.playlist, index: req.index, startSeconds: req.start });
        } else {
          player.cuePlaylist({ playlist: req.playlist, index: req.index, startSeconds: req.start });
        }
      } else if (req.videoId) {
        if (req.autoPlay) {
          player.loadVideoById({ videoId: req.videoId, startSeconds: req.start });
        } else {
          player.cueVideoById({ videoId: req.videoId, startSeconds: req.start });
        }
      }
      player.setLoop(!!loopRef.current);
    } catch {
      /* player not ready */
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadApi()
      .then((YT) => {
        const holder = holderRef.current;
        if (cancelled || !holder) return;
        const mount = document.createElement("div");
        mount.style.width = "100%";
        mount.style.height = "100%";
        holder.appendChild(mount);
        const player = new YT.Player(mount, {
          width: "100%",
          height: "100%",
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              readyRef.current = true;
              playerRef.current = player;
              try {
                player.setLoop(!!loopRef.current);
              } catch {
                /* ignore */
              }
              const pending = pendingRef.current;
              if (pending) {
                pendingRef.current = null;
                applyRequest(pending);
              }
              cbRef.current.onReady?.();
            },
            onStateChange: (event: { data: number }) => {
              cbRef.current.onState?.(event.data);
              if (event.data === 1) {
                try {
                  const data = player.getVideoData?.();
                  if (data?.video_id) cbRef.current.onVideoChange?.(data.video_id);
                } catch {
                  /* player not ready */
                }
              }
            },
            onError: (event: { data: number }) => cbRef.current.onError?.(errorMessage(event.data)),
          },
        });
        playerRef.current = player;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      readyRef.current = false;
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      holderRef.current?.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Chỉ nạp lại khi người dùng chủ động đổi bài / đổi thứ tự (requestKey).
     Khi YouTube tự chuyển bài, requestKey không đổi nên không bị nạp lại. */
  useEffect(() => {
    const firstId = videoId || (playlist && playlist.length ? playlist[playlistIndex] : null);
    if (!firstId) return;
    const req: LoadRequest = {
      videoId: firstId,
      start: Math.max(0, startSeconds || 0),
      playlist: playlist && playlist.length ? playlist : undefined,
      index: playlistIndex,
      autoPlay,
    };
    if (readyRef.current && playerRef.current) applyRequest(req);
    else pendingRef.current = req;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, requestKey]);

  useEffect(() => {
    try {
      playerRef.current?.setLoop(!!loop);
    } catch {
      /* ignore */
    }
  }, [loop]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current || !cbRef.current.onProgress) return;
      try {
        cbRef.current.onProgress(player.getCurrentTime() || 0, player.getDuration() || 0);
      } catch {
        /* not ready */
      }
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      play: () => playerRef.current?.playVideo(),
      pause: () => playerRef.current?.pauseVideo(),
      seek: (seconds: number) => playerRef.current?.seekTo(Math.max(0, seconds), true),
      setVolume: (volume: number) =>
        playerRef.current?.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100)),
      mute: (muted: boolean) => {
        if (!playerRef.current) return;
        if (muted) playerRef.current.mute();
        else playerRef.current.unMute();
      },
      setRate: (rate: number) => playerRef.current?.setPlaybackRate(rate),
      getCurrentTime: () => playerRef.current?.getCurrentTime() || 0,
      getDuration: () => playerRef.current?.getDuration() || 0,
      getState: () => playerRef.current?.getPlayerState() ?? -1,
      next: () => {
        try {
          playerRef.current?.nextVideo();
        } catch {
          /* ignore */
        }
      },
      previous: () => {
        try {
          playerRef.current?.previousVideo();
        } catch {
          /* ignore */
        }
      },
      playAt: (index: number) => {
        try {
          playerRef.current?.playVideoAt(index);
        } catch {
          /* ignore */
        }
      },
      getIndex: () => {
        try {
          return playerRef.current?.getPlaylistIndex() ?? -1;
        } catch {
          return -1;
        }
      },
      setLoop: (value: boolean) => {
        try {
          playerRef.current?.setLoop(value);
        } catch {
          /* ignore */
        }
      },
    }),
    []
  );

  return <div ref={holderRef} className={className} />;
});
