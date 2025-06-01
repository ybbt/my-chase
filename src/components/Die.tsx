import React from 'react';

interface DieProps {
  cx: number;
  cy: number;
  value: number;
  color: 'red' | 'blue';
  onClick?: () => void;
}

export const Die: React.FC<DieProps> = ({ cx, cy, value, color, onClick }) => {
  const size = 24;
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
        fill={color}
        stroke="black"
        strokeWidth={1.5}
        onClick={onClick}
        style={{ cursor: 'pointer' }}
      />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontSize="14"
        fill="white"
        fontWeight="bold"
        pointerEvents="none"
      >
        {value}
      </text>
    </>
  );
};
