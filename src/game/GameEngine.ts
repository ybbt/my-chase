// =============================
// src/game/GameEngine.ts
// =============================

export type Player = 'red' | 'blue';

export interface Die {
  row: number;   // 0..8
  col: number;   // 0..8 (горизонталь із wrap)
  value: number; // 1..6
  color: Player;
}

interface AbsorbState {
  defender: Player;
  remaining: number;                    // скільки ще треба роздати
  captured: number;                     // повне значення взятої кістки (для "Скинути")
  draft: { die: Die; added: number }[]; // проміжні нарахування
  tieLock: boolean;                     // true — кілька найслабших, чекаємо вибір
  userChoice: boolean;                  // true — був явний вибір (або "Авто" при tie)
}

export interface GameOverState {
  loser: Player;
  reason: 'INSUFFICIENT_DICE';
}

export interface GameState {
  dice: Die[];
  currentPlayer: Player;
  selected?: { row: number; col: number };
  absorb?: AbsorbState;
  gameOver?: GameOverState;             // Єдине джерело істини про кінець гри
}

// Повертаємо також індекс напряму і лічильник рикошетів (для tie-break).
type MoveOption = {
  row: number;
  col: number;
  bump?: boolean;
  bumpChain?: { row: number; col: number }[];
  dirIdx: number;
  bounces: number;
};

export class GameEngine {
  state: GameState;

  constructor() {
    // Стартова розстановка з буклету
    const pattern = [1, 2, 3, 4, 5, 4, 3, 2, 1];
    const dice: Die[] = [
      ...pattern.map((value, col) => ({ row: 0, col, value, color: 'blue' as Player })),
      ...pattern.map((value, col) => ({ row: 8, col, value, color: 'red' as Player })),
    ];
    this.state = { dice, currentPlayer: 'blue' };
  }

  // ---------- Базові утиліти ----------
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

  private countTeamDice(color: Player): number {
    return this.state.dice.filter(d => d.color === color).length;
  }

  public isGameOver(): boolean { return !!this.state.gameOver; }

  getDirectionVectors(): [number, number][] {
    // 0..5: NW, NE, W, E, SW, SE
    return [
      [-1, 0], // 0: NW
      [-1, 1], // 1: NE
      [0, -1], // 2: W
      [0, 1],  // 3: E
      [1, 0],  // 4: SW
      [1, 1],  // 5: SE
    ];
  }

  private getOffsetStep(dr: number, dc: number, isEven: boolean): [number, number] {
    // axial-like зсув для offset-сітки (чітні/непарні рядки)
    const key = `${dr},${dc}`;
    const evenMap: Record<string, [number, number]> = {
      '-1,0': [-1, 0],  '-1,1': [-1, 1],
      '0,-1': [0, -1],  '0,1': [0, 1],
      '1,0': [1, 0],    '1,1': [1, 1],
    };
    const oddMap: Record<string, [number, number]> = {
      '-1,0': [-1, -1], '-1,1': [-1, 0],
      '0,-1': [0, -1],  '0,1': [0, 1],
      '1,0': [1, -1],   '1,1': [1, 0],
    };
    return isEven ? (evenMap[key] ?? [dr, dc]) : (oddMap[key] ?? [dr, dc]);
  }

