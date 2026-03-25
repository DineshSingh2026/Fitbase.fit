import { Body, Controller, Delete, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PushNotificationService } from "./push-notification.service";

@Controller("api/push")
export class PushController {
  constructor(private readonly push: PushNotificationService) {}

  @Get("vapid-public")
  getPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY || "" };
  }

  @Post("subscribe")
  @UseGuards(JwtAuthGuard)
  async subscribe(@Req() req: any, @Body() body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }, @Res() res: Response) {
    try {
      const uid = String(req.user?.id || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      await this.push.saveSubscription(uid, body || {});
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Subscribe failed" });
    }
  }

  @Delete("subscribe")
  @UseGuards(JwtAuthGuard)
  async unsubscribe(@Req() req: any, @Body() body: { endpoint?: string }, @Res() res: Response) {
    try {
      const uid = String(req.user?.id || "");
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      await this.push.removeSubscription(uid, body?.endpoint);
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "Unsubscribe failed" });
    }
  }
}
