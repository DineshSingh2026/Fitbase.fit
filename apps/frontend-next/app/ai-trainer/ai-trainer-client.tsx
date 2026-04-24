"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CUES, EXERCISES, TIPS, WELCOME_TEXT, type ExerciseId } from "../../lib/ai-trainer/constants";
import { Detector } from "../../lib/ai-trainer/detector";
import { drawCoachingOverlay } from "../../lib/ai-trainer/overlay";
import { saveAiTrainerSession } from "../../lib/ai-trainer/save-session";
import type { DetectorOutput, NormalizedLandmarkList } from "../../lib/ai-trainer/types";
import { VoiceCoach } from "../../lib/ai-trainer/voice-coach";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") return resolve();
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

function applyFeedbackState(
  out: DetectorOutput,
  setMeter: (w: number) => void,
  setMeterKind: (k: "good" | "bad" | "") => void,
  setChip: (t: string, cls: "good" | "bad" | "") => void
): void {
  setMeter(out.score);
  if (out.kind === "good") setMeterKind("good");
  else if (out.kind === "bad" || out.kind === "error") setMeterKind("bad");
  else setMeterKind("");
  if (out.kind === "error") {
    setChip("Fix setup", "bad");
    return;
  }
  if (out.score >= 80) setChip("Great form", "good");
  else if (out.score >= 55) setChip("Needs work", "");
  else setChip("Fix form", "bad");
}