  // ---------- Валідні цілі (унікальні по клітинці; беремо варіант із мін. рикошетів) ----------
  getAvailableMoves(): MoveOption[] {
    if (this.state.absorb || this.state.gameOver) return [];
    const sel = this.state.selected; if (!sel) return [];
    const die = this.getDieAt(sel.row, sel.col); if (!die) return [];

    const deltas = this.getDirectionVectors();

    // key = "r,c" → найкращий MoveOption для цієї клітинки
    const best = new Map<string, MoveOption>();

    for (let dirIdx = 0; dirIdx < deltas.length; dirIdx++) {
      const [drInit, dcInit] = deltas[dirIdx];

      let r = sel.row, c = sel.col;
      let dr = drInit, dc = dcInit;
      let steps = die.value;
      let valid = true;
      let bounces = 0;

      while (steps > 0) {
        const isEven = r % 2 === 0;
        const [stepDr, stepDc] = this.getOffsetStep(dr, dc, isEven);
        let nextR = r + stepDr;
        let nextC = c + stepDc;

        // центр не можна ПРОХОДИТИ (але можна СТАТИ останнім кроком)
        if (nextR === 4 && nextC === 4 && steps !== 1) { valid = false; break; }

        // горизонтальний wrap
        if (nextC < 0) nextC = 8; else if (nextC > 8) nextC = 0;

        // вертикальний ricochet (після wrap)
        if (nextR < 0 || nextR > 8) {
          dr = -dr; // інверсія вертикальної складової
          bounces++;
          const [reflectDr, reflectDc] = this.getOffsetStep(dr, dc, isEven);
          nextR = r + reflectDr; nextC = c + reflectDc;
          if (nextC < 0) nextC = 8; else if (nextC > 8) nextC = 0;
          if (nextR < 0 || nextR > 8) { valid = false; break; }
        }

        const occupying = this.getDieAt(nextR, nextC);
        if (steps > 1 && occupying) { valid = false; break; } // не проходимо крізь
        r = nextR; c = nextC; steps--;
      }

      if (!valid) continue;

      const occupying = this.getDieAt(r, c);
      const bump = !!occupying && occupying.color === die.color;
      const bumpChain = bump ? this.getBumpChain(r, c, deltas[dirIdx]) : undefined;

      const key = `${r},${c}`;
      const candidate: MoveOption = { row: r, col: c, bump, bumpChain, dirIdx, bounces };

      const prev = best.get(key);
      // Тримай найменшу кількість рикошетів; якщо однаково — залиш перший (стабільно).
      if (!prev || candidate.bounces < prev.bounces) {
        best.set(key, candidate);
      }
    }

    return Array.from(best.values());
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

      if (nextR === 4 && nextC === 4 && steps !== 1) break; // центр — не проходимо

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

  // ---------- Рух (включно зі сплітом) ----------
  // у GameEngine.ts
moveSelectedTo(row: number, col: number): boolean {
  if (this.state.absorb || this.state.gameOver) return false;
  const sel = this.state.selected; if (!sel) return false;
  const die = this.getDieAt(sel.row, sel.col); if (!die) return false;

  // Ціль має бути серед валідних (беремо обраний із мін. рикошетів)
  const options = this.getAvailableMoves();
  const chosen = options.find(p => p.row === row && p.col === col);
  if (!chosen) return false;

  const dirs = this.getDirectionVectors();
  const dirUsed: [number, number] = dirs[chosen.dirIdx];

  const prevPlayer = this.state.currentPlayer;

  // === СПЛІТ у фіссійній камері ===
  if (row === 4 && col === 4) {
    const allDirs = this.getDirectionVectors();

    // 1) Знайти фактичний напрям останнього кроку в центр (entryIdx)
    let entryIdx = -1;
    let prevCell: { row: number; col: number } | undefined;
    for (let i = 0; i < allDirs.length; i++) {
      const p = this.getMovePath(die, allDirs[i]);
      if (p.length && p[p.length - 1].row === 4 && p[p.length - 1].col === 4) {
        prevCell = p.length >= 2 ? p[p.length - 2] : { row: die.row, col: die.col };
        break;
      }
    }
    if (!prevCell) return false;

    for (let i = 0; i < allDirs.length; i++) {
      const [dr, dc] = allDirs[i];
      const isEven = prevCell.row % 2 === 0;
      const [sr, sc] = this.getOffsetStep(dr, dc, isEven);
      let nr = prevCell.row + sr, nc = prevCell.col + sc;
      if (nc < 0) nc = 8; else if (nc > 8) nc = 0;
      if (nr === 4 && nc === 4) { entryIdx = i; break; }
    }
    if (entryIdx === -1) return false;

    // 2) Працюємо на кільці напрямів годинниково: [E, SE, SW, W, NW, NE]
    const ring: number[] = [3, 5, 4, 2, 0, 1];
    const entryPos = ring.indexOf(entryIdx);
    if (entryPos === -1) return false;

    // 3) Протилежний (outbound) і "ліворуч/праворуч" від нього
    const outPos = (entryPos + 3) % 6;
    const leftIdx  = ring[(outPos + 1) % 6]; // більша частина
    const rightIdx = ring[(outPos + 5) % 6];

    // 4) Один крок із центру в обраний напрям (з урахуванням wrap/парності)
    const stepFrom = (r: number, c: number, dirIdx: number) => {
      const [dr, dc] = allDirs[dirIdx];
      const isEven = r % 2 === 0;
      let [sr, sc] = this.getOffsetStep(dr, dc, isEven);
      let nr = r + sr, nc = c + sc;
      if (nc < 0) nc = 8; else if (nc > 8) nc = 0;
      if (nr < 0) nr = 0; else if (nr > 8) nr = 8;
      return { nr, nc };
    };

    const v = die.value;

    // --- Ліміт 10 фішок: якщо вже 10 або v===1 — вихід однією "назад-вліво" ---
    const teamCount = this.countTeamDice(die.color);
    if (v === 1 || teamCount >= 10) {
      const captured: Die[] = [];
      const accumulate = (d: Die) => { captured.push(d); };

      const { nr: Lr, nc: Lc } = stepFrom(4, 4, leftIdx);
      const occ = this.getDieAt(Lr, Lc);
      if (occ) {
        if (occ.color === die.color) {
          if (!this.performBump(Lr, Lc, allDirs[leftIdx], { accumulateCapture: accumulate })) return false;
        } else {
          captured.push(occ);
          this.state.dice = this.state.dice.filter(d => d !== occ);
        }
      }

      die.row = Lr; die.col = Lc; // value лишається v як був

      if (captured.length > 0) {
        const defender = captured[0].color;
        const total = captured.reduce((s, d) => s + d.value, 0);
        this.state.absorb = { defender, remaining: total, captured: total, draft: [], tieLock: false, userChoice: false };
        const a = this.state.absorb!;
        a.tieLock = (a.remaining > 0) && (this.getAbsorbWeakest().length > 1);
        if (!a.tieLock) this.autoAdvanceAbsorb();
      }

      this.state.selected = undefined;
      if (!this.state.absorb && this.state.currentPlayer === prevPlayer) this.togglePlayer();
      return true;
    }

    // --- Нормальний спліт на дві додатні частини ---
    const leftVal  = Math.ceil(v / 2);
    const rightVal = Math.floor(v / 2);
    const { nr: Lr, nc: Lc } = stepFrom(4, 4, leftIdx);
    const { nr: Rr, nc: Rc } = stepFrom(4, 4, rightIdx);

    const captured: Die[] = [];
    const accumulate = (d: Die) => { captured.push(d); };

    const leftOcc  = this.getDieAt(Lr, Lc);
    const rightOcc = this.getDieAt(Rr, Rc);
    if (leftOcc  && leftOcc.color  !== die.color) captured.push(leftOcc);
    if (rightOcc && rightOcc.color !== die.color) captured.push(rightOcc);
    if (captured.length) {
      this.state.dice = this.state.dice.filter(d => !captured.includes(d));
    }

    if (leftOcc && leftOcc.color === die.color) {
      if (!this.performBump(Lr, Lc, allDirs[leftIdx], { accumulateCapture: accumulate })) return false;
    }
    die.row = Lr; die.col = Lc; die.value = leftVal;

    if (rightVal > 0) {
      if (rightOcc && rightOcc.color === die.color) {
        if (!this.performBump(Rr, Rc, allDirs[rightIdx], { accumulateCapture: accumulate })) return false;
      }
      this.state.dice.push({ row: Rr, col: Rc, value: rightVal, color: die.color });
    }

    if (captured.length > 0) {
      const defender = captured[0].color;
      const total = captured.reduce((s, d) => s + d.value, 0);
      this.state.absorb = { defender, remaining: total, captured: total, draft: [], tieLock: false, userChoice: false };
      const a = this.state.absorb!;
      a.tieLock = (a.remaining > 0) && (this.getAbsorbWeakest().length > 1);
      if (!a.tieLock) this.autoAdvanceAbsorb();
    }

    this.state.selected = undefined;
    if (!this.state.absorb && this.state.currentPlayer === prevPlayer) this.togglePlayer();
    return true;
  }

  // --- НЕ центр: звичайний рух / бамп / захоплення ---
  const target = this.getDieAt(row, col); // <-- єдине оголошення

  if (target && target.color === die.color) {
    if (!this.performBump(row, col, dirUsed)) return false;
  } else if (target && target.color !== die.color) {
    this.captureDieAt(row, col);
  }

  die.row = row; die.col = col; this.state.selected = undefined;
  if (!this.state.absorb && this.state.currentPlayer === prevPlayer) this.togglePlayer();
  return true;
}


  // ---------- Бамп (wrap→ricochet, заборона в центр, обертання кільця) ----------
  private performBump(row: number, col: number, direction: [number, number], opts?: { accumulateCapture?: (die: Die) => void }): boolean {
    type Link = { die: Die; nextRow: number; nextCol: number };
    const chain: Link[] = [];
    const startRow = row, startCol = col;

    let curRow = row, curCol = col;
    let dx = direction[0], dy = direction[1]; // dx — вертикальна складова

    while (true) {
      const die = this.getDieAt(curRow, curCol); if (!die) break;

      const isEven = curRow % 2 === 0;
      let [stepDr, stepDc] = this.getOffsetStep(dx, dy, isEven);
      let nextRow = curRow + stepDr;
      let nextCol = curCol + stepDc;

      // wrap по колонках — СПОЧАТКУ (напрям НЕ міняємо)
      if (nextCol < 0) nextCol = 8; else if (nextCol > 8) nextCol = 0;

      // ricochet верх/низ — ПІСЛЯ wrap (міняємо лише вертикальну складову)
      if (nextRow < 0 || nextRow > 8) {
        dx = -dx;
        [stepDr, stepDc] = this.getOffsetStep(dx, dy, isEven);
        nextRow = curRow + stepDr; nextCol = curCol + stepDc;
        if (nextCol < 0) nextCol = 8; else if (nextCol > 8) nextCol = 0;
        if (nextRow < 0 || nextRow > 8) return false;
      }

      // не можна штовхати в центр
      if (nextRow === 4 && nextCol === 4) return false;

      const nextDie = this.getDieAt(nextRow, nextCol);
      chain.push({ die, nextRow, nextCol });

      if (!nextDie) break; // є куди висунути

      if (nextDie.color !== die.color) {
        if (opts?.accumulateCapture) {
          opts.accumulateCapture(nextDie);
          this.state.dice = this.state.dice.filter(d => d !== nextDie);
        } else {
          this.captureDieAt(nextRow, nextCol);
        }
        break;
      }

      // замкнене кільце
      if (nextRow === startRow && nextCol === startCol) break;

      curRow = nextRow; curCol = nextCol;
    }

    // параноя: якщо хтось зі ланцюжка у центрі — заборонити
    if (chain.some(l => l.die.row === 4 && l.die.col === 4)) return false;

    // зсув у ЗВОРОТНЬОМУ порядку (від хвоста до голови)
    for (let i = chain.length - 1; i >= 0; i--) {
      const link = chain[i];
      link.die.row = link.nextRow;
      link.die.col = link.nextCol;
    }
    return true;
  }

  private getBumpChain(row: number, col: number, direction: [number, number]): { row: number; col: number }[] {
    // лише підсвітка — не модифікує стан
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

      if (nextRow === 4 && nextCol === 4) break; // не ведемо ланцюг у центр
      const nextDie = this.getDieAt(nextRow, nextCol);
      if (!nextDie || nextDie.color !== die.color) break;
      curRow = nextRow; curCol = nextCol;
    }
    return chain;
  }

