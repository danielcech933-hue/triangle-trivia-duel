export const ROWS = 7;
export const CELL_COUNT = 28;
export type Seat = "A" | "B";
export type Cell = Seat | "X" | null;

export const idx = (r: number, c: number) => (r * (r + 1)) / 2 + c;
export const coords: [number, number][] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c <= r; c++) coords.push([r, c]);

export function neighbors(i: number): number[] {
  const [r, c] = coords[i]!;
  const cand: [number, number][] = [
    [r, c - 1], [r, c + 1], [r - 1, c - 1], [r - 1, c], [r + 1, c], [r + 1, c + 1],
  ];
  return cand.filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc <= rr).map(([rr, cc]) => idx(rr, cc));
}

export function sides(i: number): { left: boolean; right: boolean; bottom: boolean } {
  const [r, c] = coords[i]!;
  return { left: c === 0, right: c === r, bottom: r === ROWS - 1 };
}

/** Returns the winning connected group if the seat touches all three sides. */
export function findWin(cells: Cell[], seat: Seat): number[] | null {
  const seen = new Set<number>();
  for (let s = 0; s < CELL_COUNT; s++) {
    if (cells[s] !== seat || seen.has(s)) continue;
    const group: number[] = [];
    const stack = [s];
    seen.add(s);
    let L = false, R = false, B = false;
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      const sd = sides(cur);
      L ||= sd.left; R ||= sd.right; B ||= sd.bottom;
      for (const n of neighbors(cur)) if (cells[n] === seat && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
    if (L && R && B) return group;
  }
  return null;
}
