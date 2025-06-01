// ---------- src/components/HexBoard.ts ----------
import React, { useState } from 'react';
import { Die } from './Die';
import { GameEngine } from '../game/GameEngine';

const HEX_SIZE = 30;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

function getHexPoints(cx: number, cy: number, size: number): string {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30;
    const angle_rad = Math.PI / 180 * angle_deg;
    const x = cx + size * Math.cos(angle_rad);
    const y = cy + size * Math.sin(angle_rad);
    points.push(`${x},${y}`);
  }
  return points.join(' ');
}

export interface MoveOption {
  row: number;
  col: number;
  bump?: boolean;
  bumpChain?: { row: number; col: number }[];
}

export const HexBoard: React.FC = () => {
  const [engine] = useState(() => new GameEngine());
  const [_, forceUpdate] = useState(0);
  const state = engine.state;
  const availableMoves = engine.getAvailableMoves();
  const bumpHighlightCells = availableMoves
    .filter(m => m.bump && m.bumpChain)
    .flatMap(m => m.bumpChain!);

  const rows = 9;
  const cols = 9;
  const fissionRow = 4;
  const fissionCol = 4;

  const handleHexClick = (row: number, col: number) => {
    const clickedDie = engine.getDieAt(row, col);
    const isSelected = !!state.selected;
    const isOwnDie = clickedDie?.color === state.currentPlayer;
    const isSameAsSelected =
      isSelected &&
      state.selected!.row === row &&
      state.selected!.col === col;

    if (!isSelected) {
      if (isOwnDie) {
        engine.selectDie(row, col);
      }
    } else {
      const available = engine.getAvailableMoves();
      const isLegalTarget = available.some(
        (p) => p.row === row && p.col === col
      );

      if (isOwnDie && !isLegalTarget && !isSameAsSelected) {
        engine.selectDie(row, col);
      } else {
        engine.moveSelectedTo(row, col);
      }
    }

    forceUpdate((n) => n + 1);
  };

  const paths: { row: number; col: number }[][] = [];
  if (state.selected) {
    const selDie = engine.getDieAt(state.selected.row, state.selected.col);
    if (selDie) {
      const directions = engine.getDirectionVectors();
      for (const dir of directions) {
        const path = engine.getMovePath(selDie, dir);
        if (path.length > 0) {
          paths.push(path);
        }
      }
    }
  }

  const hexes = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      hexes.push({ row, col });
    }
  }

  return (
    <svg width="100%" height="100%" viewBox="-50 -50 800 800">
      {hexes.map(({ row, col }) => {
        const isEvenRow = row % 2 === 0;
        const cx = col * HEX_WIDTH + (isEvenRow ? HEX_WIDTH / 2 : 0);
        const cy = row * HEX_HEIGHT * 0.75;

        const isCenter = row === fissionRow && col === fissionCol;
        const isSelected =
          state.selected?.row === row && state.selected?.col === col;
        const move = availableMoves.find(p => p.row === row && p.col === col);
        const isAvailable = !!move;
        const isBump = move?.bump;

        let fill = isCenter ? '#fde047' : '#e5e7eb';
        if (isAvailable) fill = isBump ? '#fef08a' : '#bbf7d0';
        if (isSelected) fill = '#60a5fa';

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

      {bumpHighlightCells.map((cell, i) => {
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

      {paths.map((path, i) =>
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

      {state.dice.map((die, index) => {
        const isEvenRow = die.row % 2 === 0;
        const cx = die.col * HEX_WIDTH + (isEvenRow ? HEX_WIDTH / 2 : 0);
        const cy = die.row * HEX_HEIGHT * 0.75;

        return (
          <Die
            key={`die-${index}`}
            cx={cx}
            cy={cy}
            value={die.value}
            color={die.color}
            onClick={() => handleHexClick(die.row, die.col)}
          />
        );
      })}
    </svg>
  );
};
