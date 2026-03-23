import { Controller, Get, Inject } from "@nestjs/common";
import { Pool } from "pg";

@Controller("api")
export class HealthController {
  constructor(@Inject("PG_POOL") private readonly pool: Pool | null) {}

  @Get("health")
  async health() {
    if (!this.pool) {
      return { ok: true, db: "not_configured", stack: "nestjs" };
    }
    await this.pool.query("SELECT 1");
    return { ok: true, db: "connected", stack: "nestjs" };
  }
}
