import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import {
  DAILY_PHOTO_MEAL_SLOT_LIMIT,
  DEFAULT_CALORIE_GOAL,
  DEFAULT_PROTEIN_GOAL,
  MAX_IMAGE_BASE64_CHARS,
  MEAL_TYPES,
  NUTRITION_DAY_COMPLETE_COINS,
  PORTION_SIZES,
  STREAK_MAX_DAYS,
  type MealType,
  type PortionSize
} from "./nutrition.constants";
import { addDaysYmd, getYmdInTimeZone } from "./nutrition-date.util";
import { NutritionAnthropicService } from "./nutrition-anthropic.service";
import {
  classifyMealConfidence,
  computeMealScore,
  macrosNumericComplete,
  normalizeAiResult,
  summarizeDailyConfidenceFromLabels,
  type MacroConfidenceLabel,
  type NormalizedAiResult
} from "./nutrition-scoring.util";
import {
  defaultHeightCm,
  mifflinStJeorKcal,
  parseSex,
  stepCaloriesOut,
  sumWorkoutCaloriesOut,
  type WorkoutRowForBurn
} from "./nutrition-energy.util";

const STREAK_FALLBACK_TZ = "America/New_York";

type ReqUser = { id?: string; role?: string };

@Injectable()
export class NutritionService {
  constructor(
    @Inject("PG_POOL") private readonly pool: Pool | null,
    private readonly anthropic: NutritionAnthropicService
  ) {}

  private assertPool(): Pool {
    if (!this.pool) throw new ServiceUnavailableException("Database unavailable");
    return this.pool;
  }

  async assertCanViewNutrition(reqUser: ReqUser, targetUserId: string): Promise<void> {
    const uid = String(reqUser?.id || "");
    const role = String(reqUser?.role || "");
    if (!uid) throw new ForbiddenException();
    if (uid === targetUserId) return;
    if (role === "superadmin") return;
    if (role === "admin") {
      const r = await this.assertPool().query(
        "SELECT id FROM users WHERE id = $1 AND role = 'user' AND trainer_id = $2 LIMIT 1",
        [targetUserId, uid]
      );
      if (r.rows[0]) return;
    }
    throw new ForbiddenException();
  }

