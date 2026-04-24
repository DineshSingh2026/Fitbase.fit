export type MacroConfidenceLabel = "high" | "medium" | "low";

export interface NormalizedAiResult {
  dish: string;
  description: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
  weight: number;
  confidence: MacroConfidenceLabel;
  tips: string[];
  _bbAnalyzedWithPhoto?: boolean;
  _bbEntrySource?: "ai" | "manual";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Heuristic meal quality 1–10 from macros (not LLM). */
export function computeMealScore(raw: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}): number {
  const calories = clamp(Number(raw.calories) || 0, 1, 20_000);
  const protein = clamp(Number(raw.protein) || 0, 0, 1000);
  const carbs = clamp(Number(raw.carbs) || 0, 0, 1000);
  const fat = clamp(Number(raw.fat) || 0, 0, 1000);
  const fiber = clamp(Number(raw.fiber) || 0, 0, 200);

  let score = 5;

  const proteinPctCals = calories > 0 ? ((protein * 4) / calories) * 100 : 0;
  if (proteinPctCals >= 25) score += 2;
  else if (proteinPctCals >= 18) score += 1;
  else if (proteinPctCals >= 12) score += 0;
  else score -= 1;

  const fatPctCals = calories > 0 ? ((fat * 9) / calories) * 100 : 0;
  if (fatPctCals <= 30) score += 1;
  else if (fatPctCals <= 40) score += 0;
  else if (fatPctCals <= 50) score -= 1;
  else score -= 2;

  if (fiber >= 12) score += 2;
  else if (fiber >= 8) score += 1;
  else if (fiber >= 4) score += 0;
  else score -= 1;

  if (calories >= 300 && calories <= 700) score += 2;
  else if (calories >= 200 && calories <= 900) score += 1;
  else if (calories < 200) score -= 1;

  const carbPct = calories > 0 ? ((carbs * 4) / calories) * 100 : 0;
  if (carbPct <= 55) score += 1;

  return clamp(Math.round(score), 1, 10);
}

export function macroDerivedKcal(m: { protein: number; carbs: number; fat: number }): number {
  const p = Number(m.protein) || 0;
  const c = Number(m.carbs) || 0;
  const f = Number(m.fat) || 0;
  return p * 4 + c * 4 + f * 9;
}

export function kcalDriftRatio(stated: number, derived: number): number {
  const s = Math.abs(Number(stated)) || 1;
  return Math.abs(derived - stated) / s;
}

export function classifyMealConfidence(input: {
  entrySource: "ai" | "manual";
  modelConfidence?: string;
  hasPhoto: boolean;
  hasManualNote: boolean;
  macrosComplete: boolean;
}): MacroConfidenceLabel {
  if (input.entrySource === "manual") return "high";
  if (!input.macrosComplete) return "low";
  let bump = 0;
  if (input.hasPhoto) bump += 1;
  if (input.hasManualNote) bump += 1;
  const mc = String(input.modelConfidence || "").toLowerCase();
  let base: MacroConfidenceLabel = "medium";
  if (mc === "high") base = "high";
  else if (mc === "low") base = "low";
  if (bump >= 2 && base === "medium") return "high";
  if (bump === 0 && base === "medium") return "medium";
  if (base === "high") return bump === 0 ? "high" : "high";
  if (base === "low") return bump >= 1 ? "medium" : "low";
  return "medium";
}

export function summarizeDailyConfidenceFromLabels(labels: MacroConfidenceLabel[]): {
  label: MacroConfidenceLabel;
  detail: string;
} {
  if (!labels.length) return { label: "low", detail: "No meals logged." };
  const lows = labels.filter((l) => l === "low").length;
  const highs = labels.filter((l) => l === "high").length;
  if (highs === labels.length) return { label: "high", detail: "High confidence (manual or strong signals)." };
  if (lows >= Math.ceil(labels.length / 2)) return { label: "low", detail: "Several low-confidence meals." };
  return { label: "medium", detail: "Mixed confidence across meals." };
}

export function normalizeAiResult(
  partial: Record<string, unknown>,
  opts: { analyzedWithPhoto: boolean; entrySource: "ai" | "manual" }
): NormalizedAiResult {
  const tipsRaw = partial.tips;
  const tips = Array.isArray(tipsRaw)
    ? tipsRaw.map((t) => String(t))
    : typeof tipsRaw === "string" && tipsRaw
      ? [tipsRaw]
      : [];
  const confRaw = String(partial.confidence || "medium").toLowerCase();
  const confidence: MacroConfidenceLabel =
    confRaw === "high" || confRaw === "low" || confRaw === "medium" ? (confRaw as MacroConfidenceLabel) : "medium";

  return {
    dish: String(partial.dish || "Meal"),
    description: String(partial.description || ""),
    serving: String(partial.serving || ""),
    calories: Math.round(Number(partial.calories) || 0),
    protein: Math.round(Number(partial.protein) || 0),
    carbs: Math.round(Number(partial.carbs) || 0),
    fat: Math.round(Number(partial.fat) || 0),
    fiber: Math.round(Number(partial.fiber) || 0),
    sodium: Math.round(Number(partial.sodium) || 0),
    weight: Math.round(Number(partial.weight) || 0),
    confidence,
    tips,
    _bbAnalyzedWithPhoto: opts.analyzedWithPhoto,
    _bbEntrySource: opts.entrySource
  };
}

export function macrosNumericComplete(m: NormalizedAiResult): boolean {
  return (
    Number.isFinite(m.calories) &&
    m.calories > 0 &&
    Number.isFinite(m.protein) &&
    Number.isFinite(m.carbs) &&
    Number.isFinite(m.fat)
  );
}
