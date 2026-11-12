// The page's side of the backup worker (`worker.ts`): each call runs one of
// `snapshot.ts`'s tasks there and resolves with its result. If the worker
// can't start (its script didn't load), the task runs on the page instead:
// slower to the touch, but a save is never skipped for it.

import type { BackupFile } from "./format";
import * as tasks from "./snapshot";
import type { CopyInfo, Snapshot } from "./snapshot";
import { localSnapshot } from "./storage";

type Tasks = typeof tasks;
type Op = "snapshot" | "fullBackup" | "fullFromCopy" | "describeCopy" | "picturesUsedBy";
interface Call {
  readonly op: Op;
  readonly arg: unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

let worker: Worker | null | undefined;
let nextId = 1;
const calls = new Map<number, Call>();

const here = (c: Call) => void (tasks[c.op] as (arg: unknown) => Promise<unknown>)(c.arg).then(c.resolve, c.reject);

function start(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "gauntlet-backup" });
    w.onmessage = (event: MessageEvent<{ id: number; ok: boolean; value?: unknown; error?: string }>) => {
      const call = calls.get(event.data.id);
      if (!call) return;
      calls.delete(event.data.id);
      if (event.data.ok) call.resolve(event.data.value);
      else call.reject(new Error(event.data.error));
    };
    // Its script failed (each task catches its own errors): run what waits
    // here, and everything after.
    w.onerror = () => {
      console.warn("Gauntlet: the backup worker could not run; saving on the page instead");
      worker = null;
      const waiting = [...calls.values()];
      calls.clear();
      waiting.forEach(here);
    };
    return w;
  } catch {
    return null;
  }
}

function run<K extends Op>(op: K, arg: Parameters<Tasks[K]>[0]): ReturnType<Tasks[K]> {
  return new Promise((resolve, reject) => {
    const call: Call = { op, arg, resolve: resolve as (value: unknown) => void, reject };
    if (worker === undefined) worker = start();
    if (!worker) return here(call);
    const id = nextId++;
    calls.set(id, call);
    try {
      worker.postMessage({ id, op, arg });
    } catch (error) {
      calls.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }) as ReturnType<Tasks[K]>;
}

const request = (now: Date) => ({ local: localSnapshot(), now: now.getTime(), site: location.origin });

/** Everything here now as a split backup (text without pictures, and the
    pictures it names). A `performance` measure records each one
    ("gauntlet:snapshot"), for the speed tests. */
export async function takeSnapshot(now: Date): Promise<Snapshot> {
  const t0 = performance.now();
  const snap = await run("snapshot", request(now));
  try {
    performance.measure("gauntlet:snapshot", { start: t0, end: performance.now(), detail: snap.stats });
  } catch {
    // Measuring is never why a save fails.
  }
  return snap;
}

/** Everything here now as ONE complete file, pictures inside (slow). */
export const fullBackup = (now: Date): Promise<{ blob: Blob; what: string }> => run("fullBackup", request(now));

/** A split copy with its pictures loaded (`loadPictures`), as one complete file. */
export const fullFromCopy = (file: BackupFile): Promise<Blob> => run("fullFromCopy", file);

/** What a backup file holds (null: not one). */
export const describeCopy = (copy: Blob): Promise<CopyInfo | null> => run("describeCopy", copy);

/** The picture files a copy in the folder uses. */
export const picturesUsedBy = (copy: Blob): Promise<string[]> => run("picturesUsedBy", copy);
