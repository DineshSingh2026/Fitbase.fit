import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { join } from "path";
import type { NestExpressApplication } from "@nestjs/platform-express";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  const publicDir = join(process.cwd(), "../../public");

  app.use((req: any, res: any, next: any) => {
    const url = String(req?.originalUrl || req?.url || "").toLowerCase();
    if (url.includes("bodybank")) {
      return res.redirect(302, "/fitbase.html");
    }
    const accept = String(req?.headers?.accept || "").toLowerCase();
    const isHtml = accept.includes("text/html") || url === "/" || url.endsWith(".html");
    if (isHtml) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
    }
    return next();
  });

  app.useStaticAssets(publicDir, { index: false });
  app.getHttpAdapter().get("/", (_req: any, res: any) => {
    res.sendFile(join(publicDir, "fitbase.html"));
  });
  app.setGlobalPrefix("");
  const port = Number(process.env.PORT || 3200);
  await app.listen(port);
  console.log(`Nest backend listening on ${port}`);
}

bootstrap();