  // ---------- Захоплення та поглинання ----------
  private captureDieAt(row: number, col: number) {
    if (this.state.gameOver) return;
    const captured = this.getDieAt(row, col); if (!captured) return;
    const defender = captured.color; const value = captured.value;

    // прибрати ворожу кістку
    this.state.dice = this.state.dice.filter(d => d !== captured);

    // запуск режиму поглинання — кінець гри вирішується у finalizeAbsorb()
    this.state.absorb = { defender, remaining: value, captured: value, draft: [], tieLock: false, userChoice: false };
    const a = this.state.absorb!;
    a.tieLock = (a.remaining > 0) && (this.getAbsorbWeakest().length > 1);
    if (!a.tieLock) this.autoAdvanceAbsorb();
  }

  private getAbsorbAdded(die: Die): number {
    const a = this.state.absorb; if (!a) return 0;
    const entry = a.draft.find(e => e.die === die);
    return entry ? entry.added : 0;
  }
  public getAbsorbAddedFor(die: Die): number { return this.getAbsorbAdded(die); }

  private getCurrentValue(die: Die): number { return die.value + this.getAbsorbAdded(die); }
  private getDefenderDice(): Die[] { return this.state.absorb ? this.state.dice.filter(d => d.color === this.state.absorb!.defender) : []; }

