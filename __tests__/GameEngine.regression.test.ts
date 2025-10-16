import { GameEngine } from '../shared/engine/GameEngine';
// import { GameEngine } from '@engine/GameEngine';
import { newEngine, add, sel, mv, at, count, dirs, findMove } from './testUtils';

/**
 * 1) БАМП через правий край має зберігати "вниз" для SE.
 */
test('bump через правий край (SE) штовхає вниз, а не вгору', () => {
  const e = newEngine([], 'blue');
  add(e, 'blue', 4, 7, 2);  // штовхає
  add(e, 'blue', 6, 8, 1);  // буде бампнута
  sel(e, 4, 7);

  const m = findMove(e, 6, 8);
  expect(m).toBeTruthy();
  expect(m!.dirIdx).toBe(5); // SE

  const bumpedBefore = at(e, 6, 8)!;
  const ok = mv(e, 6, 8);
  expect(ok).toBe(true);

  // одиниця має піти ВНИЗ і через wrap: (7,0)
  expect(bumpedBefore.row).toBe(7);
  expect(bumpedBefore.col).toBe(0);
});

/**
 * 2) Ricochet інвертує лише вертикаль.
 */
test('ricochet зверху інвертує лише вертикальну складову', () => {
  const e = newEngine([], 'blue');
  add(e, 'blue', 0, 4, 2);
  const die = at(e, 0, 4)!;
  const NE = dirs()[1]; // [-1,1]
  const path = e.getMovePath(die, NE);
  expect(path.map(p => `${p.row},${p.col}`)).toEqual(['1,5', '2,5']);
});

/**
 * 3) Спліт БЕЗ spare (вже 10 фішок або v===1).
 */
test('split без spare: вихід однією на "назад-ліворуч" (NW), значення збережене', () => {
  const blues = [
    { c: 'blue', r: 4, ccol: 2, v: 2 }, // зайде в центр E-E
    // 9 "філерів"
    { c: 'blue', r: 0, ccol: 0, v: 1 },
    { c: 'blue', r: 0, ccol: 2, v: 1 },
    { c: 'blue', r: 0, ccol: 4, v: 1 },
    { c: 'blue', r: 0, ccol: 6, v: 1 },
    { c: 'blue', r: 0, ccol: 8, v: 1 },
    { c: 'blue', r: 8, ccol: 0, v: 1 },
    { c: 'blue', r: 8, ccol: 2, v: 1 },
    { c: 'blue', r: 8, ccol: 4, v: 1 },
    { c: 'blue', r: 8, ccol: 6, v: 1 },
  ] as any;
  const e = newEngine(blues, 'blue');

  sel(e, 4, 2);
  const ok = mv(e, 4, 4);
  expect(ok).toBe(true);

  expect(count(e, 'blue')).toBe(10);
  const lone = at(e, 3, 4);
  expect(lone).toBeTruthy();
  expect(lone!.value).toBe(2);
});

/**
 * 4) Спліт ЗІ spare (менше 10): забезпечуємо вхід у центр саме зі СХОДУ за 5 кроків.
 * Стартуємо з (4,8) та йдемо E×5: 0,1,2,3,4(центр). Очікування: NW (3) і SW (2).
 */
test('split зі spare: дві половинки (ceil/floor), NW більша, SW менша', () => {
  // 9 синіх загалом перед ходом (ця + ще 8)
  const blues = [
    { c: 'blue', r: 4, ccol: 8, v: 5 }, // увійде в центр зі сходу за 5 кроків
    { c: 'blue', r: 0, ccol: 0, v: 1 },
    { c: 'blue', r: 0, ccol: 2, v: 1 },
    { c: 'blue', r: 0, ccol: 4, v: 1 },
    { c: 'blue', r: 0, ccol: 6, v: 1 },
    { c: 'blue', r: 8, ccol: 0, v: 1 },
    { c: 'blue', r: 8, ccol: 2, v: 1 },
    { c: 'blue', r: 8, ccol: 4, v: 1 },
    { c: 'blue', r: 8, ccol: 6, v: 1 },
  ] as any;
  const e = newEngine(blues, 'blue');

  sel(e, 4, 8);
  const ok = mv(e, 4, 4);
  expect(ok).toBe(true);

  expect(count(e, 'blue')).toBe(10);

  // ліворуч від outbound (NW) — 3 -> (3,4)
  const left = at(e, 3, 4);
  expect(left).toBeTruthy();
  expect(left!.value).toBe(3);

  // праворуч від outbound (SW) — 2 -> (5,4)
  const right = at(e, 5, 4);
  expect(right).toBeTruthy();
  expect(right!.value).toBe(2);
});

