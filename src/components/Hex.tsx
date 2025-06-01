// src/components/Hex.tsx
import React from 'react';

export interface HexProps {
  cx: number;
  cy: number;
  size: number;
  fill?: string;
  stroke?: string;
  onClick?: () => void;
}

export const Hex: React.FC<HexProps> = ({
  cx,
  cy,
  size,
  fill = '#ddd',
  stroke = '#333',
  onClick,
}) => {
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
      strokeWidth={1}
      onClick={onClick}
    />
  );
};
