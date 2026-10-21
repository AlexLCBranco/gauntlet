import { IconSprite, SaveFailedBanner, Toaster, useThemeStore } from "./boardkit";

// Boards on the whiteboard are dark, as the whiteboard is (owner's rule),
// whatever Boardkit itself is set to. In memory only: Boardkit's own
// setting is left alone.
useThemeStore.setState({ choice: "dark", resolved: "dark" });
document.documentElement.dataset.theme = "dark";
document.documentElement.classList.add("dark");

/** What Boardkit's boards need once per page: its icon sprite (list icons),
    its toasts ("List is full" and the like), and its banner while board
    changes can't be saved (storage full or blocked), with "Try again" and
    a "Leave site?" prompt. */
export function BoardkitParts() {
  return (
    <>
      <IconSprite />
      <Toaster position="bottom-center" theme="dark" />
      <SaveFailedBanner />
    </>
  );
}
