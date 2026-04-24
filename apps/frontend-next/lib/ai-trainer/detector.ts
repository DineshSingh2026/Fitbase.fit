import { LM, type ExerciseId } from "./constants";
import { ang, avg2 } from "./geometry";
import type { DetectorOutput, NormalizedLandmarkList } from "./types";

type PressPhase = { phase: "up" | "down"; _bt: number };

export class Detector {
  MIN_REP_MS = 420;
  FR_DOWN = 2;
  FR_STAND = 3;
  private _lastRep = 0;
  private _d = 0;
  private _u = 0;
  private jj = { open: false, oSt: 0, cSt: 0, wasOpen: false };
  private curl = { phase: "down" as "down" | "up", upSt: 0, dnSt: 0 };
  private press: PressPhase = { phase: "up", _bt: 0 };
  private row = { phase: "up" as string, dnSt: 0, upSt: 0 };
  private lunge = {
    side: "L",
    d: 0,
    h: 0,
    ue: 100,
    uh: 94,
    ux: 150,
    us: 136,
    _uxc: 0,
    _usc: 0
  };
  private calf = { ema: null as number | null, peak: 0, base: null as number | null, up: 0, dn: 0 };
  private lat = { up: false, uSt: 0, dSt: 0 };
  private front = { up: false, uSt: 0, dSt: 0 };
  private _noLm = 0;

  reset(): void {
    this._lastRep = 0;
    this._d = 0;
    this._u = 0;
    this.jj = { open: false, oSt: 0, cSt: 0, wasOpen: false };
    this.curl = { phase: "down", upSt: 0, dnSt: 0 };
    this.press = { phase: "up", _bt: 0 };
    this.row = { phase: "up", dnSt: 0, upSt: 0 };
    this.lunge = { side: "L", d: 0, h: 0, ue: 100, uh: 94, ux: 150, us: 136, _uxc: 0, _usc: 0 };
    this.calf = { ema: null, peak: 0, base: null, up: 0, dn: 0 };
    this.lat = { up: false, uSt: 0, dSt: 0 };
    this.front = { up: false, uSt: 0, dSt: 0 };
    this._noLm = 0;
  }

