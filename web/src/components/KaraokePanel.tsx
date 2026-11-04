"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { buildKaraokeReport, type KaraokeFrame, type KaraokeReport } from "@/lib/karaoke";
import { centsFromNearest, detectPitch, hzToMidi, midiToName } from "@/lib/pitch";
import { cn, formatTime } from "@/lib/utils";
import { Close, Mic, Play } from "./Icons";

const MIC_KEY = "synctune:micDevice";
/** Khoảng cách giữa hai mẫu đưa vào bộ chấm điểm. */
const STEP_MS = 40;
/** Số mẫu hiện trên làn cao độ (12 giây). */
const HISTORY = Math.round(12000 / STEP_MS);

type Phase = "idle" | "starting" | "live" | "report";
type AudioSessionLike = { type?: string };

interface Live {
  note: string;
  hz: number;
  cents: number;
  clarity: number;
  rms: number;
}

const EMPTY_LIVE: Live = { note: "—", hz: 0, cents: 0, clarity: 0, rms: 0 };

const MIDI_LOW = 45;
const MIDI_HIGH = 81;

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-300";
  return "text-rose-400";
}

function scoreBar(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-400";
  return "bg-rose-500";
}

export function KaraokePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current, playing, toggle, position, duration, seek } = usePlayer();

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<Live>(EMPTY_LIVE);
  const [sung, setSung] = useState(0);
  const [report, setReport] = useState<KaraokeReport | null>(null);
  const [reportTitle, setReportTitle] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Float32Array | null>(null);
  const rafRef = useRef(0);
  const framesRef = useRef<KaraokeFrame[]>([]);
  const historyRef = useRef<Array<number | null>>([]);
  const startedAtRef = useRef(0);
  const lastSampleRef = useRef(0);
  const lastUiRef = useRef(0);
  const voicedMsRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const trackIdRef = useRef<string | null>(null);
  const prevPosRef = useRef(0);

  const setPhaseSafe = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const stopAudio = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
  }, []);

  const setAudioSession = useCallback((type: string) => {
    const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
    if (!session) return;
    try {
      session.type = type;
    } catch {
      /* trình duyệt không cho đổi */
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const yOf = (midi: number) =>
      ((MIDI_HIGH - midi) / (MIDI_HIGH - MIDI_LOW)) * h;

    for (let m = MIDI_LOW; m <= MIDI_HIGH; m++) {
      const isC = ((m % 12) + 12) % 12 === 0;
      g.strokeStyle = isC ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.08)";
      g.lineWidth = isC ? 1 : 0.5;
      const y = yOf(m);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      if (isC) {
        g.fillStyle = "rgba(148,163,184,0.55)";
        g.font = "9px ui-monospace, monospace";
        g.fillText(midiToName(m), 3, Math.max(9, y - 3));
      }
    }

    const hist = historyRef.current;
    const step = w / HISTORY;
    for (let i = 0; i < hist.length; i++) {
      const midi = hist[i];
      if (midi == null) continue;
      const x = (i + (HISTORY - hist.length)) * step;
      const y = yOf(Math.max(MIDI_LOW, Math.min(MIDI_HIGH, midi)));
      g.fillStyle = "rgba(52,211,153,0.95)";
      g.fillRect(x, y - 1.5, Math.max(2, step), 3);
    }
  }, []);

  const loop = useCallback(() => {
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    const ctx = ctxRef.current;
    if (!analyser || !buf || !ctx) return;

    analyser.getFloatTimeDomainData(buf);
    const now = performance.now();

    if (now - lastSampleRef.current >= STEP_MS) {
      const frame = detectPitch(buf, ctx.sampleRate);
      const voiced = frame.hz > 0 && frame.clarity >= 0.55;
      const midi = voiced ? hzToMidi(frame.hz) : 0;

      framesRef.current.push({
        t: now - startedAtRef.current,
        hz: voiced ? frame.hz : 0,
        midi,
        cents: voiced ? centsFromNearest(frame.hz) : 0,
        clarity: frame.clarity,
        rms: frame.rms,
      });

      historyRef.current.push(voiced ? midi : null);
      if (historyRef.current.length > HISTORY) {
        historyRef.current.splice(0, historyRef.current.length - HISTORY);
      }

      if (voiced) voicedMsRef.current += now - lastSampleRef.current;
      lastSampleRef.current = now;

      if (now - lastUiRef.current > 100) {
        lastUiRef.current = now;
        setLive({
          note: voiced ? midiToName(midi) : "—",
          hz: voiced ? frame.hz : 0,
          cents: voiced ? centsFromNearest(frame.hz) : 0,
          clarity: voiced ? frame.clarity : 0,
          rms: frame.rms,
        });
        setSung(voicedMsRef.current / 1000);
      }

      draw();
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  const openStream = useCallback(async (preferred?: string) => {
    const audio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    };
    if (preferred) audio.deviceId = { exact: preferred };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio });
    } catch (e) {
      // Thiết bị đã lưu không còn → mở micro mặc định.
      if (preferred) return navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: undefined } });
      throw e;
    }
  }, []);

  const start = useCallback(
    async (preferred?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Trình duyệt này không cho web app dùng micro.");
        setPhaseSafe("idle");
        return;
      }

      stopAudio();
      setError(null);
      setReport(null);
      setLive(EMPTY_LIVE);
      setSung(0);
      framesRef.current = [];
      historyRef.current = [];
      voicedMsRef.current = 0;
      trackIdRef.current = current?.id ?? null;
      setReportTitle(current?.title ?? "");
      prevPosRef.current = 0;
      setPhaseSafe("starting");

      try {
        const stored = preferred ?? window.localStorage.getItem(MIC_KEY) ?? "";
        const stream = await openStream(stored || undefined);
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
        const settings = track?.getSettings?.();
        setDeviceId(settings?.deviceId ?? stored ?? "");
        setDeviceLabel(track?.label || "Micro mặc định");
        if (settings?.deviceId) window.localStorage.setItem(MIC_KEY, settings.deviceId);

        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          setDevices(list.filter((d) => d.kind === "audioinput"));
        } catch {
          /* ignore */
        }

        // Giữ nhạc phát trong khi micro mở (nếu trình duyệt hỗ trợ).
        setAudioSession("play-and-record");

        startedAtRef.current = performance.now();
        lastSampleRef.current = startedAtRef.current;
        lastUiRef.current = 0;
        setPhaseSafe("live");
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        stopAudio();
        setPhaseSafe("idle");
        setError(
          e instanceof Error
            ? e.name === "NotAllowedError"
              ? "Bạn chưa cho phép dùng micro. Bấm “Hát” lại và chọn Cho phép."
              : e.message
            : "Không mở được micro."
        );
      }
    },
   [current?.id, current?.title, loop, openStream, position, setAudioSession, setPhaseSafe, stopAudio]
  );

  const finish = useCallback(() => {
    if (phaseRef.current !== "live") return;
    const elapsed = (performance.now() - startedAtRef.current) / 1000;
    stopAudio();
    setPhaseSafe("report");
    setLive(EMPTY_LIVE);
    setReport(buildKaraokeReport(framesRef.current, elapsed));
    draw();
  }, [draw, setPhaseSafe, stopAudio]);

  const close = useCallback(() => {
    stopAudio();
    setAudioSession("playback");
    setPhaseSafe("idle");
    setError(null);
    setReport(null);
    setLive(EMPTY_LIVE);
    setSung(0);
    onClose();
  }, [onClose, setAudioSession, setPhaseSafe, stopAudio]);

  // Mở panel = bắt đầu hát luôn (một chạm từ trình phát).
  useEffect(() => {
    if (!open) return;
    void start();
    return () => {
      stopAudio();
      setAudioSession("playback");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tự kết thúc khi hết bài hoặc sang bài khác.
  useEffect(() => {
    if (!open || phase !== "live") return;
    const id = current?.id ?? null;
    if (trackIdRef.current && id !== trackIdRef.current) {
      finish();
      return;
    }
    if (duration > 0 && position > 0) {
      const prev = prevPosRef.current;
      if (position >= duration - 0.7) {
        finish();
        return;
      }
      // Lặp lại một bài: vị trí nhảy về đầu.
      if (duration > 30 && prev > duration - 3 && position < 2) {
        finish();
        return;
      }
    }
    prevPosRef.current = position;
  }, [open, phase, current?.id, position, duration, finish]);

  const restart = useCallback(() => {
    seek(0);
    if (!playing) toggle();
    void start();
  }, [playing, seek, start, toggle]);

  if (!open) return null;

  const sungSeconds = Math.max(sung, framesRef.current.length * (STEP_MS / 1000));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-gradient-to-b from-[#14121f] via-[#0b0b12] to-black text-white">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600/25 text-brand-300">
            <Mic width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-white/40">Karaoke</p>
            <p className="truncate text-sm font-medium">{current?.title || "Chưa chọn bài"}</p>
          </div>
        </div>
        <button onClick={close} className="st-btn-ghost !text-white/70 hover:!bg-white/10" aria-label="Đóng">
          <Close />
        </button>
      </div>

      {phase === "live" ? (
        <LiveView
          live={live}
          sungSeconds={sungSeconds}
          canvasRef={canvasRef}
          position={position}
          duration={duration}
          deviceLabel={deviceLabel}
          devices={devices}
          deviceId={deviceId}
          onDevice={(id) => void start(id || undefined)}
          onFinish={finish}
        />
      ) : null}

      {phase === "starting" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          <p className="text-sm text-white/60">Đang mở micro…</p>
          <button onClick={close} className="st-btn-ghost !text-white/60">
            Huỷ
          </button>
        </div>
      ) : null}

      {phase === "idle" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-white/5 text-white/40">
            <Mic width={36} height={36} />
          </span>
          {error ? (
            <p className="max-w-sm rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-300">{error}</p>
          ) : (
            <p className="max-w-sm text-sm text-white/60">
              Bật micro để hát theo bài đang phát. Hết bài app sẽ tự chấm điểm và gợi ý cải thiện.
            </p>
          )}
          <button onClick={() => void start()} className="st-btn-primary">
            <Mic width={16} height={16} /> Bắt đầu hát
          </button>
          <p className="max-w-sm text-[11px] text-white/35">
            Âm thanh chỉ được phân tích trên máy, không gửi lên server.
          </p>
        </div>
      ) : null}

      {phase === "report" && report ? (
        <ReportView
          report={report}
          title={reportTitle}
          onRestart={restart}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

function LiveView({
  live,
  sungSeconds,
  canvasRef,
  position,
  duration,
  deviceLabel,
  devices,
  deviceId,
  onDevice,
  onFinish,
}: {
  live: Live;
  sungSeconds: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  position: number;
  duration: number;
  deviceLabel: string;
  devices: MediaDeviceInfo[];
  deviceId: string;
  onDevice: (id: string) => void;
  onFinish: () => void;
}) {
  const tuned = live.hz > 0 && Math.abs(live.cents) <= 35;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/40">Bạn đang hát</p>
          <p className="text-5xl font-bold tabular-nums leading-none">{live.note}</p>
          <p className="mt-1 text-xs text-white/45">
            {live.hz > 0 ? `${live.hz.toFixed(1)} Hz` : "chưa nghe thấy giọng"}
          </p>
        </div>
        <div className="text-right">
          <span
            className={cn(
              "st-chip !border-white/10 tabular-nums",
              live.hz === 0
                ? "!bg-white/5 !text-white/50"
                : tuned
                  ? "!bg-emerald-500/15 !text-emerald-300"
                  : Math.abs(live.cents) <= 60
                    ? "!bg-amber-500/15 !text-amber-300"
                    : "!bg-rose-500/15 !text-rose-300"
            )}
          >
            {live.hz > 0 ? `${live.cents > 0 ? "+" : ""}${Math.round(live.cents)} cent` : "—"}
          </span>
          <p className="mt-2 text-[11px] text-white/40">
            Đã hát {Math.round(sungSeconds)}s · {formatTime(position)}
            {duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full transition-[width] duration-100", tuned ? "bg-emerald-500" : "bg-brand-500")}
          style={{ width: `${Math.round(live.clarity * 100)}%` }}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
        <canvas ref={canvasRef} className="block h-40 w-full" />
      </div>

      <p className="text-xs text-white/45">
        Hát to hơn nhạc một chút. Đường xanh là cao độ giọng bạn trong 12 giây gần nhất.
      </p>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
        Mở micro có thể khiến tai nghe Bluetooth chuyển sang chế độ gọi (nhạc đục hơn). Nếu khó chịu,
        hãy dùng tai nghe có dây — điểm số không bị ảnh hưởng.
      </div>

      {devices.length > 1 ? (
        <label className="block text-xs text-white/45">
          Nguồn micro
          <select
            value={deviceId}
            onChange={(e) => onDevice(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          >
            <option value="">Mặc định của hệ thống</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {d.label || `Micro ${i + 1}`}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-white/30">Đang dùng: {deviceLabel || "—"}</span>
        </label>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <button onClick={onFinish} className="st-btn-primary w-full justify-center">
          Dừng & chấm điểm
        </button>
        <p className="text-center text-[11px] text-white/30">
          Hết bài app tự dừng và chấm. Hát càng nhiều càng chính xác.
        </p>
      </div>
    </div>
  );
}

function ReportView({
  report,
  title,
  onRestart,
  onClose,
}: {
  report: KaraokeReport;
  title: string;
  onRestart: () => void;
  onClose: () => void;
}) {
  if (!report.enough) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
        <p className="text-sm font-medium text-white/80">Chưa đủ dữ liệu để chấm</p>
        <p className="max-w-sm text-xs text-white/50">
          {report.improvements[0] ?? "Hãy hát to hơn và lâu hơn một chút rồi thử lại."}
        </p>
        <div className="flex gap-2">
          <button onClick={onRestart} className="st-btn-primary">
            <Play width={16} height={16} /> Hát lại
          </button>
          <button onClick={onClose} className="st-btn-ghost !text-white/70">
            Đóng
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-widest text-white/40">Kết quả</p>
        <p className="truncate text-sm text-white/60">{title}</p>
        <p className={cn("mt-2 text-6xl font-bold tabular-nums leading-none", scoreColor(report.total))}>
          {report.total}
        </p>
        <p className="mt-1 text-sm text-white/60">{report.headline}</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        {report.parts.map((p) => (
          <div key={p.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-white/80">{p.label}</span>
              <span className="tabular-nums text-white/55">{p.score}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className={cn("h-full rounded-full", scoreBar(p.score))} style={{ width: `${p.score}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-white/35">{p.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Giọng trong" value={`${report.stats.inTunePct}%`} />
        <Stat label="Câu dài nhất" value={`${report.stats.longestPhrase.toFixed(1)}s`} />
        <Stat label="Quãng" value={report.stats.rangeLow === "—" ? "—" : `${report.stats.rangeLow}–${report.stats.rangeHigh}`} />
      </div>

      {report.strengths.length ? (
        <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">Điểm mạnh</h3>
          <ul className="space-y-1 text-sm text-emerald-100/80">
            {report.strengths.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-brand-400/20 bg-brand-500/5 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-300">Cải thiện thế nào</h3>
        <ul className="space-y-2 text-sm leading-relaxed text-slate-200/85">
          {report.improvements.map((s) => (
            <li key={s}>• {s}</li>
          ))}
        </ul>
      </section>

      <p className="text-center text-[11px] leading-relaxed text-white/30">
        Điểm dựa trên mic nên đánh giá kỹ thuật giọng hát (tông, hơi, quãng), không so với giai điệu gốc
        trong video YouTube.
      </p>

      <div className="flex gap-2 pb-2">
        <button onClick={onRestart} className="st-btn-primary flex-1 justify-center">
          <Play width={16} height={16} /> Hát lại
        </button>
        <button onClick={onClose} className="st-btn-ghost flex-1 justify-center !text-white/70">
          Đóng
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-white/35">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