  private async userTimezone(userId: string): Promise<string> {
    const r = await this.assertPool().query(`SELECT timezone FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const tz = String(r.rows[0]?.timezone || "").trim();
    if (tz) return tz;
    return String(process.env.NUTRITION_STREAK_TZ || STREAK_FALLBACK_TZ).trim() || STREAK_FALLBACK_TZ;
  }

  private parseMealType(v: unknown): MealType {
    const s = String(v || "")
      .trim()
      .toLowerCase();
    if ((MEAL_TYPES as readonly string[]).includes(s)) return s as MealType;
    throw new BadRequestException("mealType must be breakfast, lunch, snack, or dinner.");
  }

  private parsePortion(v: unknown): PortionSize {
    const s = String(v || "medium")
      .trim()
      .toLowerCase();
    if ((PORTION_SIZES as readonly string[]).includes(s)) return s as PortionSize;
    return "medium";
  }

  private async countDistinctPhotoSlots(userId: string, logDate: string): Promise<number> {
    const r = await this.assertPool().query(
      `SELECT COUNT(*)::int AS c FROM nutrition_meal_logs
       WHERE user_id = $1 AND log_date = $2::date AND COALESCE(photo_upload_count,0) > 0`,
      [userId, logDate]
    );
    return r.rows[0]?.c ?? 0;
  }

  async purgeOldNutritionPhotos(): Promise<void> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 3);
    const ymd = cutoff.toISOString().slice(0, 10);
    await this.assertPool().query(
      `UPDATE nutrition_meal_logs SET photo_data = NULL, photo_mime = NULL WHERE log_date <= $1::date`,
      [ymd]
    );
  }

  async analyze(
    reqUser: ReqUser,
    body: {
      imageBase64?: string;
      mimeType?: string;
      mealType?: string;
      portionSize?: string;
      manualNote?: string;
      triggerNotify?: boolean;
      autoNotifyOnComplete?: boolean;
      date?: string;
    }
  ) {
    const userId = String(reqUser?.id || "");
    if (String(reqUser?.role || "") !== "user" || !userId) throw new ForbiddenException();

    const mealType = this.parseMealType(body.mealType);
    const portionSize = this.parsePortion(body.portionSize);
    const manualNote = String(body.manualNote ?? "").trim();
    if (!manualNote) throw new BadRequestException("Please add meal details in text.");

    const tz = await this.userTimezone(userId);
    const logDate = body.date?.slice(0, 10) || getYmdInTimeZone(tz);

    const imageBase64 = body.imageBase64 ? String(body.imageBase64).replace(/\s/g, "") : "";
    const hasImage = !!imageBase64;
    if (hasImage) {
      if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
        throw new BadRequestException("Image payload is too large.");
      }
      try {
        const bytes = Buffer.from(imageBase64, "base64").length;
        if (bytes > Math.floor(4.5 * 1024 * 1024)) {
          throw new BadRequestException("Image is too large after decoding. Try a smaller photo.");
        }
      } catch (e: any) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException("Could not read image data.");
      }
    }
    const mimeType = hasImage ? String(body.mimeType || "image/jpeg").trim() : "";

    const pool = this.assertPool();
    const existing = await pool.query(
      `SELECT photo_upload_count FROM nutrition_meal_logs
       WHERE user_id = $1 AND log_date = $2::date AND meal_type = $3 LIMIT 1`,
      [userId, logDate, mealType]
    );
    const prevPhotoCount = Number(existing.rows[0]?.photo_upload_count) || 0;

    if (hasImage && prevPhotoCount === 0) {
      const slots = await this.countDistinctPhotoSlots(userId, logDate);
      if (slots >= DAILY_PHOTO_MEAL_SLOT_LIMIT) {
        throw new HttpException("Daily photo upload limit reached (4).", HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const { parsed: macroParsed, usage: u1 } = await this.anthropic.callClaudeNutrition({
      manualNote,
      mealType,
      portionSize,
      imageBase64: hasImage ? imageBase64 : undefined,
      mimeType: hasImage ? mimeType : undefined
    });

    const { is_food_meal, usage: u2 } = await this.anthropic.validateIsFoodMeal({
      manualNote,
      imageBase64: hasImage ? imageBase64 : undefined,
      mimeType: hasImage ? mimeType : undefined
    });
    if (!is_food_meal) {
      throw new BadRequestException("This does not look like a valid meal. Add a clear food description or photo.");
    }

    const aiResult = normalizeAiResult(macroParsed as unknown as Record<string, unknown>, {
      analyzedWithPhoto: hasImage,
      entrySource: "ai"
    });
    const mealScore = computeMealScore(aiResult);
    const mealConfidence = classifyMealConfidence({
      entrySource: "ai",
      modelConfidence: aiResult.confidence,
      hasPhoto: hasImage,
      hasManualNote: manualNote.length > 0,
      macrosComplete: macrosNumericComplete(aiResult)
    });

    const photoUploadCount = prevPhotoCount + (hasImage ? 1 : 0);
    const aiUsage = { macro: u1, validate: u2 };

    await pool.query(
      `INSERT INTO nutrition_meal_logs (
         user_id, log_date, meal_type, portion_size, manual_note, photo_data, photo_mime,
         photo_upload_count, ai_result, ai_usage, meal_score, meal_confidence, submitted_at, notified_at
       ) VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,now(),NULL)
       ON CONFLICT (user_id, log_date, meal_type) DO UPDATE SET
         portion_size = EXCLUDED.portion_size,
         manual_note = EXCLUDED.manual_note,
         photo_data = COALESCE(EXCLUDED.photo_data, nutrition_meal_logs.photo_data),
         photo_mime = COALESCE(EXCLUDED.photo_mime, nutrition_meal_logs.photo_mime),
         photo_upload_count = EXCLUDED.photo_upload_count,
         ai_result = EXCLUDED.ai_result,
         ai_usage = EXCLUDED.ai_usage,
         meal_score = EXCLUDED.meal_score,
         meal_confidence = EXCLUDED.meal_confidence,
         submitted_at = now(),
         notified_at = NULL`,
      [
        userId,
        logDate,
        mealType,
        portionSize,
        manualNote,
        hasImage ? imageBase64 : null,
        hasImage ? mimeType : null,
        photoUploadCount,
        JSON.stringify(aiResult),
        JSON.stringify(aiUsage),
        mealScore,
        mealConfidence
      ]
    );

    await this.purgeOldNutritionPhotos();
    const dailyStats = await this.recomputeDailyStats(userId, logDate, tz);
    const mealsLoggedToday = await this.countMealsForDay(userId, logDate);
    const streak = await this.nutritionLoggingStreak(userId, tz);
    const notify = await this.maybeNotifyDayComplete({
      userId,
      logDate,
      tz,
      mealsLoggedToday,
      triggerNotify: !!body.triggerNotify,
      autoNotifyOnComplete: body.autoNotifyOnComplete !== false,
      hasImageUrlForHook: hasImage
    });
    await this.awardDayCoinsIfEligible(userId, logDate, mealsLoggedToday);
    await this.notifyMealHook(userId, logDate, aiResult, mealScore, mealsLoggedToday);

    const dailyConf = summarizeDailyConfidenceFromLabels(
      (await this.mealConfidencesForDay(userId, logDate)) as MacroConfidenceLabel[]
    );

    return {
      aiResult,
      usage: aiUsage,
      mealScore,
      mealConfidence,
      dailyConfidence: dailyConf.label,
      dailyConfidenceDetail: dailyConf.detail,
      date: logDate,
      dailyStats,
      mealsLoggedToday,
      notifySent: notify.sent,
      notifyResult: notify.detail,
      streak
    };
  }

  async logManual(
    reqUser: ReqUser,
    body: {
      mealType?: string;
      portionSize?: string;
      manualNote?: string;
      calories?: number;
      protein?: number;
      carbs?: number;
      fat?: number;
      fiber?: number;
      sodium?: number;
      weight?: number;
      dish?: string;
      description?: string;
      triggerNotify?: boolean;
      autoNotifyOnComplete?: boolean;
      date?: string;
    }
  ) {
    const userId = String(reqUser?.id || "");
    if (String(reqUser?.role || "") !== "user" || !userId) throw new ForbiddenException();

    const mealType = this.parseMealType(body.mealType);
    const portionSize = this.parsePortion(body.portionSize);
    const manualNote = String(body.manualNote ?? "").trim();
    if (!manualNote) throw new BadRequestException("Please add meal details in text.");

    const tz = await this.userTimezone(userId);
    const logDate = body.date?.slice(0, 10) || getYmdInTimeZone(tz);

    const aiResult = normalizeAiResult(
      {
        dish: body.dish,
        description: body.description,
        serving: "",
        calories: body.calories,
        protein: body.protein,
        carbs: body.carbs,
        fat: body.fat,
        fiber: body.fiber ?? 0,
        sodium: body.sodium ?? 0,
        weight: body.weight ?? 0,
        confidence: "high",
        tips: []
      },
      { analyzedWithPhoto: false, entrySource: "manual" }
    );
    const mealScore = computeMealScore(aiResult);
    const mealConfidence: MacroConfidenceLabel = "high";

    const pool = this.assertPool();
    await pool.query(
      `INSERT INTO nutrition_meal_logs (
         user_id, log_date, meal_type, portion_size, manual_note,
         photo_upload_count, ai_result, meal_score, meal_confidence, submitted_at, notified_at
       ) VALUES ($1,$2::date,$3,$4,$5,0,$6::jsonb,$7,$8,now(),NULL)
       ON CONFLICT (user_id, log_date, meal_type) DO UPDATE SET
         portion_size = EXCLUDED.portion_size,
         manual_note = EXCLUDED.manual_note,
         ai_result = EXCLUDED.ai_result,
         meal_score = EXCLUDED.meal_score,
         meal_confidence = EXCLUDED.meal_confidence,
         submitted_at = now(),
         notified_at = NULL`,
      [userId, logDate, mealType, portionSize, manualNote, JSON.stringify(aiResult), mealScore, mealConfidence]
    );

    await this.purgeOldNutritionPhotos();
    const dailyStats = await this.recomputeDailyStats(userId, logDate, tz);
    const mealsLoggedToday = await this.countMealsForDay(userId, logDate);
    const streak = await this.nutritionLoggingStreak(userId, tz);
    const notify = await this.maybeNotifyDayComplete({
      userId,
      logDate,
      tz,
      mealsLoggedToday,
      triggerNotify: !!body.triggerNotify,
      autoNotifyOnComplete: body.autoNotifyOnComplete !== false,
      hasImageUrlForHook: false
    });
    await this.awardDayCoinsIfEligible(userId, logDate, mealsLoggedToday);
    await this.notifyMealHook(userId, logDate, aiResult, mealScore, mealsLoggedToday);

    const dailyConf = summarizeDailyConfidenceFromLabels(
      (await this.mealConfidencesForDay(userId, logDate)) as MacroConfidenceLabel[]
    );

    return {
      aiResult,
      mealScore,
      mealConfidence,
      dailyConfidence: dailyConf.label,
      dailyConfidenceDetail: dailyConf.detail,
      date: logDate,
      dailyStats,
      mealsLoggedToday,
      notifySent: notify.sent,
      notifyResult: notify.detail,
      streak
    };
  }

  private async mealConfidencesForDay(userId: string, logDate: string): Promise<string[]> {
    const r = await this.assertPool().query(
      `SELECT meal_confidence FROM nutrition_meal_logs WHERE user_id = $1 AND log_date = $2::date`,
      [userId, logDate]
    );
    return r.rows.map((row) => String(row.meal_confidence || "medium"));
  }

  async getDayLog(reqUser: ReqUser, userId: string, date: string) {
    await this.assertCanViewNutrition(reqUser, userId);
    const tz = await this.userTimezone(userId);
    const d = date.slice(0, 10);
    const pool = this.assertPool();
    const meals = await pool.query(
      `SELECT meal_type, portion_size, manual_note, ai_result, meal_score, meal_confidence,
              photo_upload_count, submitted_at
       FROM nutrition_meal_logs WHERE user_id = $1 AND log_date = $2::date ORDER BY meal_type`,
      [userId, d]
    );
    const stats = await pool.query(
      `SELECT * FROM nutrition_daily_stats WHERE user_id = $1 AND stats_date = $2::date LIMIT 1`,
      [userId, d]
    );
    const streak = await this.nutritionLoggingStreak(userId, tz);
    const labels = meals.rows.map((m) => String(m.meal_confidence || "medium")) as MacroConfidenceLabel[];
    const dailyConf = summarizeDailyConfidenceFromLabels(labels);
    return {
      date: d,
      meals: meals.rows,
      dailyStats: stats.rows[0] || null,
      streak,
      dailyConfidence: dailyConf.label,
      dailyConfidenceDetail: dailyConf.detail
    };
  }

  async getReport(reqUser: ReqUser, userId: string) {
    await this.assertCanViewNutrition(reqUser, userId);
    const r = await this.assertPool().query(
      `SELECT * FROM nutrition_daily_stats
       WHERE user_id = $1 AND stats_date >= (CURRENT_DATE - interval '6 day')
       ORDER BY stats_date DESC`,
      [userId]
    );
    return { userId, days: r.rows };
  }

  async forceNotify(reqUser: ReqUser, body: { userId?: string; date?: string }) {
    const target = String(body.userId || reqUser?.id || "");
    await this.assertCanViewNutrition(reqUser, target);
    const tz = await this.userTimezone(target);
    const logDate = body.date?.slice(0, 10) || getYmdInTimeZone(tz);
    const mealsLoggedToday = await this.countMealsForDay(target, logDate);
    const n = await this.sendDayCompleteNotifications(target, logDate, mealsLoggedToday, false);
    return { ok: true, notifyResult: n };
  }

  async adminAllOnDate(reqUser: ReqUser, date: string) {
    const role = String(reqUser?.role || "");
    if (role !== "admin" && role !== "superadmin") throw new ForbiddenException();
    const d = date.slice(0, 10);
    const pool = this.assertPool();
    if (role === "superadmin") {
      const r = await pool.query(
        `SELECT DISTINCT m.user_id, u.email, u.first_name, u.last_name
         FROM nutrition_meal_logs m
         LEFT JOIN users u ON u.id::text = m.user_id::text
         WHERE m.log_date = $1::date ORDER BY m.user_id`,
        [d]
      );
      return { date: d, users: r.rows };
    }
    const r = await pool.query(
      `SELECT DISTINCT m.user_id, u.email, u.first_name, u.last_name
       FROM nutrition_meal_logs m
       INNER JOIN users u ON u.id::text = m.user_id::text
       WHERE m.log_date = $1::date AND u.role = 'user' AND u.trainer_id = $2
       ORDER BY m.user_id`,
      [d, String(reqUser?.id)]
    );
    return { date: d, users: r.rows };
  }

  async adminRichReport(reqUser: ReqUser, date: string) {
    const role = String(reqUser?.role || "");
    if (role !== "admin" && role !== "superadmin") throw new ForbiddenException();
    const d = date.slice(0, 10);
    const pool = this.assertPool();
    const scope =
      role === "superadmin"
        ? { sql: "", args: [d] as unknown[] }
        : {
            sql: `AND u.trainer_id = $2`,
            args: [d, String(reqUser?.id)] as unknown[]
          };
    const r = await pool.query(
      `SELECT m.user_id, u.email, u.first_name, u.last_name,
              json_agg(json_build_object(
                'meal_type', m.meal_type,
                'meal_score', m.meal_score,
                'calories', (m.ai_result->>'calories')::int,
                'protein', (m.ai_result->>'protein')::int
              ) ORDER BY m.meal_type) AS meals,
              s.total_calories, s.meal_quality_score, s.energy_balance_est
       FROM nutrition_meal_logs m
       JOIN users u ON u.id::text = m.user_id::text
       LEFT JOIN nutrition_daily_stats s ON s.user_id = m.user_id AND s.stats_date = m.log_date
       WHERE m.log_date = $1::date ${scope.sql}
       GROUP BY m.user_id, u.email, u.first_name, u.last_name, s.total_calories, s.meal_quality_score, s.energy_balance_est`,
      scope.args
    );
    return { date: d, clients: r.rows };
  }

  async adminExportCsv(reqUser: ReqUser, date: string): Promise<string> {
    const report = await this.adminRichReport(reqUser, date);
    const rows = report.clients as {
      user_id: string;
      email: string;
      first_name: string;
      last_name: string;
      meals: { meal_type: string; meal_score: number; calories: number; protein: number }[];
      total_calories: number;
      meal_quality_score: number;
      energy_balance_est: number;
    }[];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      ["user_id", "email", "name", "total_calories", "meal_quality", "energy_balance_est", "meals_json"].join(",")
    ];
    for (const c of rows) {
      lines.push(
        [
          esc(c.user_id),
          esc(c.email),
          esc(`${c.first_name || ""} ${c.last_name || ""}`.trim()),
          esc(c.total_calories),
          esc(c.meal_quality_score),
          esc(c.energy_balance_est),
          esc(JSON.stringify(c.meals || []))
        ].join(",")
      );
    }
    return lines.join("\n");
  }

  async adminShareWeekly(reqUser: ReqUser, userId: string) {
    await this.assertCanViewNutrition(reqUser, userId);
    const rep = await this.getReport(reqUser, userId);
    const title = "Your weekly nutrition summary";
    const body = `Last 7 days snapshot: ${rep.days?.length || 0} day(s) with logged stats. Keep going!`;
    const id = randomUUID();
    await this.assertPool().query(
      `INSERT INTO user_inbox (id, user_id, title, body, type, is_read) VALUES ($1,$2,$3,$4,'nutrition',false)`,
      [id, userId, title, body]
    );
    return { ok: true, inboxId: id };
  }

  async adminAnalyzeAll(reqUser: ReqUser, userId: string, date: string) {
    const role = String(reqUser?.role || "");
    if (role !== "admin" && role !== "superadmin") throw new ForbiddenException();
    await this.assertCanViewNutrition(reqUser, userId);
    const d = date.slice(0, 10);
    const pool = this.assertPool();
    const results: { mealType: string; ok: boolean; error?: string }[] = [];
    for (const mt of MEAL_TYPES) {
      const row = await pool.query(
        `SELECT manual_note, photo_data, photo_mime, portion_size FROM nutrition_meal_logs
         WHERE user_id = $1 AND log_date = $2::date AND meal_type = $3 LIMIT 1`,
        [userId, d, mt]
      );
      const m = row.rows[0];
      if (!m?.manual_note) {
        results.push({ mealType: mt, ok: false, error: "no row" });
        continue;
      }
      try {
        await this.analyzeAsUser(userId, {
          manualNote: String(m.manual_note),
          mealType: mt,
          portionSize: String(m.portion_size || "medium"),
          imageBase64: m.photo_data ? String(m.photo_data) : undefined,
          mimeType: m.photo_mime ? String(m.photo_mime) : undefined,
          date: d,
          triggerNotify: false,
          autoNotifyOnComplete: false
        });
        results.push({ mealType: mt, ok: true });
      } catch (e: any) {
        results.push({ mealType: mt, ok: false, error: String(e?.message || e) });
      }
    }
    return { date: d, userId, results };
  }

  /** Re-run analyze logic for a user (admin); bypasses role=user guard. */
  private async analyzeAsUser(
    userId: string,
    body: {
      manualNote: string;
      mealType: string;
      portionSize: string;
      imageBase64?: string;
      mimeType?: string;
      date: string;
      triggerNotify: boolean;
      autoNotifyOnComplete: boolean;
    }
  ) {
    const mealType = this.parseMealType(body.mealType);
    const portionSize = this.parsePortion(body.portionSize);
    const manualNote = String(body.manualNote || "").trim();
    if (!manualNote) throw new BadRequestException("Please add meal details in text.");
    const tz = await this.userTimezone(userId);
    const logDate = body.date.slice(0, 10);

    const imageBase64 = body.imageBase64 ? String(body.imageBase64).replace(/\s/g, "") : "";
    const hasImage = !!imageBase64;
    const mimeType = hasImage ? String(body.mimeType || "image/jpeg").trim() : "";

    if (hasImage) {
      const bytes = Buffer.from(imageBase64, "base64").length;
      if (bytes > Math.floor(4.5 * 1024 * 1024)) {
        throw new BadRequestException("Image is too large after decoding.");
      }
    }

    const pool = this.assertPool();
    const existing = await pool.query(
      `SELECT photo_upload_count FROM nutrition_meal_logs
       WHERE user_id = $1 AND log_date = $2::date AND meal_type = $3 LIMIT 1`,
      [userId, logDate, mealType]
    );
    const prevPhotoCount = Number(existing.rows[0]?.photo_upload_count) || 0;
    if (hasImage && prevPhotoCount === 0) {
      const slots = await this.countDistinctPhotoSlots(userId, logDate);
      if (slots >= DAILY_PHOTO_MEAL_SLOT_LIMIT) {
        throw new HttpException("Daily photo upload limit reached (4).", HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const { parsed: macroParsed, usage: u1 } = await this.anthropic.callClaudeNutrition({
      manualNote,
      mealType,
      portionSize,
      imageBase64: hasImage ? imageBase64 : undefined,
      mimeType: hasImage ? mimeType : undefined
    });
    const { is_food_meal, usage: u2 } = await this.anthropic.validateIsFoodMeal({
      manualNote,
      imageBase64: hasImage ? imageBase64 : undefined,
      mimeType: hasImage ? mimeType : undefined
    });
    if (!is_food_meal) throw new BadRequestException("Not a valid meal.");

    const aiResult = normalizeAiResult(macroParsed as unknown as Record<string, unknown>, {
      analyzedWithPhoto: hasImage,
      entrySource: "ai"
    });
    const mealScore = computeMealScore(aiResult);
    const mealConfidence = classifyMealConfidence({
      entrySource: "ai",
      modelConfidence: aiResult.confidence,
      hasPhoto: hasImage,
      hasManualNote: manualNote.length > 0,
      macrosComplete: macrosNumericComplete(aiResult)
    });
    const photoUploadCount = prevPhotoCount + (hasImage ? 1 : 0);
    const aiUsage = { macro: u1, validate: u2 };

    await pool.query(
      `INSERT INTO nutrition_meal_logs (
         user_id, log_date, meal_type, portion_size, manual_note, photo_data, photo_mime,
         photo_upload_count, ai_result, ai_usage, meal_score, meal_confidence, submitted_at, notified_at
       ) VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,now(),NULL)
       ON CONFLICT (user_id, log_date, meal_type) DO UPDATE SET
         portion_size = EXCLUDED.portion_size,
         manual_note = EXCLUDED.manual_note,
         photo_data = COALESCE(EXCLUDED.photo_data, nutrition_meal_logs.photo_data),
         photo_mime = COALESCE(EXCLUDED.photo_mime, nutrition_meal_logs.photo_mime),
         photo_upload_count = EXCLUDED.photo_upload_count,
         ai_result = EXCLUDED.ai_result,
         ai_usage = EXCLUDED.ai_usage,
         meal_score = EXCLUDED.meal_score,
         meal_confidence = EXCLUDED.meal_confidence,
         submitted_at = now(),
         notified_at = NULL`,
      [
        userId,
        logDate,
        mealType,
        portionSize,
        manualNote,
        hasImage ? imageBase64 : null,
        hasImage ? mimeType : null,
        photoUploadCount,
        JSON.stringify(aiResult),
        JSON.stringify(aiUsage),
        mealScore,
        mealConfidence
      ]
    );
    await this.purgeOldNutritionPhotos();
    await this.recomputeDailyStats(userId, logDate, tz);
    const mealsLoggedToday = await this.countMealsForDay(userId, logDate);
    if (body.autoNotifyOnComplete) {
      await this.maybeNotifyDayComplete({
        userId,
        logDate,
        tz,
        mealsLoggedToday,
        triggerNotify: body.triggerNotify,
        autoNotifyOnComplete: true,
        hasImageUrlForHook: hasImage
      });
    }
    await this.awardDayCoinsIfEligible(userId, logDate, mealsLoggedToday);
  }

  async countMealsForDay(userId: string, logDate: string): Promise<number> {
    const r = await this.assertPool().query(
      `SELECT COUNT(*)::int AS c FROM nutrition_meal_logs WHERE user_id = $1 AND log_date = $2::date`,
      [userId, logDate]
    );
    return r.rows[0]?.c ?? 0;
  }

  async nutritionLoggingStreak(userId: string, tz: string): Promise<number> {
    const r = await this.assertPool().query(
      `SELECT log_date::text AS d FROM nutrition_meal_logs
       WHERE user_id = $1
       GROUP BY log_date
       ORDER BY log_date DESC
       LIMIT ${STREAK_MAX_DAYS}`,
      [userId]
    );
    const dates = new Set(r.rows.map((x) => String(x.d)));
    if (!dates.size) return 0;
    const today = getYmdInTimeZone(tz);
    const yesterday = addDaysYmd(today, -1);
    let anchor = today;
    if (!dates.has(today)) {
      if (!dates.has(yesterday)) return 0;
      anchor = yesterday;
    }
    let streak = 0;
    let cursor = anchor;
    while (dates.has(cursor)) {
      streak += 1;
      cursor = addDaysYmd(cursor, -1);
    }
    return streak;
  }

  private async getUserPhysio(userId: string): Promise<{
    weightKg: number;
    heightCm: number;
    ageYears: number;
    sex: "male" | "female" | "unknown";
  }> {
    const pool = this.assertPool();
    const u = await pool.query(
      `SELECT gender, date_of_birth, height_cm FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    const row = u.rows[0] || {};
    const sex = parseSex(row.gender);
    let age = 35;
    if (row.date_of_birth) {
      const dob = new Date(String(row.date_of_birth));
      if (!Number.isNaN(dob.getTime())) {
        const diff = Date.now() - dob.getTime();
        age = Math.max(16, Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
      }
    }
    const wq = await pool.query(
      `SELECT weight_kg FROM weight_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    const weightKg = Number(wq.rows[0]?.weight_kg) || 70;
    let heightCm = Number(row.height_cm) || 0;
    if (!heightCm) heightCm = defaultHeightCm(sex);
    return { weightKg, heightCm, ageYears: age, sex };
  }

  private async getGoals(userId: string): Promise<{ calorie_goal: number; protein_goal: number }> {
    return { calorie_goal: DEFAULT_CALORIE_GOAL, protein_goal: DEFAULT_PROTEIN_GOAL };
  }

  async recomputeDailyStats(userId: string, statsDate: string, tz: string) {
    const pool = this.assertPool();
    const meals = await pool.query(
      `SELECT ai_result, meal_score FROM nutrition_meal_logs WHERE user_id = $1 AND log_date = $2::date`,
      [userId, statsDate]
    );
    let total_calories = 0;
    let total_protein = 0;
    let total_carbs = 0;
    let total_fat = 0;
    let total_fiber = 0;
    const scores: number[] = [];
    for (const m of meals.rows) {
      const ar = (m.ai_result || {}) as NormalizedAiResult;
      total_calories += Number(ar.calories) || 0;
      total_protein += Number(ar.protein) || 0;
      total_carbs += Number(ar.carbs) || 0;
      total_fat += Number(ar.fat) || 0;
      total_fiber += Number(ar.fiber) || 0;
      if (m.meal_score != null) scores.push(Number(m.meal_score));
    }
    const goals = await this.getGoals(userId);
    const phys = await this.getUserPhysio(userId);

    const wRows = await pool.query(
      `SELECT duration_seconds, workout_name, workout_type, calories_burned, workout_completed, created_at, session_date
       FROM workout_logs WHERE user_id = $1::text OR user_id = $2`,
      [userId, userId]
    );
    const workoutBurn = sumWorkoutCaloriesOut(wRows.rows as WorkoutRowForBurn[], phys.weightKg, statsDate);

    const stepsR = await pool.query(
      `SELECT steps FROM daily_checkins WHERE user_id = $1 AND checkin_date = $2::date LIMIT 1`,
      [userId, statsDate]
    );
    const steps = Number(stepsR.rows[0]?.steps) || 0;
    const stepBurn = stepCaloriesOut({ steps, weightKg: phys.weightKg, sex: phys.sex });

    const calories_out = workoutBurn + stepBurn;
    const energy_difference = calories_out - total_calories;
    const rmr = mifflinStJeorKcal(phys);
    const tef_kcal_est = Math.round(total_calories * 0.09);
    const total_out_est_kcal = rmr + workoutBurn + stepBurn + tef_kcal_est;
    const energy_balance_est = total_calories - total_out_est_kcal;

    const week = await pool.query(
      `SELECT stats_date, total_calories, total_protein FROM nutrition_daily_stats
       WHERE user_id = $1 AND stats_date <= $2::date AND stats_date >= ($2::date - interval '6 day')
       ORDER BY stats_date ASC`,
      [userId, statsDate]
    );
    const weekRows = week.rows as { stats_date: string; total_calories: number; total_protein: number }[];
    const curDay = {
      stats_date: statsDate,
      total_calories,
      total_protein
    };
    const merged = [...weekRows.filter((x) => x.stats_date !== statsDate), curDay];
    const slice = merged.slice(-7);
    const weekly_avg_calories =
      slice.length === 0 ? null : slice.reduce((a, b) => a + (Number(b.total_calories) || 0), 0) / slice.length;
    const weekly_avg_protein =
      slice.length === 0 ? null : slice.reduce((a, b) => a + (Number(b.total_protein) || 0), 0) / slice.length;

    const meal_quality_score =
      scores.length === 0 ? null : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;

    await pool.query(
      `INSERT INTO nutrition_daily_stats (
         user_id, stats_date, total_calories, total_protein, total_carbs, total_fat, total_fiber,
         calorie_goal, protein_goal, calories_out, energy_difference,
         rmr_kcal, tef_kcal_est, total_out_est_kcal, energy_balance_est,
         weekly_avg_calories, weekly_avg_protein, meal_quality_score, updated_at
       ) VALUES (
         $1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now()
       )
       ON CONFLICT (user_id, stats_date) DO UPDATE SET
         total_calories = EXCLUDED.total_calories,
         total_protein = EXCLUDED.total_protein,
         total_carbs = EXCLUDED.total_carbs,
         total_fat = EXCLUDED.total_fat,
         total_fiber = EXCLUDED.total_fiber,
         calorie_goal = EXCLUDED.calorie_goal,
         protein_goal = EXCLUDED.protein_goal,
         calories_out = EXCLUDED.calories_out,
         energy_difference = EXCLUDED.energy_difference,
         rmr_kcal = EXCLUDED.rmr_kcal,
         tef_kcal_est = EXCLUDED.tef_kcal_est,
         total_out_est_kcal = EXCLUDED.total_out_est_kcal,
         energy_balance_est = EXCLUDED.energy_balance_est,
         weekly_avg_calories = EXCLUDED.weekly_avg_calories,
         weekly_avg_protein = EXCLUDED.weekly_avg_protein,
         meal_quality_score = EXCLUDED.meal_quality_score,
         updated_at = now()`,
      [
        userId,
        statsDate,
        total_calories,
        total_protein,
        total_carbs,
        total_fat,
        total_fiber,
        goals.calorie_goal,
        goals.protein_goal,
        calories_out,
        energy_difference,
        rmr,
        tef_kcal_est,
        total_out_est_kcal,
        energy_balance_est,
        weekly_avg_calories,
        weekly_avg_protein,
        meal_quality_score
      ]
    );
    const out = await pool.query(
      `SELECT * FROM nutrition_daily_stats WHERE user_id = $1 AND stats_date = $2::date LIMIT 1`,
      [userId, statsDate]
    );
    return out.rows[0];
  }

  private async maybeNotifyDayComplete(input: {
    userId: string;
    logDate: string;
    tz: string;
    mealsLoggedToday: number;
    triggerNotify: boolean;
    autoNotifyOnComplete: boolean;
    hasImageUrlForHook: boolean;
  }): Promise<{ sent: boolean; detail: string }> {
    const { userId, logDate, mealsLoggedToday, triggerNotify, autoNotifyOnComplete } = input;
    if (mealsLoggedToday < 4) return { sent: false, detail: "Fewer than four meals; day-complete notifications skipped." };
    const pool = this.assertPool();
    const notified = await pool.query(
      `SELECT 1 FROM nutrition_meal_logs
       WHERE user_id = $1 AND log_date = $2::date AND notified_at IS NOT NULL LIMIT 1`,
      [userId, logDate]
    );
    const anyNotified = !!notified.rows[0];
    const should =
      triggerNotify || (autoNotifyOnComplete && mealsLoggedToday >= 4 && !anyNotified);
    if (!should) return { sent: false, detail: "Notification conditions not met." };
    return this.sendDayCompleteNotifications(userId, logDate, mealsLoggedToday, true);
  }

  private async sendDayCompleteNotifications(
    userId: string,
    logDate: string,
    mealsLoggedToday: number,
    markNotified: boolean
  ): Promise<{ sent: boolean; detail: string }> {
    const pool = this.assertPool();
    const id = randomUUID();
    const title = "Nutrition day complete";
    const body = `You logged ${mealsLoggedToday} meals on ${logDate}. Great consistency.`;
    await pool.query(
      `INSERT INTO user_inbox (id, user_id, title, body, type, is_read) VALUES ($1,$2,$3,$4,'nutrition',false)`,
      [id, userId, title, body]
    );
    if (markNotified) {
      await pool.query(
        `UPDATE nutrition_meal_logs SET notified_at = now() WHERE user_id = $1 AND log_date = $2::date`,
        [userId, logDate]
      );
    }
    await this.postNutritionWebhook({
      event: "NUTRITION_DAY_COMPLETE",
      userId,
      date: logDate,
      mealsLoggedToday
    });
    return { sent: true, detail: "inbox+webhook" };
  }

  private async notifyMealHook(
    userId: string,
    logDate: string,
    aiResult: NormalizedAiResult,
    mealScore: number,
    mealsLoggedToday: number
  ) {
    if (mealsLoggedToday >= 4) return;
    await this.postNutritionWebhook({
      event: "NUTRITION_MEAL_LOGGED",
      userId,
      date: logDate,
      mealScore,
      macros: {
        calories: aiResult.calories,
        protein: aiResult.protein,
        carbs: aiResult.carbs,
        fat: aiResult.fat
      }
    });
  }

  private async postNutritionWebhook(payload: Record<string, unknown>) {
    const url = String(process.env.NUTRITION_NOTIFY_WEBHOOK_URL || "").trim();
    if (!url) return;
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch {
      /* optional hook */
    }
  }

  private async awardDayCoinsIfEligible(userId: string, logDate: string, mealsLoggedToday: number) {
    if (mealsLoggedToday < 4) return;
    const key = `coins:nutrition_day_complete:${userId}:${logDate}`;
    const pool = this.assertPool();
    const ins = await pool.query(
      `INSERT INTO nutrition_coin_events (idempotency_key, user_id, coins)
       VALUES ($1,$2,$3)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [key, userId, NUTRITION_DAY_COMPLETE_COINS]
    );
    if (!ins.rows[0]) return;
    const id = randomUUID();
    await pool.query(
      `INSERT INTO user_inbox (id, user_id, title, body, type, is_read) VALUES ($1,$2,$3,$4,'nutrition',false)`,
      [id, userId, "Coins earned", `+${NUTRITION_DAY_COMPLETE_COINS} coins for completing nutrition logging.`, "nutrition"]
    );
  }
}
