// import Fastify from 'fastify';
// import cors from '@fastify/cors';
// import { z } from 'zod';
// import { nanoid } from 'nanoid';

// // ІМПОРТ РУШІЯ: шлях від server/src/ до спільного коду
// import { GameEngine } from '../../shared/engine/GameEngine.js';

// /** ===== Типи ===== **/
// type PlayerSlot = 'red' | 'blue';
// type Token = string;

// type Game = {
//   id: string;
//   engine: GameEngine;
//   version: number;                   // інкремент на кожну валідну дію
//   players: Partial<Record<PlayerSlot, Token>>; // { red?: token, blue?: token }
//   sinks: Set<NodeJS.WritableStream>; // SSE клієнти
//   createdAt: number;
//   updatedAt: number;
// };

// /** ===== Ініціалізація сервера ===== **/
// const app = Fastify({ logger: true });

// app.setErrorHandler((err, _req, reply) => {
//   app.log.error(err);
//   reply.code((err as any).statusCode ?? 500).send({ ok: false, error: err.message });
// });

// await app.register(cors, { origin: true });

// const games = new Map<string, Game>();

// /** ===== Хелпери ===== **/
// const serialize = (e: GameEngine) => e.state;

// function getGameOrThrow(id: string): Game {
//   const g = games.get(id);
//   if (!g) throw Object.assign(new Error('not_found'), { statusCode: 404 });
//   return g;
// }

// function getSlotByToken(g: Game, token?: string): PlayerSlot | undefined {
//   if (!token) return;
//   return (Object.keys(g.players) as PlayerSlot[]).find(s => g.players[s] === token);
// }

// function assertTurn(g: Game, slot: PlayerSlot) {
//   const curr = g.engine.state.currentPlayer;
//   if (curr !== slot) {
//     throw Object.assign(new Error('not_your_turn'), { statusCode: 403, details: { currentPlayer: curr } });
//   }
// }

// function broadcast(g: Game, payload: any) {
//   const data = `data: ${JSON.stringify(payload)}\n\n`;
//   for (const sink of g.sinks) sink.write(data);
// }

// /** ===== Схеми вхідних даних ===== **/
// const MoveBody = z.object({
//   version: z.number().int(),
//   action: z.object({
//     type: z.literal('move'),
//     from: z.object({ row: z.number().int(), col: z.number().int() }),
//     to:   z.object({ row: z.number().int(), col: z.number().int() })
//   })
// });

// const TransferBody = z.object({
//   version: z.number().int(),
//   action: z.object({
//     type: z.literal('transfer'),
//     src: z.object({ row: z.number().int(), col: z.number().int() }),
//     dst: z.object({ row: z.number().int(), col: z.number().int() }),
//     direction: z.enum(['out','in']),
//     amount: z.number().int().positive()
//   })
// });

// const AbsorbChooseBody = z.object({
//   version: z.number().int(),
//   action: z.object({
//     type: z.literal('absorb.choose'),
//     row: z.number().int(),
//     col: z.number().int()
//   })
// });

// const AbsorbAutoBody = z.object({
//   version: z.number().int(),
//   action: z.object({ type: z.literal('absorb.auto') })
// });

// const AbsorbFinalizeBody = z.object({
//   version: z.number().int(),
//   action: z.object({ type: z.literal('absorb.finalize') })
// });

// const AbsorbResetBody = z.object({
//   version: z.number().int(),
//   action: z.object({ type: z.literal('absorb.reset') })
// });

// const AnyActionBody = z.union([
//   MoveBody, TransferBody, AbsorbChooseBody, AbsorbAutoBody, AbsorbFinalizeBody, AbsorbResetBody
// ]);

// /** ===== Роути ===== **/

// // Health
// app.get('/api/health', async () => ({ ok: true }));

// // Створити гру
// app.post('/api/games', async (_req, reply) => {
//   try {
//     const id = nanoid(8);
//     const engine = new GameEngine();
//     const game: Game = { id, engine, version: 1, players: {}, sinks: new Set(), createdAt: Date.now(), updatedAt: Date.now() };
//     games.set(id, game);
//     return { id, state: engine.state, version: game.version, players: { red: !!game.players.red, blue: !!game.players.blue } };
//   } catch (e:any) {
//     app.log.error(e);
//     return reply.code(500).send({ ok:false, error: e?.message ?? 'create_failed' });
//   }
// });

// // Список ігор (простий лобі)
// app.get('/api/games', async () => {
//   return Array.from(games.values()).map(g => ({
//     id: g.id,
//     version: g.version,
//     players: { red: !!g.players.red, blue: !!g.players.blue },
//     updatedAt: g.updatedAt,
//   }));
// });

// // Приєднатися до гри (отримати токен гравця)
// app.post('/api/games/:id/join', async (req, reply) => {
//   try {
//     const id = (req.params as any).id as string;
//     const slotParam = (req.query as any).slot as 'red'|'blue' | undefined;

//     const g = getGameOrThrow(id);

//     const desired = slotParam;
//     let slot: 'red'|'blue' | undefined =
//       desired && !g.players[desired] ? desired : undefined;
//     if (!slot) slot = (['blue','red'] as const).find(s => !g.players[s]);
//     if (!slot) return reply.code(409).send({ ok:false, error:'both_slots_taken' });

//     const token = nanoid(24);
//     g.players[slot] = token;
//     g.updatedAt = Date.now();

//     return { ok:true, id: g.id, slot, token, state: serialize(g.engine), version: g.version };
//   } catch {
//     return reply.code(404).send({ ok:false, error:'game_not_found' });
//   }
// });

