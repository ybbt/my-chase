// server/src/app.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
// import { nanoid } from 'nanoid';
import { randomUUID } from 'crypto';
// import { GameEngine } from '../../shared/engine/GameEngine.js';
import { GameEngine } from '../shared/engine/GameEngine.js'

const genId = () => Math.random().toString(36).slice(2, 10); // 8 символів
const genToken = () =>
  (typeof randomUUID === 'function'
    ? randomUUID().replace(/-/g, '')
    : Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 10)).join('')
  ).slice(0, 24);

type PlayerSlot = 'red' | 'blue';
type Token = string;
type Game = {
  id: string; engine: GameEngine; version: number;
  players: Partial<Record<PlayerSlot, Token>>;
  sinks: Set<NodeJS.WritableStream>;
  createdAt: number; updatedAt: number;
};

export async function buildServer() {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _req, reply) => {
    console.error(err);
    reply.code((err as any).statusCode ?? 500).send({ ok:false, error: err.message });
  });

  await app.register(cors, {
    origin: true,             // або масив/функція з дозволеними походженнями
    methods: ['GET','POST','OPTIONS'],
  });

  const games = new Map<string, Game>();
  const serialize = (e: GameEngine) => e.state;
  const getGameOrThrow = (id: string) => {
    const g = games.get(id);
    if (!g) throw Object.assign(new Error('not_found'), { statusCode: 404 });
    return g;
  };
  const getSlotByToken = (g: Game, token?: string): PlayerSlot | undefined =>
    token ? (Object.keys(g.players) as PlayerSlot[]).find(s => g.players[s] === token) : undefined;
  const assertTurn = (g: Game, slot: PlayerSlot) => {
    const curr = g.engine.state.currentPlayer;
    if (curr !== slot) throw Object.assign(new Error('not_your_turn'), { statusCode: 403, details: { currentPlayer: curr } });
  };
  const broadcast = (g: Game, payload: any) => {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const sink of g.sinks) sink.write(data);
  };

  // --- схеми тіла запиту (без змін) ---
  const MoveBody = z.object({ version: z.number().int(), action: z.object({
    type: z.literal('move'),
    from: z.object({ row: z.number().int(), col: z.number().int() }),
    to:   z.object({ row: z.number().int(), col: z.number().int() }),
  })});
  const TransferBody = z.object({ version: z.number().int(), action: z.object({
    type: z.literal('transfer'),
    src: z.object({ row: z.number().int(), col: z.number().int() }),
    dst: z.object({ row: z.number().int(), col: z.number().int() }),
    direction: z.enum(['out','in']),
    amount: z.number().int().positive(),
  })});
  const AbsorbChooseBody = z.object({ version: z.number().int(), action: z.object({ type: z.literal('absorb.choose'), row: z.number().int(), col: z.number().int() })});
  const AbsorbAutoBody   = z.object({ version: z.number().int(), action: z.object({ type: z.literal('absorb.auto') })});
  const AbsorbFinalizeBody = z.object({ version: z.number().int(), action: z.object({ type: z.literal('absorb.finalize') })});
  const AbsorbResetBody = z.object({ version: z.number().int(), action: z.object({ type: z.literal('absorb.reset') })});
  const AnyActionBody = z.union([MoveBody, TransferBody, AbsorbChooseBody, AbsorbAutoBody, AbsorbFinalizeBody, AbsorbResetBody]);

  // --- маршрути (як у вас) ---
  app.get('/api/health', async () => ({ ok: true }));

  app.post('/api/games', async (_req, reply) => {
    try {
    //   const id = nanoid(8);
      const id = genId();
      const engine = new GameEngine();
      const game: Game = { id, engine, version: 1, players: {}, sinks: new Set(), createdAt: Date.now(), updatedAt: Date.now() };
      games.set(id, game);
      return { id, state: engine.state, version: game.version, players: { red: !!game.players.red, blue: !!game.players.blue } };
    } catch (e:any) {
      console.error(e); 
      return reply.code(500).send({ ok:false, error: e?.message ?? 'create_failed' });
    }
  });

  app.get('/api/games', async () => Array.from(games.values()).map(g => ({
    id: g.id, version: g.version, players: { red: !!g.players.red, blue: !!g.players.blue }, updatedAt: g.updatedAt,
  })));

  app.post('/api/games/:id/join', async (req, reply) => {
    try {
      const id = (req.params as any).id as string;
      const slotParam = (req.query as any).slot as 'red'|'blue' | undefined;
      const g = getGameOrThrow(id);
      const desired = slotParam;
      let slot: 'red'|'blue' | undefined = desired && !g.players[desired] ? desired : undefined;
      if (!slot) slot = (['blue','red'] as const).find(s => !g.players[s]);
      if (!slot) return reply.code(409).send({ ok:false, error:'both_slots_taken' });
    //   const token = nanoid(24);
      const token = genToken();
      g.players[slot] = token;
      g.updatedAt = Date.now();
      return { ok:true, id: g.id, slot, token, state: serialize(g.engine), version: g.version };
    } catch {
      return reply.code(404).send({ ok:false, error:'game_not_found' });
    }
  });

  app.get('/api/games/:id', async (req, reply) => {
    try {
      const id = (req.params as any).id as string;
      const g = getGameOrThrow(id);
      return { id, state: serialize(g.engine), version: g.version, players: { red: !!g.players.red, blue: !!g.players.blue } };
    } catch (e: any) {
      reply.code(e.statusCode ?? 404); return { error: e.message };
    }
  });

  // app.get('/api/games/:id/stream', async (req, reply) => {
  //   try {
  //     const id = (req.params as any).id as string;
  //     const g = getGameOrThrow(id);
  //     reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  //     reply.raw.write(`data: ${JSON.stringify({ type: 'state', payload: { id: g.id, state: serialize(g.engine), version: g.version } })}\n\n`);
  //     g.sinks.add(reply.raw);
  //     req.raw.on('close', () => { g.sinks.delete(reply.raw); });
  //   } catch (e: any) { reply.code(e.statusCode ?? 404).send({ error: e.message }); }
  // });

