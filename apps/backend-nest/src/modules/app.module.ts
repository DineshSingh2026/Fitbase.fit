import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "./database.module";
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
import { BootstrapService } from "./bootstrap.service";

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
    AdminController
  ],
  providers: [AuthService, RolesGuard, BootstrapService]
})
export class AppModule {}
