// // server/src/index.ts
// import { buildServer } from './app.js';

// const app = await buildServer();
// const PORT = Number(process.env.PORT ?? 3000);

// app.listen({ port: PORT, host: '0.0.0.0' })
//   .then(() => app.log.info(`API on http://localhost:${PORT}`))
//   .catch((e) => { console.error(e); process.exit(1); });

// server/src/index.ts
import { buildServer } from './app.js';

const app = await buildServer();

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

try {
  await app.listen({ port: PORT, host: HOST });

  // гарний URL у логах локально/на хості
  const url =
    process.env.RENDER_EXTERNAL_URL
    ?? `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;

  app.log.info(`API listening on ${url}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// graceful shutdown (коректно закриває сокети/SSE)
const shutdown = async (sig: string) => {
  app.log.info(`Received ${sig}, closing...`);
  try {
    await app.close();
    process.exit(0);
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }
};
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => void shutdown(sig)));
