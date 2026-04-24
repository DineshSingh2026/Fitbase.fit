import { LM, type ExerciseId } from "./constants";
import { ang, vis } from "./geometry";
import type { DetectorOutput, JointStatus, NormalizedLandmarkList } from "./types";

const COL = {
  good: "#3de68b",
  warn: "#e4bb5a",
  bad: "#ff4f6a",
  neut: "rgba(255,255,255,.35)"
};

const BONES: [number, number, keyof JointStatus][] = [
  [LM.LS, LM.RS, "torso"],
  [LM.LS, LM.LH, "torso"],
  [LM.RS, LM.RH, "torso"],
  [LM.LH, LM.RH, "hip"],
  [LM.LS, LM.LE, "L_elbow"],
  [LM.LE, LM.LW, "L_elbow"],
  [LM.RS, LM.RE, "R_elbow"],
  [LM.RE, LM.RW, "R_elbow"],
  [LM.LH, LM.LK, "L_knee"],
  [LM.LK, LM.LA, "L_knee"],
  [LM.RH, LM.RK, "R_knee"],
  [LM.RK, LM.RA, "R_knee"]
];

export function evaluateJoints(ex: ExerciseId, lm: NormalizedLandmarkList | null): JointStatus {
  const st: JointStatus = {
    torso: "neut",
    hip: "neut",
    L_elbow: "neut",
    R_elbow: "neut",
    L_knee: "neut",
    R_knee: "neut"
  };
  if (!lm) return st;
  const kL = ang(lm, LM.LH, LM.LK, LM.LA);
  const kR = ang(lm, LM.RH, LM.RK, LM.RA);
  if (ex === "squat") {
    if (kL != null) st.L_knee = kL < 94 ? "warn" : kL > 150 ? "good" : "neut";
    if (kR != null) st.R_knee = kR < 94 ? "warn" : kR > 150 ? "good" : "neut";
  } else if (ex === "pushup" || ex === "tricepsdip") {
    const eL = ang(lm, LM.LS, LM.LE, LM.LW);
    const eR = ang(lm, LM.RS, LM.RE, LM.RW);
    if (eL != null) st.L_elbow = eL < 100 ? "warn" : "good";
    if (eR != null) st.R_elbow = eR < 100 ? "warn" : "good";
  }
  return st;
}

function jointColor(st: JointStatus, key: keyof JointStatus): string {
  const v = st[key];
  return v === "good" ? COL.good : v === "warn" ? COL.warn : v === "bad" ? COL.bad : COL.neut;
}

export function drawCoachingOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lm: NormalizedLandmarkList | null,
  ex: ExerciseId,
  _detRes: DetectorOutput
): void {
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const st = evaluateJoints(ex, lm);
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  for (const [a, b, key] of BONES) {
    if (!vis(lm, a) || !vis(lm, b)) continue;
    const pa = lm[a]!;
    const pb = lm[b]!;
    ctx.strokeStyle = jointColor(st, key);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }
  ctx.restore();
}
