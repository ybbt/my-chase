import { GameEngine } from '../src/game/GameEngine';

export type C = 'red' | 'blue';

export function newEngine(dice: Array<{c: C; r: number; ccol: number; v: number}>, current: C = 'blue') {
  const e = new GameEngine();
  // повністю перезбираємо стан
  (e.state.dice as any) = dice.map(d => ({ row: d.r, col: d.ccol, value: d.v, color: d.c }));
  e.state.currentPlayer = current;
  e.state.selected = undefined;
  e.state.absorb = undefined;
  e.state.gameOver = undefined;
  return e;
}

export function add(e: GameEngine, c: C, r: number, ccol: number, v: number) {
  e.state.dice.push({ row: r, col: ccol, value: v, color: c });
}

export function sel(e: GameEngine, r: number, ccol: number) {
  e.selectDie(r, ccol);
}

export function mv(e: GameEngine, r: number, ccol: number) {
  return e.moveSelectedTo(r, ccol);
}

export function at(e: GameEngine, r: number, ccol: number) {
  return e.getDieAt(r, ccol);
}

export function count(e: GameEngine, c: C) {
  return e.state.dice.filter(d => d.color === c).length;
}

export function dirs() {
  const tmp = new GameEngine();
  return tmp.getDirectionVectors();
}

/** Зручний пошук валідної цілі з getAvailableMoves() */
export function findMove(e: GameEngine, r: number, c: number) {
  return (e.getAvailableMoves() as any[]).find(m => m.row === r && m.col === c);
}
