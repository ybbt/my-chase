// =============================
// src/components/HexBoard.tsx
// =============================
// Основна сцена: малює дошку 9×9, центрову «фісійну камеру», кістки, підсвічування та
// маршрути руху. Взаємодіє з GameEngine (стан гри + валідні ходи).

import React, { useState } from 'react';
import { Die } from './Die';
import { GameEngine } from '../game/GameEngine';

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

  // Плоский список усіх координат клітинок для рендера
  const hexes = [] as { row: number; col: number }[];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) hexes.push({ row, col });
  }

  // -------------------------------
  // UI Оверлей для режиму поглинання
  // -------------------------------
  const Overlay = () => !absorb ? null : (
    <div style={{ position: 'absolute', top: 12, left: 12, padding: 12, background: 'rgba(255,255,255,0.95)', border: '1px solid #ddd', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: 320, lineHeight: 1.4, wordBreak: 'break-word' }}>
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

          // Якщо йде поглинання — підсвічуємо лише поточних «найслабших» захисника
          let fill = isCenter ? '#fde047' : '#e5e7eb';
          if (!absorb) {
            if (isAvailable) fill = isBump ? '#fef08a' : '#bbf7d0';
            if (isSelected) fill = '#60a5fa';
          } else {
            if (absorb.remaining > 0 && weakestKey.has(`${row},${col}`)) fill = '#86efac'; // зелена підсвітка кандидата лише коли ще є бали
          }

          return (
            <polygon
              key={`hex-${row}-${col}`}
              points={getHexPoints(cx, cy, HEX_SIZE)}
              fill={fill}
              stroke="#333"
              strokeWidth={1}
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
              fill="#fde68a55"
              stroke="#facc15"
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
                fill="#93c5fd55"
                stroke="#3b82f6"
                strokeWidth={0.5}
                style={{ pointerEvents: 'none' }}
              />
            );
          })
        )}

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