/**
 * Talking to the widgets' frames. One `message` listener for the whole
 * canvas, attached when this module loads, so it is always in place before
 * any frame gets its address (frames send `stone:ready` once, early).
 * A message counts only from this origin and from a frame registered here,
 * matched by `event.source`.
 */
import { parseFromFrame, type FromFrame, type ToFrame } from "../domain/protocol";

type Handler = (msg: FromFrame) => void;

const handlers = new Map<HTMLIFrameElement, Handler>();
const flushWaiters = new Map<HTMLIFrameElement, (busy: boolean) => void>();

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  const msg = parseFromFrame(event.data);
  if (!msg) return;
  for (const [el, handler] of handlers) {
    if (!el.contentWindow || el.contentWindow !== event.source) continue;
    if (msg.type === "stone:flushed") flushWaiters.get(el)?.(msg.busy);
    handler(msg);
    return;
  }
});

export function register(el: HTMLIFrameElement, handler: Handler): () => void {
  handlers.set(el, handler);
  return () => {
    handlers.delete(el);
    flushWaiters.get(el)?.(true);
  };
}

export const send = (el: HTMLIFrameElement, msg: ToFrame) => el.contentWindow?.postMessage(msg, location.origin);

/** Asks the frame to save now. Resolves `busy`: true while something is
    being typed in it, and also when it doesn't answer in time (a frame that
    never answers counts as busy, so it is never unloaded). */
export function flush(el: HTMLIFrameElement, timeoutMs = 1500): Promise<boolean> {
  flushWaiters.get(el)?.(true);
  return new Promise((resolve) => {
    const done = (busy: boolean) => {
      clearTimeout(timer);
      if (flushWaiters.get(el) === done) flushWaiters.delete(el);
      resolve(busy);
    };
    const timer = setTimeout(() => done(true), timeoutMs);
    flushWaiters.set(el, done);
    send(el, { type: "stone:flush" });
  });
}
