import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix("");
  const port = Number(process.env.PORT || 3200);
  await app.listen(port);
  console.log(`Nest backend listening on ${port}`);
}

bootstrap();
