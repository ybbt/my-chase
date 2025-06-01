// ---------- src/game/GameEngine.ts ----з-------
export type Player = 'red' | 'blue';

export interface Die {
  row: number;
  col: number;
  value: number;
  color: Player;
}

export interface MoveOption {
  row: number;
  col: number;
  bump?: boolean;
  bumpChain?: { row: number; col: number }[];
}

export interface GameState {
  dice: Die[];
  currentPlayer: Player;
  selected?: { row: number; col: number };
}

export class GameEngine {
  state: GameState;

  constructor() {
    const pattern = [1, 2, 3, 4, 5, 4, 3, 2, 1];
    const dice = [
    ...pattern.map((value, col) => ({ row: 8, col, value, color: 'red' })),
    ...pattern.map((value, col) => ({ row: 0, col, value, color: 'blue' })),
    ] as Die[];


    this.state = {
      dice,
      currentPlayer: 'red',
    };
  }

  getDieAt(row: number, col: number): Die | undefined {
    return this.state.dice.find(d => d.row === row && d.col === col);
  }

  selectDie(row: number, col: number) {
    const die = this.getDieAt(row, col);
    if (die && die.color === this.state.currentPlayer) {
      this.state.selected = { row, col };
    } else {
      this.state.selected = undefined;
    }
  }

  getAvailableMoves(): MoveOption[] {
    const sel = this.state.selected;
    if (!sel) return [];

    const die = this.getDieAt(sel.row, sel.col);
    if (!die) return [];

    const deltas = this.getDirectionVectors();
    const moves: MoveOption[] = [];

    for (const [drInit, dcInit] of deltas) {
      let r = sel.row;
      let c = sel.col;
      let dr = drInit;
      let dc = dcInit;
      let steps = die.value;
      let valid = true;

      while (steps > 0) {
        const isEven = r % 2 === 0;
        const [stepDr, stepDc] = this.getOffsetStep(dr, dc, isEven);
        let nextC = c + stepDc;
        let nextR = r + stepDr;

        if ((r === 4 && c === 4) || (nextR === 4 && nextC === 4)) {
          if (!(steps === 1 && nextR === 4 && nextC === 4)) {
            valid = false;
            break;
          }
        }

        if (nextC < 0) nextC = 8;
        else if (nextC > 8) nextC = 0;

        if (nextR < 0 || nextR > 8) {
          dr = -dr;
          const [reflectDr, _] = this.getOffsetStep(dr, dc, isEven);
          nextR = r + reflectDr;
          if (nextR < 0 || nextR > 8) {
            valid = false;
            break;
          }
        }

        const occupying = this.getDieAt(nextR, nextC);

        if (steps > 1 && occupying) {
          valid = false;
          break;
        }

        r = nextR;
        c = nextC;
        steps--;
      }

      if (!valid) continue;

      const occupying = this.getDieAt(r, c);
      if (!occupying || occupying.color !== die.color || (occupying && occupying.color === die.color)) {
        const bump = occupying?.color === die.color;
const bumpChain = bump ? this.getBumpChain(r, c, [drInit, dcInit]) : undefined;
moves.push({ row: r, col: c, bump, bumpChain });
      }
    }

    return moves;
  }
  getMovePath(die: Die, dir: [number, number]): { row: number, col: number }[] {
  const path: { row: number, col: number }[] = [];
  let { row, col } = die;
  let dr = dir[0];
  let dc = dir[1];
  let steps = die.value;

  while (steps > 0) {
    const isEven = row % 2 === 0;
    const [stepDr, stepDc] = this.getOffsetStep(dr, dc, isEven);
    let nextR = row + stepDr;
    let nextC = col + stepDc;

    if ((row === 4 && col === 4) || (nextR === 4 && nextC === 4)) {
      if (!(steps === 1 && nextR === 4 && nextC === 4)) break;
    }

    if (nextC < 0) nextC = 8;
    else if (nextC > 8) nextC = 0;

    if (nextR < 0 || nextR > 8) {
      dr = -dr;
      const [reflectDr, _] = this.getOffsetStep(dr, dc, isEven);
      nextR = row + reflectDr;
      if (nextR < 0 || nextR > 8) break;
    }

    const occupying = this.getDieAt(nextR, nextC);
    if (steps > 1 && occupying) break;

    path.push({ row: nextR, col: nextC });
    row = nextR;
    col = nextC;
    steps--;
  }

  return path;
}

