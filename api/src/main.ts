import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PreviewInterceptor } from './common/preview.store';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // Anexo da Julie chega como dataURL (base64) em JSON. O padrão do Nest/Express é 100KB e
  // estoura (413). 50MB cobre a Julie mandando uma PASTA de documentos — o Gemini não tem
  // mais teto (os arquivos sobem pela File API); o gargalo passa a ser só este body.
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });
  // Escopo de "ver como cliente" por requisição (o banco é quem valida).
  app.useGlobalInterceptors(new PreviewInterceptor());
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
