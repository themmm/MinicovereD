/** The readable half of an unknown thrown value, for a status line or a log. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