  moveSelectedTo(row: number, col: number): boolean {
    const sel = this.state.selected;
    if (!sel) return false;

    const die = this.getDieAt(sel.row, sel.col);
    if (!die) return false;

    const possible = this.getAvailableMoves();
    const legal = possible.some(p => p.row === row && p.col === col);
    if (!legal) return false;

    const target = this.getDieAt(row, col);

    // --- Handle BUMP ---
    if (target && target.color === die.color) {
      const directions = this.getDirectionVectors();
      const direction = directions.find(dir => {
        const path = this.getMovePath(die, dir);
        const last = path[path.length - 1];
        return last?.row === row && last?.col === col;
      });
      if (!direction) return false;

      const bumped = this.performBump(row, col, direction);
      if (!bumped) return false;

      die.row = row;
      die.col = col;
      this.state.selected = undefined;
      this.state.currentPlayer = this.state.currentPlayer === 'red' ? 'blue' : 'red';
      return true;
    }

    // --- Handle CAPTURE ---
    if (target && target.color !== die.color) {
      const sameColorDice = this.state.dice.filter(d => d.color === target.color && d !== target);
      const sortedDice = sameColorDice.sort((a, b) => a.value - b.value);
      let remaining = target.value;

      for (const d of sortedDice) {
        const space = 6 - d.value;
        const gain = Math.min(space, remaining);
        d.value += gain;
        remaining -= gain;
        if (remaining <= 0) break;
      }

      this.state.dice = this.state.dice.filter(d => d !== target);
    }

    die.row = row;
    die.col = col;
    this.state.selected = undefined;
    this.state.currentPlayer = this.state.currentPlayer === 'red' ? 'blue' : 'red';
    return true;
  }

  private performBump(row: number, col: number, direction: [number, number]): boolean {
    const bumpChain: Die[] = [];
    let curRow = row;
    let curCol = col;
    let dx = direction[0];
    let dy = direction[1];

    while (true) {
      const die = this.getDieAt(curRow, curCol);
      if (!die) break;
      bumpChain.push(die);

      const isEven = curRow % 2 === 0;
      const [stepDr, stepDc] = this.getOffsetStep(dx, dy, isEven);
      let nextRow = curRow + stepDr;
      let nextCol = curCol + stepDc;

      if (nextCol < 0) nextCol = 8;
      else if (nextCol > 8) nextCol = 0;

      if (nextRow < 0 || nextRow > 8) {
        dx = -dx;
        const [reflectDr, _] = this.getOffsetStep(dx, dy, isEven);
        nextRow = curRow + reflectDr;
        if (nextRow < 0 || nextRow > 8) return false;
      }

      if (nextRow === 4 && nextCol === 4) return false;

      if (nextRow === curRow && nextCol === curCol) break;

    const nextDie = this.getDieAt(nextRow, nextCol);

      if (!nextDie) break;
      if (nextDie.color !== die.color) {
        this.captureDieAt(nextRow, nextCol);
        break;
      }

      curRow = nextRow;
      curCol = nextCol;
    }

    for (let i = bumpChain.length - 1; i >= 0; i--) {
      const die = bumpChain[i];
      const isEven = row % 2 === 0;
      const [stepDr, stepDc] = this.getOffsetStep(dx, dy, isEven);
      die.row += stepDr;
      die.col += stepDc;

      if (die.col < 0) die.col = 8;
      else if (die.col > 8) die.col = 0;
    }

    return true;
  }

  private getBumpChain(row: number, col: number, direction: [number, number]): { row: number, col: number }[] {
  const chain: { row: number, col: number }[] = [];
  let curRow = row;
  let curCol = col;
  let [dr, dc] = direction;

  while (true) {
    const die = this.getDieAt(curRow, curCol);
    if (!die) break;
    chain.push({ row: curRow, col: curCol });

    const isEven = curRow % 2 === 0;
    const [stepDr, stepDc] = this.getOffsetStep(dr, dc, isEven);
    let nextRow = curRow + stepDr;
    let nextCol = curCol + stepDc;

    if (nextCol < 0) nextCol = 8;
    else if (nextCol > 8) nextCol = 0;

    if (nextRow < 0 || nextRow > 8) break;
    if (nextRow === 4 && nextCol === 4) break;

    const nextDie = this.getDieAt(nextRow, nextCol);
    if (!nextDie || nextDie.color !== die.color) break;

    curRow = nextRow;
    curCol = nextCol;
  }
  return chain;
}

private captureDieAt(row: number, col: number) {
  const die = this.getDieAt(row, col);
  if (!die) return;

  const others = this.state.dice.filter(d => d.color === die.color && d !== die);
  const sorted = others.sort((a, b) => a.value - b.value);
  let remaining = die.value;

  for (const d of sorted) {
    const space = 6 - d.value;
    const gain = Math.min(space, remaining);
    d.value += gain;
    remaining -= gain;
    if (remaining <= 0) break;
  }

  this.state.dice = this.state.dice.filter(d => d !== die);
  }
  public getDirectionVectors(): [number, number][] {
    return [
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
  }

  private getOffsetStep(dr: number, dc: number, isEven: boolean): [number, number] {
    const key = `${dr},${dc}`;

    const evenMap: Record<string, [number, number]> = {
      '-1,0': [-1, 0],
      '-1,1': [-1, 1],
      '0,-1': [0, -1],
      '0,1': [0, 1],
      '1,0': [1, 0],
      '1,1': [1, 1],
    };

    const oddMap: Record<string, [number, number]> = {
      '-1,0': [-1, -1],
      '-1,1': [-1, 0],
      '0,-1': [0, -1],
      '0,1': [0, 1],
      '1,0': [1, -1],
      '1,1': [1, 0],
    };

    return isEven ? evenMap[key] ?? [dr, dc] : oddMap[key] ?? [dr, dc];
  }
}
