/* eslint-disable no-console */

import { env } from '@shared/config/env';

import { app } from './app';

async function main() {
  try {
    const PORT = Number(env.PORT) ?? 3333;
    await app
      .listen({
        host: '0.0.0.0',
        port: PORT,
      })
      .then(() => {
        console.log(`🟢 HTTP server running on http://localhost:${PORT}`);
      });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
main();

const shutdown = async () => {
  console.log('🛑 Shutting down server...');
  await app.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
