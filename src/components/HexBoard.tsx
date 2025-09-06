// =============================
// src/components/HexBoard.tsx
// =============================

import React, { useState } from 'react';
import { Die as DieView } from './Die';
import { GameEngine } from '../game/GameEngine';
import { COLORS } from '../ui/theme';

// Геометрія гекса (SVG)
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
  const [engine] = useState(() => new GameEngine());
  const [, forceUpdate] = useState(0);
  const state = engine.state;
  const absorb = state.absorb;
  const gameOver = state.gameOver;

  const [transfer, setTransfer] = useState<TransferState | undefined>(undefined);
  const [suppressOfferKey, setSuppressOfferKey] = useState<string | null>(null);

  // Підсумки по кольорах (показ у кутку та в модалці)
  const sums = (() => {
    let red = 0, blue = 0;
    for (const d of state.dice) d.color === 'red' ? red += d.value : blue += d.value;
    return { red, blue };
  })();

  // Валідні рухи для підсвітки
  const availableMoves = engine.getAvailableMoves();

  // Підсвітка бамп-ланцюжків
  const bumpHighlightCells = (!absorb && !transfer && !gameOver)
    ? availableMoves.reduce((acc, m) => { if (m.bump && m.bumpChain) acc.push(...m.bumpChain); return acc; }, [] as {row:number;col:number}[])
    : [];

  const rows = 9, cols = 9;
  const fissionRow = 4, fissionCol = 4;

  // Найслабші під час absorb
  const weakestSet = absorb ? engine.getAbsorbWeakest() : [];
  const weakestKey = new Set(weakestSet.map(d => `${d.row},${d.col}`));

  // ----- сусіди (для TRANSFER) -----
  function getNeighborCells(row: number, col: number): {row:number;col:number}[] {
    const even = row % 2 === 0;
    const dirsEven: [number,number][] = [[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
    const dirsOdd:  [number,number][] = [[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]];
    const dirs = even ? dirsEven : dirsOdd;
    const res: {row:number;col:number}[] = [];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      if (nc < 0) nc = 8; else if (nc > 8) nc = 0; // wrap
      if (nr < 0 || nr > 8) continue;
      res.push({ row: nr, col: nc });
    }
    return res;
  }

  const adjacentAllies: {row:number;col:number}[] = (() => {
    if (!state.selected) return [];
    const me = engine.getDieAt(state.selected.row, state.selected.col);
    if (!me) return [];
    return getNeighborCells(state.selected.row, state.selected.col)
      .map(p => engine.getDieAt(p.row, p.col))
      .filter((d): d is NonNullable<typeof d> => !!d && d.color === me.color)
      .map(d => ({ row: d.row, col: d.col }));
  })();

  const selectedKey = state.selected ? `${state.selected.row},${state.selected.col}` : null;
  const canOfferTransfer = !absorb && !transfer && !gameOver && state.selected && adjacentAllies.length > 0 && (suppressOfferKey !== selectedKey);

  // ----- кліки -----
  const handleHexClick = (row: number, col: number) => {
    if (gameOver) return;

    // режим Absorb
    if (state.absorb) {
      if (state.absorb.remaining === 0) return;
      const key = `${row},${col}`;
      if (weakestKey.has(key)) {
        engine.chooseAbsorbAt(row, col);
        forceUpdate(n => n + 1);
      }
      return;
    }

    // режим Transfer — вибір отримувача
    if (transfer) {
      const isCandidate = transfer.candidates.some(p => p.row === row && p.col === col);
      if (!isCandidate) return;

      const donor = engine.getDieAt(transfer.source.row, transfer.source.col);
      const recip = engine.getDieAt(row, col);
      if (!donor || !recip) return;

      const maxOut = Math.min(donor.value - 1, 6 - recip.value); // source -> target
      const maxIn  = Math.min(recip.value - 1, 6 - donor.value); // target -> source

      let direction: 'out' | 'in' | undefined;
      if (maxOut > 0) direction = 'out';
      else if (maxIn > 0) direction = 'in';

      const amount = direction === 'out'
        ? Math.max(1, Math.min(1, maxOut))
        : direction === 'in'
        ? Math.max(1, Math.min(1, maxIn))
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
      if (isOwnDie) {
        engine.selectDie(row, col);
        setSuppressOfferKey(null);
      }
    } else {
      const isLegalTarget = availableMoves.some(p => p.row === row && p.col === col);
      if (isOwnDie && !isLegalTarget && !isSameAsSelected) {
        engine.selectDie(row, col);
        setSuppressOfferKey(null);
      } else {
        const moved = engine.moveSelectedTo(row, col);
        if (moved) {
          // кінець гри тепер визначає тільки engine.state.gameOver у finalizeAbsorb()
        }
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
      const legalTargets = new Set(availableMoves.map(m => `${m.row},${m.col}`));
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

  // ----- застосувати TRANSFER (через рушій) -----
  const applyTransfer = () => {
    if (!transfer || !transfer.target || !state.selected || !transfer.direction || gameOver) return;

    const ok = engine.transfer(
      transfer.source,
      transfer.target,
      transfer.direction,
      Math.max(1, transfer.amount ?? 1),
    );
    if (!ok) return;

    setTransfer(undefined);
    forceUpdate(n => n + 1);
  };

  // ----- оверлеї -----
  const OverlayAbsorb = () => !absorb ? null : (
    <div style={{ position: 'absolute', top: 12, left: 12, padding: 12, background: COLORS.absorb.overlayBg, border: `1px solid ${COLORS.absorb.overlayBorder}`, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: 340, lineHeight: 1.4 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Поглинання — команда {absorb.defender}</div>
      {absorb.remaining > 0 && (<div style={{ marginBottom: 8 }}>Залишилось розподілити: <b>{absorb.remaining}</b></div>)}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => { engine.forceAutoAbsorb(); forceUpdate(n=>n+1); }} disabled={absorb.remaining === 0 || (engine.getAbsorbWeakest().length === 0 && absorb.remaining > 0)}>Авто</button>
        <button onClick={() => { engine.resetAbsorb(); forceUpdate(n=>n+1); }} disabled={absorb.remaining === absorb.captured && absorb.draft.length === 0}>Скинути</button>
        <button onClick={() => { engine.finalizeAbsorb(); forceUpdate(n=>n+1); }} disabled={absorb.remaining > 0 && engine.getAbsorbWeakest().length > 0 && !absorb.userChoice}>
          Готово
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
        {
          absorb.remaining === 0
            ? <>Розподіл завершено. Натисніть «Готово», щоб підтвердити (хід перейде супернику).</>
            : (() => {
                const count = engine.getAbsorbWeakest().length;
                if (count > 1) return <>Є кілька найслабших — оберіть одну.</>;
                if (count === 0) return <>Немає доступних кісток &lt; 6 — решта {absorb.remaining} не може бути розподілена.</>;
                return <>Найслабша одна — підвищення відбувається автоматично.</>;
              })()
        }
      </div>
    </div>
  );

  const OverlayTransfer = () => {
    if (gameOver) return null;

    // 1) Пропозиція почати трансфер
    if (canOfferTransfer) {
      return (
        <div style={{ position: 'absolute', top: 12, right: 12, padding: 12, background: COLORS.transfer.overlayBg, border: `1px solid ${COLORS.transfer.overlayBorder}`, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: 380, lineHeight: 1.4 }}>
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
        <div style={{ position: 'absolute', top: 12, right: 12, padding: 12, background: COLORS.transfer.overlayBg, border: `1px solid ${COLORS.transfer.overlayBorder}`, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: 420, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Трансфер активний</div>
          <div style={{ marginBottom: 10 }}>Оберіть суміжну свою кістку-отримувача (підсвічено на полі).</div>
          <div style={{ fontSize: 12, color: '#555' }}>
            Обрано: <b>{transfer.source.row},{transfer.source.col}</b> (= {donor?.value ?? '?'})
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={() => setTransfer(undefined)}>Вийти</button>
          </div>
        </div>
      );
    }

    // 3) Є пара — вибір напряму та кількості
    if (transfer && transfer.target) {
      const src = engine.getDieAt(transfer.source.row, transfer.source.col);
      const trg = engine.getDieAt(transfer.target.row, transfer.target.col);
      const srcVal = src?.value ?? 0;
      const trgVal = trg?.value ?? 0;
      const maxOut = Math.max(0, Math.min(srcVal - 1, 6 - trgVal)); // source → target
      const maxIn  = Math.max(0, Math.min(trgVal - 1, 6 - srcVal)); // target → source
      const activeMax = transfer.direction === 'out' ? maxOut : transfer.direction === 'in' ? maxIn : 0;
      const amount = Math.min(Math.max(transfer.amount ?? 1, 1), Math.max(activeMax, 1));
      const disableConfirm = activeMax <= 0;

      const setDir = (dir: 'out' | 'in') => {
        const newMax = dir === 'out' ? maxOut : maxIn;
        setTransfer({ ...transfer, direction: dir, amount: newMax > 0 ? Math.min(transfer.amount ?? 1, newMax) || 1 : 0, maxOut, maxIn });
      };

      return (
        <div style={{ position: 'absolute', top: 12, right: 12, padding: 12, background: COLORS.transfer.overlayBg, border: `1px solid ${COLORS.transfer.overlayBorder}`, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: 460, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Підтвердити трансфер</div>

          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <div>
              Пара: <b>{transfer.source.row},{transfer.source.col}</b> (={srcVal}) ↔ <b>{transfer.target.row},{transfer.target.col}</b> (={trgVal})
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => setDir('out')} disabled={maxOut <= 0} style={{ fontWeight: transfer.direction === 'out' ? 700 : 400 }} title={maxOut > 0 ? `Макс ${maxOut}` : 'Немає можливого переказу'}>
                {`${transfer.source.row},${transfer.source.col} → ${transfer.target.row},${transfer.target.col}`}
              </button>
              <button onClick={() => setDir('in')} disabled={maxIn <= 0} style={{ fontWeight: transfer.direction === 'in' ? 700 : 400 }} title={maxIn > 0 ? `Макс ${maxIn}` : 'Немає можливого переказу'}>
                {`${transfer.source.row},${transfer.source.col} ← ${transfer.target.row},${transfer.target.col}`}
              </button>
              <span style={{ fontSize: 12, color: '#666' }}>
                {transfer.direction === 'out' ? `Макс: ${maxOut}` : transfer.direction === 'in' ? `Макс: ${maxIn}` : 'Оберіть напрям'}
              </span>
            </div>

            {activeMax <= 0 ? (
              <div style={{ color: '#b91c1c' }}>
                Не можна передати в обраному напрямі (донор має лишити ≥1, одержувач не може стати &gt;6).
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setTransfer({ ...transfer, amount: Math.max(1, amount - 1) })}>−</button>
                <input
                  type="number"
                  min={1}
                  max={activeMax}
                  value={amount}
                  onChange={e => {
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
            <button onClick={() => setTransfer({ source: transfer.source, candidates: transfer.candidates })}>
              Змінити отримувача
            </button>
            <button onClick={() => setTransfer(undefined)}>Вийти</button>
            <button onClick={applyTransfer} disabled={disableConfirm}>
              Підтвердити
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  const OverlayGameOver = () => {
    if (!gameOver) return null;

    const loser = gameOver.loser;
    const winnerText = loser === 'red' ? 'Переможець: СИНІ' : 'Переможець: ЧЕРВОНІ';

    const resetGame = () => {
      const fresh = new GameEngine();
      (engine as any).state = fresh.state; // "мʼякий" reset
      setTransfer(undefined);
      setSuppressOfferKey(null);
      forceUpdate(n => n + 1);
    };

    return (
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
        <div style={{ background: 'white', padding: 20, borderRadius: 10, minWidth: 320, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Гра завершена</div>
          <div style={{ marginBottom: 6 }}>{winnerText}</div>
          <div style={{ marginBottom: 16, fontSize: 14, color: '#555' }}>Суми — Червоні: <b>{sums.red}</b>, Сині: <b>{sums.blue}</b></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={resetGame}>OK</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <OverlayAbsorb />
      <OverlayTransfer />
      <OverlayGameOver />

      <svg width="100%" height="100%" viewBox="-50 -50 800 800">
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

            const move = (!absorb && !transfer && !gameOver) ? availableMoves.find(p => p.row === row && p.col === col) : undefined;
            const isAvailable = !!move;
            const isBump = move?.bump;
            const endDie = (!absorb && !transfer && !gameOver) ? engine.getDieAt(row, col) : undefined;
            const isCapture = isAvailable && !isBump && !!endDie && endDie.color !== state.currentPlayer;

            let fill: string = isCenter ? COLORS.board.center : COLORS.board.cell;
            let strokeClr: string = COLORS.board.border;
            let strokeW = 1;

            if (transfer && !gameOver) {
              const isCandidate = transfer.candidates.some(p => p.row === row && p.col === col);
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

            return (
              <polygon
                key={`hex-${row}-${col}`}
                points={getHexPoints(cx, cy, HEX_SIZE)}
                fill={fill}
                stroke={strokeClr}
                strokeWidth={strokeW}
                onClick={() => handleHexClick(row, col)}
                style={{ cursor: gameOver ? 'default' : 'pointer' }}
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
          const first = path[0];
          const isEvenStart = (state.selected!.row % 2) === 0;
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

              const movingRight = (prevCol === 8 && cell.col === 0)
                ? true
                : (prevCol === 0 && cell.col === 8)
                ? false
                : (cell.col > prevCol);

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
          return (
            <DieView
              key={`die-${i}`}
              cx={cx}
              cy={cy}
              value={displayValue}
              color={die.color}
              onClick={() => handleHexClick(die.row, die.col)}
            />
          );
        })}
      </svg>

      {/* маленький індикатор сум (зручно для тесту) */}
      <div style={{ position: 'absolute', bottom: 8, left: 12, padding: '4px 8px', background: 'rgba(255,255,255,0.8)', borderRadius: 6, fontSize: 12 }}>
        Σ Red: <b>{sums.red}</b> | Σ Blue: <b>{sums.blue}</b>
      </div>
    </div>
  );
};
