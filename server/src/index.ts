// server/src/index.ts
import { buildServer } from './app.js';

const app = await buildServer();
const PORT = Number(process.env.PORT ?? 3000);

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`API on http://localhost:${PORT}`))
  .catch((e) => { console.error(e); process.exit(1); });
