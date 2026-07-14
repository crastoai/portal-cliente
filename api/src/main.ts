import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // CORS: o SPA do Portal chama esta API do navegador. Allowlist por env.
  const origins = (
    process.env.CORS_ORIGINS ||
    'https://portal.crasto.ai,http://localhost:5178,http://localhost:4173'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
