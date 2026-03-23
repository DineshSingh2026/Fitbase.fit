import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("api/push")
@UseGuards(JwtAuthGuard)
export class PushController {
  @Get("vapid-public")
  getPublicKey() {
    return { publicKey: process.env.VAPID_PUBLIC_KEY || "" };
  }

  @Post("subscribe")
  subscribe(@Body() _body: any) {
    return { ok: true };
  }
}
