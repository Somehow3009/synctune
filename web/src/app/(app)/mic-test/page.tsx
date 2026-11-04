"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePlayer } from "@/context/PlayerContext";
import { centsFromNearest, detectPitch, hzToMidi, midiToName } from "@/lib/pitch";
import { cn } from "@/lib/utils";

interface Live {
  note: string;
  hz: number;
  cents: number;
  clarity: number;
  rms: number;
}

interface MicInfo {
  label: string;
  sampleRate: number;
  settings: MediaTrackSettings | null;
  baseLatency: number | null;
  outputLatency: number | null;
}

const WAVE_H = 84;
const MIDI_LOW = 40;
const MIDI_HIGH = 84;
const HISTORY = 240;

const EMPTY_LIVE: Live = { note: "—", hz: 0, cents: 0, clarity: 0, rms: 0 };

export default function MicTestPage() {
  const { current, playing, isEmbed } = usePlayer();

  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Live>(EMPTY_LIVE);
  const [info, setInfo] = useState<MicInfo | null>(null);
  const [recording, setRecording] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipSize, setClipSize] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [sessionType, setSessionType] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array | null>(null);
  const rafRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const historyRef = useRef<Array<number | null>>([]);
  const lastUiRef = useRef(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    historyRef.current = [];
    setMicOn(false);
    setRecording(false);
    setLive(EMPTY_LIVE);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  useEffect(() => {
    return () => {
      if (clipUrl) URL.revokeObjectURL(clipUrl);
    };
  }, [clipUrl]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (!canvas || !analyser || !buf) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    // --- waveform ---
    g.strokeStyle = "rgba(56,189,248,0.9)";
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < buf.length; i++) {
      const x = (i / (buf.length - 1)) * w;
      const y = WAVE_H / 2 + buf[i] * (WAVE_H / 2) * 1.6;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = "rgba(148,163,184,0.25)";
    g.beginPath();
    g.moveTo(0, WAVE_H / 2);
    g.lineTo(w, WAVE_H / 2);
    g.stroke();

    // --- pitch strip ---
    const top = WAVE_H + 12;
    const stripH = h - top - 6;
    const yOf = (midi: number) =>
      top + ((MIDI_HIGH - midi) / (MIDI_HIGH - MIDI_LOW)) * stripH;

    for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) {
      const isC = ((m % 12) + 12) % 12 === 0;
      g.strokeStyle = isC ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.12)";
      g.lineWidth = isC ? 1 : 0.5;
      const y = yOf(m);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      if (isC) {
        g.fillStyle = "rgba(148,163,184,0.6)";
        g.font = "9px ui-monospace, monospace";
        g.fillText(midiToName(m), 2, y - 2);
      }
    }

    const hist = historyRef.current;
    const step = w / HISTORY;
    for (let i = 0; i < hist.length; i++) {
      const midi = hist[i];
      if (midi == null) continue;
      const x = i * step;
      const y = yOf(Math.max(MIDI_LOW, Math.min(MIDI_HIGH, midi)));
      g.fillStyle = "rgba(52,211,153,0.95)";
      g.fillRect(x, y - 1.5, Math.max(2, step), 3);
    }
  }, []);

  const loop = useCallback(() => {
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (!analyser || !buf) return;

    analyser.getFloatTimeDomainData(buf);
    const frame = detectPitch(buf, ctxRef.current?.sampleRate ?? 48000);

    let midi: number | null = null;
    if (frame.hz > 0 && frame.clarity > 0.5) {
      midi = hzToMidi(frame.hz);
      historyRef.current.push(midi);
    } else {
      historyRef.current.push(null);
    }
    if (historyRef.current.length > HISTORY) {
      historyRef.current.splice(0, historyRef.current.length - HISTORY);
    }

    const now = performance.now();
    if (now - lastUiRef.current > 100) {
      lastUiRef.current = now;
      setLive({
        note: midi != null ? midiToName(midi) : "—",
        hz: frame.hz,
        cents: frame.hz > 0 ? centsFromNearest(frame.hz) : 0,
        clarity: frame.clarity,
        rms: frame.rms,
      });
    }

    draw();
    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  const start = useCallback(async (preferredId?: string) => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trình duyệt này không cung cấp micro cho web app.");
      }
      const audio: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      };
      if (preferredId) audio.deviceId = { exact: preferredId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      streamRef.current = stream;

      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) throw new Error("Trình duyệt không hỗ trợ Web Audio.");
      const ctx = new AudioCtor();
      await ctx.resume();
      ctxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);

      const track = stream.getAudioTracks()[0];
      const latencyCtx = ctx as AudioContext & { outputLatency?: number };
      setInfo({
        label: track?.label || "(không rõ tên thiết bị)",
        sampleRate: ctx.sampleRate,
        settings: track?.getSettings?.() ?? null,
        baseLatency: typeof ctx.baseLatency === "number" ? ctx.baseLatency : null,
        outputLatency: typeof latencyCtx.outputLatency === "number" ? latencyCtx.outputLatency : null,
      });
      setDeviceId(track?.getSettings?.().deviceId ?? preferredId ?? "");

      const session = (navigator as Navigator & { audioSession?: { type?: string } }).audioSession;
      setSessionType(session?.type ?? null);

      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === "audioinput"));
      } catch {
        /* ignore */
      }

      setMicOn(true);
      lastUiRef.current = 0;
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      cleanup();
      setError(e instanceof Error ? e.message : "Không mở được micro.");
    }
  }, [cleanup, loop]);

  const switchDevice = useCallback(
    async (id: string) => {
      cleanup();
      await start(id || undefined);
    },
    [cleanup, start]
  );

  const changeSession = useCallback((type: string) => {
    const session = (navigator as Navigator & { audioSession?: { type?: string } }).audioSession;
    if (!session) {
      setError("Trình duyệt không hỗ trợ Audio Session API.");
      return;
    }
    try {
      session.type = type;
      setSessionType(session.type ?? type);
    } catch {
      setError("Không đổi được kiểu phiên âm thanh.");
    }
  }, []);

  const toggleRecord = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
    const mimeType =
      typeof MediaRecorder !== "undefined"
        ? types.find((t) => MediaRecorder.isTypeSupported(t))
        : undefined;
    if (typeof MediaRecorder === "undefined") {
      setError("Trình duyệt không hỗ trợ ghi âm.");
      return;
    }
    chunksRef.current = [];
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/mp4" });
      setClipSize(blob.size);
      setClipUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setRecording(false);
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
  }, [recording]);

  const settings = info?.settings;
  const bluetoothMic = /airpod|bluetooth|buds|beats|jbl|sony|wh-|wf-|bose|soundcore|edifier|galaxy/i.test(
    info?.label ?? ""
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Kiểm tra micro & cao độ</h1>
        <p className="mt-1 text-sm text-slate-500">
          Bước đệm cho chế độ Karaoke. Trang này sẽ được thay bằng giao diện hát thật.
        </p>
      </div>

      <section className="st-card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-400">Đang phát</p>
            <p className="truncate text-sm font-medium">
              {current ? current.title : "Chưa có bài nào"}
            </p>
            <p className="text-xs text-slate-500">
              {isEmbed ? "YouTube" : "Nguồn trực tiếp"} · {playing ? "đang phát" : "tạm dừng"}
            </p>
          </div>
          <Link href="/" className="st-chip">
            Về trang chủ
          </Link>
        </div>

        <button
          onClick={micOn ? cleanup : () => void start()}
          className={cn("st-btn w-full justify-center", micOn ? "st-btn-ghost" : "st-btn-primary")}
        >
          {micOn ? "Tắt micro" : "Bật micro"}
        </button>

        {error ? (
          <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
        ) : null}

        {micOn || devices.length > 0 ? (
          <label className="block text-xs text-slate-500">
            Nguồn micro
            <select
              value={deviceId}
              onChange={(e) => void switchDevice(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
            >
              <option value="">Mặc định của hệ thống</option>
              {devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Micro ${i + 1}`}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-slate-400">
              Chọn micro của điện thoại (không phải tai nghe) để tránh tai nghe chuyển sang chế độ gọi.
              iOS có thể bỏ qua lựa chọn này.
            </span>
          </label>
        ) : null}

        {bluetoothMic ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
            Đang dùng micro của tai nghe Bluetooth → iOS chuyển sang chế độ gọi (HFP), nhạc sẽ bị đục.
            Thử chọn micro điện thoại ở trên.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Thiết bị" value={info?.label ?? "—"} />
          <Stat label="Sample rate" value={info ? `${info.sampleRate} Hz` : "—"} />
          <Stat
            label="Khử vọng"
            value={settings ? (settings.echoCancellation ? "bật" : "tắt") : "—"}
          />
          <Stat
            label="Khử ồn"
            value={settings ? (settings.noiseSuppression ? "bật" : "tắt") : "—"}
          />
          <Stat
            label="Tự tăng âm"
            value={settings ? (settings.autoGainControl ? "bật" : "tắt") : "—"}
          />
          <Stat
            label="Độ trễ"
            value={
              info?.baseLatency != null
                ? `${Math.round((info.baseLatency + (info.outputLatency ?? 0)) * 1000)} ms`
                : "—"
            }
          />
          <Stat label="Phiên âm thanh" value={sessionType ?? "không hỗ trợ"} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Thử kiểu phiên:</span>
          {["play-and-record", "playback", "auto"].map((t) => (
            <button
              key={t}
              onClick={() => changeSession(t)}
              className={cn("st-chip", sessionType === t && "!bg-brand-600/20 !text-brand-500")}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="st-card space-y-3 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Cao độ</p>
            <p className="text-3xl font-bold tabular-nums">{live.note}</p>
            <p className="text-xs text-slate-500">
              {live.hz > 0 ? `${live.hz.toFixed(1)} Hz` : "chưa nghe thấy giọng"}
            </p>
          </div>
          <span
            className={cn(
              "st-chip tabular-nums",
              live.hz === 0
                ? ""
                : Math.abs(live.cents) <= 25
                  ? "!bg-emerald-500/15 !text-emerald-500"
                  : Math.abs(live.cents) <= 60
                    ? "!bg-amber-500/15 !text-amber-500"
                    : "!bg-red-500/15 !text-red-500"
            )}
          >
            {live.hz > 0 ? `${live.cents > 0 ? "+" : ""}${Math.round(live.cents)} cent` : "—"}
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-100"
            style={{ width: `${Math.round(live.clarity * 100)}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-500">
          Độ tin cậy {Math.round(live.clarity * 100)}% · mức âm {Math.round(live.rms * 100)}
        </p>

        <div className="overflow-hidden rounded-2xl bg-slate-900">
          <canvas ref={canvasRef} className="block h-56 w-full" />
        </div>

        <p className="text-xs text-slate-500">
          Hát giữ một nốt “a” khoảng 2 giây. Nếu đường xanh nhảy loạn, micro đang thu quá nhỏ hoặc
          đang lẫn nhạc.
        </p>
      </section>

      <section className="st-card space-y-3 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Ghi âm thử</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleRecord}
            disabled={!micOn}
            className={cn("st-btn", recording ? "st-btn-primary" : "st-btn-ghost", !micOn && "opacity-50")}
          >
            {recording ? "Dừng ghi" : "Ghi âm"}
          </button>
          {clipSize ? <span className="text-xs text-slate-500">{Math.round(clipSize / 1024)} KB</span> : null}
        </div>
        {clipUrl ? (
          <audio src={clipUrl} controls className="w-full">
            <track kind="captions" />
          </audio>
        ) : null}
      </section>

      <section className="st-card space-y-2 p-4 text-sm text-slate-500">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Thử với tai nghe Bluetooth
        </h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Bật một bài ở trang chủ, đeo tai nghe Bluetooth.</li>
          <li>Quay lại trang này, bấm “Bật micro”.</li>
          <li>
            Nghe xem nhạc có bị <strong>nhỏ và đục</strong> đi không — đó là lúc tai nghe chuyển
            sang chế độ gọi (HFP).
          </li>
          <li>
            Mở “Nguồn micro”, chọn micro của điện thoại (thường tên kiểu “iPhone Microphone”).
            Nếu nhạc trở lại bình thường và ô “Thiết bị” đổi tên → đã né được HFP.
          </li>
          <li>Hát thử và xem cao độ có bám đúng nốt không.</li>
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-white/5">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="truncate text-xs font-medium">{value}</p>
    </div>
  );
}
