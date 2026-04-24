import { CUES, type ExerciseId } from "./constants";
import type { DetectorOutput, NormalizedLandmarkList } from "./types";

export class VoiceCoach {
  muted = false;
  private _last = 0;
  private _badStreak = 0;
  private _goodStreak = 0;
  private _lastEnc = 0;
  private _keep: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly getVolume: () => number) {
    if (typeof window !== "undefined") {
      try {
        this.muted = localStorage.getItem("bb_ai_trainer_voice_muted") === "1";
      } catch {
        /* ignore */
      }
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem("bb_ai_trainer_voice_muted", m ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
  }

  speak(text: string, bypassCd: boolean): void {
    if (this.muted || !text || typeof window === "undefined" || !window.speechSynthesis) return;
    const now = performance.now();
    if (!bypassCd && now - this._last < 2200) return;
    this._last = now;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.93;
    u.pitch = 0.87;
    u.lang = "en-US";
    u.volume = this.getVolume();
    const voices = speechSynthesis.getVoices();
    let v = voices.find((x) => /^en/i.test(x.lang) && /male/i.test(x.name));
    if (!v) v = voices.find((x) => /^en/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
    if (this._keep) clearInterval(this._keep);
    this._keep = setInterval(() => {
      try {
        speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }, 10000);
    u.onend = () => {
      if (this._keep) {
        clearInterval(this._keep);
        this._keep = null;
      }
    };
  }

  onFrame(
    lm: NormalizedLandmarkList | null,
    _ex: ExerciseId,
    detOut: DetectorOutput,
    running: boolean,
    reps: number,
    now: number
  ): void {
    if (!running) return;
    if (!lm) {
      if (now - this._last > 8000) this.speak(this.pick(CUES.noPerson), false);
      return;
    }
    const m = CUES.milestones;
    for (const k of Object.keys(m)) {
      if (Number(reps) === Number(k)) this.speak(m[Number(k)]!, true);
    }
    if (reps > 0 && reps % 3 === 0 && detOut.kind === "good") this.speak(this.pick(CUES.repPraiseGood), false);
    else if (reps > 0 && reps % 3 === 0) this.speak(this.pick(CUES.repPraiseOk), false);
    if (detOut.kind === "bad" || detOut.kind === "error") {
      this._badStreak++;
      this._goodStreak = 0;
    } else {
      this._badStreak = 0;
      if (detOut.kind === "good") this._goodStreak++;
      else this._goodStreak = 0;
    }
    if (this._badStreak >= 92 && now - this._last > 5200) {
      this.speak(this.pick(CUES.correction), false);
      this._badStreak = 0;
    }
    if (this._goodStreak >= 200 && now - this._last > 3000) {
      this.speak(this.pick(CUES.encouragement), false);
      this._goodStreak = 0;
    }
    if (now - this._lastEnc > 52000 && now - this._last > 4000) {
      this.speak(this.pick(CUES.encouragement), false);
      this._lastEnc = now;
    }
  }
}
