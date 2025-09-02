// =============================
// src/ui/theme.ts
// =============================
// Єдина палітра кольорів інтерфейсу. Міняючи значення тут — змінюється вся гра.

export const COLORS = {
  board: {
    cell: '#e5e7eb',      // звичайна клітинка
    center: '#fde047',    // фісійна камера
    border: '#333',       // обводка гексів
  },
  move: {
    emptyFill: '#bbf7d0',     // легальна порожня ціль (бірюзова)
    bumpFill: '#fef08a',      // бамп по своїх (жовта)
    captureFill: '#f87171',   // взяття (насичений червоний)
    captureStroke: '#ef4444', // обводка при взятті
    selected: '#60a5fa',      // обрана кістка
  },
  absorb: {
    candidate: '#86efac',             // найслабші під час поглинання
    overlayBg: 'rgba(255,255,255,0.95)',
    overlayBorder: '#ddd',
  },
  path: {
    blue: { hexFill: '#93c5fd55', stroke: '#3b82f6', arrow: '#3b82f6' },
    red:  { hexFill: '#fca5a555', stroke: '#ef4444', arrow: '#ef4444' },
    bumpCellsFill: '#fde68a55',
    bumpCellsStroke: '#facc15',
  },
  die: {
    red:  { fill: 'red',  stroke: 'black' },
    blue: { fill: 'blue', stroke: 'black' },
    text: 'white',
  },
} as const;