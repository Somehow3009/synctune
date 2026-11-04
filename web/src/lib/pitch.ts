/**
 * Nhận diện cao độ giọng hát bằng thuật toán YIN.
 * Dùng cho chế độ Karaoke: chạy hoàn toàn trên máy, không gửi audio lên server.
 */

export interface PitchFrame {
  /** Tần số (Hz); 0 nếu không xác định được. */
  hz: number;
  /** Độ tin cậy 0..1. */
  clarity: number;
  /** Năng lượng âm thanh 0..1. */
  rms: number;
}

const MIN_HZ = 70;
const MAX_HZ = 1100;

export function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function downsample(buf: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return buf;
  const n = Math.floor(buf.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += buf[i * factor + j];
    out[i] = sum / factor;
  }
  return out;
}

/**
 * Ước lượng f0 của một khung tín hiệu.
 * Khung 2048 mẫu @48kHz cho độ phân giải ~10ms, đủ để chấm điểm giọng hát.
 */
export function detectPitch(input: Float32Array, sampleRate: number): PitchFrame {
  const rms = rmsOf(input);
  if (rms < 0.006) return { hz: 0, clarity: 0, rms };

  const factor = sampleRate > 32000 ? 2 : 1;
  const x = downsample(input, factor);
  const sr = sampleRate / factor;
  const n = x.length;

  const maxLag = Math.min(Math.floor(sr / MIN_HZ), Math.floor(n / 2));
  const minLag = Math.max(2, Math.floor(sr / MAX_HZ));
  if (maxLag <= minLag) return { hz: 0, clarity: 0, rms };

  // Hàm sai khác: d(tau) = sum (x[j] - x[j+tau])^2
  const diff = new Float32Array(maxLag + 1);
  for (let tau = minLag; tau <= maxLag; tau++) {
    let sum = 0;
    const limit = n - tau;
    for (let j = 0; j < limit; j++) {
      const d = x[j] - x[j + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // Chuẩn hoá theo trung bình tích luỹ
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1;
  }

  const threshold = 0.15;
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 <= maxLag && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    let best = minLag;
    for (let t = minLag; t <= maxLag; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (cmnd[best] > 0.6) return { hz: 0, clarity: 0, rms };
    tau = best;
  }

  // Nội suy parabol để mịn hơn
  let refined = tau;
  if (tau > minLag && tau < maxLag) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-9) refined = tau + (a - c) / (2 * denom);
  }

  const hz = sr / refined;
  const clarity = Math.max(0, Math.min(1, 1 - cmnd[tau]));
  if (!isFinite(hz) || hz < MIN_HZ || hz > MAX_HZ) return { hz: 0, clarity: 0, rms };
  return { hz, clarity, rms };
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  return `${name}${Math.floor(rounded / 12) - 1}`;
}

/** Lệch bao nhiêu cent so với nốt gần nhất (âm = thấp, dương = cao). */
export function centsFromNearest(hz: number): number {
  const midi = hzToMidi(hz);
  return (midi - Math.round(midi)) * 100;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
