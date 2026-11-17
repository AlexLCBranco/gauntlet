// The pinned calendarkit's Slate stylesheet as text (GT-5): put first in
// <head> by kit.ts only when the pinned copy is used, so it never fights
// with the stylesheet of calendarkit's run-time kit.
export { default } from "calendarkit/src/slate/slate.css?inline";
