/**
 * Chấm điểm karaoke từ tín hiệu micro (chạy hoàn toàn trên máy).
 *
 * Lưu ý: với nguồn YouTube, trình duyệt không cho phân tích audio trong iframe
 * nên không thể biết giai điệu gốc. Bộ chấm này đánh giá KỸ THUẬT giọng hát:
 * độ chắc tông, độ ổn định, hơi, quãng, độ đều âm lượng.
 */

export interface KaraokeFrame {
  /** ms kể từ lúc bắt đầu hát */
  t: number;
  /** Hz, 0 nếu không có giọng */
  hz: number;
  midi: number;
  /** lệch cent so với nốt gần nhất */
  cents: number;
  clarity: number;
  rms: number;
}

export interface KaraokePart {
  key: string;
  label: string;
  score: number;
  note: string;
}

export interface KaraokeReport {
  enough: boolean;
  total: number;
  headline: string;
  parts: KaraokePart[];
  strengths: string[];
  improvements: string[];
  stats: {
    sungSeconds: number;
    longestPhrase: number;
    rangeLow: string;
    rangeHigh: string;
    rangeSemitones: number;
    inTunePct: number;
    driftCents: number;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function midiName(midi: number): string {
  const r = Math.round(midi);
  return `${NOTE_NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = clamp(Math.round((p / 100) * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

function rollingMedian(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - radius), Math.min(values.length, i + radius + 1));
    const sorted = [...slice].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  });
}

export function buildKaraokeReport(frames: KaraokeFrame[], elapsedSec: number): KaraokeReport {
  const empty: KaraokeReport = {
    enough: false,
    total: 0,
    headline: "Chưa đủ dữ liệu",
    parts: [],
    strengths: [],
    improvements: ["Hãy hát ít nhất khoảng 10 giây rồi thử lại."],
    stats: {
      sungSeconds: 0,
      longestPhrase: 0,
      rangeLow: "—",
      rangeHigh: "—",
      rangeSemitones: 0,
      inTunePct: 0,
      driftCents: 0,
    },
  };

  if (!frames.length || elapsedSec < 8) return empty;

  const voiced = frames.filter((f) => f.hz > 0 && f.clarity >= 0.55);
  if (voiced.length < 30) return empty;

  const dt = elapsedSec / frames.length; // giây/khung trung bình
  const sungSeconds = voiced.length * dt;
  if (sungSeconds < 5) return empty;

  const cents = voiced.map((f) => f.cents);
  const absCents = cents.map(Math.abs);
  const meanAbs = absCents.reduce((a, b) => a + b, 0) / absCents.length;
  const drift = cents.reduce((a, b) => a + b, 0) / cents.length;
  const inTune = absCents.filter((c) => c <= 35).length / absCents.length;

  // Độ chênh chao: lệch khỏi trung vị cục bộ
  const smoothed = rollingMedian(cents, 4);
  const wobble =
    cents.reduce((acc, c, i) => acc + Math.abs(c - smoothed[i]), 0) / Math.max(1, cents.length);

  // Quãng giọng (bỏ 5% ngoài biên để tránh nhiễu)
  const midis = voiced.map((f) => f.midi).sort((a, b) => a - b);
  const lowP = percentile(midis, 5);
  const highP = percentile(midis, 95);
  const rangeSemitones = Math.max(0, highP - lowP);

  // Câu hát dài nhất và số lần đứt hơi
  let longest = 0;
  let runStart = -1;
  let lastVoiced = -1;
  let gaps = 0;
  for (let i = 0; i < frames.length; i++) {
    const isVoiced = frames[i].hz > 0 && frames[i].clarity >= 0.55;
    if (isVoiced) {
      if (runStart < 0) runStart = i;
      lastVoiced = i;
    } else if (runStart >= 0 && (i - lastVoiced) * dt > 0.28) {
      longest = Math.max(longest, (lastVoiced - runStart) * dt);
      gaps += 1;
      runStart = -1;
    }
  }
  if (runStart >= 0) longest = Math.max(longest, (lastVoiced - runStart) * dt);

  // Độ đều âm lượng
  const rmsValues = voiced.map((f) => f.rms);
  const rmsMean = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  const rmsStd = Math.sqrt(
    rmsValues.reduce((acc, v) => acc + (v - rmsMean) ** 2, 0) / rmsValues.length
  );
  const cv = rmsMean > 0 ? rmsStd / rmsMean : 0;

  const intonationScore = Math.round(clamp(inTune * 70 + clamp(100 - meanAbs, 0, 100) * 0.3, 0, 100));
  const stabilityScore = Math.round(clamp(100 - wobble * 1.6, 0, 100));
  const breathScore = Math.round(clamp((longest / 8) * 100, 0, 100));
  const rangeScore = Math.round(clamp(((rangeSemitones - 5) / 14) * 100, 0, 100));
  const dynamicsScore = Math.round(clamp(100 - cv * 170, 0, 100));

  const total = Math.round(
    intonationScore * 0.4 +
      stabilityScore * 0.2 +
      breathScore * 0.15 +
      rangeScore * 0.1 +
      dynamicsScore * 0.15
  );

  const parts: KaraokePart[] = [
    {
      key: "intonation",
      label: "Chắc tông",
      score: intonationScore,
      note: `${Math.round(inTune * 100)}% số nốt nằm trong ±35 cent`,
    },
    {
      key: "stability",
      label: "Ổn định",
      score: stabilityScore,
      note: `dao động trung bình ${Math.round(wobble)} cent`,
    },
    {
      key: "breath",
      label: "Giữ hơi",
      score: breathScore,
      note: `câu dài nhất ${longest.toFixed(1)} giây${gaps > 2 ? `, ${gaps} lần đứt` : ""}`,
    },
    {
      key: "range",
      label: "Quãng giọng",
      score: rangeScore,
      note: `${midiName(lowP)} → ${midiName(highP)} (${Math.round(rangeSemitones)} nửa cung)`,
    },
    {
      key: "dynamics",
      label: "Đều âm",
      score: dynamicsScore,
      note: cv > 0.35 ? "âm lượng lên xuống khá nhiều" : "âm lượng khá đều",
    },
  ];

  const improvements: string[] = [];
  if (inTune < 0.6) {
    improvements.push(
      "Nhiều nốt bị chênh. Thử hát chậm lại và nghe kỹ nốt trước khi lên nốt kế tiếp."
    );
  }
  if (drift > 25) {
    improvements.push(
      `Bạn có xu hướng hát cao hơn nốt khoảng ${Math.round(drift)} cent — hát nhẹ lại, đừng đẩy giọng.`
    );
  } else if (drift < -25) {
    improvements.push(
      `Bạn có xu hướng hát thấp hơn nốt khoảng ${Math.round(-drift)} cent — lấy hơi sâu hơn và mở khẩu hình.`
    );
  }
  if (longest < 5) {
    improvements.push(
      `Câu dài nhất chỉ ${longest.toFixed(1)} giây. Tập lấy hơi sớm hơn ở cuối câu trước và hát liền mạch hơn.`
    );
  }
  if (wobble > 35) {
    improvements.push(
      "Giọng còn chênh chao trong từng nốt. Thử hát to hơn một chút và giữ hơi đều, tránh rung tay."
    );
  }
  if (rangeSemitones < 10) {
    improvements.push(
      "Quãng giọng còn hẹp. Luyện thêm các nốt cao bằng bài tập thang 5 nốt mỗi ngày."
    );
  }
  if (cv > 0.4) {
    improvements.push(
      "Âm lượng lên xuống nhiều. Hát đều hơn ở đầu câu và giữ hơi cho cuối câu."
    );
  }
  if (!improvements.length) {
    improvements.push("Kỹ thuật khá tốt. Thử hát lại và so sánh để thấy tiến bộ.");
  }

  const strengths = parts
    .filter((p) => p.score >= 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((p) => `${p.label}: ${p.note}`);

  const headline =
    total >= 85 ? "Rất tốt" : total >= 70 ? "Khá tốt" : total >= 55 ? "Ổn" : "Cần luyện thêm";

  return {
    enough: true,
    total,
    headline,
    parts,
    strengths,
    improvements: improvements.slice(0, 3),
    stats: {
      sungSeconds,
      longestPhrase: longest,
      rangeLow: midiName(lowP),
      rangeHigh: midiName(highP),
      rangeSemitones,
      inTunePct: Math.round(inTune * 100),
      driftCents: Math.round(drift),
    },
  };
}
