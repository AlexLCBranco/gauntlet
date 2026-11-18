import { react, type Editor } from "tldraw";

// GT-15: the browser tab's title says where you are, "Gauntlet · <page
// name>", as calendarkit and footykit do (owner's rule for all apps). It
// follows the current page: switching page, renaming it, or a page coming
// back after a reload.

export const SITE_NAME = "Gauntlet";

/** "Gauntlet · Page 2"; just "Gauntlet" for a page with no name. */
export function tabTitle(pageName: string | undefined): string {
  const name = pageName?.trim();
  return name ? `${SITE_NAME} · ${name}` : SITE_NAME;
}

/** Keeps document.title on the current page's name; the stop puts "Gauntlet" back. */
export function followPageTitle(editor: Editor): () => void {
  const stop = react("tab title follows the page", () => {
    document.title = tabTitle(editor.getCurrentPage()?.name);
  });
  return () => {
    stop();
    document.title = SITE_NAME;
  };
}
