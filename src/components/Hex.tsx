// =============================
// src/components/Hex.tsx
// =============================
// Допоміжний компонент для відмальовки 1 гекс-клітинки. Логіки правил не містить.

import React from 'react';

export interface HexProps {
  cx: number;      // центр гекса по X
  cy: number;      // центр гекса по Y
  size: number;    // радіус/розмір гекса
  fill?: string;   // заливка
  stroke?: string; // колір обводки
  strokeWidth?: number; // товщина обводки
  onClick?: () => void; // клік по клітинці, якщо потрібно
}

export const Hex: React.FC<HexProps> = ({
  cx,
  cy,
  size,
  fill = '#ddd',
  stroke = '#333',
  strokeWidth = 1,
  onClick,
}) => {
  // Обчислюємо 6 вершин регулярного гекса (кутова орієнтація -30°, 30°, ...)
  const points = Array.from({ length: 6 }).map((_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    return `${x},${y}`;
  });

  return (
    <polygon
      points={points.join(' ')}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      onClick={onClick}
    />
  );
};