// =============================
// src/game/GameEngine.ts
// =============================
// Серце правил гри. Тут реалізовано:
// - Початкова розстановка 9×9 (згідно з буклетом)
// - Вибір кістки свого кольору
// - Генерація легальних кінцевих клітинок ходу (getAvailableMoves)
//   * RULE: рух рівно на значення кістки
//   * RULE: 6 «ортогональних» напрямів на гекс-сітці
//   * RULE: заборона проходу через інші кістки
//   * RULE: заборона проходу через фіссійну камеру (крім точної зупинки)
//   * RULE: wrap-around по стовпцях (циліндр)
//   * RULE: рикошет від верх/низ країв (кут падіння = кут відбиття в дискретній моделі)
//   * RULE: можливість закінчити хід на своїй (бамп) чи ворожій (захоплення) кістці
// - Розрахунок маршрутів для підсвічування (getMovePath)
// - Виконання руху з бампом/захопленням (moveSelectedTo + performBump)
// - Режим «поглинання» після захоплення з авто/ручним tie-break (absorb)
//
// TODO:
// - Окремий хід «передача швидкості» (transfer)
// - Спліт у фіссійній камері
// - Перевірка «гра закінчена при ≤4 кістках»

export type Player = 'red' | 'blue';

export interface Die {
  row: number; // 0..8
  col: number; // 0..8 (горизонталь з wrap)
  value: number; // 1..6
  color: Player;
}

interface AbsorbState {
  defender: Player;                     // чия команда розподіляє піпси
  remaining: number;                    // скільки ще треба додати
  captured: number;                     // повне значення поглинутої кістки (для скидання)
  draft: { die: Die; added: number }[]; // тимчасові + до конкретних кісток
  tieLock: boolean;                     // TRUE — є кілька найслабших і чекаємо вибір
  userChoice: boolean;                  // TRUE — гравець робив вибір (або натискав «Авто» при tie)
}

export interface GameState {
  dice: Die[];
  currentPlayer: Player;
  selected?: { row: number; col: number };
  absorb?: AbsorbState;
}

export class GameEngine {
  state: GameState;

  constructor() {
    const pattern = [1, 2, 3, 4, 5, 4, 3, 2, 1];
    const dice: Die[] = [
      ...pattern.map((value, col) => ({ row: 8, col, value, color: 'red' as Player })),
      ...pattern.map((value, col) => ({ row: 0, col, value, color: 'blue' as Player })),
    ];
    this.state = { dice, currentPlayer: 'blue', absorb: undefined };
  }

  // ---------- База ----------
  getDieAt(row: number, col: number): Die | undefined {
    return this.state.dice.find(d => d.row === row && d.col === col);
  }

  selectDie(row: number, col: number) {
    const die = this.getDieAt(row, col);
    if (die && die.color === this.state.currentPlayer) this.state.selected = { row, col };
    else this.state.selected = undefined;
  }

  togglePlayer() {
    this.state.currentPlayer = this.state.currentPlayer === 'red' ? 'blue' : 'red';
  }

  // ---------- Рухи ----------
  getDirectionVectors(): [number, number][] {
    return [
      [-1, 0], [-1, 1],
      [0, -1], [0, 1],
      [1, 0], [1, 1],
    ];
  }

  private getOffsetStep(dr: number, dc: number, isEven: boolean): [number, number] {
    const key = `${dr},${dc}`;
    const evenMap: Record<string, [number, number]> = {
      '-1,0': [-1, 0], '-1,1': [-1, 1],
      '0,-1': [0, -1],  '0,1': [0, 1],
      '1,0': [1, 0],   '1,1': [1, 1],
    };
    const oddMap: Record<string, [number, number]> = {
      '-1,0': [-1, -1], '-1,1': [-1, 0],
      '0,-1': [0, -1],  '0,1': [0, 1],
      '1,0': [1, -1],   '1,1': [1, 0],
    };
    return isEven ? (evenMap[key] ?? [dr, dc]) : (oddMap[key] ?? [dr, dc]);
  }

