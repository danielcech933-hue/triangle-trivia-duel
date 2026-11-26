export type Seat = "A" | "B" | "C";
export type Cell = Seat | "X" | null;
export const SEATS: Seat[] = ["A", "B", "C"];

/** 2 players: 7 rows (28 cells). 3 players: 10 rows (55 cells), roughly double the area. */
export const rowsFor = (players: number) => (players >= 3 ? 10 : 7);
export const cellCount = (rows: number) => (rows * (rows + 1)) / 2;
export const rowsOf = (cells: number) => Math.round((Math.sqrt(8 * cells + 1) - 1) / 2);
/** Back-compat defaults for the classic 2-player board. */
export const ROWS = 7;
export const CELL_COUNT = 28;

export const idx = (r: number, c: number) => (r * (r + 1)) / 2 + c;
export function coordsOf(i: number): [number, number] {
  let r = 0;
  while (idx(r + 1, 0) <= i) r++;
  return [r, i - idx(r, 0)];
}

export function neighbors(i: number, rows = ROWS): number[] {
  const [r, c] = coordsOf(i);
  const cand: [number, number][] = [
    [r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c], [r + 1, c + 1],
  ];
  return cand.filter(([rr, cc]) => rr >= 0 && rr < rows && cc >= 0 && cc <= rr).map(([rr, cc]) => idx(rr, cc));
}

export function sides(i: number, rows = ROWS): { left: boolean; right: boolean; bottom: boolean } {
  const [r, c] = coordsOf(i);
  return { left: c === 0, right: c === r, bottom: r === rows - 1 };
}

/** Returns the winning connected group if the seat touches all three sides. Board size comes from cells.length. */
export function findWin(cells: Cell[], seat: Seat): number[] | null {
  const rows = rowsOf(cells.length);
  const seen = new Set<number>();
  for (let s = 0; s < cells.length; s++) {
    if (cells[s] !== seat || seen.has(s)) continue;
    const group: number[] = [];
    const stack = [s];
    seen.add(s);
    let L = false, R = false, B = false;
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      const sd = sides(cur, rows);
      L ||= sd.left; R ||= sd.right; B ||= sd.bottom;
      for (const n of neighbors(cur, rows)) if (cells[n] === seat && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
    if (L && R && B) return group;
  }
  return null;
}
