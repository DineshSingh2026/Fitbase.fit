"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./modules/app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: true });
    app.setGlobalPrefix("");
    const port = Number(process.env.PORT || 3200);
    await app.listen(port);
    console.log(`Nest backend listening on ${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map