import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS for GitHub Pages (configure in Render as env var CORS_ORIGIN)
  // Example: https://jlarrondot.github.io
  const originEnv = process.env.CORS_ORIGIN;
  const origin = originEnv
    ? originEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : true;

  app.enableCors({
    origin,
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
  // Keep this log because Render expects something listening on PORT
  // and it helps debugging.
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
