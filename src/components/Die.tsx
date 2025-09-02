// =============================
// src/components/Die.tsx
// =============================
// Компонент відмальовує одну «кістку» (die) як квадрат з цифрою поверх гекс-клітинки.
// Це презентаційний компонент: не містить правил, лише викликає onClick.

import React from 'react';
import { COLORS } from '../ui/theme';

interface DieProps {
  cx: number; // центр по X у SVG-координатах
  cy: number; // центр по Y у SVG-координатах
  value: number; // значення кістки (швидкість/кроки)
  color: 'red' | 'blue'; // колір гравця
  onClick?: () => void; // хендлер кліку
}

export const Die: React.FC<DieProps> = ({ cx, cy, value, color, onClick }) => {
  const size = 24; // розмір «кубика»
  const x = cx - size / 2;
  const y = cy - size / 2;

  return (
    <>
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={4}
        ry={4}
        fill={COLORS.die[color].fill}
        stroke={COLORS.die[color].stroke}
        strokeWidth={1.5}
        onClick={onClick}
        style={{ cursor: 'pointer' }}
      />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize="14"
        fill={COLORS.die.text}
        fontWeight="bold"
        pointerEvents="none"
      >
        {value}
      </text>
    </>
  );
};