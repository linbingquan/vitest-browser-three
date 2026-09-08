/** Format a number for error messages: integers get a trailing `.0`; `-0` renders as `0.0`. */
export function formatFloat(n: number): string {
  if (Object.is(n, -0)) return "0.0";
  return Number.isInteger(n) ? `${n}.0` : String(n);
}
