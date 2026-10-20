import { isEqual, type Editor, type TLRecord } from "tldraw";

/** Drawing records changed just before the tab went away, kept for the next open. */
const KEY = "gauntlet:whiteboard:unsaved";
/** A change older than this is surely in IndexedDB: tldraw writes at most
    350 ms after it (and reloads the page if a write fails). */
const RECENT_MS = 10_000;

/** Each record as it was when the tab went away; null: deleted. */
type Journal = { schema: string; records: Record<string, TLRecord | null> };

function read(): Journal | null {
  try {
    const raw = localStorage.getItem(KEY);
    const j = raw ? (JSON.parse(raw) as Journal) : null;
    return j && typeof j.schema === "string" && j.records && typeof j.records === "object" ? j : null;
  } catch {
    return null;
  }
}

/** A journal that can't be kept current must not replay old data later. */
function write(j: Journal) {
  try {
    localStorage.setItem(KEY, JSON.stringify(j));
  } catch {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // No localStorage at all: nothing was kept either.
    }
  }
}

function clear() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}

/** Ids a record points at: a shape's parent, a binding's two shapes. */
const refs = (r: TLRecord): string[] =>
  r.typeName === "shape" ? [r.parentId] : r.typeName === "binding" ? [r.fromId, r.toId] : [];

/**
 * Puts the journal's records into the store, then forgets it. A record
 * already as journaled is left alone, so a second open changes nothing. A
 * record whose parent (page or shape) is gone, or a delete that would leave
 * something without its parent, is skipped: the open works as before.
 */
function replay(editor: Editor, schema: string) {
  const j = read();
  clear(); // Also one that can't be read.
  if (!j) return;
  if (j.schema !== schema) return; // Saved by another tldraw version.
  const store = editor.store;
  const changes = new Map<string, TLRecord | null>();
  for (const [id, to] of Object.entries(j.records)) {
    if (!isEqual(store.get(id as TLRecord["id"]) ?? null, to)) changes.set(id, to);
  }
  if (!changes.size) return;
  const finalOf = (id: string) => (changes.has(id) ? changes.get(id)! : (store.get(id as TLRecord["id"]) ?? null));
  for (let dropped = true; dropped; ) {
    dropped = false;
    const after = new Map(store.allRecords().map((r) => [r.id as string, r as TLRecord | null]));
    for (const [id, to] of changes) after.set(id, to);
    const used = new Set<string>();
    let pages = 0;
    for (const r of after.values()) {
      if (!r) continue;
      for (const ref of refs(r)) used.add(ref);
      if (r.typeName === "page") pages++;
    }
    for (const [id, to] of changes) {
      const orphan = to ? refs(to).some((ref) => !finalOf(ref)) : used.has(id) || (pages === 0 && id.startsWith("page:"));
      if (orphan) {
        changes.delete(id);
        dropped = true;
      }
    }
  }
  const put = [...changes.values()].filter((r): r is TLRecord => !!r);
  const removed = [...changes].filter(([, r]) => !r).map(([id]) => id as TLRecord["id"]);
  // A user change, not undoable: tldraw saves it and tells the other tabs.
  editor.run(
    () => {
      if (removed.length) store.remove(removed);
      if (put.length) store.put(put);
    },
    { history: "ignore" },
  );
  if (!editor.getPage(editor.getCurrentPageId())) editor.setCurrentPage(editor.getPages()[0].id);
}

/**
 * Keeps drawings made just before a reload or tab close. tldraw saves to
 * IndexedDB 350 ms after a change; its flush when the page goes away is an
 * async write the unload cuts off, so the last changes were lost. Here the
 * records changed in the last few seconds are written to localStorage
 * (synchronous) on pagehide, and put back on the next open, after tldraw
 * has loaded; tldraw then saves them as usual.
 *
 * Other tabs: tldraw shows a change in every open tab at once. A tab that
 * changes a journaled record while the journal waits writes its own
 * version into it (deleted included), so the journal never brings back an
 * older one. Records already as journaled are left alone.
 */
export function unsavedJournal(editor: Editor): () => void {
  const store = editor.store;
  const schema = JSON.stringify(store.schema.serialize());
  /** When each record was last changed in this tab. */
  const touched = new Map<string, number>();
  /** The waiting journal's records, as last seen (null: none waits). */
  let waiting: Set<string> | null = null;

  const stopListen = store.listen(
    ({ changes }) => {
      const now = Date.now();
      const ids = [...Object.keys(changes.added), ...Object.keys(changes.updated), ...Object.keys(changes.removed)];
      for (const id of ids) touched.set(id, now);
      if (touched.size > 1000) for (const [id, t] of touched) if (now - t > RECENT_MS) touched.delete(id);
      if (waiting && ids.some((id) => waiting!.has(id))) {
        const j = read();
        if (!j) return void (waiting = null);
        for (const id of ids) if (id in j.records) j.records[id] = store.get(id as TLRecord["id"]) ?? null;
        write(j);
      }
    },
    { source: "user", scope: "document" },
  );

  // After the listener: what is put back is unsaved again until tldraw
  // saves it, so a second quick reload keeps it too.
  try {
    replay(editor, schema);
  } catch (e) {
    // Never stop the whiteboard opening; it opens as tldraw saved it.
    console.warn("Couldn't restore the last changes before the reload", e);
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return;
    const j = read();
    waiting = j ? new Set(Object.keys(j.records)) : null;
  };

  const onLeave = () => {
    try {
      // Changes from this frame reach the listeners (tldraw's too) first.
      store._flushHistory();
      const now = Date.now();
      const recent = [...touched].filter(([, t]) => now - t < RECENT_MS).map(([id]) => id);
      if (!recent.length) return;
      const old = read();
      const j: Journal = old && old.schema === schema ? old : { schema, records: {} };
      for (const id of recent) j.records[id] = store.get(id as TLRecord["id"]) ?? null;
      write(j);
      // Kept current if this tab comes back (the back/forward cache).
      waiting = new Set(Object.keys(j.records));
    } catch {
      // Leaving must never fail; tldraw's own save still applies.
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("beforeunload", onLeave);
  return () => {
    stopListen();
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pagehide", onLeave);
    window.removeEventListener("beforeunload", onLeave);
  };
}
