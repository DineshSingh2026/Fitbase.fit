import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "./database.module";
import { LegacyProxyController } from "./legacy-proxy.controller";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RolesGuard } from "./roles.guard";
import { AdminController } from "./admin.controller";
import { join } from "path";
import { TrainerRequestsController } from "./trainer-requests.controller";
import { SuperadminController } from "./superadmin.controller";
import { AdminManagementController } from "./admin-management.controller";
import { NotificationsController } from "./notifications.controller";
import { ProgramsController } from "./programs.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(process.cwd(), "../../.env"), ".env"]
    }),
    DatabaseModule
  ],
  controllers: [
    HealthController,
    AuthController,
    TrainerRequestsController,
    SuperadminController,
    AdminManagementController,
    NotificationsController,
    ProgramsController,
    AdminController,
    LegacyProxyController
  ],
  providers: [AuthService, RolesGuard]
})
export class AppModule {}
