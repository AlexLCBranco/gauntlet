import { IconSprite, Toaster, useThemeStore } from "./boardkit";

// Boards on the whiteboard are dark, as the whiteboard is (owner's rule),
// whatever Boardkit itself is set to. In memory only: Boardkit's own
// setting is left alone.
useThemeStore.setState({ choice: "dark", resolved: "dark" });
document.documentElement.dataset.theme = "dark";
document.documentElement.classList.add("dark");

/** What Boardkit's boards need once per page: its icon sprite (list icons)
    and its toasts ("List is full" and the like). */
export function BoardkitParts() {
  return (
    <>
      <IconSprite />
      <Toaster position="bottom-center" theme="dark" />
    </>
  );
}
