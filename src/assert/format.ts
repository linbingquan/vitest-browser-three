/** Format a number for error messages: integers get a trailing `.0`. */
export function formatFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : String(n);
}
