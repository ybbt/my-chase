// =============================
// src/components/HexBoard.tsx
// =============================
// Основна сцена: малює дошку 9×9, центрову «фісійну камеру», кістки, підсвічування та
// маршрути руху. Взаємодіє з GameEngine (стан гри + валідні ходи).

import React, { useState } from 'react';
import { Die } from './Die';
import { GameEngine } from '../game/GameEngine';
import { COLORS } from '../ui/theme';

// Геометрія гекса у пікселях (SVG)
const HEX_SIZE = 30;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE; // горизонтальний крок між стовпцями
const HEX_HEIGHT = 2 * HEX_SIZE;           // вертикальний діаметр гекса

function getHexPoints(cx: number, cy: number, size: number): string {
  // Та сама утиліта, що й у Hex.tsx, але локальна для швидкого рендеру масивів
  const points = [] as string[];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30;
    const angle_rad = (Math.PI / 180) * angle_deg;
    const x = cx + size * Math.cos(angle_rad);
    const y = cy + size * Math.sin(angle_rad);
    points.push(`${x},${y}`);
  }
  return points.join(' ');
}

export interface MoveOption {
  row: number;
  col: number;
  bump?: boolean; // чи буде бамп на цій клітинці
  bumpChain?: { row: number; col: number }[]; // попередній перегляд ланцюжка бампів
}

