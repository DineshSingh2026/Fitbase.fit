"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const health_controller_1 = require("./health.controller");
const database_module_1 = require("./database.module");
const legacy_proxy_controller_1 = require("./legacy-proxy.controller");
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const roles_guard_1 = require("./roles.guard");
const admin_controller_1 = require("./admin.controller");
const path_1 = require("path");
const trainer_requests_controller_1 = require("./trainer-requests.controller");
const superadmin_controller_1 = require("./superadmin.controller");
const admin_management_controller_1 = require("./admin-management.controller");
const notifications_controller_1 = require("./notifications.controller");
const programs_controller_1 = require("./programs.controller");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: [(0, path_1.join)(process.cwd(), "../../.env"), ".env"]
            }),
            database_module_1.DatabaseModule
        ],
        controllers: [
            health_controller_1.HealthController,
            auth_controller_1.AuthController,
            trainer_requests_controller_1.TrainerRequestsController,
            superadmin_controller_1.SuperadminController,
            admin_management_controller_1.AdminManagementController,
            notifications_controller_1.NotificationsController,
            programs_controller_1.ProgramsController,
            admin_controller_1.AdminController,
            legacy_proxy_controller_1.LegacyProxyController
        ],
        providers: [auth_service_1.AuthService, roles_guard_1.RolesGuard]
    })
], AppModule);
//# sourceMappingURL=app.module.js.map