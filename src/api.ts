// my-chase-frontend/src/api.ts
export type Id = string;

export async function apiCreateGame(): Promise<{id: Id; state: any; version: number; players:{red:boolean;blue:boolean}}> {
  const r = await fetch('/api/games', { method: 'POST' });
  if (!r.ok) throw new Error('createGame failed');
  return r.json();
}

export async function apiJoinGame(id: Id, slot?: 'red'|'blue'): Promise<{ok: true; id: Id; slot:'red'|'blue'; token: string; state:any; version:number}> {
  const r = await fetch(`/api/games/${id}/join${slot ? `?slot=${slot}` : ''}`, { method: 'POST' });
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
  const r = await fetch(`/api/games/${id}/action`, {
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
  const es = new EventSource(`/api/games/${id}/stream`);
  es.onmessage = (e) => {
    try { onMsg(JSON.parse(e.data)); } catch {}
  };
  return () => es.close();
}
