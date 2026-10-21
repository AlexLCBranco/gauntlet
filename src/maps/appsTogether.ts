import { keyStoredElsewhere as toBoardkit, onWroteHere as boardkitWrote } from "../boards/boardkit";
import { registryChanged, REGISTRY_KEY } from "../boards/registry";
import { keyStoredElsewhere as toLinkkit, onWroteHere as linkkitWrote } from "./linkkit";

const gone = (key: string) => {
  try {
    return localStorage.getItem(key) === null;
  } catch {
    return false;
  }
};

/**
 * Boardkit and Linkkit on one page. A map linked to a board shares that
 * board's record: each app follows the other's writes through the
 * browser's `storage` event, which only another tab gets. On the
 * whiteboard both are on the same page, so each app's writes are passed to
 * the other here, as if another tab had made them: a card edited in a
 * board shows at once in its linked map (and the other way round), in a
 * board or map widget, being edited or not. Returns a stop function.
 */
export function appsTogether(): () => void {
  const stopLinkkit = linkkitWrote((key) => {
    if (!key.startsWith("boardkit:")) return;
    toBoardkit(key, gone(key));
    // A linked map's start renamed: its board's name in Boardkit's list.
    if (key === REGISTRY_KEY) registryChanged();
  });
  const stopBoardkit = boardkitWrote((key) => toLinkkit(key, gone(key)));
  return () => {
    stopLinkkit();
    stopBoardkit();
  };
}
