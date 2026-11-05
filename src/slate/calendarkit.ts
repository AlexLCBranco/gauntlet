// calendarkit, the app (an npm git dependency pinned in package.json): the
// Slate widget draws its cards with calendarkit's own Slate part
// (`src/slate/`, its PROJECT.md "Using Slate in the gauntlet"). Every import
// from calendarkit goes through this file, and only SlateWidget.tsx imports
// it, lazily: a page without a Slate widget never loads calendarkit.
import "calendarkit/src/slate/slate.css";
import "./calendarkit.css";

export {
  loadCalendarData,
  liveOddsStore,
  localNotesStore,
  slateCopyColumns,
  slateGames,
  slateImageSize,
  SlateCopy,
  SLATE_COPY_GAP,
  type CalendarData,
  type DayOdds,
  type SlateOdds,
  type SlateNotes,
} from "calendarkit/src/slate";
export { SLATE_GRID_GAP } from "calendarkit/src/slate/layout";