  getAvailableMoves(): { row: number; col: number; bump?: boolean; bumpChain?: {row:number;col:number}[] }[] {
    if (this.state.absorb) return [];
    const sel = this.state.selected; if (!sel) return [];
    const die = this.getDieAt(sel.row, sel.col); if (!die) return [];

    const deltas = this.getDirectionVectors();
    const moves: { row: number; col: number; bump?: boolean; bumpChain?: {row:number;col:number}[] }[] = [];

    for (const [drInit, dcInit] of deltas) {
      let r = sel.row, c = sel.col;
      let dr = drInit, dc = dcInit;
      let steps = die.value;
      let valid = true;

      while (steps > 0) {
        const isEven = r % 2 === 0;
        const [stepDr, stepDc] = this.getOffsetStep(dr, dc, isEven);
        let nextR = r + stepDr;
        let nextC = c + stepDc;

        // центр (4,4): не можна проходити, лише точно зупинитись
        if ((r === 4 && c === 4) || (nextR === 4 && nextC === 4)) {
          if (!(steps === 1 && nextR === 4 && nextC === 4)) { valid = false; break; }
        }

        // wrap по колонках
        if (nextC < 0) nextC = 8; else if (nextC > 8) nextC = 0;

        // рикошет по вертикалі
        if (nextR < 0 || nextR > 8) {
          dr = -dr;
          const [reflectDr, reflectDc] = this.getOffsetStep(dr, dc, isEven);
          nextR = r + reflectDr; nextC = c + reflectDc;
          if (nextC < 0) nextC = 8; else if (nextC > 8) nextC = 0;
          if (nextR < 0 || nextR > 8) { valid = false; break; }
        }

        const occupying = this.getDieAt(nextR, nextC);
        if (steps > 1 && occupying) { valid = false; break; }

        r = nextR; c = nextC; steps--;
      }

      if (!valid) continue;

      const occupying = this.getDieAt(r, c);
      const bump = !!occupying && occupying.color === die.color;
      const bumpChain = bump ? this.getBumpChain(r, c, [drInit, dcInit]) : undefined;
      moves.push({ row: r, col: c, bump, bumpChain });
    }
    return moves;
  }

  getMovePath(die: Die, dir: [number, number]): { row: number; col: number }[] {
    const path: { row: number; col: number }[] = [];
    let { row, col } = die;
    let dr = dir[0], dc = dir[1];
    let steps = die.value;

    while (steps > 0) {
      const isEven = row % 2 === 0;
      const [stepDr, stepDc] = this.getOffsetStep(dr, dc, isEven);
      let nextR = row + stepDr;
      let nextC = col + stepDc;

      if ((row === 4 && col === 4) || (nextR === 4 && nextC === 4)) {
        if (!(steps === 1 && nextR === 4 && nextC === 4)) break;
      }

      if (nextC < 0) nextC = 8; else if (nextC > 8) nextC = 0;

      if (nextR < 0 || nextR > 8) {
        dr = -dr;
        const [reflectDr, reflectDc] = this.getOffsetStep(dr, dc, isEven);
        nextR = row + reflectDr; nextC = col + reflectDc;
        if (nextC < 0) nextC = 8; else if (nextC > 8) nextC = 0;
        if (nextR < 0 || nextR > 8) break;
      }

      const occupying = this.getDieAt(nextR, nextC);
      if (steps > 1 && occupying) break;

      path.push({ row: nextR, col: nextC });
      row = nextR; col = nextC; steps--;
    }
    return path;
  }

  moveSelectedTo(row: number, col: number): boolean {
    if (this.state.absorb) return false; // під час поглинання ходи не робимо
    const sel = this.state.selected; if (!sel) return false;
    const die = this.getDieAt(sel.row, sel.col); if (!die) return false;

    const possible = this.getAvailableMoves();
    const legal = possible.some(p => p.row === row && p.col === col);
    if (!legal) return false;

    const prevPlayer = this.state.currentPlayer;
    const target = this.getDieAt(row, col);

    if (target && target.color === die.color) {
      // бамп по своїх
      const directions = this.getDirectionVectors();
      const direction = directions.find(dir => {
        const path = this.getMovePath(die, dir);
        const last = path[path.length - 1];
        return last?.row === row && last?.col === col;
      });
      if (!direction) return false;
      const bumped = this.performBump(row, col, direction);
      if (!bumped) return false;
      die.row = row; die.col = col; this.state.selected = undefined;
      if (!this.state.absorb && this.state.currentPlayer === prevPlayer) this.togglePlayer();
      return true;
    }

    if (target && target.color !== die.color) {
      // захоплення → старт поглинання
      this.captureDieAt(row, col);
    }

    // звичайне переміщення
    die.row = row; die.col = col; this.state.selected = undefined;
    if (!this.state.absorb && this.state.currentPlayer === prevPlayer) this.togglePlayer();
    return true;
  }

