// =============================
// src/components/HexBoard.tsx
// =============================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Die as DieView } from './Die';
import { GameEngine } from '../../shared/engine/GameEngine';
import { COLORS } from '../ui/theme';

// Централізовані API-хелпери
// import { apiCreateGame, apiJoinGame, apiAction, apiSubscribe } from '../api';
import { apiCreateGame, apiJoinGame, apiAction, apiSubscribe, ensureBackendAwake } from '../api';

type PlayerSlot = 'red' | 'blue';

// ---------- Геометрія гекса (SVG) ----------
const HEX_SIZE = 30;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

function getHexPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${cx + size * Math.cos(ang)},${cy + size * Math.sin(ang)}`);
  }
  return pts.join(' ');
}

// Локальний UI-режим TRANSFER (вибір пари/напряму/кількості)
type TransferState = {
  source: { row: number; col: number };
  candidates: { row: number; col: number }[];
  target?: { row: number; col: number };
  direction?: 'out' | 'in';
  amount?: number;
  maxOut?: number;
  maxIn?: number;
};

export const HexBoard: React.FC = () => {
  // Один інстанс рушія. В онлайн-режимі — підсовуємо state із сервера.
  const [engine] = useState(() => new GameEngine());
  const [, forceUpdate] = useState(0);

  // --- ONLINE SESSION ---
  const [gameId, setGameId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [slot, setSlot] = useState<PlayerSlot | null>(null);
  const [version, setVersion] = useState<number>(0);
  const esUnsubRef = useRef<null | (() => void)>(null);

  const isOnline = !!gameId && !!token;

  // Всі посилання на state — через engine.state
  const state = engine.state;
  const absorb = state.absorb; // щоб не лаялась TS про possibly undefined

  // ✔ чи атакер чекає, поки суперник розподіляє
  const isWaitingAbsorb = isOnline && !!absorb && !!slot && slot !== absorb.defender;

  // ✔ таймер очікування (пасивний)
  const [waitSec, setWaitSec] = useState(0);
  useEffect(() => {
    if (isWaitingAbsorb) {
      setWaitSec(0);
      const id = setInterval(() => setWaitSec((s) => s + 1), 1000);
      return () => clearInterval(id);
    } else {
      setWaitSec(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWaitingAbsorb, absorb?.defender]);

  const fmtWait = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60)
      .toString()
      .padStart(2, '0')}`;
  
  // Чи треба показати атакеру підказку в статус-барі під час чужого розподілу
  const showAbsorbWait = isOnline && !!absorb && !!slot && slot !== absorb.defender;

  const gameOver = state.gameOver;

  const currentPlayer = state.currentPlayer as PlayerSlot;
  const isMyTurn = !isOnline || (slot !== null && currentPlayer === slot);
  const canActAbsorb = !!absorb && (!isOnline || (slot !== null && slot === absorb.defender));

  // Легкий UI-алерт
  const [lastError, setLastError] = useState<string | null>(null);
  // Пасивний індикатор: прокидаємо бекенд (Render Free)
  const [isWaking, setIsWaking] = useState(false);
  const showError = (msg: string) => {
    setLastError(msg);
    setTimeout(() => setLastError(null), 2200);
  };

  // Застосувати стан із сервера до локального рушія + оновити версію
  const applyServerState = (st: any, v?: number) => {
    const next = structuredClone(st);

    // Якщо не моя черга — прибираємо локальне виділення
    if (isOnline && slot && next.currentPlayer !== slot) {
      next.selected = undefined;
    }

    (engine as any).state = next;
    if (typeof v === 'number') setVersion(v);
    forceUpdate(n => n + 1);
  };

  // Підписка на SSE
  const subscribeSSE = (id: string) => {
    esUnsubRef.current?.();
    esUnsubRef.current = apiSubscribe(id, (msg: any) => {
      if (msg?.type === 'state' || msg?.type === 'state.updated') {
        applyServerState(msg.payload.state, msg.payload.version);
      }
    });
  };

  useEffect(() => () => esUnsubRef.current?.(), []);

  // Створити гру і приєднатися як обраний колір
  const createAndJoinAs = async (want: PlayerSlot) => {
    setIsWaking(true);
    await ensureBackendAwake(); // 👈 чемно пінгуємо /api/health (холодний старт)
    setIsWaking(false);

    const g = await apiCreateGame();
    setGameId(g.id);
    applyServerState(g.state, g.version);

    const j = await apiJoinGame(g.id, want);
    setToken(j.token);
    setSlot(j.slot);
    applyServerState(j.state, j.version);
    subscribeSSE(g.id);
  };

  // Приєднатися до існуючої гри
  const [joinInput, setJoinInput] = useState('');
  const joinExisting = async (id: string, want?: PlayerSlot) => {
    setIsWaking(true);
    await ensureBackendAwake();
    setIsWaking(false);

    setGameId(id);
    const j = await apiJoinGame(id, want);
    setToken(j.token);
    setSlot(j.slot);
    applyServerState(j.state, j.version);
    subscribeSSE(id);
  };

  const [transfer, setTransfer] = useState<TransferState | undefined>(undefined);
  const [suppressOfferKey, setSuppressOfferKey] = useState<string | null>(null);

  // Підсумки по кольорах
  const sums = useMemo(() => {
    let red = 0, blue = 0;
    for (const d of state.dice) d.color === 'red' ? (red += d.value) : (blue += d.value);
    return { red, blue };
  }, [state.dice]);

  // Валідні рухи (локальна підсвітка)
  const availableMoves = engine.getAvailableMoves();

  // Підсвітка бамп-ланцюжків
  const bumpHighlightCells =
    !absorb && !transfer && !gameOver
      ? availableMoves.reduce((acc, m) => { if (m.bump && m.bumpChain) acc.push(...m.bumpChain); return acc; }, [] as { row: number; col: number }[])
      : [];

  const rows = 9, cols = 9;
  const fissionRow = 4, fissionCol = 4;

  // Найслабші під час absorb
  const weakestSet = absorb ? engine.getAbsorbWeakest() : [];
  const weakestKey = new Set(weakestSet.map((d) => `${d.row},${d.col}`));

  // ----- сусіди (для TRANSFER) -----
  function getNeighborCells(row: number, col: number): { row: number; col: number }[] {
    const even = row % 2 === 0;
    const dirsEven: [number, number][] = [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
    const dirsOdd:  [number, number][] = [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]];
    const dirs = even ? dirsEven : dirsOdd;
    const res: { row: number; col: number }[] = [];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      if (nc < 0) nc = 8; else if (nc > 8) nc = 0; // wrap
      if (nr < 0 || nr > 8) continue;
      res.push({ row: nr, col: nc });
    }
    return res;
  }

  const adjacentAllies: { row: number; col: number }[] = (() => {
    if (!state.selected) return [];
    const me = engine.getDieAt(state.selected.row, state.selected.col);
    if (!me) return [];
    return getNeighborCells(state.selected.row, state.selected.col)
      .map((p) => engine.getDieAt(p.row, p.col))
      .filter((d): d is NonNullable<typeof d> => !!d && d.color === me.color)
      .map((d) => ({ row: d.row, col: d.col }));
  })();

  const selectedKey = state.selected ? `${state.selected.row},${state.selected.col}` : null;
  const canOfferTransfer =
    !absorb && !transfer && !gameOver && state.selected && adjacentAllies.length > 0 && suppressOfferKey !== selectedKey;

  // ----- Відправка дій на бек (або локально) -----
  const sendMove = async (from: { row: number; col: number }, to: { row: number; col: number }) => {
    if (isOnline && slot && state.currentPlayer !== slot) { showError('Зараз не ваша черга.'); return; }
    if (!isOnline) { engine.selectDie(from.row, from.col); engine.moveSelectedTo(to.row, to.col); forceUpdate(n => n + 1); return; }

    const res = await apiAction(gameId!, token!, version, { type: 'move', from, to });
    if (res.status === 403) { showError('Зараз не ваша черга.'); return; }
    if (res.status === 409) { applyServerState(res.data.state, res.data.version); return; }
    if (res.status === 200 && res.data.ok) { applyServerState(res.data.state, res.data.version); }
  };

  const sendTransfer = async (src: { row: number; col: number }, dst: { row: number; col: number }, direction: 'out' | 'in', amount: number) => {
    if (isOnline && slot && state.currentPlayer !== slot) { showError('Зараз не ваша черга.'); return; }
    if (!isOnline) { engine.transfer(src, dst, direction, amount); forceUpdate(n => n + 1); return; }

    const res = await apiAction(gameId!, token!, version, { type: 'transfer', src, dst, direction, amount });
    if (res.status === 403) { showError('Зараз не ваша черга.'); return; }
    if (res.status === 409) { applyServerState(res.data.state, res.data.version); return; }
    if (res.status === 200 && res.data.ok) { applyServerState(res.data.state, res.data.version); }
  };

  // Absorb (сервер сам перевіряє права; UI теж не шле зайвого)
  const sendAbsorbChoose = async (row: number, col: number) => {
    if (isOnline && absorb && slot && slot !== absorb.defender) return;
    if (!isOnline) { engine.chooseAbsorbAt(row, col); forceUpdate(n => n + 1); return; }
    const res = await apiAction(gameId!, token!, version, { type: 'absorb.choose', row, col });
    if (res.status === 403) { showError('Поглинання виконує інша сторона.'); return; }
    if (res.status === 409) applyServerState(res.data.state, res.data.version);
    else if (res.status === 200 && res.data.ok) applyServerState(res.data.state, res.data.version);
  };

  const sendAbsorbAuto = async () => {
    if (isOnline && absorb && slot && slot !== absorb.defender) return;
    if (!isOnline) { engine.forceAutoAbsorb(); forceUpdate(n => n + 1); return; }
    const res = await apiAction(gameId!, token!, version, { type: 'absorb.auto' });
    if (res.status === 403) { showError('Поглинання виконує інша сторона.'); return; }
    if (res.status === 409) applyServerState(res.data.state, res.data.version);
    else if (res.status === 200 && res.data.ok) applyServerState(res.data.state, res.data.version);
  };

  const sendAbsorbFinalize = async () => {
    if (isOnline && absorb && slot && slot !== absorb.defender) return;
    if (!isOnline) { engine.finalizeAbsorb(); forceUpdate(n => n + 1); return; }
    const res = await apiAction(gameId!, token!, version, { type: 'absorb.finalize' });
    if (res.status === 403) { showError('Поглинання виконує інша сторона.'); return; }
    if (res.status === 409) applyServerState(res.data.state, res.data.version);
    else if (res.status === 200 && res.data.ok) applyServerState(res.data.state, res.data.version);
  };

  const sendAbsorbReset = async () => {
    if (isOnline && absorb && slot && slot !== absorb.defender) return;
    if (!isOnline) { engine.resetAbsorb(); forceUpdate(n => n + 1); return; }
    const res = await apiAction(gameId!, token!, version, { type: 'absorb.reset' });
    if (res.status === 403) { showError('Поглинання виконує інша сторона.'); return; }
    if (res.status === 409) applyServerState(res.data.state, res.data.version);
    else if (res.status === 200 && res.data.ok) applyServerState(res.data.state, res.data.version);
  };

  // ----- кліки -----
  const handleHexClick = (row: number, col: number) => {
    if (gameOver) return;

    // режим Absorb
    if (absorb) {
      if (!canActAbsorb) return;
      if (absorb.remaining === 0) return;
      const key = `${row},${col}`;
      if (weakestKey.has(key)) void sendAbsorbChoose(row, col);
      return;
    }

    // режим Transfer — вибір отримувача
    if (transfer) {
      const isCandidate = transfer.candidates.some((p) => p.row === row && p.col === col);
      if (!isCandidate) return;

      const donor = engine.getDieAt(transfer.source.row, transfer.source.col);
      const recip = engine.getDieAt(row, col);
      if (!donor || !recip) return;

      const maxOut = Math.min(donor.value - 1, 6 - recip.value);
      const maxIn  = Math.min(recip.value - 1, 6 - donor.value);

      let direction: 'out' | 'in' | undefined;
      if (maxOut > 0) direction = 'out';
      else if (maxIn > 0) direction = 'in';

      const amount =
        direction === 'out' ? Math.max(1, Math.min(1, maxOut))
                            : direction === 'in' ? Math.max(1, Math.min(1, maxIn))
                            : 0;

      setTransfer({
        ...transfer,
        target: { row, col },
        direction,
        amount: amount || 0,
        maxOut: Math.max(0, maxOut),
        maxIn: Math.max(0, maxIn),
      });
      return;
    }

    // звичайний режим
    const clickedDie = engine.getDieAt(row, col);
    const isSelected = !!state.selected;
    const isOwnDie = clickedDie?.color === state.currentPlayer;
    const isSameAsSelected = isSelected && state.selected!.row === row && state.selected!.col === col;

    if (!isSelected) {
      if (isOwnDie) { engine.selectDie(row, col); setSuppressOfferKey(null); }
    } else {
      const isLegalTarget = availableMoves.some((p) => p.row === row && p.col === col);
      if (isOwnDie && !isLegalTarget && !isSameAsSelected) {
        engine.selectDie(row, col); setSuppressOfferKey(null);
      } else {
        const from = { row: state.selected!.row, col: state.selected!.col };
        void sendMove(from, { row, col });
      }
    }
    forceUpdate(n => n + 1);
  };

  // ---- побудова попередніх шляхів (стрілки), вимкнено під час absorb ----
  const paths: { row: number; col: number }[][] = [];
  if (state.selected && !absorb) {
    const selDie = engine.getDieAt(state.selected.row, state.selected.col);
    if (selDie) {
      const dirs = engine.getDirectionVectors();
      const legalTargets = new Set(availableMoves.map((m) => `${m.row},${m.col}`));
      for (const dir of dirs) {
        const path = engine.getMovePath(selDie, dir);
        const last = path[path.length - 1];
        const isComplete = path.length === selDie.value && last && legalTargets.has(`${last.row},${last.col}`);
        if (isComplete) paths.push(path);
      }
    }
  }

  const selectedDie = state.selected ? engine.getDieAt(state.selected.row, state.selected.col) : undefined;
  const pathPalette = selectedDie?.color === 'red' ? COLORS.path.red : COLORS.path.blue;
  const arrowId = selectedDie?.color === 'red' ? 'arrow-red' : 'arrow-blue';

  // ----- застосувати TRANSFER -----
  const applyTransfer = () => {
    if (!transfer || !transfer.target || !state.selected || !transfer.direction || gameOver) return;
    void sendTransfer(transfer.source, transfer.target, transfer.direction, Math.max(1, transfer.amount ?? 1));
    setTransfer(undefined);
  };

  /** =======================
   *   ЛЕЙАУТ БЕЗ ПЕРЕКРИТТІВ
   *   grid: header | left | board | right
   *  ======================= */
  const GRID: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '280px 1fr 280px',
    gridTemplateRows: '56px 1fr',
    gridTemplateAreas: `
      "header header header"
      "left   board  right"
    `,
    height: '100vh',
    width: '100%',
    overflow: 'hidden',
    background: '#fafafa',
  };

  const HeaderBar: React.FC = () => (
    <div style={{
      gridArea: 'header',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderBottom: '1px solid #e5e7eb',
      background: 'white',
      position: 'relative'
    }}>
      {!isOnline ? (
        <>
          <button onClick={() => void createAndJoinAs('red')}>Create (Red)</button>
          <button onClick={() => void createAndJoinAs('blue')}>Create (Blue)</button>
          <span style={{ marginLeft: 8 }}>Join ID:</span>
          <input value={joinInput} onChange={(e) => setJoinInput(e.target.value)} placeholder="Game ID" style={{ width: 120 }} />
          <button disabled={!joinInput} onClick={() => void joinExisting(joinInput.trim(), 'red')}>Join as Red</button>
          <button disabled={!joinInput} onClick={() => void joinExisting(joinInput.trim(), 'blue')}>Join as Blue</button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 12, color: '#111' }}>
            <b>ID:</b> {gameId} | <b>you:</b> {slot} | <b>turn:</b> {state.currentPlayer} | <b>defender:</b> {absorb ? absorb.defender : '—'} | v{version}
          </span>
          {isWaitingAbsorb && (
            <span
              aria-label="status-wait-absorb"
              style={{ marginLeft: 12, fontSize: 12, color: '#6b7280' }}
            >
              Хід суперника: розподіл балів…{' '}
              <span aria-label="wait-timer">({fmtWait(waitSec)})</span> — нема дій: чекаємо опонента
            </span>
          )}
          {isWaking && (
            <span
              aria-label="status-waking"
              style={{ marginLeft: 12, fontSize: 12, color: '#6b7280' }}
            >
              Прокидаємо сервер… це може зайняти до хвилини
            </span>
          )}
          <button style={{ marginLeft: 'auto' }} onClick={() => {
            esUnsubRef.current?.();
            setGameId(null); setToken(null); setSlot(null); setVersion(0);
          }}>Leave</button>
        </>
      )}

      {lastError && (
        <div style={{
          position: 'absolute', right: 12, top: 8,
          background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca',
          padding: '6px 10px', borderRadius: 8
        }}>
          {lastError}
        </div>
      )}
    </div>
  );

  const LeftPanelAbsorb: React.FC = () => {
    // if (!absorb) return <div style={{ gridArea: 'left', padding: 12 }} />;
    // const a = absorb;    

    if (!absorb) return <div style={{ gridArea: 'left', padding: 12 }} />;

    // 🔽 показувати панель лише захиснику (хто перерозподіляє)
    if (isOnline && slot && slot !== absorb.defender) {
      return <div style={{ gridArea: 'left', padding: 12 }} />; // порожня ліва панель
    }

    const a = absorb;

    return (
      <div style={{
        gridArea: 'left',
        padding: 12,
        borderRight: '1px solid #e5e7eb',
        background: '#fff',
        overflowY: 'auto'
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Поглинання — команда {a.defender}</div>
        {a.remaining > 0 && <div style={{ marginBottom: 8 }}>Залишилось розподілити: <b>{a.remaining}</b></div>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button
            onClick={() => void sendAbsorbAuto()}
            disabled={!canActAbsorb || a.remaining === 0 || (engine.getAbsorbWeakest().length === 0 && a.remaining > 0)}
          >Авто</button>

          <button
            onClick={() => void sendAbsorbReset()}
            disabled={!canActAbsorb || (a.remaining === a.captured && a.draft.length === 0)}
          >Скинути</button>

          <button
            onClick={() => void sendAbsorbFinalize()}
            disabled={!canActAbsorb || (a.remaining > 0 && engine.getAbsorbWeakest().length > 0 && !a.userChoice)}
          >Готово</button>
        </div>

        <div style={{ fontSize: 12, color: '#555' }}>
          {a.remaining === 0 ? (
            <>Розподіл завершено. Натисніть «Готово», щоб підтвердити (хід перейде супернику).</>
          ) : (() => {
              const count = engine.getAbsorbWeakest().length;
              if (count > 1) return <>Є кілька найслабших — оберіть одну (клік по кістці на полі).</>;
              if (count === 0) return <>Немає доступних кісток &lt; 6 — решта {a.remaining} не може бути розподілена.</>;
              return <>Найслабша одна — підвищення відбувається автоматично.</>;
            })()}
          {!canActAbsorb && <div style={{ marginTop: 6, color: '#666' }}>Це поглинання виконує команда {a.defender}. Ви спостерігаєте.</div>}
        </div>
      </div>
    );
  };

  const RightPanelTransfer: React.FC = () => {
    // 1) Пропозиція почати трансфер
    if (!gameOver && canOfferTransfer && !transfer) {
      return (
        <div style={{ gridArea: 'right', padding: 12, borderLeft: '1px solid #e5e7eb', background: '#fff' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Трансфер швидкості</div>
          <div style={{ marginBottom: 10 }}>Поруч є свої кістки. Почати трансфер?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => { if (!state.selected) return; setTransfer({ source: { ...state.selected }, candidates: adjacentAllies }); }}>Почати</button>
            <button onClick={() => setSuppressOfferKey(selectedKey)}>Скасувати</button>
          </div>
        </div>
      );
    }

    // 2) Активний режим, але без вибраного отримувача
    if (transfer && !transfer.target) {
      const donor = engine.getDieAt(transfer.source.row, transfer.source.col);
      return (
        <div style={{ gridArea: 'right', padding: 12, borderLeft: '1px solid #e5e7eb', background: '#fff' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Трансфер активний</div>
          <div style={{ marginBottom: 10 }}>Оберіть суміжну свою кістку-отримувача (підсвічено на полі).</div>
          <div style={{ fontSize: 12, color: '#555' }}>
            Обрано: <b>{transfer.source.row},{transfer.source.col}</b> (= {donor?.value ?? '?'})
          </div>
          <div style={{ marginTop: 8 }}><button onClick={() => setTransfer(undefined)}>Вийти</button></div>
        </div>
      );
    }

    // 3) Пара обрана — напрям і кількість
    if (transfer && transfer.target) {
      const src = engine.getDieAt(transfer.source.row, transfer.source.col);
      const trg = engine.getDieAt(transfer.target.row, transfer.target.col);
      const srcVal = src?.value ?? 0;
      const trgVal = trg?.value ?? 0;
      const maxOut = Math.max(0, Math.min(srcVal - 1, 6 - trgVal));
      const maxIn  = Math.max(0, Math.min(trgVal - 1, 6 - srcVal));
      const activeMax = transfer.direction === 'out' ? maxOut : transfer.direction === 'in' ? maxIn : 0;
      const amount = Math.min(Math.max(transfer.amount ?? 1, 1), Math.max(activeMax, 1));
      const disableConfirm = activeMax <= 0;

      const setDir = (dir: 'out' | 'in') => {
        const newMax = dir === 'out' ? maxOut : maxIn;
        setTransfer({ ...transfer, direction: dir, amount: newMax > 0 ? Math.min(transfer.amount ?? 1, newMax) || 1 : 0, maxOut, maxIn });
      };

      return (
        <div style={{ gridArea: 'right', padding: 12, borderLeft: '1px solid #e5e7eb', background: '#fff' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Підтвердити трансфер</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <div>Пара: <b>{transfer.source.row},{transfer.source.col}</b> (={srcVal}) ↔ <b>{transfer.target.row},{transfer.target.col}</b> (={trgVal})</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setDir('out')} disabled={maxOut <= 0} style={{ fontWeight: transfer.direction === 'out' ? 700 : 400 }}>
                {`${transfer.source.row},${transfer.source.col} → ${transfer.target.row},${transfer.target.col}`}
              </button>
              <button onClick={() => setDir('in')} disabled={maxIn <= 0} style={{ fontWeight: transfer.direction === 'in' ? 700 : 400 }}>
                {`${transfer.source.row},${transfer.source.col} ← ${transfer.target.row},${transfer.target.col}`}
              </button>
              <span style={{ fontSize: 12, color: '#666' }}>
                {transfer.direction === 'out' ? `Макс: ${maxOut}` : transfer.direction === 'in' ? `Макс: ${maxIn}` : 'Оберіть напрям'}
              </span>
            </div>

            {activeMax <= 0 ? (
              <div style={{ color: '#b91c1c' }}>Не можна передати в обраному напрямі (донор ≥1, одержувач ≤6).</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setTransfer({ ...transfer, amount: Math.max(1, amount - 1) })}>−</button>
                <input
                  type="number"
                  min={1}
                  max={activeMax}
                  value={amount}
                  onChange={(e) => {
                    const v = parseInt(e.target.value || '1', 10);
                    const nv = isNaN(v) ? 1 : Math.min(Math.max(v, 1), activeMax);
                    setTransfer({ ...transfer, amount: nv });
                  }}
                  style={{ width: 64, textAlign: 'center' }}
                />
                <button onClick={() => setTransfer({ ...transfer, amount: Math.min(activeMax, amount + 1) })}>+</button>
                <span style={{ fontSize: 12, color: '#666' }}>макс: {activeMax}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setTransfer({ source: transfer.source, candidates: transfer.candidates })}>Змінити отримувача</button>
            <button onClick={() => setTransfer(undefined)}>Вийти</button>
            <button onClick={applyTransfer} disabled={disableConfirm}>Підтвердити</button>
          </div>
        </div>
      );
    }

    return <div style={{ gridArea: 'right', padding: 12 }} />;
  };

  const BoardArea: React.FC = () => (
    <div style={{ gridArea: 'board', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* саме поле — центр, займає всю доступну площу */}
      <svg width="100%" height="100%" viewBox="-50 -50 800 800" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arrow-blue" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L10,5 L0,10 Z" fill={COLORS.path.blue.arrow} />
          </marker>
          <marker id="arrow-red" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L10,5 L0,10 Z" fill={COLORS.path.red.arrow} />
          </marker>
        </defs>

        {/* Сітка гексів */}
        {(() => {
          const hexes: { row: number; col: number }[] = [];
          for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) hexes.push({ row, col });
          return hexes.map(({ row, col }) => {
            const isEvenRow = row % 2 === 0;
            const cx = col * HEX_WIDTH + (isEvenRow ? HEX_WIDTH / 2 : 0);
            const cy = row * HEX_HEIGHT * 0.75;

            const isCenter = row === fissionRow && col === fissionCol;
            const isSelected = !absorb && state.selected?.row === row && state.selected?.col === col;

            const move = !absorb && !transfer && !gameOver ? availableMoves.find((p) => p.row === row && p.col === col) : undefined;
            const isAvailable = !!move;
            const isBump = move?.bump;
            const endDie = !absorb && !transfer && !gameOver ? engine.getDieAt(row, col) : undefined;
            const isCapture = isAvailable && !isBump && !!endDie && endDie.color !== state.currentPlayer;

            let fill: string = isCenter ? COLORS.board.center : COLORS.board.cell;
            let strokeClr: string = COLORS.board.border;
            let strokeW = 1;

            if (transfer && !gameOver) {
              const isCandidate = transfer.candidates.some((p) => p.row === row && p.col === col);
              const isSource = transfer.source.row === row && transfer.source.col === col;
              if (isCandidate) fill = COLORS.transfer.candidate;
              if (isSource) strokeW = 2;
            } else if (!absorb) {
              if (isAvailable) {
                if (isBump) fill = COLORS.move.bumpFill;
                else if (isCapture) { fill = COLORS.move.captureFill; strokeClr = COLORS.move.captureStroke; strokeW = 1.5; }
                else fill = COLORS.move.emptyFill;
              }
              if (isSelected) fill = COLORS.move.selected;
            } else {
              if (absorb.remaining > 0 && weakestKey.has(`${row},${col}`)) fill = COLORS.absorb.candidate;
            }

            if (isCenter) { strokeW = 5; strokeClr = COLORS.board.border; }

            const clickable = absorb
              ? (canActAbsorb && weakestKey.has(`${row},${col}`))
              : isMyTurn;

            return (
              <polygon
                key={`hex-${row}-${col}`}
                points={getHexPoints(cx, cy, HEX_SIZE)}
                fill={fill}
                stroke={strokeClr}
                strokeWidth={strokeW}
                onClick={() => clickable && handleHexClick(row, col)}
                style={{ cursor: gameOver ? 'default' : (clickable ? 'pointer' : 'not-allowed') }}
              />
            );
          });
        })()}

        {/* Півпрозора підсвітка бамп-ланцюжків */}
        {!absorb && !transfer && !gameOver && bumpHighlightCells.map((cell, i) => {
          const isEven = cell.row % 2 === 0;
          const cx = cell.col * HEX_WIDTH + (isEven ? HEX_WIDTH / 2 : 0);
          const cy = cell.row * HEX_HEIGHT * 0.75;
          return (
            <polygon
              key={`bump-${i}`}
              points={getHexPoints(cx, cy, HEX_SIZE)}
              fill={COLORS.path.bumpCellsFill}
              stroke={COLORS.path.bumpCellsStroke}
              strokeWidth={0.5}
              style={{ pointerEvents: 'none' }}
            />
          );
        })}

        {/* Попередні шляхи/стрілки */}
        {!absorb && !transfer && !gameOver && paths.map((path, i) => {
          if (path.length === 0) return null;
          const isEvenStart = state.selected!.row % 2 === 0;
          const sx = state.selected!.col * HEX_WIDTH + (isEvenStart ? HEX_WIDTH / 2 : 0);
          const sy = state.selected!.row * HEX_HEIGHT * 0.75;

          const pre: string[] = [`${sx},${sy}`];
          const post: string[] = [];
          let wrapped = false;
          let prevCol = state.selected!.col;
          let prevX = sx, prevY = sy;

          for (let j = 0; j < path.length; j++) {
            const cell = path[j];
            const isEven = cell.row % 2 === 0;
            const cx = cell.col * HEX_WIDTH + (isEven ? HEX_WIDTH / 2 : 0);
            const cy = cell.row * HEX_HEIGHT * 0.75;

            const delta = Math.abs(cell.col - prevCol);
            if (!wrapped && delta > 1) {
              wrapped = true;

              const movingRight =
                prevCol === 8 && cell.col === 0 ? true
                : prevCol === 0 && cell.col === 8 ? false
                : cell.col > prevCol;

              const boardW = cols * HEX_WIDTH;
              const nextAdjX = movingRight ? (cx + boardW) : (cx - boardW);
              const nextAdjY = cy;

              const vx = nextAdjX - prevX; const vy = nextAdjY - prevY;
              const vlen = Math.hypot(vx, vy) || 1;
              const ux = vx / vlen; const uy = vy / vlen;

              const preEdgeX = prevX + ux * (HEX_WIDTH / 2);
              const preEdgeY = prevY + uy * (HEX_WIDTH / 2);
              pre.push(`${preEdgeX},${preEdgeY}`);

              const postEdgeAdjX = nextAdjX - ux * (HEX_WIDTH / 2);
              const postEdgeAdjY = nextAdjY - uy * (HEX_WIDTH / 2);
              const postEdgeX = movingRight ? (postEdgeAdjX - boardW) : (postEdgeAdjX + boardW);
              const postEdgeY = postEdgeAdjY;
              post.push(`${postEdgeX},${postEdgeY}`);
              post.push(`${cx},${cy}`);
            } else {
              if (wrapped) post.push(`${cx},${cy}`); else pre.push(`${cx},${cy}`);
            }
            prevCol = cell.col; prevX = cx; prevY = cy;
          }

          if (!wrapped) {
            return (
              <polyline
                key={`pline-${i}`}
                points={pre.join(' ')}
                fill="none"
                stroke={pathPalette.stroke}
                strokeWidth={2}
                strokeOpacity={0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd={`url(#${arrowId})`}
                style={{ pointerEvents: 'none' }}
              />
            );
          }

          return (
            <React.Fragment key={`pline-${i}`}>
              <polyline
                points={pre.join(' ')}
                fill="none"
                stroke={pathPalette.stroke}
                strokeWidth={2}
                strokeOpacity={0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 6"
                style={{ pointerEvents: 'none' }}
              />
              <polyline
                points={post.join(' ')}
                fill="none"
                stroke={pathPalette.stroke}
                strokeWidth={2}
                strokeOpacity={0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 6"
                markerEnd={`url(#${arrowId})`}
                style={{ pointerEvents: 'none' }}
              />
            </React.Fragment>
          );
        })}

        {/* Кістки */}
        {state.dice.map((die, i) => {
          const isEvenRow = die.row % 2 === 0;
          const cx = die.col * HEX_WIDTH + (isEvenRow ? HEX_WIDTH / 2 : 0);
          const cy = die.row * HEX_HEIGHT * 0.75;
          const displayValue = die.value + (absorb && die.color === absorb.defender ? engine.getAbsorbAddedFor(die) : 0);
          const clickable = absorb
            ? (canActAbsorb && weakestKey.has(`${die.row},${die.col}`))
            : isMyTurn;
          return (
            <DieView
              key={`die-${i}`}
              cx={cx}
              cy={cy}
              value={displayValue}
              color={die.color}
              onClick={() => clickable && handleHexClick(die.row, die.col)}
            />
          );
        })}
      </svg>

      {/* маленький індикатор сум (зручно для тесту) */}
      <div style={{
        position: 'absolute', bottom: 8, left: 12,
        padding: '4px 8px', background: 'rgba(255,255,255,0.8)', borderRadius: 6, fontSize: 12
      }}>
        Σ Red: <b>{sums.red}</b> | Σ Blue: <b>{sums.blue}</b>
      </div>

      {/* Кінець гри — показуємо у правій панелі нижче (щоб не перекривати поле) */}
    </div>
  );

  const RightPanelGameOver: React.FC = () => {
    if (!gameOver) return null;

    const loser = gameOver.loser;
    const winnerText = loser === 'red' ? 'Переможець: СИНІ' : 'Переможець: ЧЕРВОНІ';

    const resetGame = () => {
      if (isOnline) { alert('У онлайн-режимі перезапуск — створіть нову гру.'); return; }
      const fresh = new GameEngine();
      (engine as any).state = fresh.state;
      setTransfer(undefined);
      setSuppressOfferKey(null);
      forceUpdate(n => n + 1);
    };

    return (
      <div style={{ gridArea: 'right', padding: 12, borderLeft: '1px solid #e5e7eb', background: '#fff' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 8 }}>Гра завершена</div>
        <div style={{ marginBottom: 6 }}>{winnerText}</div>
        <div style={{ marginBottom: 12, fontSize: 14, color: '#555' }}>
          Суми — Червоні: <b>{sums.red}</b>, Сині: <b>{sums.blue}</b>
        </div>
        <div><button onClick={resetGame}>OK</button></div>
      </div>
    );
  };

  return (
    <div style={GRID}>
      <HeaderBar />
      <LeftPanelAbsorb />
      {/* якщо є gameOver — показуємо результат справа замість Transfer-панелі */}
      {gameOver ? <RightPanelGameOver /> : <RightPanelTransfer />}
      <BoardArea />
    </div>
  );
};
