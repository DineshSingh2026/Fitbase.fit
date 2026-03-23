import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { join } from "path";
import type { NestExpressApplication } from "@nestjs/platform-express";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  app.useStaticAssets(join(process.cwd(), "../../public"));
  app.setGlobalPrefix("");
  const port = Number(process.env.PORT || 3200);
  await app.listen(port);
  console.log(`Nest backend listening on ${port}`);
}

bootstrap();
