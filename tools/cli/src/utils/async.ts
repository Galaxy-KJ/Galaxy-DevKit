/** Resolve after the requested delay. Shared by polling watch commands. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
