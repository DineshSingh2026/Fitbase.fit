/** MediaPipe-normalized landmark (subset used here). */
export type Landmark = { x: number; y: number; z?: number; visibility?: number };

export type NormalizedLandmarkList = Landmark[];

export type FormKind = "good" | "bad" | "warn" | "default" | "error";

export type DetectorOutput = {
  repAdded: boolean;
  score: number;
  kind: FormKind;
  phase: string;
  feedback: string;
};

export type JointStatusKey = "torso" | "hip" | "L_elbow" | "R_elbow" | "L_knee" | "R_knee";

export type JointStatus = Record<JointStatusKey, "good" | "warn" | "bad" | "neut">;
