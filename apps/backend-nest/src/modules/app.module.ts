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
import { ClientRequestsController } from "./client-requests.controller";
import { PublicSignupController } from "./public-signup.controller";
import { SuperadminController } from "./superadmin.controller";
import { AdminManagementController } from "./admin-management.controller";
import { NotificationsController } from "./notifications.controller";
import { ProgramsController } from "./programs.controller";
import { BootstrapService } from "./bootstrap.service";
import { StatsController } from "./stats.controller";
import { TrainerCompatController } from "./trainer-compat.controller";
import { PushController } from "./push.controller";
import { MessageThreadsController } from "./message-threads.controller";
import { ClientActivityController } from "./client-activity.controller";

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
    ClientRequestsController,
    PublicSignupController,
    SuperadminController,
    AdminManagementController,
    NotificationsController,
    ProgramsController,
    AdminController,
    StatsController,
    TrainerCompatController,
    PushController,
    MessageThreadsController,
    ClientActivityController
  ],
  providers: [AuthService, RolesGuard, BootstrapService]
})
export class AppModule {}
