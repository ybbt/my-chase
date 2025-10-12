// my-chase-frontend/src/api.ts

// 🔹 Одноразове "пробудження" бекенду (Render Free може спати)
// У тестах (NODE_ENV=test) — no-op, щоб не було мережевих викликів.
let __warmupPromise: Promise<void> | null = null;

const API_BASE = (import.meta as any).env?.VITE_API_BASE
  ? String((import.meta as any).env.VITE_API_BASE).replace(/\/$/, '')
  : '';
const apiUrl = (p: string) => `${API_BASE}${p}`;

export async function ensureBackendAwake(): Promise<void> {
  const maybeProcess = (globalThis as any).process;
  if (maybeProcess?.env?.NODE_ENV === 'test') return; // у jest не пінгуємо

  if (__warmupPromise) return __warmupPromise;

  __warmupPromise = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000); // таймаут 15с на холодний старт
      await fetch(apiUrl('/api/health'), {
        signal: ctrl.signal,
        cache: 'no-store',                // не брати з кешу
        headers: { 'cache-control': 'no-cache' },
      });
      clearTimeout(t);
    } catch {
      // якщо не відповів — ігноруємо, наступний реальний запит все одно піде
    } finally {
      __warmupPromise = null; // дозволяємо повторити при наступному кліку через якийсь час
    }
  })();

  return __warmupPromise;
}

export type Id = string;

export async function apiCreateGame(): Promise<{id: Id; state: any; version: number; players:{red:boolean;blue:boolean}}> {
  const r = await fetch(apiUrl('/api/games'), { method: 'POST' });
  if (!r.ok) throw new Error('createGame failed');
  return r.json();
}

export async function apiJoinGame(id: Id, slot?: 'red'|'blue'): Promise<{ok: true; id: Id; slot:'red'|'blue'; token: string; state:any; version:number}> {
  const r = await fetch(apiUrl(`/api/games/${id}/join${slot ? `?slot=${slot}` : ''}`), { method: 'POST' });
  if (!r.ok) throw new Error('join failed');
  return r.json();
}

export async function apiAction(
  id: Id,
  token: string,
  version: number,
  action:
    | { type:'move'; from:{row:number;col:number}; to:{row:number;col:number} }
    | { type:'transfer'; src:{row:number;col:number}; dst:{row:number;col:number}; direction:'out'|'in'; amount:number }
    | { type:'absorb.choose'; row:number; col:number }
    | { type:'absorb.auto' }
    | { type:'absorb.finalize' }
    | { type:'absorb.reset' }
) {
  const r = await fetch(apiUrl(`/api/games/${id}/action`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-player-token': token
    },
    body: JSON.stringify({ version, action })
  });
  const data = await r.json();
  return { status: r.status, data };
}

export function apiSubscribe(id: Id, onMsg: (m: {type:string; payload:any}) => void) {
  const es = new EventSource(apiUrl(`/api/games/${id}/stream`));
  es.onmessage = (e) => {
    try { onMsg(JSON.parse(e.data)); } catch {}
  };
  return () => es.close();
}
