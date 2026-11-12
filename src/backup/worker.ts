// The backup worker: runs `snapshot.ts`'s tasks off the page's own thread,
// so a save never makes the whiteboard stutter. Called through `client.ts`.

import * as tasks from "./snapshot";

type Op = "snapshot" | "fullBackup" | "fullFromCopy" | "describeCopy" | "picturesUsedBy";

self.onmessage = async (event: MessageEvent<{ id: number; op: Op; arg: unknown }>) => {
  const { id, op, arg } = event.data;
  try {
    const value = await (tasks[op] as (arg: unknown) => Promise<unknown>)(arg);
    self.postMessage({ id, ok: true, value });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