// // Отримати стан гри
// app.get('/api/games/:id', async (req, reply) => {
//   try {
//     const id = (req.params as any).id as string;
//     const g = getGameOrThrow(id);
//     return { id, state: serialize(g.engine), version: g.version, players: { red: !!g.players.red, blue: !!g.players.blue } };
//   } catch (e: any) {
//     reply.code(e.statusCode ?? 404); return { error: e.message };
//   }
// });

// // Stream оновлень (SSE)
// app.get('/api/games/:id/stream', async (req, reply) => {
//   try {
//     const id = (req.params as any).id as string;
//     const g = getGameOrThrow(id);

//     reply.raw.writeHead(200, {
//       'Content-Type': 'text/event-stream',
//       'Cache-Control': 'no-cache',
//       'Connection': 'keep-alive',
//       'X-Accel-Buffering': 'no'
//     });
//     // відразу надішлемо стан
//     reply.raw.write(`data: ${JSON.stringify({ type: 'state', payload: { id: g.id, state: serialize(g.engine), version: g.version } })}\n\n`);

//     g.sinks.add(reply.raw);
//     req.raw.on('close', () => { g.sinks.delete(reply.raw); });

//   } catch (e: any) {
//     reply.code(e.statusCode ?? 404).send({ error: e.message });
//   }
// });

// app.get('/api/_debug/engine', async () => {
//   return {
//     typeofGameEngine: typeof GameEngine,
//     isConstructor: typeof GameEngine === 'function'
//   };
// });

// // Виконати дію (сервер-авторитет)
// app.post('/api/games/:id/action', async (req, reply) => {
//   try {
//     const id = (req.params as any).id as string;
//     const g = getGameOrThrow(id);

//     // 1) валідний body + версія
//     const parsed = AnyActionBody.parse(req.body);
//     if (parsed.version !== g.version) {
//       reply.code(409);
//       return { ok: false, error: 'version_mismatch', id: g.id, state: serialize(g.engine), version: g.version };
//     }

//     // 2) авторизація: потрібен токен гравця
//     const token = (req.headers['x-player-token'] as string | undefined);
//     const slot = getSlotByToken(g, token);
//     if (!slot) { reply.code(401); return { ok: false, error: 'unauthorized' }; }

//     // 3) чия "черга": для absorb.* — право має defender; для інших — currentPlayer
//     const a = parsed.action;
//     const isAbsorbAction =
//       a.type === 'absorb.choose' ||
//       a.type === 'absorb.auto' ||
//       a.type === 'absorb.finalize' ||
//       a.type === 'absorb.reset';

//     if (isAbsorbAction) {
//       const defender = g.engine.state.absorb?.defender;
//       if (!defender) { reply.code(400); return { ok:false, error:'no_absorb' }; }
//       if (slot !== defender) {
//         reply.code(403);
//         return { ok:false, error:'absorb_forbidden', details:{ defender } };
//       }
//     } else {
//       // move / transfer — за чергою
//       assertTurn(g, slot);
//     }

//     // 4) застосувати дію
//     let ok = false;
//     const e = g.engine;

//     switch (a.type) {
//       case 'move':
//         e.selectDie(a.from.row, a.from.col);
//         ok = e.moveSelectedTo(a.to.row, a.to.col);
//         break;
//       case 'transfer':
//         ok = e.transfer(a.src, a.dst, a.direction, a.amount);
//         break;
//       case 'absorb.choose':
//         ok = e.chooseAbsorbAt(a.row, a.col);
//         break;
//       case 'absorb.auto':
//         e.forceAutoAbsorb(); ok = true; break;
//       case 'absorb.finalize':
//         e.finalizeAbsorb(); ok = true; break;
//       case 'absorb.reset':
//         e.resetAbsorb(); ok = true; break;
//     }

//     if (!ok) {
//       reply.code(400);
//       return { ok: false, error: 'illegal_action', state: serialize(e), version: g.version };
//     }

//     // 5) оновити версію і розіслати
//     g.version += 1;
//     g.updatedAt = Date.now();

//     const payload = { type: 'state.updated', payload: { id: g.id, state: serialize(e), version: g.version } };
//     broadcast(g, payload);

//     return { ok: true, id: g.id, state: serialize(e), version: g.version };

//   } catch (e: any) {
//     app.log.error(e);
//     const code = e.statusCode ?? 400;
//     reply.code(code);
//     return { ok: false, error: e.message ?? 'bad_request' };
//   }
// });

// // (опційно) Скинути гру до початкового стану (для дебагу)
// app.post('/api/games/:id/reset', async (req, reply) => {
//   try {
//     const id = (req.params as any).id as string;
//     const g = getGameOrThrow(id);
//     const fresh = new GameEngine();
//     (g.engine as any).state = fresh.state; // зберігаємо посилання на інстанс
//     g.version += 1;
//     g.updatedAt = Date.now();
//     broadcast(g, { type: 'state.updated', payload: { id: g.id, state: serialize(g.engine), version: g.version } });
//     return { ok: true, id: g.id, state: serialize(g.engine), version: g.version };
//   } catch (e: any) {
//     reply.code(e.statusCode ?? 400); return { ok: false, error: e.message };
//   }
// });

// const PORT = Number(process.env.PORT ?? 3000);
// app.listen({ port: PORT, host: '0.0.0.0' })
//   .then(() => app.log.info(`API on http://localhost:${PORT}`))
//   .catch((e) => { console.error(e); process.exit(1); });

// server/src/index.ts
import { buildServer } from './app.js';

const app = await buildServer();
const PORT = Number(process.env.PORT ?? 3000);

app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => app.log.info(`API on http://localhost:${PORT}`))
  .catch((e) => { console.error(e); process.exit(1); });