  update(ex: ExerciseId, lm: NormalizedLandmarkList | null, now: number): DetectorOutput {
    if (!lm || !lm.length) {
      this._noLm++;
      return { repAdded: false, score: 0, kind: "error", phase: "", feedback: "No pose" };
    }
    this._noLm = 0;
    const lk = (i: number) => lm[i];
    const kneeL = ang(lm, LM.LH, LM.LK, LM.LA);
    const kneeR = ang(lm, LM.RH, LM.RK, LM.RA);
    const kneeAvg = avg2(kneeL, kneeR);
    const elbL = ang(lm, LM.LS, LM.LE, LM.LW);
    const elbR = ang(lm, LM.RS, LM.RE, LM.RW);
    const elbAvg = avg2(elbL, elbR);
    const hipL = ang(lm, LM.LS, LM.LH, LM.LK);
    const hipR = ang(lm, LM.RS, LM.RH, LM.RK);
    const lineL = ang(lm, LM.LS, LM.LH, LM.LA);
    const lineR = ang(lm, LM.RS, LM.RH, LM.RA);
    const sh = lk(LM.LS);
    const sr = lk(LM.RS);
    const lh = lk(LM.LH);
    const wl = lk(LM.LW);
    const wr = lk(LM.RW);
    const al = lk(LM.LA);
    const ar = lk(LM.RA);

    let repAdded = false;
    let score = 72;
    let kind: DetectorOutput["kind"] = "default";
    let phase = "";
    let feedback = "";

    const canRep = () => now - this._lastRep >= this.MIN_REP_MS;

    if (ex === "squat") {
      if (kneeAvg != null) {
        if (kneeAvg < 94) {
          this._d++;
          this._u = 0;
          phase = "down";
          feedback = kneeAvg < 85 ? "A bit deeper." : "Good depth.";
        } else {
          this._d = 0;
          if (kneeAvg > 156) this._u++;
          else this._u = 0;
          phase = "up";
        }
        if (this._d >= this.FR_DOWN && this._u >= this.FR_STAND && canRep()) {
          repAdded = true;
          this._lastRep = now;
          this._d = this._u = 0;
        }
        score = kneeAvg < 94 ? 55 + (94 - kneeAvg) : 70 + Math.min(25, (kneeAvg - 120) * 0.5);
        kind = kneeAvg < 90 ? "bad" : kneeAvg < 100 ? "warn" : "good";
      }
    } else if (ex === "pushup") {
      const body = avg2(lineL, lineR);
      if (elbAvg != null) {
        if (elbAvg < 97) {
          this._d++;
          this._u = 0;
          phase = "down";
        } else {
          this._d = 0;
          if (elbAvg > 154) this._u++;
          else this._u = 0;
          phase = "up";
        }
        if (this._d >= this.FR_DOWN && this._u >= this.FR_STAND && canRep()) {
          repAdded = true;
          this._lastRep = now;
          this._d = this._u = 0;
        }
        const lineSc = body != null ? Math.max(0, 100 - Math.abs(body - 175) * 3) : 60;
        score = lineSc * 0.55 + (elbAvg < 120 ? 40 : 75);
        kind = body != null && Math.abs(body - 175) < 12 ? "good" : "warn";
        feedback = body != null && body < 165 ? "Hips sagging — brace core." : "";
      }
    } else if (ex === "plank") {
      const body = avg2(lineL, lineR);
      repAdded = false;
      if (body != null) {
        const dev = Math.abs(body - 170);
        score = Math.max(0, 100 - dev * 2.5);
        kind = dev <= 8 ? "good" : dev <= 18 ? "warn" : "bad";
        phase = "hold";
        feedback = dev > 18 ? "Straighten shoulder–hip–ankle line." : "Hold steady.";
      }
    } else if (ex === "jumpingjack") {
      const armUp = !!(sh && sr && wl && wr && wl.y < sh.y - 0.04 && wr.y < sr.y - 0.04);
      const shoulderW = wl && wr ? Math.abs(wl.x - wr.x) : 0;
      const legOut = !!(al && ar && shoulderW > 0 && Math.abs(al.x - ar.x) > shoulderW * 1.1);
      const open = !!(armUp && legOut);
      if (open) {
        this.jj.oSt = Math.min(99, this.jj.oSt + 1);
        this.jj.cSt = 0;
      } else {
        this.jj.cSt = Math.min(99, this.jj.cSt + 1);
        this.jj.oSt = 0;
      }
      if (open && !this.jj.open && this.jj.oSt >= 2) {
        this.jj.open = true;
        this.jj.wasOpen = true;
        phase = "open";
      }
      if (!open && this.jj.open && this.jj.cSt >= 2) {
        if (this.jj.wasOpen && canRep()) {
          repAdded = true;
          this._lastRep = now;
        }
        this.jj.open = false;
        phase = "closed";
      }
      score = open ? 78 : 70;
      kind = open ? "good" : "default";
    } else if (ex === "biccurl") {
      const lean = sh && lh ? Math.abs(sh.x - lh.x) : null;
      if (elbL != null) {
        if (this.curl.phase === "down") {
          if (elbL < 58) {
            this.curl.phase = "up";
            this.curl.upSt = 0;
          } else this.curl.dnSt++;
        } else {
          if (elbL > 142) {
            this.curl.upSt++;
            if (this.curl.upSt >= this.FR_DOWN && canRep()) {
              repAdded = true;
              this._lastRep = now;
              this.curl.phase = "down";
              this.curl.upSt = 0;
            }
          } else this.curl.upSt = 0;
        }
        score = 80 - (lean != null && lean > 0.08 ? 25 : 0);
        kind = lean != null && lean > 0.1 ? "bad" : "good";
        phase = this.curl.phase;
      }
    } else if (ex === "shoulderpress") {
      const lock =
        elbAvg != null &&
        elbAvg > 155 &&
        wl &&
        sh &&
        wl.y < sh.y - 0.05 &&
        wr &&
        sr &&
        wr.y < sr.y - 0.05;
      if (lock && this.press.phase === "up") {
        this.press.phase = "down";
        this.press._bt = 0;
      }
      if (elbAvg != null && elbAvg < 100) this.press._bt = Math.min(99, (this.press._bt || 0) + 1);
      else this.press._bt = 0;
      if (this.press.phase === "down" && (this.press._bt || 0) >= 2 && canRep()) {
        repAdded = true;
        this._lastRep = now;
        this.press.phase = "up";
      }
      score = elbAvg != null && sh && lh ? 75 - Math.min(30, Math.abs(sh.x - lh.x) * 40) : 60;
      kind = "default";
      phase = this.press.phase;
    } else if (ex === "bentoverrow") {
      const hinge = avg2(hipL, hipR);
      if (elbAvg != null) {
        if (elbAvg < 82) {
          this.row.dnSt++;
          this.row.upSt = 0;
          this.row.phase = "pull";
        } else {
          this.row.dnSt = 0;
          if (elbAvg > 138) this.row.upSt++;
          else this.row.upSt = 0;
          this.row.phase = "extend";
        }
        if (this.row.dnSt >= this.FR_DOWN && this.row.upSt >= this.FR_STAND && canRep()) {
          repAdded = true;
          this._lastRep = now;
          this.row.dnSt = this.row.upSt = 0;
        }
      }
      const hingeOk = hinge != null && hinge >= 40 && hinge <= 100;
      score = hingeOk ? 78 : 55;
      kind = hingeOk ? "good" : "warn";
      phase = this.row.phase;
    } else if (ex === "lunge") {
      const kf = kneeL != null ? kneeL : kneeR;
      if (kf != null) {
        if (kf < this.lunge.ue) this.lunge.d++;
        else this.lunge.d = 0;
        if (kf < this.lunge.uh) this.lunge.h++;
        else this.lunge.h = 0;
        if (kf > this.lunge.ux) this.lunge._uxc++;
        else this.lunge._uxc = 0;
        if (kf > this.lunge.us) this.lunge._usc++;
        else this.lunge._usc = 0;
        if (this.lunge.d >= 2 && this.lunge.h >= 2 && this.lunge._uxc >= 3 && canRep()) {
          repAdded = true;
          this._lastRep = now;
          this.lunge.d = this.lunge.h = this.lunge._uxc = this.lunge._usc = 0;
        }
      }
      const asym = kneeL != null && kneeR != null ? Math.abs(kneeL - kneeR) : 0;
      score = 80 - Math.min(30, asym * 2);
      kind = asym > 12 ? "warn" : "good";
      phase = "lunge";
    } else if (ex === "calfraise") {
      if (kneeAvg != null && kneeAvg < 138) {
        return {
          repAdded: false,
          score: 30,
          kind: "error",
          phase: "",
          feedback: "Keep knees straighter — not a squat."
        };
      }
      const ankY = avg2(al?.y ?? null, ar?.y ?? null);
      if (ankY == null)
        return { repAdded: false, score: 50, kind: "default", phase: "", feedback: "" };
      if (this.calf.ema == null) this.calf.ema = ankY;
      else this.calf.ema = this.calf.ema * 0.92 + ankY * 0.08;
      const lift = (this.calf.ema || 0) - ankY;
      if (lift > 0.017) this.calf.up++;
      else this.calf.up = 0;
      if (lift < -0.014) this.calf.dn++;
      else this.calf.dn = 0;
      if (this.calf.up >= 3 && this.calf.dn >= 3 && canRep()) {
        repAdded = true;
        this._lastRep = now;
        this.calf.up = this.calf.dn = 0;
      }
      score = 70 + Math.min(25, lift * 400);
      kind = "good";
      phase = "raise";
    } else if (ex === "lateralraise") {
      const spread = wl && wr ? Math.abs(wl.x - wr.x) : 0;
      const up = !!(sh && sr && spread > 0.18 && wl && wr && wl.y < sh.y + 0.02 && wr.y < sr.y + 0.02);
      const down = !!(sh && sr && spread < 0.14 && wl && wr && wl.y > sh.y - 0.02 && wr.y > sr.y - 0.02);
      if (up) this.lat.uSt++;
      else this.lat.uSt = 0;
      if (down) this.lat.dSt++;
      else this.lat.dSt = 0;
      if (up && !this.lat.up && this.lat.uSt >= 2) this.lat.up = true;
      if (down && this.lat.up && this.lat.dSt >= 2 && canRep()) {
        repAdded = true;
        this._lastRep = now;
        this.lat.up = false;
      }
      score = 75;
      kind = "default";
    } else if (ex === "tricepsdip") {
      if (elbAvg != null) {
        if (elbAvg < 99) {
          this._d++;
          this._u = 0;
        } else {
          this._d = 0;
          if (elbAvg > 154) this._u++;
          else this._u = 0;
        }
        if (this._d >= this.FR_DOWN && this._u >= this.FR_STAND && canRep()) {
          repAdded = true;
          this._lastRep = now;
          this._d = this._u = 0;
        }
      }
      const body = avg2(lineL, lineR);
      score = body != null ? 100 - Math.abs(body - 176) * 2 : 68;
      kind = body != null && Math.abs(body - 176) < 10 ? "good" : "warn";
    } else if (ex === "frontraise") {
      const narrow = !!(wl && wr && Math.abs(wl.x - wr.x) < 0.2);
      const up = !!(sh && sr && narrow && wl && wr && wl.y < sh.y - 0.052 && wr.y < sr.y - 0.052);
      const down = !!(sh && sr && narrow && wl && wr && wl.y > sh.y - 0.02 && wr.y > sr.y - 0.02);
      if (up) this.front.uSt++;
      else this.front.uSt = 0;
      if (down) this.front.dSt++;
      else this.front.dSt = 0;
      if (up && !this.front.up && this.front.uSt >= 2) this.front.up = true;
      if (down && this.front.up && this.front.dSt >= 2 && canRep()) {
        repAdded = true;
        this._lastRep = now;
        this.front.up = false;
      }
      const h = sh && wl ? sh.y - wl.y : 0;
      score = 70 + Math.min(25, h * 200);
      kind = "good";
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    return { repAdded, score, kind, phase, feedback };
  }

  noPersonFrames(): number {
    return this._noLm;
  }
}