  private performBump(row: number, col: number, direction: [number, number]): boolean {
    const bumpChain: { die: Die; direction: [number, number] }[] = [];
    let curRow = row, curCol = col; let dx = direction[0], dy = direction[1];
    const seen = new Set<string>();

    while (true) {
      const key = `${curRow},${curCol}`;
      if (seen.has(key)) return false; // захист від циклів
      seen.add(key);

      const die = this.getDieAt(curRow, curCol);
      if (!die) break;
      bumpChain.push({ die, direction: [dx, dy] });

      const isEven = curRow % 2 === 0;
      const [stepDr, stepDc] = this.getOffsetStep(dx, dy, isEven);
      let nextRow = curRow + stepDr; let nextCol = curCol + stepDc;

      if (nextCol < 0) nextCol = 8; else if (nextCol > 8) nextCol = 0;

      if (nextRow < 0 || nextRow > 8) {
        dx = -dx;
        const [reflectDr, reflectDc] = this.getOffsetStep(dx, dy, isEven);
        nextRow = curRow + reflectDr; nextCol = curCol + reflectDc;
        if (nextRow < 0 || nextRow > 8) return false;
      }

      if (nextRow === 4 && nextCol === 4) return false; // не можна бампнути в центр

      const nextDie = this.getDieAt(nextRow, nextCol);
      if (!nextDie) break; // далі пусто — закінчимо
      if (nextDie.color !== die.color) { this.captureDieAt(nextRow, nextCol); break; }

      curRow = nextRow; curCol = nextCol;
    }

    // заборонити, якщо хтось з ланцюжка у центрі
    if (bumpChain.some(({ die }) => die.row === 4 && die.col === 4)) return false;

    // зрушуємо у зворотному порядку
    for (let i = bumpChain.length - 1; i >= 0; i--) {
      const { die } = bumpChain[i];
      const isEven = die.row % 2 === 0;
      const [stepDr, stepDc] = this.getOffsetStep(direction[0], direction[1], isEven);
      const newRow = die.row + stepDr; const newCol = (die.col + stepDc + 9) % 9;
      if (newRow === 4 && newCol === 4) return false;
      die.row = newRow; die.col = newCol;
    }
    return true;
  }

  private getBumpChain(row: number, col: number, direction: [number, number]): { row: number; col: number }[] {
    const chain: { row: number; col: number }[] = [];
    let curRow = row, curCol = col; let [dr, dc] = direction;
    const seen = new Set<string>();

    while (true) {
      const key = `${curRow},${curCol}`; if (seen.has(key)) break; seen.add(key);
      const die = this.getDieAt(curRow, curCol); if (!die) break;
      chain.push({ row: curRow, col: curCol });

      const isEven = curRow % 2 === 0;
      const [stepDr, stepDc] = this.getOffsetStep(dr, dc, isEven);
      let nextRow = curRow + stepDr; let nextCol = curCol + stepDc;

      if (nextCol < 0) nextCol = 8; else if (nextCol > 8) nextCol = 0;

      if (nextRow < 0 || nextRow > 8) {
        dr = -dr;
        const [reflectDr, reflectDc] = this.getOffsetStep(dr, dc, isEven);
        nextRow = curRow + reflectDr; nextCol = curCol + reflectDc;
        if (nextRow < 0 || nextRow > 8) break;
      }

      if (nextRow === 4 && nextCol === 4) break;
      const nextDie = this.getDieAt(nextRow, nextCol);
      if (!nextDie || nextDie.color !== die.color) break;
      curRow = nextRow; curCol = nextCol;
    }
    return chain;
  }

  // ---------- Захоплення й поглинання ----------
  private captureDieAt(row: number, col: number) {
    const captured = this.getDieAt(row, col); if (!captured) return;
    const defender = captured.color; const value = captured.value;

    // прибрати ворожу кістку
    this.state.dice = this.state.dice.filter(d => d !== captured);

    // старт поглинання
    this.state.absorb = { defender, remaining: value, captured: value, draft: [], tieLock: false, userChoice: false };
    const a = this.state.absorb;
    a.tieLock = (a.remaining > 0) && (this.getAbsorbWeakest().length > 1);
    if (!a.tieLock) this.autoAdvanceAbsorb();
  }