export const HexBoard: React.FC = () => {
  // ініціалізуємо рушій гри один раз (у стейті)
  const [engine] = useState(() => new GameEngine());
  const [_, forceUpdate] = useState(0); // хак для форс-рендеру після змін engine.state
  const state = engine.state;           // поточний стан гри
  const absorb = state.absorb;          // режим поглинання (якщо є)

  

  // Запитуємо у рушія валідні цілі для обраної кістки (у режимі поглинання рушій поверне [])
  const availableMoves = engine.getAvailableMoves();

  // Для підсвітки бамп-ланцюжків (прозоре накриття клітинок) — показуємо лише якщо НЕ поглинаємо
  const bumpHighlightCells = !absorb
    ? availableMoves.reduce((acc, m) => {
        if (m.bump && m.bumpChain) acc.push(...m.bumpChain);
        return acc;
      }, [] as { row: number; col: number }[])
    : [];

  // Параметри поля 9×9, центр — (4,4)
  const rows = 9;
  const cols = 9;
  const fissionRow = 4;
  const fissionCol = 4;

  // Кандидати для підвищення в режимі поглинання (тільки поточні «найслабші» < 6)
  const weakestSet = absorb ? engine.getAbsorbWeakest() : [];
  const weakestKey = new Set(weakestSet.map(d => `${d.row},${d.col}`));

  // -------------------------------
  // Обробка кліків по клітинках/кістках
  // -------------------------------
  const handleHexClick = (row: number, col: number) => {
    // Якщо йде поглинання — кліки інтерпретуємо як вибір кістки-захисника
    if (state.absorb) {
      // Якщо все вже розподілено — ігноруємо кліки, просто чекаємо «Готово» або «Скинути»
      if (state.absorb.remaining === 0) return;
      // Дозволяємо клік лише по «поточній найслабшій» кістці захисника
      const key = `${row},${col}`;
      if (weakestKey.has(key)) {
        engine.chooseAbsorbAt(row, col); // підняти вибрану й авто-докрутити одиночні
        forceUpdate(n => n + 1);
      }
      return;
    }

    // Звичайний режим
    const clickedDie = engine.getDieAt(row, col);
    const isSelected = !!state.selected;
    const isOwnDie = clickedDie?.color === state.currentPlayer;
    const isSameAsSelected = isSelected && state.selected!.row === row && state.selected!.col === col;

    if (!isSelected) {
      if (isOwnDie) engine.selectDie(row, col);
    } else {
      const available = engine.getAvailableMoves();
      const isLegalTarget = available.some((p) => p.row === row && p.col === col);
      if (isOwnDie && !isLegalTarget && !isSameAsSelected) {
        engine.selectDie(row, col);
      } else {
        engine.moveSelectedTo(row, col);
      }
    }
    forceUpdate((n) => n + 1);
  };

  // Побудова попередніх «шляхів» — підсвічення клітинок, через які
  // піде обрана кістка у кожному з 6 напрямків (допомагає дивитися траєкторію
  // з урахуванням рикошетів/обгортань і блокувань іншими кістками). Вимикаємо під час поглинання
  // ПРАВКА: показуємо шляхи лише для ТИХ напрямків, де кінцева клітинка — ЛЕГАЛЬНА (а не «урвана» перешкодою)
  const paths: { row: number; col: number }[][] = [];
  if (state.selected && !absorb) {
    const selDie = engine.getDieAt(state.selected.row, state.selected.col);
    if (selDie) {
      const directions = engine.getDirectionVectors();
      const legalTargets = new Set(availableMoves.map(m => `${m.row},${m.col}`));
      for (const dir of directions) {
        const path = engine.getMovePath(selDie, dir);
        const last = path[path.length - 1];
        const isComplete = path.length === selDie.value && last && legalTargets.has(`${last.row},${last.col}`);
        if (isComplete) paths.push(path);
      }
    }
  }

  // Кольори шляхів: червона фішка — червоні шляхи; синя — сині
  const selectedDie = state.selected ? engine.getDieAt(state.selected.row, state.selected.col) : undefined;
  const pathPalette = selectedDie?.color === 'red' ? COLORS.path.red : COLORS.path.blue;
  const arrowId = selectedDie?.color === 'red' ? 'arrow-red' : 'arrow-blue';

  // Плоский список усіх координат клітинок для рендера
  const hexes = [] as { row: number; col: number }[];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) hexes.push({ row, col });
  }

  // -------------------------------
  // UI Оверлей для режиму поглинання
  // -------------------------------
  const Overlay = () => !absorb ? null : (
    <div style={{ position: 'absolute', top: 12, left: 12, padding: 12, background: COLORS.absorb.overlayBg, border: `1px solid ${COLORS.absorb.overlayBorder}`, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: 320, lineHeight: 1.4, wordBreak: 'break-word' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Поглинання — команда {absorb.defender}</div>
      {absorb.remaining > 0 && (
        <div style={{ marginBottom: 8 }}>Залишилось розподілити: <b>{absorb.remaining}</b></div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => { engine.forceAutoAbsorb(); forceUpdate(n=>n+1); }} disabled={absorb.remaining === 0 || (engine.getAbsorbWeakest().length === 0 && absorb.remaining > 0)}>
          Авто
        </button>
        <button onClick={() => { engine.resetAbsorb(); forceUpdate(n=>n+1); }} disabled={absorb.remaining === absorb.captured && absorb.draft.length === 0}>
          Скинути
        </button>
        <button onClick={() => { engine.finalizeAbsorb(); forceUpdate(n=>n+1); }} disabled={absorb.remaining !== 0 && engine.getAbsorbWeakest().length > 0}>
          Готово
        </button>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
        {absorb.remaining === 0 ? (
          <>Розподіл завершено. Натисніть «Готово», щоб підтвердити, або «Скинути», щоб змінити.</>
        ) : (
          (() => {
            const count = engine.getAbsorbWeakest().length;
            if (count > 1) return <>Є кілька найслабших — оберіть одну.</>;
            if (count === 0) return <>Немає доступних кісток &lt; 6 — решта {absorb.remaining} не може бути розподілена.</>;
            return <>Найслабша одна — підвищення відбувається автоматично.</>;
          })()
        )}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Overlay />
      <svg width="100%" height="100%" viewBox="-50 -50 800 800">
        <defs>
          <marker id="arrow-blue" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L10,5 L0,10 Z" fill={COLORS.path.blue.arrow} />
          </marker>
          <marker id="arrow-red" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M0,0 L10,5 L0,10 Z" fill={COLORS.path.red.arrow} />
          </marker>
        </defs>
        {/* Рендер сітки гексів з підсвіткою */}
        {hexes.map(({ row, col }) => {
          const isEvenRow = row % 2 === 0; // зсув парних рядків
          const cx = col * HEX_WIDTH + (isEvenRow ? HEX_WIDTH / 2 : 0);
          const cy = row * HEX_HEIGHT * 0.75; // вертикальний крок 3/4 діаметра

          const isCenter = row === fissionRow && col === fissionCol; // фісійна камера
          const isSelected = !absorb && state.selected?.row === row && state.selected?.col === col;

          const move = !absorb ? availableMoves.find(p => p.row === row && p.col === col) : undefined;
          const isAvailable = !!move;     // чи можна закінчити хід тут
          const isBump = move?.bump;      // чи це бамп-плитка
          const endDie = !absorb ? engine.getDieAt(row, col) : undefined; // хто зараз стоїть у цілі
          const isCapture = isAvailable && !isBump && !!endDie && endDie.color !== state.currentPlayer; // взяття?

          // Якщо йде поглинання — підсвічуємо лише поточних «найслабших» захисника
          let fill: string = isCenter ? COLORS.board.center : COLORS.board.cell;
          let strokeClr: string = COLORS.board.border;
          let strokeW = 1;
          if (!absorb) {
            if (isAvailable) {
              if (isBump) {
                fill = COLORS.move.bumpFill;
              } else if (isCapture) {
                // Інтенсивніша підсвітка взяття + червона обводка
                fill = COLORS.move.captureFill;        // red-400
                strokeClr = COLORS.move.captureStroke;   // red-500
                strokeW = 1.5;
              } else {
                fill = COLORS.move.emptyFill;
              }
            }
            if (isSelected) fill = COLORS.move.selected;
          } else {
            if (absorb.remaining > 0 && weakestKey.has(`${row},${col}`)) fill = COLORS.absorb.candidate; // зелена підсвітка кандидата лише коли ще є бали
          }

          if (isCenter) {
            strokeW = 5;
            strokeClr = COLORS.board.border;
          }

          return (
            <polygon
              key={`hex-${row}-${col}`}
              points={getHexPoints(cx, cy, HEX_SIZE)}
              fill={fill}
              stroke={strokeClr}
              strokeWidth={strokeW}
              onClick={() => handleHexClick(row, col)}
              style={{ cursor: 'pointer' }}
            />
          );
        })}

        {/* напівпрозора підсвітка клітинок, через які пройде ланцюжок бампів (лише поза поглинанням) */}
        {!absorb && bumpHighlightCells.map((cell, i) => {
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

        {/* Попередні шляхи (маршрути) обраної кістки у всіх 6 напрямках (вимкнено під час поглинання) */}
        {!absorb && paths.map((path, i) =>
          path.map((cell, j) => {
            const isEvenPathRow = cell.row % 2 === 0;
            const cx = cell.col * HEX_WIDTH + (isEvenPathRow ? HEX_WIDTH / 2 : 0);
            const cy = cell.row * HEX_HEIGHT * 0.75;
            return (
              <polygon
                key={`path-${i}-${j}`}
                points={getHexPoints(cx, cy, HEX_SIZE)}
                fill={pathPalette.hexFill}
                stroke={pathPalette.stroke}
                strokeWidth={0.5}
                style={{ pointerEvents: 'none' }}
              />
            );
          })
        )}

        {/* Лінія через центри гексів уздовж кожного валідного шляху */}
        {!absorb && paths.map((path, i) => {
          if (!selectedDie) return null;
          // Стартова точка — центр обраної фішки
          const isEven0 = selectedDie.row % 2 === 0;
          const sx = selectedDie.col * HEX_WIDTH + (isEven0 ? HEX_WIDTH / 2 : 0);
          const sy = selectedDie.row * HEX_HEIGHT * 0.75;

          // Розіб'ємо лінію на дві частини, якщо є wrap по горизонталі:
          // до краю (pre) і від протилежного краю (post)
          const pre: string[] = [`${sx},${sy}`];
          const post: string[] = [];
          let wrapped = false;
          let prevCol = selectedDie.col;
          let prevX = sx, prevY = sy;

          for (let k = 0; k < path.length; k++) {
            const cell = path[k];
            const isEven = cell.row % 2 === 0;
            const cx = cell.col * HEX_WIDTH + (isEven ? HEX_WIDTH / 2 : 0);
            const cy = cell.row * HEX_HEIGHT * 0.75;

            // wrap детектуємо за стрибком стовпця > 1 (0↔8)
            const delta = Math.abs(cell.col - prevCol);
            if (!wrapped && delta > 1) {
              wrapped = true;
              // напрямок wrap: вправо (8→0) чи вліво (0→8)
              const movingRight = (prevCol === 8 && cell.col === 0)
                ? true
                : (prevCol === 0 && cell.col === 8)
                ? false
                : (cell.col > prevCol);

              // «Розмотуємо» координату наступного центру по X, щоб отримати локальний вектор руху
              const boardW = cols * HEX_WIDTH;
              const nextAdjX = movingRight ? (cx + boardW) : (cx - boardW);
              const nextAdjY = cy;

              // Одиничний вектор напрямку від попереднього центру до «розмотаного» наступного
              const vx = nextAdjX - prevX; const vy = nextAdjY - prevY;
              const vlen = Math.hypot(vx, vy) || 1;
              const ux = vx / vlen; const uy = vy / vlen;

              // Точка виходу до краю попереднього гекса (на пів HEX_WIDTH у напрямку руху)
              const preEdgeX = prevX + ux * (HEX_WIDTH / 2);
              const preEdgeY = prevY + uy * (HEX_WIDTH / 2);
              pre.push(`${preEdgeX},${preEdgeY}`);

              // Точка входу з протилежного краю наступного гекса (дзеркально)
              const postEdgeAdjX = nextAdjX - ux * (HEX_WIDTH / 2);
              const postEdgeAdjY = nextAdjY - uy * (HEX_WIDTH / 2);
              const postEdgeX = movingRight ? (postEdgeAdjX - boardW) : (postEdgeAdjX + boardW);
              const postEdgeY = postEdgeAdjY;
              post.push(`${postEdgeX},${postEdgeY}`);
              // Додаємо сам центр цієї клітинки
              post.push(`${cx},${cy}`);
            } else {
              if (wrapped) post.push(`${cx},${cy}`); else pre.push(`${cx},${cy}`);
            }
            prevCol = cell.col; prevX = cx; prevY = cy;
          }

          if (!wrapped) {
            // Без wrap — одна суцільна лінія з маркером на фініші
            const pts = pre.join(' ');
            return (
              <polyline
                key={`pline-${i}`}
                points={pts}
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

          // Є wrap — малюємо ДВІ лінії: до краю і від протилежного краю
          return (
            <>
              <polyline
                key={`pline-${i}-pre`}
                points={pre.join(' ')}
                fill="none"
                stroke={pathPalette.stroke}
                strokeWidth={2}
                strokeOpacity={0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={'6 6'}
                style={{ pointerEvents: 'none' }}
              />
              <polyline
                key={`pline-${i}-post`}
                points={post.join(' ')}
                fill="none"
                stroke={pathPalette.stroke}
                strokeWidth={2}
                strokeOpacity={0.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={'6 6'}
                markerEnd={`url(#${arrowId})`}
                style={{ pointerEvents: 'none' }}
              />
            </>
          );
        })}

        {/* Рендер кісток поверх клітинок */}
        {state.dice.map((die, index) => {
          const isEvenRow = die.row % 2 === 0;
          const cx = die.col * HEX_WIDTH + (isEvenRow ? HEX_WIDTH / 2 : 0);
          const cy = die.row * HEX_HEIGHT * 0.75;

          return (
            <Die
              key={`die-${index}`}
              cx={cx}
              cy={cy}
              value={die.value + (absorb && die.color === absorb.defender ? engine.getAbsorbAddedFor(die) : 0)}
              color={die.color}
              onClick={() => handleHexClick(die.row, die.col)}
            />
          );
        })}
      </svg>
    </div>
  );
};