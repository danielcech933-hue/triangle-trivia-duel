export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a) /, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

function tolerance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

function close(input: string, target: string): boolean {
  const a = input.replace(/ /g, "");
  const b = target.replace(/ /g, "");
  if (!a || !b) return false;
  return levenshtein(a, b) <= tolerance(b.length);
}

/** Tolerates diacritics, case, extra spaces and small typos; a surname alone is enough. */
export function isCorrect(input: string, answers: string[]): boolean {
  const n = normalize(input);
  if (!n) return false;
  return answers.some((ans) => {
    const t = normalize(ans);
    if (close(n, t)) return true;
    const words = t.split(" ");
    const last = words[words.length - 1] ?? "";
    return words.length > 1 && last.length >= 4 && close(n, last);
  });
}
