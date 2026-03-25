import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import {
  formatCampaignListReply,
  normalizeCampaignDay,
  normalizeCampaignTime,
  type ParsedCampaignCommand,
  parseAICampaignCommand
} from "./campaign.util";
import { CampaignBroadcastService } from "./campaign-broadcast.service";
import { CampaignSchedulerService } from "./campaign-scheduler.service";

@Injectable()
export class CampaignService {
  constructor(
    @Inject("PG_POOL") private readonly pool: Pool | null,
    private readonly broadcast: CampaignBroadcastService,
    private readonly scheduler: CampaignSchedulerService
  ) {}

  async list(activeOnly?: boolean): Promise<any[]> {
    if (!this.pool) return [];
    try {
      const sql = activeOnly
        ? `SELECT * FROM campaign_messages WHERE is_active = TRUE ORDER BY day_of_week, time_of_day`
        : `SELECT * FROM campaign_messages ORDER BY day_of_week, time_of_day`;
      const r = await this.pool.query(sql);
      return r.rows || [];
    } catch (e: any) {
      console.error("[campaigns] GET error:", e?.message || e);
      throw e;
    }
  }

  async create(message: string, day_of_week: string, time_of_day: string): Promise<any> {
    if (!this.pool) throw new Error("Database unavailable");
    const rawDay = String(day_of_week).trim().toLowerCase();
    const day = rawDay === "daily" ? "daily" : normalizeCampaignDay(day_of_week);
    const time = normalizeCampaignTime(time_of_day);
    if (!day) {
      throw new Error("Invalid day_of_week");
    }
    if (!time) throw new Error("Invalid time_of_day");
    const d = day;
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO campaign_messages (id, day_of_week, time_of_day, message, is_active, created_at)
       VALUES ($1, $2, $3, $4, TRUE, now())`,
      [id, d, time, String(message).trim()]
    );
    const row = await this.pool.query(`SELECT * FROM campaign_messages WHERE id = $1`, [id]);
    await this.scheduler.restart().catch((e) => console.error("[campaigns] Restart error:", e?.message || e));
    return row.rows[0];
  }

  async delete(id: string): Promise<void> {
    if (!this.pool) throw new Error("Database unavailable");
    await this.pool.query(`DELETE FROM campaign_messages WHERE id = $1`, [id]);
    await this.scheduler.restart().catch((e) => console.error("[campaigns] Restart error:", e?.message || e));
  }

  async pause(id: string): Promise<void> {
    if (!this.pool) throw new Error("Database unavailable");
    await this.pool.query(`UPDATE campaign_messages SET is_active = FALSE WHERE id = $1`, [id]);
    await this.scheduler.restart().catch((e) => console.error("[campaigns] Restart error:", e?.message || e));
  }

  async resume(id: string): Promise<void> {
    if (!this.pool) throw new Error("Database unavailable");
    await this.pool.query(`UPDATE campaign_messages SET is_active = TRUE WHERE id = $1`, [id]);
    await this.scheduler.restart().catch((e) => console.error("[campaigns] Restart error:", e?.message || e));
  }

  async handleAiCommand(cmd: ParsedCampaignCommand): Promise<string> {
    if (!this.pool) return "Database unavailable.";
    try {
      switch (cmd.action) {
        case "list": {
          const rows = await this.list(false);
          return formatCampaignListReply(rows);
        }
        case "create": {
          await this.create(cmd.data.message, cmd.data.day_of_week, cmd.data.time_of_day);
          return `Campaign created! Day: ${cmd.data.day_of_week} | Time: ${cmd.data.time_of_day} IST | Message: "${cmd.data.message}". It will be broadcast to all active users at the scheduled time.`;
        }
        case "pause": {
          const row = await this.pool.query(`SELECT * FROM campaign_messages WHERE id = $1`, [cmd.id]);
          if (!row.rows[0]) return "Campaign not found. Use \"list campaigns\" to see available IDs.";
          await this.pause(cmd.id);
          const c = row.rows[0];
          return `Campaign paused: "${c.message}" (${c.day_of_week} ${c.time_of_day})`;
        }
        case "resume": {
          const row = await this.pool.query(`SELECT * FROM campaign_messages WHERE id = $1`, [cmd.id]);
          if (!row.rows[0]) return "Campaign not found. Use \"list campaigns\" to see available IDs.";
          await this.resume(cmd.id);
          const c = row.rows[0];
          return `Campaign resumed: "${c.message}" (${c.day_of_week} ${c.time_of_day})`;
        }
        case "delete": {
          const row = await this.pool.query(`SELECT * FROM campaign_messages WHERE id = $1`, [cmd.id]);
          if (!row.rows[0]) return "Campaign not found. Use \"list campaigns\" to see available IDs.";
          const c = row.rows[0];
          await this.delete(cmd.id);
          return `Campaign deleted: "${c.message}" (${c.day_of_week} ${c.time_of_day})`;
        }
        case "broadcast": {
          const sent = await this.broadcast.broadcastToAllActiveUsers(cmd.message);
          return `Broadcast sent! Message: "${cmd.message}". Reached ${sent} user(s).`;
        }
        default:
          return "Unknown campaign action.";
      }
    } catch (e: any) {
      return `Campaign action failed: ${e?.message || String(e)}`;
    }
  }

  runCampaignAiParse(text: string): ParsedCampaignCommand | null {
    return parseAICampaignCommand(text);
  }
}
