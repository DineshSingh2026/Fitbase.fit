import { Body, Controller, Get, Header, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import { NutritionService } from "./nutrition.service";

@Controller("api/nutrition")
export class NutritionController {
  constructor(private readonly nutrition: NutritionService) {}

  @Post("analyze")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("user")
  async analyze(@Req() req: { user?: { id?: string; role?: string } }, @Body() body: Record<string, unknown>) {
    return this.nutrition.analyze(req.user || {}, body);
  }

  @Post("log")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("user")
  async log(@Req() req: { user?: { id?: string; role?: string } }, @Body() body: Record<string, unknown>) {
    return this.nutrition.logManual(req.user || {}, body);
  }

  @Get("log/:userId/:date")
  @UseGuards(JwtAuthGuard)
  async getDay(
    @Req() req: { user?: { id?: string; role?: string } },
    @Param("userId") userId: string,
    @Param("date") date: string
  ) {
    return this.nutrition.getDayLog(req.user || {}, userId, date);
  }

  @Get("report/:userId")
  @UseGuards(JwtAuthGuard)
  async report(@Req() req: { user?: { id?: string; role?: string } }, @Param("userId") userId: string) {
    return this.nutrition.getReport(req.user || {}, userId);
  }

  @Post("notify")
  @UseGuards(JwtAuthGuard)
  async notify(@Req() req: { user?: { id?: string; role?: string } }, @Body() body: { userId?: string; date?: string }) {
    return this.nutrition.forceNotify(req.user || {}, body);
  }

  @Get("admin/all")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async adminAll(
    @Req() req: { user?: { id?: string; role?: string } },
    @Query("date") date?: string
  ) {
    const d = date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    return this.nutrition.adminAllOnDate(req.user || {}, d);
  }

  @Get("admin/report")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async adminReport(@Req() req: { user?: { id?: string; role?: string } }, @Query("date") date?: string) {
    const d = date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    return this.nutrition.adminRichReport(req.user || {}, d);
  }

  @Get("admin/export")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async adminExport(
    @Req() req: { user?: { id?: string; role?: string } },
    @Query("date") date: string | undefined,
    @Res({ passthrough: false }) res: Response
  ) {
    const d = date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const csv = await this.nutrition.adminExportCsv(req.user || {}, d);
    res.setHeader("Content-Disposition", `attachment; filename="nutrition-${d}.csv"`);
    res.send(csv);
  }

  @Post("admin/share-weekly/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async shareWeekly(
    @Req() req: { user?: { id?: string; role?: string } },
    @Param("userId") userId: string
  ) {
    return this.nutrition.adminShareWeekly(req.user || {}, userId);
  }

  @Post("analyze-all/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  async analyzeAll(
    @Req() req: { user?: { id?: string; role?: string } },
    @Param("userId") userId: string,
    @Body() body: { date?: string }
  ) {
    const d = body?.date?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    return this.nutrition.adminAnalyzeAll(req.user || {}, userId, d);
  }
}
