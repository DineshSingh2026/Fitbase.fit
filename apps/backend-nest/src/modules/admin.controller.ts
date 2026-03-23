import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";

@Controller("api/admin")
export class AdminController {
  @Get("ping")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "superadmin")
  ping(@Req() req: any) {
    return {
      ok: true,
      scope: "admin",
      user: {
        id: req.user?.id,
        email: req.user?.email,
        role: req.user?.role
      }
    };
  }
}
