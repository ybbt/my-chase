// __tests__/server.absorb.auth.test.ts
import { buildServer } from '../server/src/app';

describe('absorb authorization', () => {
  test('сторонній слот отримує 403 для absorb.*', async () => {
    process.env.NODE_ENV = 'test';
    const app = await buildServer();

    // 1) створити гру
    const created = await app.inject({ method: 'POST', url: '/api/games' });
    expect(created.statusCode).toBe(200);
    const { id, version } = created.json() as { id: string; version: number };

    // 2) приєднати синіх і червоних
    const joinBlue = await app.inject({ method: 'POST', url: `/api/games/${id}/join?slot=blue` });
    const joinRed  = await app.inject({ method: 'POST', url: `/api/games/${id}/join?slot=red`  });
    const blueToken = (joinBlue.json() as any).token as string;
    const redToken  = (joinRed.json()  as any).token  as string;

    // 3) примусово активувати absorb на боці захисника (red)
    const forced = await app.inject({
      method: 'POST', url: `/api/_test/force-absorb/${id}`,
      payload: { defender: 'red', remaining: 3, captured: 3 },
    });
    expect(forced.statusCode).toBe(200);

    // 4) blue намагається виконати absorb.auto -> 403
    const blueAbsorb = await app.inject({
      method: 'POST', url: `/api/games/${id}/action`,
      headers: { 'x-player-token': blueToken, 'content-type': 'application/json' },
      payload: { version, action: { type: 'absorb.auto' } },
    });
    expect(blueAbsorb.statusCode).toBe(403);
    expect((blueAbsorb.json() as any).error).toBe('absorb_forbidden');

    // 5) red виконує absorb.auto -> 200 (допускаємо успіх)
    const redAbsorb = await app.inject({
      method: 'POST', url: `/api/games/${id}/action`,
      headers: { 'x-player-token': redToken, 'content-type': 'application/json' },
      payload: { version, action: { type: 'absorb.auto' } },
    });
    expect(redAbsorb.statusCode).toBe(200);
    expect((redAbsorb.json() as any).ok).toBe(true);

    await app.close();
  });
});