  private getAbsorbAdded(die: Die): number {
    const a = this.state.absorb; if (!a) return 0;
    const entry = a.draft.find(e => e.die === die);
    return entry ? entry.added : 0;
  }

  private getCurrentValue(die: Die): number { return die.value + this.getAbsorbAdded(die); }
  private getDefenderDice(): Die[] { return this.state.absorb ? this.state.dice.filter(d => d.color === this.state.absorb!.defender) : []; }

  public getAbsorbWeakest(): Die[] {
    const a = this.state.absorb; if (!a) return [];
    const pool = this.getDefenderDice().filter(d => this.getCurrentValue(d) < 6);
    if (pool.length === 0) return [];
    const minVal = Math.min(...pool.map(d => this.getCurrentValue(d)));
    return pool.filter(d => this.getCurrentValue(d) === minVal);
  }

  public getAbsorbAddedFor(die: Die): number { return this.getAbsorbAdded(die); }

  public chooseAbsorbAt(row: number, col: number): boolean {
    const a = this.state.absorb; if (!a) return false;
    const die = this.getDieAt(row, col);
    if (!die || die.color !== a.defender) return false;
    const weakest = this.getAbsorbWeakest();
    if (!weakest.some(w => w === die)) return false;
    a.userChoice = true; // був явний вибір гравця — не автозавершуємо наприкінці
    a.tieLock = false;   // зняти блок і виконати крок
    this.bumpAbsorbDie(die);
    this.autoAdvanceAbsorb();
    return true;
  }

  public autoAdvanceAbsorb() {
    const a = this.state.absorb; if (!a) return;
    if (a.tieLock) return;
    while (a.remaining > 0) {
      const set = this.getAbsorbWeakest();
      if (set.length === 0) break;      // немає кого підвищувати
      if (set.length !== 1) break;      // кілька — чекаємо вибір
      this.bumpAbsorbDie(set[0]);
    }
    if (this.state.absorb) {
      const aa = this.state.absorb;
      const noCandidates = this.getAbsorbWeakest().length === 0;
      // Авто-фініш тільки якщо гравець НЕ робив вибір
      if ((aa.remaining === 0 || noCandidates) && !aa.userChoice) this.finalizeAbsorb();
    }
  }

  public forceAutoAbsorb() {
    const a = this.state.absorb; if (!a) return;
    // Якщо зараз tie — вважаємо, що гравець зробив усвідомлений авто-вибір
    if (this.getAbsorbWeakest().length > 1) a.userChoice = true;
    while (a.remaining > 0) {
      const set = this.getAbsorbWeakest();
      if (set.length === 0) break;
      const die = set.slice().sort((d1, d2) => (d1.row - d2.row) || (d1.col - d2.col))[0];
      this.bumpAbsorbDie(die);
    }
    if (this.state.absorb && !this.state.absorb.userChoice) this.finalizeAbsorb();
  }

  public resetAbsorb() {
    const a = this.state.absorb; if (!a) return;
    a.remaining = a.captured; a.draft = [];
    a.tieLock = (a.remaining > 0) && (this.getAbsorbWeakest().length > 1);
    a.userChoice = false;
    this.autoAdvanceAbsorb();
  }

  /** Застосувати draft і завершити поглинання, потім передати хід */
  public finalizeAbsorb() {
    const a = this.state.absorb; if (!a) return;
    for (const { die, added } of a.draft) {
      die.value = Math.min(6, die.value + added);
    }
    this.state.absorb = undefined;
    this.togglePlayer();
  }

  private bumpAbsorbDie(die: Die) {
    const a = this.state.absorb!; if (!a) return;
    const cur = this.getCurrentValue(die);
    if (cur >= 6 || a.remaining <= 0) return;
    const give = Math.min(6 - cur, a.remaining);
    const entry = a.draft.find(e => e.die === die);
    if (entry) entry.added += give; else a.draft.push({ die, added: give });
    a.remaining -= give;
    if (a.remaining === 0) { a.tieLock = false; return; }
    a.tieLock = this.getAbsorbWeakest().length > 1;
  }
}