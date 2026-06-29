export function pad(n: number, digits = 4): string {
  return String(n).padStart(digits, '0');
}

export function buildCode(year: number, seq: number): string {
  return `COTA-${year}-${pad(seq)}`;
}

export function parseCode(code: string): { year: number; seq: number } | null {
  const m = code.match(/^COTA-(\d{4})-(\d{4})$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), seq: parseInt(m[2], 10) };
}
