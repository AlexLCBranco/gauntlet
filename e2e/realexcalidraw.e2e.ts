import { existsSync, readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { checkImported, imported, openWhiteboard, type ExcElement } from "./excalidrawChecks";

/**
 * The owner's own Excalidraw drawing, imported (Excalidraw parity item 2).
 * The file is read from the owner's Downloads folder at run time and only
 * opened in this test's throwaway browser; it is never copied into the repo
 * or sent anywhere. No file there: skipped. Only against a local build,
 * like realdata.e2e.ts.
 */

const FILE = process.env.REAL_EXCALIDRAW ?? "C:/Users/alexc/Downloads/excalidraw-test.excalidraw";
const SITE = process.env.BRIDGE_SITE ?? "";
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(SITE);

test.skip(!existsSync(FILE), `no Excalidraw file at ${FILE}`);
test.skip(!local, "the owner's drawing is only opened on a local build");
test.use({ viewport: { width: 1920, height: 1080 } });

test("the owner's Excalidraw drawing imports with every element's place, size, colours, font and size, text inside its box, and every picture", async ({ page }) => {
  const drawing = JSON.parse(readFileSync(FILE, "utf-8")) as { elements: ExcElement[] };
  await openWhiteboard(page);
  await page.getByTestId("main-menu.button").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import Excalidraw file…" }).click();
  await (await chooser).setFiles(FILE);
  await expect(page.getByTestId("import-notice")).toBeVisible();
  const notConverted = page.getByTestId("import-not-converted");
  if (await notConverted.isVisible()) console.log(`not converted: ${await notConverted.innerText()}`);
  await checkImported(page, drawing.elements, await imported(page));
});