/**
 * 5) Absorb "до найслабших": якщо всі =6, лишок не роздати → програш захисника.
 * Стабілізуємо сценарій захоплення на 1 крок (v=1).
 */
test('absorb: якщо немає кандидатів <6, лишок → програш захисника', () => {
  const e = newEngine([], 'blue');

  // захисник — червоні: три "максимальні" 6
  add(e, 'red', 7, 3, 6);
  add(e, 'red', 7, 5, 6);
  add(e, 'red', 6, 4, 6);

  // атакер — синя 1, яка захопить червону 1 за 1 крок
  add(e, 'blue', 5, 4, 1);
  add(e, 'red',  5, 5, 1); // ціль

  sel(e, 5, 4);
  const ok = mv(e, 5, 5);
  expect(ok).toBe(true);

  // авто-абсорб не має куди роздавати → finalizeAbsorb() → gameOver
  expect(e.state.gameOver).toBeTruthy();
  expect(e.state.gameOver!.loser).toBe('red');
});

test('absorb tie-lock: поки є вибір між найслабшими, кінець гри не настає', () => {
  const e = newEngine([], 'blue');

  // захисник — червоні: дві п'ятірки (tie) + 3 "філери", щоб після захоплення було >4
  add(e, 'red', 6, 4, 5);
  add(e, 'red', 6, 5, 5);
  add(e, 'red', 0, 0, 6);
  add(e, 'red', 0, 2, 6);
  add(e, 'red', 8, 0, 6);

  // атакер синій 1 захоплює червону 1 за 1 крок
  add(e, 'blue', 5, 4, 1);
  add(e, 'red',  5, 5, 1);

  sel(e, 5, 4);
  const ok = mv(e, 5, 5);
  expect(ok).toBe(true);

  // 1) tie-lock активний, гри ще немає
  expect(e.state.absorb).toBeTruthy();
  expect(e.state.gameOver).toBeFalsy();

  // 2) робимо вибір і завершуємо — у захисника >4 фішок, гри теж немає
  const picked = at(e, 6, 4) ?? at(e, 6, 5);
  expect(picked).toBeTruthy();
  e.chooseAbsorbAt(picked!.row, picked!.col);
  e.finalizeAbsorb();

  expect(e.state.gameOver).toBeFalsy();
});

/**
 * 7) Бамп у центр заборонений.
 * Робимо так, щоб цільова своя клітинка реально досягалася рівно за 2 кроки: (4,1) ->E-> (4,2) ->E-> (4,3),
 * а бамп штовхнув би у (4,4) — має відхилити.
 */
test('бамп у центр — нелегальний (хід відхиляється)', () => {
  const e = newEngine([], 'blue');
  add(e, 'blue', 4, 1, 2); // рухається E×2
  add(e, 'blue', 4, 3, 1); // ціль для бампа (далі центр) — заборонено
  sel(e, 4, 1);

  // ціль (4,3) має бути валідною
  const attempt = findMove(e, 4, 3);
  expect(attempt).toBeTruthy();

  // але сам бамп у центр — заборонений, тож виконання руху = false
  const ok = mv(e, 4, 3);
  expect(ok).toBe(false);
});

/**
 * 8) TRANSFER через wrap (0↔8) працює, обмеження 1..6 дотримується і хід переходить супернику.
 */
test('transfer через край: сусідство 0↔8, обмеження 1..6, перемикання ходу', () => {
  const e = newEngine([], 'blue');
  add(e, 'blue', 4, 8, 3);
  add(e, 'blue', 4, 0, 4);

  const ok = e.transfer({ row: 4, col: 8 }, { row: 4, col: 0 }, 'out', 2);
  expect(ok).toBe(true);

  const A = at(e, 4, 8)!; // донор
  const B = at(e, 4, 0)!; // отримувач
  expect(A.value).toBe(1);
  expect(B.value).toBe(6);
  expect(e.state.currentPlayer).toBe('red');
});

/**
 * 9) Заборонено ПРОХОДИТИ крізь центр: ціль, що вимагає пройти (а не фінішувати) через (4,4), не має бути доступною.
 */
test('не можна проходити крізь центр', () => {
  const e = newEngine([], 'blue');
  add(e, 'blue', 4, 3, 2);   // E×2: перший крок у центр → має бути заблоковано
  sel(e, 4, 3);
  expect(findMove(e, 4, 5)).toBeUndefined(); // (4,5) недосяжна
});

/**
 * 10) Блокування по дорозі: не можна «перестрибувати» через фішку на проміжному кроці.
 */
