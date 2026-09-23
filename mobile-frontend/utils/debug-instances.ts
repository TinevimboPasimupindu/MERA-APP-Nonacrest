// TEMPORARY debug instrumentation for the "dashboard slide animation gets
// worse with every trigger/cancel cycle" investigation. Delete this file and
// every line tagged `[DBG]` (grep for "DBG") once the cause is found.
//
// Tracks how many instances of each screen are mounted AT THE SAME TIME, so
// the console shows directly whether screens are stacking up.

const alive: Record<string, Set<string>> = {};

export function newDebugId(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function debugMount(screen: string, id: string): void {
  (alive[screen] ??= new Set()).add(id);
  console.log(
    `[DBG] MOUNT   ${screen}#${id}  alive ${screen}: ${alive[screen].size} [${[...alive[screen]].join(', ')}]`
  );
}

export function debugUnmount(screen: string, id: string): void {
  alive[screen]?.delete(id);
  console.log(
    `[DBG] UNMOUNT ${screen}#${id}  alive ${screen}: ${alive[screen]?.size ?? 0} [${[...(alive[screen] ?? [])].join(', ')}]`
  );
}

export function debugLog(message: string): void {
  console.log(`[DBG] ${message}`);
}
