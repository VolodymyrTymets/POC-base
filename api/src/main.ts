// IMPORTANT: Make sure to import `instrument.ts` at the top of your file.
// If you're using CommonJS (CJS) syntax, use `require("./instrument.ts");`
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './common/cors-origins';

async function bootstrap() {
  // Nest's default body-parser limit is 100kb, far under FILE_MAX_SIZE
  // (10MB default) - file content now travels through this JSON body
  // (ADR-0010), so the limit has to track the same config FileAssertService
  // uses, not the framework default.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const configService = app.get(ConfigService);
  const fileMaxSize =
    configService.get<number>('FILE_MAX_SIZE') ?? 1024 * 1024 * 10;
  // Base64 adds ~33% over raw bytes; leave headroom for the rest of the
  // GraphQL JSON envelope around `content`.
  app.useBodyParser('json', { limit: Math.ceil(fileMaxSize * 1.4) });
  app.enableCors({
    origin: parseCorsOrigins(configService.get<string>('CORS_ORIGINS')),
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