export default function AiTrainerClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLInputElement>(null);

  const detRef = useRef(new Detector());
  const vcRef = useRef<VoiceCoach | null>(null);

  const poseRef = useRef<{ close?: () => void } | null>(null);
  const cameraRef = useRef<{ stop?: () => void } | null>(null);

  const runningRef = useRef(false);
  const repsRef = useRef(0);
  const formSumRef = useRef(0);
  const formNRef = useRef(0);
  const exerciseRef = useRef<ExerciseId>("squat");
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [exerciseId, setExerciseId] = useState<ExerciseId>("squat");
  const [volume, setVolume] = useState(0.9);
  const [poseReady, setPoseReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [inWorkoutBody, setInWorkoutBody] = useState(false);
  const [reps, setReps] = useState(0);
  const [sets] = useState(1);
  const [timeLabel, setTimeLabel] = useState("0:00");
  const [phaseLine, setPhaseLine] = useState("Select an exercise and press Start.");
  const [meterWidth, setMeterWidth] = useState(0);
  const [meterKind, setMeterKind] = useState<"good" | "bad" | "">("");
  const [chipText, setChipText] = useState("—");
  const [chipKind, setChipKind] = useState<"good" | "bad" | "">("");
  const [showBanner, setShowBanner] = useState(false);
  const [countdownShow, setCountdownShow] = useState(false);
  const [countdownText, setCountdownText] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summarySave, setSummarySave] = useState("");
  const [sumReps, setSumReps] = useState(0);
  const [sumDur, setSumDur] = useState("0:00");
  const [sumForm, setSumForm] = useState("—");
  const [muteLabel, setMuteLabel] = useState("Mute");
  const [mutePressed, setMutePressed] = useState(false);
  const [startDisabled, setStartDisabled] = useState(false);
  const [stopDisabled, setStopDisabled] = useState(true);

  useEffect(() => {
    exerciseRef.current = exerciseId;
  }, [exerciseId]);

  useEffect(() => {
    document.body.classList.add("ai-trainer-page");
    return () => {
      document.body.classList.remove("ai-trainer-page", "at-in-workout");
    };
  }, []);

  useEffect(() => {
    if (inWorkoutBody) document.body.classList.add("at-in-workout");
    else document.body.classList.remove("at-in-workout");
  }, [inWorkoutBody]);

  useEffect(() => {
    vcRef.current = new VoiceCoach(() => parseFloat(volRef.current?.value || "0.9") || 0.9);
    if (typeof window !== "undefined" && !sessionStorage.getItem("bb_ai_trainer_welcome_done")) {
      sessionStorage.setItem("bb_ai_trainer_welcome_done", "1");
      const t = setTimeout(() => vcRef.current?.speak(WELCOME_TEXT, true), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  const resizeCanvas = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (!video.videoWidth) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (inWorkoutBody) resizeCanvas();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [inWorkoutBody, resizeCanvas]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js");
        if (cancelled) return;
        const PoseCtor = (window as unknown as { Pose?: new (opts: unknown) => MediaPipePose }).Pose;
        const CamCtor = (window as unknown as { Camera?: new (v: HTMLVideoElement, opts: unknown) => MediaPipeCamera })
          .Camera;
        if (!PoseCtor || !CamCtor) {
          console.error("MediaPipe globals missing");
          return;
        }
        const video = videoRef.current!;
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const det = detRef.current;
        const pose = new PoseCtor({
          locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`
        });
        pose.setOptions({
          modelComplexity: 0,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.45
        });
        pose.onResults((results: { poseLandmarks?: NormalizedLandmarkList }) => {
          resizeCanvas();
          const lmRaw = results.poseLandmarks;
          const lmArr: NormalizedLandmarkList = lmRaw && lmRaw.length ? lmRaw : [];
          const ex = exerciseRef.current;
          const now = performance.now();
          const out = det.update(ex, lmArr, now);
          if (runningRef.current && out.repAdded) {
            repsRef.current += 1;
            setReps(repsRef.current);
          }
          if (runningRef.current && out.kind !== "error") {
            formSumRef.current += out.score;
            formNRef.current += 1;
          }
          applyFeedbackState(out, setMeterWidth, setMeterKind, (t, c) => {
            setChipText(t);
            setChipKind(c);
          });
          setPhaseLine(out.feedback || out.phase || "—");
          drawCoachingOverlay(ctx, canvas.width, canvas.height, lmArr.length ? lmArr : null, ex, out);
          vcRef.current?.onFrame(lmArr.length ? lmArr : null, ex, out, runningRef.current, repsRef.current, now);
          setShowBanner(runningRef.current && det.noPersonFrames() > 40);
        });
        poseRef.current = pose;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        if (cancelled) return;
        video.srcObject = stream;
        await video.play();
        const camera = new CamCtor(video, {
          onFrame: async () => {
            if (poseRef.current) await (poseRef.current as MediaPipePose).send({ image: video });
          },
          width: 1280,
          height: 720
        });
        camera.start();
        cameraRef.current = camera;
        setPoseReady(true);
      } catch (e) {
        console.error(e);
        alert("Camera or pose init failed: " + (e instanceof Error ? e.message : String(e)));
      }
    })();
    return () => {
      cancelled = true;
      try {
        cameraRef.current?.stop?.();
      } catch {
        /* ignore */
      }
      try {
        poseRef.current?.close?.();
      } catch {
        /* ignore */
      }
      const v = videoRef.current;
      if (v?.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      }
    };
  }, [resizeCanvas]);

  const tickLoop = useCallback(() => {
    if (!runningRef.current) return;
    const t = (Date.now() - startTimeRef.current) / 1000;
    setTimeLabel(fmtTime(t));
    rafRef.current = requestAnimationFrame(tickLoop);
  }, []);

  const countdown = useCallback(async () => {
    const muted = vcRef.current?.muted ?? false;
    const DIGIT_CAP_MS = 480;
    const GAP = 72;
    const STEP = 420;
    const speak = (txt: string) => {
      if (muted || typeof window === "undefined") return;
      const u = new SpeechSynthesisUtterance(txt);
      u.rate = 0.9;
      u.volume = parseFloat(volRef.current?.value || "0.9") || 0.9;
      speechSynthesis.speak(u);
    };
    setCountdownShow(true);
    for (const d of ["3", "2", "1", "Go"]) {
      setCountdownText(d === "Go" ? "Go!" : d);
      speak(d === "Go" ? "Go" : d);
      await new Promise((r) => setTimeout(r, muted ? STEP : DIGIT_CAP_MS));
      if (!muted) await new Promise((r) => setTimeout(r, GAP));
    }
    setCountdownShow(false);
    setCountdownText("");
    setTimeout(() => vcRef.current?.speak(vcRef.current.pick(CUES.intro), true), 380);
  }, []);

  const onStart = useCallback(async () => {
    if (runningRef.current) return;
    if (!poseReady) {
      alert("Pose model not ready yet.");
      return;
    }
    detRef.current.reset();
    repsRef.current = 0;
    formSumRef.current = 0;
    formNRef.current = 0;
    setReps(0);
    setInWorkoutBody(true);
    await countdown();
    runningRef.current = true;
    setRunning(true);
    startTimeRef.current = Date.now();
    tickLoop();
    setStartDisabled(true);
    setStopDisabled(false);
    try {
      await stageRef.current?.requestFullscreen();
    } catch {
      /* ignore */
    }
    resizeCanvas();
  }, [countdown, poseReady, resizeCanvas, tickLoop]);

  const onStop = useCallback(async () => {
    runningRef.current = false;
    setRunning(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setInWorkoutBody(false);
    setStartDisabled(false);
    setStopDisabled(true);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignore */
      }
    }
    const dur = (Date.now() - startTimeRef.current) / 1000;
    const ex = EXERCISES.find((x) => x.id === exerciseRef.current);
    const avgForm = formNRef.current ? Math.round(formSumRef.current / formNRef.current) : 0;
    setSumReps(repsRef.current);
    setSumDur(fmtTime(dur));
    setSumForm(formNRef.current ? `${avgForm}%` : "—");
    setSummaryOpen(true);
    setSummarySave("Saving…");
    try {
      const msg = await saveAiTrainerSession(repsRef.current, sets, dur, ex?.label || "AI Trainer");
      setSummarySave(msg);
    } catch (e) {
      setSummarySave(e instanceof Error ? e.message : String(e));
    }
  }, [sets]);

  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  useEffect(() => {
    const fs = () => {
      if (!document.fullscreenElement && runningRef.current) {
        void onStopRef.current();
      }
    };
    document.addEventListener("fullscreenchange", fs);
    return () => document.removeEventListener("fullscreenchange", fs);
  }, []);

  const onMute = () => {
    const vc = vcRef.current;
    if (!vc) return;
    vc.setMuted(!vc.muted);
    setMutePressed(vc.muted);
    setMuteLabel(vc.muted ? "Unmute" : "Mute");
  };

  const onFs = async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e) {
      console.warn(e);
    }
  };

  const tips = TIPS[exerciseId] || TIPS.squat;

  return (
    <>
      <header className="at-header">
        <h1>AI Trainer</h1>
        <div className="at-row">
          <label>
            Exercise{" "}
            <select
              aria-label="Exercise"
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value as ExerciseId)}
            >
              {EXERCISES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Voice
            <input
              ref={volRef}
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-label="Voice volume"
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </label>
          <button type="button" onClick={onMute} aria-pressed={mutePressed} title="Mute coach">
            {muteLabel}
          </button>
          <button type="button" onClick={() => void onFs()}>
            Fullscreen
          </button>
          <button type="button" className="at-primary" disabled={startDisabled} onClick={() => void onStart()}>
            Start
          </button>
          <button type="button" disabled={stopDisabled} onClick={() => void onStop()}>
            Stop
          </button>
        </div>
      </header>

      <main className="at-main">
        <div>
          <div className="at-stage-wrap" ref={stageRef}>
            <div className="at-stage-inner">
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} className="at-overlay" width={1280} height={720} />
              <div className={`at-banner${showBanner ? " at-show" : ""}`}>No person — step into frame</div>
              <div className={`at-countdown${countdownShow ? " at-show" : ""}`}>{countdownText}</div>
            </div>
          </div>
          <div className="at-row" style={{ marginTop: 10 }}>
            <span>Reps: {reps}</span>
            <span>Sets: {sets}</span>
            <span>{timeLabel}</span>
            <span className={`at-chip${chipKind ? ` at-${chipKind}` : ""}`}>{chipText}</span>
          </div>
          <div className={`at-meter${meterKind ? ` at-${meterKind}` : ""}`}>
            <i style={{ width: `${meterWidth}%` }} />
          </div>
          <p style={{ color: "var(--at-muted)", fontSize: 14, margin: "6px 0 0" }}>{phaseLine}</p>
        </div>
        <aside className="at-aside">
          <h2>Tips</h2>
          <div className="at-tips">
            <ul>
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </aside>
      </main>

      <div className={`at-modal-bg${summaryOpen ? " at-show" : ""}`} aria-hidden={!summaryOpen}>
        <div className="at-modal">
          <h3>Session summary</h3>
          <div className="at-stat">
            <span>Reps</span>
            <b>{sumReps}</b>
          </div>
          <div className="at-stat">
            <span>Sets</span>
            <b>{sets}</b>
          </div>
          <div className="at-stat">
            <span>Duration</span>
            <b>{sumDur}</b>
          </div>
          <div className="at-stat">
            <span>Avg form</span>
            <b>{sumForm}</b>
          </div>
          <p style={{ fontSize: 13, color: "var(--at-muted)", margin: "12px 0 0" }}>{summarySave}</p>
          <div className="at-row" style={{ marginTop: 14 }}>
            <button type="button" onClick={() => setSummaryOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Minimal typing for UMD MediaPipe classes on window. */
type MediaPipePose = {
  setOptions: (o: Record<string, unknown>) => void;
  onResults: (cb: (r: { poseLandmarks?: NormalizedLandmarkList }) => void) => void;
  send: (o: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => void;
};

type MediaPipeCamera = {
  start: () => void;
  stop?: () => void;
};
