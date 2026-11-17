// calendarkit, the app (an npm git dependency pinned in package.json): the
// Slate widget draws its cards with calendarkit's own Slate part
// (`src/slate/`, its PROJECT.md "Using Slate in the gauntlet").
//
// GT-5: this pinned copy is now the FALLBACK. kit.ts loads calendarkit's
// current Slate kit from its site at run time and uses this module only when
// that fails; the names here are the kit's (calendarkit's src/slate/kit.ts),
// so both are used the same way. Its stylesheet is put in by kit.ts
// (calendarkitCss.ts), only when this copy is used. Only kit.ts imports this
// file, lazily: a page without a Slate widget never loads calendarkit.

export {
  hoopsjunkieLink,
  loadCalendarData,
  liveOddsStore,
  localNotesStore,
  refreshCalendarData,
  SCHEDULE_CHECK_MS,
  slateCopyCardWidth,
  slateCopyColumns,
  slateGames,
  slateImageSize,
  SlateCopy,
  SLATE_COPY_GAP,
  teamCalendarUrl,
  teamLinkTarget,
  TeamLinkContext,
  useSeriesPopup,
  useStreakPopup,
  useTooltip,
  withFinals,
  type CalendarData,
  type DayOdds,
  type SlateOdds,
  type SlateNotes,
  type TeamLinks,
} from "calendarkit/src/slate";
export { SLATE_GRID_GAP, slateCardWidth } from "calendarkit/src/slate/layout";
export { claimPopup, releasePopup } from "calendarkit/src/slate/popupGate";
export { slateCopyCup } from "calendarkit/src/slate/SlateCard";
export const SLATEKIT_API = 1;
