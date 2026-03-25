import { Inject, Injectable, OnApplicationBootstrap } from "@nestjs/common";
import * as cron from "node-cron";
import { Pool } from "pg";
import { buildCronExpression } from "./campaign.util";
import { CampaignBroadcastService } from "./campaign-broadcast.service";

const TIMEZONE = "Asia/Kolkata";

@Injectable()
export class CampaignSchedulerService implements OnApplicationBootstrap {
  private jobs = new Map<string, cron.ScheduledTask>();

  constructor(
    @Inject("PG_POOL") private readonly pool: Pool | null,
    private readonly broadcast: CampaignBroadcastService
  ) {}

  async onApplicationBootstrap() {
    if (this.pool) {
      await this.restart().catch((e) => console.error("[Campaign] Initial scheduler start failed:", e));
    }
  }

  stopCampaign(id: string) {
    const key = String(id);
    const existing = this.jobs.get(key);
    if (existing) {
      existing.stop();
      this.jobs.delete(key);
    }
  }

  stopAll() {
    for (const [, task] of this.jobs) {
      task.stop();
    }
    this.jobs.clear();
  }

  scheduleCampaign(c: { id: string; day_of_week: string; time_of_day: string; message: string }): boolean {
    const expr = buildCronExpression(c.day_of_week, c.time_of_day);
    if (!expr) {
      console.warn(`[Campaign] Skipping invalid schedule: id=${c.id} day=${c.day_of_week} time=${c.time_of_day}`);
      return false;
    }
    if (!cron.validate(expr)) {
      console.warn(`[Campaign] Invalid cron expression "${expr}" for campaign ${c.id}`);
      return false;
    }

    this.stopCampaign(String(c.id));

    const task = cron.schedule(
      expr,
      async () => {
        const nowIST = new Date().toLocaleString("en-IN", { timeZone: TIMEZONE });
        console.log(`[Campaign] Firing: "${c.message}" (${c.day_of_week} ${c.time_of_day}) at ${nowIST} IST`);
        try {
          await this.broadcast.broadcastToAllActiveUsers(c.message);
        } catch (e: any) {
          console.error(`[Campaign] Broadcast error for campaign ${c.id}:`, e?.message || e);
        }
      },
      { timezone: TIMEZONE }
    );

    this.jobs.set(String(c.id), task);
    console.log(
      `[Campaign] Scheduled: ${String(c.day_of_week).padEnd(9)} ${c.time_of_day} IST | cron: ${expr} | "${c.message}"`
    );
    return true;
  }

  async restart(): Promise<number> {
    if (!this.pool) return 0;
    console.log("[Campaign] Restarting scheduler...");
    this.stopAll();

    let campaigns: { id: string; day_of_week: string; time_of_day: string; message: string }[] = [];
    try {
      const r = await this.pool.query(
        `SELECT id, day_of_week, time_of_day, message
         FROM campaign_messages WHERE is_active = TRUE
         ORDER BY day_of_week, time_of_day`
      );
      campaigns = r.rows || [];
    } catch (e: any) {
      console.error("[Campaign] Failed to load campaigns from DB:", e?.message || e);
      return 0;
    }

    let scheduled = 0;
    for (const c of campaigns) {
      if (this.scheduleCampaign(c)) scheduled++;
    }
    console.log(`[Campaign] Scheduler ready — ${scheduled} active job(s) (timezone: ${TIMEZONE})`);
    return scheduled;
  }
}