//   app.get('/api/games/:id/stream', async (req, reply) => {
//   try {
//     const id = (req.params as any).id as string;
//     const g = getGameOrThrow(id);

//     // ❗ CORS (додай ОБОВ’ЯЗКОВО)
//     const origin = (req.headers.origin as string | undefined) ?? 'http://127.0.0.1:4173';
//     reply.header('Access-Control-Allow-Origin', origin);
//     reply.header('Vary', 'Origin');

//     // ❗ ЖОДНОГО reply.raw.writeHead — тільки через reply.header(...)
//     reply.header('Content-Type', 'text/event-stream');
//     reply.header('Cache-Control', 'no-cache');
//     reply.header('Connection', 'keep-alive');
//     reply.header('X-Accel-Buffering', 'no');

//     // Відправляємо заголовки й починаємо стрім
//     reply.raw.flushHeaders?.();

//     const send = (payload: any) =>
//       reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);

//     send({ type: 'state', payload: { id, state: serialize(g.engine), version: g.version } });

//     g.sinks.add(reply.raw);
//     req.raw.on('close', () => { g.sinks.delete(reply.raw); });
//   } catch (e: any) {
//     reply.code(e.statusCode ?? 404).send({ error: e.message });
//   }
// });

app.get('/api/games/:id/stream', async (req, reply) => {
  const id = (req.params as any).id as string;
  const g = getGameOrThrow(id);

  // CORS (якщо різні origin)
  const origin = (req.headers.origin as string | undefined) ?? 'http://127.0.0.1:4173';
  reply.raw.setHeader('Access-Control-Allow-Origin', origin);
  reply.raw.setHeader('Vary', 'Origin');

  // Обовʼязкові заголовки для SSE
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');

  // 🔑 Захоплюємо відповідь — Fastify більше НЕ втручається (і не змінить MIME)
  reply.hijack();

  // Відправляємо стартовий state
  const send = (payload: any) =>
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);

  send({ type: 'state', payload: { id, state: serialize(g.engine), version: g.version } });

  // Регіструємо sink і чищення
  g.sinks.add(reply.raw);
  req.raw.on('close', () => { g.sinks.delete(reply.raw); });
});

  app.post('/api/games/:id/action', async (req, reply) => {
    try {
      const id = (req.params as any).id as string;
      const g = getGameOrThrow(id);

      const parsed = AnyActionBody.parse(req.body);
      if (parsed.version !== g.version) {
        reply.code(409);
        return { ok: false, error: 'version_mismatch', id: g.id, state: serialize(g.engine), version: g.version };
      }

      const token = (req.headers['x-player-token'] as string | undefined);
      const slot = getSlotByToken(g, token);
      if (!slot) { reply.code(401); return { ok: false, error: 'unauthorized' }; }

    //   const a = parsed.action;
      const a = parsed.action as { type: string } & Record<string, unknown>;
      const isAbsorbAction = a.type === 'absorb.choose' || a.type === 'absorb.auto' || a.type === 'absorb.finalize' || a.type === 'absorb.reset';

      if (isAbsorbAction) {
        const defender = g.engine.state.absorb?.defender;
        if (!defender) { reply.code(400); return { ok:false, error:'no_absorb' }; }
        if (slot !== defender) { reply.code(403); return { ok:false, error:'absorb_forbidden', details:{ defender } }; }
      } else {
        assertTurn(g, slot);
      }

    //   let ok = false; const e = g.engine;

      let ok = false; const e = g.engine;

    //   switch (a.type) {
    //     case 'move': e.selectDie(a.from.row, a.from.col); ok = e.moveSelectedTo(a.to.row, a.to.col); break;
    //     case 'transfer': ok = e.transfer(a.src, a.dst, a.direction, a.amount); break;
    //     case 'absorb.choose': ok = e.chooseAbsorbAt(a.row, a.col); break;
    //     case 'absorb.auto': e.forceAutoAbsorb(); ok = true; break;
    //     case 'absorb.finalize': e.finalizeAbsorb(); ok = true; break;
    //     case 'absorb.reset': e.resetAbsorb(); ok = true; break;
    //   }

    type Coords = { row: number; col: number };
    type TransferAction = {
        type: 'transfer';
        src: Coords;
        dst: Coords;
        direction: 'out' | 'in';
        amount: number;
    };

    switch (a.type) {
    case 'move': {
        const m = (parsed.action as z.infer<typeof MoveBody>['action']);
        e.selectDie(m.from.row, m.from.col);
        ok = e.moveSelectedTo(m.to.row, m.to.col);
        break;
    }
    case 'transfer': {
        // const t = (parsed.action as z.infer<typeof TransferBody>['action']);
        // ok = e.transfer(t.src, t.dst, t.direction, t.amount);
        // break;
        const t = parsed.action as TransferAction;
        ok = e.transfer(t.src, t.dst, t.direction, t.amount);
        break;
    }
    case 'absorb.choose': {
        const c = (parsed.action as z.infer<typeof AbsorbChooseBody>['action']);
        ok = e.chooseAbsorbAt(c.row, c.col);
        break;
    }
    case 'absorb.auto': {
        e.forceAutoAbsorb(); ok = true; break;
    }
    case 'absorb.finalize': {
        e.finalizeAbsorb(); ok = true; break;
    }
    case 'absorb.reset': {
        e.resetAbsorb(); ok = true; break;
    }
    }

      if (!ok) { reply.code(400); return { ok:false, error:'illegal_action', state: serialize(e), version: g.version }; }

      g.version += 1; g.updatedAt = Date.now();
      broadcast(g, { type: 'state.updated', payload: { id: g.id, state: serialize(e), version: g.version } });
      return { ok:true, id: g.id, state: serialize(e), version: g.version };
    } catch (e:any) {
      console.error(e);
      const code = e.statusCode ?? 400;
      reply.code(code);
      return { ok:false, error: e.message ?? 'bad_request' };
    }
  });

  // Тільки для тестів: змусити absorb-стан (без зміни version)
  if (process.env.NODE_ENV === 'test') {
    app.post('/api/_test/force-absorb/:id', async (req, reply) => {
      const id = (req.params as any).id as string;
      const g = getGameOrThrow(id);
      const { defender = 'red', remaining = 3, captured = remaining } = (req.body as any) ?? {};
      g.engine.state.absorb = { defender, remaining, captured, draft: [], tieLock: false, userChoice: false };
      return reply.send({ ok: true });
    });
  }

  // (опційно) reset для дебагу (без змін)
  app.post('/api/games/:id/reset', async (req, reply) => {
    try {
      const id = (req.params as any).id as string;
      const g = getGameOrThrow(id);
      const fresh = new GameEngine();
      (g.engine as any).state = fresh.state;
      g.version += 1; g.updatedAt = Date.now();
      broadcast(g, { type: 'state.updated', payload: { id: g.id, state: serialize(g.engine), version: g.version } });
      return { ok: true, id: g.id, state: serialize(g.engine), version: g.version };
    } catch (e:any) { reply.code(e.statusCode ?? 400); return { ok:false, error:e.message }; }
  });

  return app;
}
