// Canadian postal codes never use D, F, I, O, Q or U, and W and Z are not valid first letters.
const POSTAL_CODE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$/

/** Uppercases, drops stray characters and inserts the space: `v8v1a1` -> `V8V 1A1`. */
export function formatPostalCode(value: string): string {
  const compact = value
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 6)
  return compact.length > 3 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : compact
}

export const isValidPostalCode = (value: string): boolean =>
  POSTAL_CODE.test(formatPostalCode(value))
