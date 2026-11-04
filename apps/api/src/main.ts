import { Logger } from '@nestjs/common';
import { createApp } from './app';

async function bootstrap() {
  const { app, deps } = await createApp();
  await app.listen({ port: deps.env.API_PORT, host: '0.0.0.0' });
  const db = deps.env.DATABASE_URL.startsWith('pglite:') ? 'embedded PGlite (dev only)' : 'PostgreSQL';
  new Logger('API').log(`Listening on http://localhost:${deps.env.API_PORT}/api (database: ${db})`);
}

void bootstrap();
