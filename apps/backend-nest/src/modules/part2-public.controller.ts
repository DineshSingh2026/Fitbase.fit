import { Body, Controller, Get, Inject, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { randomUUID } from "crypto";
import { Pool } from "pg";

/** Public Part-2 Body Audit form — matches Express `POST /api/part2` (BodyBank). */
@Controller("api")
export class Part2PublicController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  @Post("part2")
  async submit(@Body() body: Record<string, unknown>, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Submission failed" });
    const b = body || {};
    const name = String(b.name || "").trim();
    const email = String(b.email || "").trim();
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email required" });
    }
    const id = randomUUID();
    try {
      await this.pool.query(
        `INSERT INTO part2_audit (
          id, name, email, mobile, sports_history, injuries, mental_health,
          gym_experience, food_choices, vices_addictions, goals, what_compelled, activity_level
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          name,
          email,
          String(b.mobile || ""),
          String(b.sports_history || ""),
          String(b.injuries || ""),
          String(b.mental_health || ""),
          String(b.gym_experience || ""),
          String(b.food_choices || ""),
          String(b.vices_addictions || ""),
          String(b.goals || ""),
          String(b.what_compelled || ""),
          String(b.activity_level || "")
        ]
      );
      return res.json({ id, message: "Form submitted successfully" });
    } catch (e: any) {
      console.error("[part2] POST error:", e?.message || e);
      return res.status(500).json({ error: "Submission failed" });
    }
  }

  @Get("part2/:id")
  async getById(@Param("id") id: string, @Res() res: Response) {
    if (!this.pool) return res.status(500).json({ error: "Failed" });
    try {
      const r = await this.pool.query("SELECT * FROM part2_audit WHERE id = $1 LIMIT 1", [id]);
      const row = r.rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      return res.json(row);
    } catch {
      return res.status(500).json({ error: "Failed" });
    }
  }
}