  public getAbsorbWeakest(): Die[] {
    const a = this.state.absorb; if (!a) return [];
    const pool = this.getDefenderDice().filter(d => this.getCurrentValue(d) < 6);
    if (pool.length === 0) return [];
    const minVal = Math.min(...pool.map(d => this.getCurrentValue(d)));
    return pool.filter(d => this.getCurrentValue(d) === minVal);
  }

  public chooseAbsorbAt(row: number, col: number): boolean {
    const a = this.state.absorb; if (!a) return false;
    const die = this.getDieAt(row, col);
    if (!die || die.color !== a.defender) return false;
    const weakest = this.getAbsorbWeakest();
    if (!weakest.some(w => w === die)) return false;
    a.userChoice = true; // був явний вибір
    a.tieLock = false;
    this.bumpAbsorbDie(die);
    this.autoAdvanceAbsorb();
    return true;
  }

  public autoAdvanceAbsorb() {
    const a = this.state.absorb; if (!a) return;
    if (a.tieLock) return;
    while (a.remaining > 0) {
      const set = this.getAbsorbWeakest();
      if (set.length === 0) break;   // нікого підвищувати
      if (set.length !== 1) break;   // tie — чекаємо вибір
      this.bumpAbsorbDie(set[0]);
    }
    if (this.state.absorb) {
      const aa = this.state.absorb;
      const noCandidates = this.getAbsorbWeakest().length === 0;
      if ((aa.remaining === 0 || noCandidates) && !aa.userChoice) this.finalizeAbsorb();
    }
  }

