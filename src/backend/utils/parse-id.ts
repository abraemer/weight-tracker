export function parseId(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) {
    return null
  }
  const n = Number(raw)
  return Number.isSafeInteger(n) ? n : null
}
