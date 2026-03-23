"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./modules/app.module");
const path_1 = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { cors: true });
    const publicDir = (0, path_1.join)(process.cwd(), "../../public");
    app.useStaticAssets(publicDir, { index: false });
    app.getHttpAdapter().get("/", (_req, res) => {
        res.sendFile((0, path_1.join)(publicDir, "fitbase.html"));
    });
    app.setGlobalPrefix("");
    const port = Number(process.env.PORT || 3200);
    await app.listen(port);
    console.log(`Nest backend listening on ${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map