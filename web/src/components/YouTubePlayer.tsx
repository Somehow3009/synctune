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
}

interface Props {
  videoId: string | null;
  startSeconds?: number;
  className?: string;
  onReady?: () => void;
  onState?: (state: number) => void;
  onProgress?: (time: number, duration: number) => void;
  onError?: (message: string) => void;
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
  { videoId, startSeconds = 0, className, onReady, onState, onProgress, onError },
  ref
) {
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<{ videoId: string; start: number } | null>(null);
  const startRef = useRef(startSeconds);
  startRef.current = startSeconds;

  const cbRef = useRef({ onReady, onState, onProgress, onError });
  cbRef.current = { onReady, onState, onProgress, onError };

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
              const pending = pendingRef.current;
              if (pending) {
                pendingRef.current = null;
                player.loadVideoById({ videoId: pending.videoId, startSeconds: pending.start });
              }
              cbRef.current.onReady?.();
            },
            onStateChange: (event: { data: number }) => cbRef.current.onState?.(event.data),
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
  }, []);

  useEffect(() => {
    if (!videoId) return;
    const request = { videoId, start: Math.max(0, startRef.current) };
    if (readyRef.current && playerRef.current) {
      playerRef.current.loadVideoById(request);
    } else {
      pendingRef.current = request;
    }
  }, [videoId]);

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
    }),
    []
  );

  return <div ref={holderRef} className={className} />;
});
