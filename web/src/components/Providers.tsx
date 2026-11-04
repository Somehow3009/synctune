"use client";

import { useEffect, useState } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { LibraryProvider } from "@/context/LibraryContext";
import { PlayerProvider, usePlayer } from "@/context/PlayerContext";
import { ThemeProvider } from "@/context/ThemeContext";

function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}

/**
 * The audio element lives at the document root (not inside the player overlay)
 * and stays rendered at 1x1px so iOS keeps the audio session alive when the
 * player is collapsed or the app is backgrounded.
 */
function PersistentAudio() {
  const { audioRef } = usePlayer();
  return (
    <audio
      ref={audioRef}
      preload="auto"
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 0,
        bottom: 0,
        width: 1,
        height: 1,
        opacity: 0.01,
        pointerEvents: "none",
      }}
    />
  );
}

function MediaDiagnostics() {
  const { audioRef, embedRef, isEmbed, playing, current, ytRequest, sleepRemaining } = usePlayer();
  const [enabled, setEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("diag") !== "1") return;
    setEnabled(true);
    const id = window.setInterval(() => {
      const el = audioRef.current;
      let media: string;
      if (isEmbed) {
        const yt = embedRef.current;
        const st = yt?.getState() ?? -1;
        const t = yt?.getCurrentTime() ?? 0;
        const idx = yt?.getIndex() ?? -1;
        const loop = ytRequest?.ids.length === 1 ? "one" : "all";
        media = `YT state=${st} t=${t.toFixed(1)} idx=${idx}/${ytRequest?.ids.length ?? 0} loop=${loop}`;
      } else if (el) {
        media =
          `audio paused=${el.paused} rs=${el.readyState} ` +
          `t=${el.currentTime.toFixed(1)}/${isFinite(el.duration) ? el.duration.toFixed(1) : "-"}`;
      } else {
        media = "no media";
      }
      const ms = "mediaSession" in navigator ? navigator.mediaSession.playbackState : "-";
      setSnapshot(
        `vis=${document.visibilityState} playing=${playing} ms=${ms} sleep=${sleepRemaining}s | ` +
          `${media} | ${(current?.title || "-").slice(0, 28)}`
      );
    }, 500);
    return () => window.clearInterval(id);
  }, [audioRef, embedRef, isEmbed, playing, current, ytRequest, sleepRemaining]);

  if (!enabled) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        bottom: 0,
        zIndex: 9999,
        maxWidth: "100vw",
        background: "rgba(0,0,0,0.85)",
        color: "#9f9",
        font: "10px/1.3 monospace",
        padding: "2px 4px",
        wordBreak: "break-all",
      }}
    >
      {snapshot}
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LibraryProvider>
          <PlayerProvider>
            <PersistentAudio />
            <MediaDiagnostics />
            <ServiceWorkerRegistrar />
            {children}
          </PlayerProvider>
        </LibraryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
