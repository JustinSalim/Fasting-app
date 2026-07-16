export function getWeightDelta(entries: { value: number }[], index: number): number | null {
  if (index <= 0 || index >= entries.length) return null
  return entries[index].value - entries[index - 1].value
}