  public forceAutoAbsorb() {
    const a = this.state.absorb; if (!a) return;
    if (this.getAbsorbWeakest().length > 1) a.userChoice = true; // усвідомлений авто-вибір
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

  /** Застосувати draft і завершити поглинання, потім (якщо не кінець гри) передати хід */
  public finalizeAbsorb() {
    const a = this.state.absorb; if (!a) return;
    const defender = a.defender;
    const leftover = a.remaining;

    for (const { die, added } of a.draft) {
      die.value = Math.min(6, die.value + added);
    }
    this.state.absorb = undefined;

    // ФІНІШ: якщо щось не роздали, або в захисника ≤4 фішок — програш
    if (leftover > 0 || this.countTeamDice(defender) <= 4) {
      this.state.gameOver = { loser: defender, reason: 'INSUFFICIENT_DICE' };
      return;
    }
    this.togglePlayer();
  }

  private bumpAbsorbDie(die: Die) {
    const a = this.state.absorb; if (!a) return;
    const cur = this.getCurrentValue(die);
    if (cur >= 6 || a.remaining <= 0) return;
    const give = Math.min(6 - cur, a.remaining);
    const entry = a.draft.find(e => e.die === die);
    if (entry) entry.added += give; else a.draft.push({ die, added: give });
    a.remaining -= give;
    if (a.remaining === 0) { a.tieLock = false; return; }
    a.tieLock = this.getAbsorbWeakest().length > 1;
  }

  // ---------- TRANSFER (винесено з UI у рушій) ----------
  private areAdjacent(a: {row:number;col:number}, b: {row:number;col:number}): boolean {
    const { row: r1, col: c1 } = a;
    const { row: r2, col: c2 } = b;
    // wrap по колонках
    const sameRow = r1 === r2;
    const dc = Math.abs(c1 - c2);
    const wrappedNeighbors = sameRow && ((dc === 1) || (dc === 8)); // 0↔8 — сусіди
    if (wrappedNeighbors) return true;

    // вертикальні сусіди з урахуванням парності та wrap по колонках
    const even = r1 % 2 === 0;
    const neighEven = [[-1,0],[-1,1],[1,0],[1,1]];
    const neighOdd  = [[-1,-1],[-1,0],[1,-1],[1,0]];
    const neigh = even ? neighEven : neighOdd;
    for (const [dr, dc2] of neigh) {
      let nr = r1 + dr, nc = c1 + dc2;
      if (nc < 0) nc = 8; else if (nc > 8) nc = 0;
      if (nr < 0 || nr > 8) continue;
      if (nr === r2 && nc === c2) return true;
    }
    return false;
  }

  /**
   * Перенесення швидкості між суміжними своїми кістками.
   * @param src джерело
   * @param dst приймач
   * @param direction 'out' — із src до dst; 'in' — навпаки
   * @param amount кількість піпсів
   */
  public transfer(src: {row:number;col:number}, dst: {row:number;col:number}, direction: 'out'|'in', amount: number): boolean {
    if (this.state.absorb || this.state.gameOver) return false;
    const A = this.getDieAt(src.row, src.col);
    const B = this.getDieAt(dst.row, dst.col);
    if (!A || !B) return false;
    if (A.color !== B.color || A.color !== this.state.currentPlayer) return false;
    if (!this.areAdjacent(src, dst)) return false;

    const from = (direction === 'out') ? A : B;
    const to   = (direction === 'out') ? B : A;
    const maxGive = Math.max(0, Math.min(from.value - 1, 6 - to.value));
    if (maxGive <= 0) return false;
    const amt = Math.max(1, Math.min(amount | 0, maxGive));
    from.value -= amt; to.value += amt;

    this.state.selected = undefined;
    this.togglePlayer();
    return true;
  }
}
