import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health.controller";
import { DatabaseModule } from "./database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RolesGuard } from "./roles.guard";
import { AdminController } from "./admin.controller";
import { AdminTrainersController } from "./admin-trainers.controller";
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
import { PushNotificationService } from "./push-notification.service";
import { MessageThreadsController } from "./message-threads.controller";
import { ClientActivityController } from "./client-activity.controller";
import { CampaignsController } from "./campaigns.controller";
import { CampaignService } from "./campaign.service";
import { CampaignBroadcastService } from "./campaign-broadcast.service";
import { CampaignSchedulerService } from "./campaign-scheduler.service";
import { Part2PublicController } from "./part2-public.controller";
import { ProfileController } from "./profile.controller";
import { NutritionController } from "./nutrition.controller";
import { NutritionService } from "./nutrition.service";
import { NutritionAnthropicService } from "./nutrition-anthropic.service";

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
    AdminTrainersController,
    StatsController,
    TrainerCompatController,
    PushController,
    MessageThreadsController,
    ClientActivityController,
    CampaignsController,
    Part2PublicController,
    ProfileController,
    NutritionController
  ],
  providers: [
    AuthService,
    RolesGuard,
    BootstrapService,
    PushNotificationService,
    CampaignBroadcastService,
    CampaignSchedulerService,
    CampaignService,
    NutritionAnthropicService,
    NutritionService
  ]
})
export class AppModule {}
