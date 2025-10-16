// my-chase-frontend/src/hooks/useOnlineGame.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiCreateGame, apiJoinGame, apiAction, apiSubscribe } from '../api';
// import { GameEngine } from '../../shared/engine/GameEngine'; // для локальної підсвітки
import { GameEngine } from '@engine/GameEngine'; // для локальної підсвітки

export function useOnlineGame() {
  const [gameId, setGameId] = useState<string>();
  const [token, setToken] = useState<string>();
  const [slot, setSlot] = useState<'red'|'blue'>();
  const [state, setState] = useState<any>();
  const [version, setVersion] = useState<number>(0);
  const unsub = useRef<null | (()=>void)>(null);

  // створити нову гру і приєднатися
  const createAndJoin = useCallback(async (want:'red'|'blue'='blue') => {
    const g = await apiCreateGame();
    setGameId(g.id);
    setState(g.state);
    setVersion(g.version);
    const j = await apiJoinGame(g.id, want);
    setToken(j.token);
    setSlot(j.slot);
    // підписка на SSE
    unsub.current?.();
    unsub.current = apiSubscribe(g.id, (msg) => {
      if (msg.type === 'state' || msg.type === 'state.updated') {
        setState(msg.payload.state);
        setVersion(msg.payload.version);
      }
    });
  }, []);

  // приєднатися до наявної гри (за id)
  const joinExisting = useCallback(async (id: string, want?: 'red'|'blue') => {
    setGameId(id);
    const j = await apiJoinGame(id, want);
    setToken(j.token);
    setSlot(j.slot);
    setState(j.state);
    setVersion(j.version);
    unsub.current?.();
    unsub.current = apiSubscribe(id, (msg) => {
      if (msg.type === 'state' || msg.type === 'state.updated') {
        setState(msg.payload.state);
        setVersion(msg.payload.version);
      }
    });
  }, []);

  // надіслати дію (хід / transfer / absorb.*)
  const send = useCallback(async (action: Parameters<typeof apiAction>[3]) => {
    if (!gameId || !token) return { ok:false, reason:'no-session' as const };
    const res = await apiAction(gameId, token, version, action);
    if (res.status === 409) {
      // відстали — приймаємо серверний стан
      setState(res.data.state);
      setVersion(res.data.version);
      return { ok:false, reason:'version-mismatch' as const };
    }
    if (res.status !== 200 || !res.data.ok) {
      return { ok:false, reason:'illegal' as const };
    }
    // успіх — оновить SSE або вже в тілі відповіді (ми ставимо обидва)
    setState(res.data.state);
    setVersion(res.data.version);
    return { ok:true as const };
  }, [gameId, token, version]);

  // обчислити підсвітку локально (без мережі)
  const computeMoves = useCallback((row: number, col: number) => {
    if (!state) return [];
    const e = new GameEngine();
    e.state = structuredClone(state);
    e.selectDie(row, col);
    return e.getAvailableMoves();
  }, [state]);

  useEffect(() => () => { unsub.current?.(); }, []);

  return {
    // сесія
    gameId, slot, token, state, version,
    // дії
    createAndJoin, joinExisting, send,
    // підсвітка
    computeMoves
  };
}
