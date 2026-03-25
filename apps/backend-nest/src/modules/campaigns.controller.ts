import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import { CampaignService } from "./campaign.service";
import { CampaignBroadcastService } from "./campaign-broadcast.service";

@Controller("api/campaigns")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "superadmin")
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignService,
    private readonly broadcast: CampaignBroadcastService
  ) {}

  @Get()
  async list(@Query("active") active?: string) {
    const activeOnly = String(active || "").toLowerCase() === "true";
    return this.campaigns.list(activeOnly);
  }

  @Post("broadcast")
  async broadcastNow(@Body() body: { message?: string }) {
    const message = String(body?.message || "").trim();
    if (!message) {
      return { error: "message is required" };
    }
    try {
      const sent = await this.broadcast.broadcastToAllActiveUsers(message);
      return { ok: true, sent };
    } catch (e: any) {
      console.error("[campaigns] Broadcast error:", e?.message || e);
      return { error: "Broadcast failed" };
    }
  }

  @Post(":id/pause")
  async pause(@Param("id") id: string) {
    try {
      await this.campaigns.pause(id);
      return { ok: true };
    } catch {
      return { error: "Failed to pause campaign" };
    }
  }

  @Post(":id/resume")
  async resume(@Param("id") id: string) {
    try {
      await this.campaigns.resume(id);
      return { ok: true };
    } catch {
      return { error: "Failed to resume campaign" };
    }
  }

  @Post()
  async create(@Body() body: { message?: string; day_of_week?: string; time_of_day?: string }) {
    const message = body?.message;
    const day_of_week = body?.day_of_week;
    const time_of_day = body?.time_of_day;
    if (!message || !day_of_week || !time_of_day) {
      return { error: "message, day_of_week, and time_of_day are required" };
    }
    try {
      const row = await this.campaigns.create(String(message), String(day_of_week), String(time_of_day));
      return { ok: true, campaign: row };
    } catch (e: any) {
      const msg = e?.message || "";
      if (msg.includes("Invalid")) {
        return { error: msg };
      }
      console.error("[campaigns] POST error:", msg);
      return { error: "Failed to create campaign" };
    }
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    try {
      await this.campaigns.delete(id);
      return { ok: true };
    } catch {
      return { error: "Failed to delete campaign" };
    }
  }
}