test('не можна проходити крізь іншу фішку по дорозі', () => {
  const e = newEngine([], 'blue');
  add(e, 'blue', 3, 0, 2); // хоче E×2
  add(e, 'red',  3, 1, 1); // блокує перший крок
  sel(e, 3, 0);
  expect(findMove(e, 3, 2)).toBeUndefined(); // фініш далі за блоком — нелегальний
});

/**
 * 11) TRANSFER 'in': напрямок «всередину» (dst → src) і кламп до лімітів 1..6.
 */
test('transfer "in" працює і клампиться до лімітів', () => {
  const e = newEngine([], 'blue');
  add(e, 'blue', 4, 0, 2); // src
  add(e, 'blue', 4, 8, 5); // dst (сусід через wrap)
  const ok = e.transfer({row:4,col:0}, {row:4,col:8}, 'in', 999); // просимо забагато → має обрізати до 4
  expect(ok).toBe(true);
  const A = at(e, 4, 0)!; // отримувач
  const B = at(e, 4, 8)!; // донор
  expect(A.value).toBe(6); // 2 + 4
  expect(B.value).toBe(1); // 5 - 4, але не нижче 1
});

/**
 * 12) TRANSFER під час absorb заборонений.
 */
test('transfer під час absorb відхиляється', () => {
  const e = newEngine([], 'blue');

  // Створюємо tie-lock у захисника, щоб absorb НЕ завершився автоматично
  add(e, 'red', 6, 4, 5);
  add(e, 'red', 6, 5, 5);

  // Дві сині суміжні для спроби transfer
  add(e, 'blue', 4, 4, 3);
  add(e, 'blue', 4, 5, 2);

  // Захоплення на 1 крок вмикає absorb (залишок = 1)
  add(e, 'blue', 5, 4, 1);
  add(e, 'red',  5, 5, 1);

  sel(e, 5, 4);
  expect(mv(e, 5, 5)).toBe(true);

  // absorb активний (tie-lock), під час нього transfer має відхилитись
  expect(e.state.absorb).toBeTruthy();

  const A0 = at(e, 4, 4)!.value, B0 = at(e, 4, 5)!.value;
  expect(e.transfer({row:4,col:4},{row:4,col:5},'out',1)).toBe(false);
  expect(at(e, 4, 4)!.value).toBe(A0);
  expect(at(e, 4, 5)!.value).toBe(B0);
});

/**
 * 13) Спліт захоплює з обох боків і сумарно роздає здобич (частина може роздатись, решта → gameOver).
 * Вихід зі сходу (як у попередніх тестах): ліворуч 2, праворуч 3 → всього 5.
 */
test('split: подвійне захоплення + коректна сума до absorb', () => {
  const e = newEngine([], 'blue');

  // Атакер: зайде в центр з E×5
  add(e, 'blue', 4, 8, 5);

  // Вороги в місцях виходу половинок: NW(3,4)=2 і SW(5,4)=3
  add(e, 'red', 3, 4, 2);
  add(e, 'red', 5, 4, 3);

  // Ще червоні, щоб була одна кістка <6, куди роздати 1 очко, і кілька заповнених
  add(e, 'red', 0, 0, 5); // отримає +1 → стане 6
  add(e, 'red', 0, 2, 6);
  add(e, 'red', 8, 0, 6);
  add(e, 'red', 8, 2, 6);

  sel(e, 4, 8);
  expect(mv(e, 4, 4)).toBe(true);

  // частина здобичі роздалась (5 → +1 на (0,0)), решта не влазить → фіналізовано з поразкою червоних
  expect(at(e, 0, 0)!.value).toBe(6);
  expect(e.state.gameOver).toBeTruthy();
  expect(e.state.gameOver!.loser).toBe('red');
});

/**
 * 14) «Game over» не ставиться ДО завершення absorb у випадку tie-lock.
 * (Дублює ідею 6-го, але чітко фіксує інваріант перед finalizeAbsorb.)
 */
test('tie-lock: перед finalizeAbsorb gameOver не виставляється', () => {
  const e = newEngine([], 'blue');
  // Захисник з двома найслабшими (tie) + філери, щоб було >4 після захоплення
  add(e, 'red', 6, 4, 5);
  add(e, 'red', 6, 5, 5);
  add(e, 'red', 0, 0, 6);
  add(e, 'red', 0, 2, 6);
  add(e, 'red', 8, 0, 6);

  add(e, 'blue', 5, 4, 1);
  add(e, 'red',  5, 5, 1);

  sel(e, 5, 4);
  expect(mv(e, 5, 5)).toBe(true);

  // absorb активний і НЕ завершений → gameOver ще немає
  expect(e.state.absorb).toBeTruthy();
  expect(e.state.gameOver).toBeFalsy();
});

