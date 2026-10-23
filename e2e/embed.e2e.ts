import { expect, test, type Page } from "./test";

/**
 * Web embeds (owner, toolbar rework step 4): pasting a web address makes
 * one; it shows a static preview (title, picture) and loads the live site
 * only after a click on "Load site"; an embed on another page never loads.
 * The address is this site's own /embed-sample.html (public/), so nothing
 * comes from elsewhere; requests to it are counted by path, which the
 * preview's own server-side fetch (/api/unfurl) never matches.
 */

test.use({ viewport: { width: 1400, height: 900 } });

const SAMPLE = "/embed-sample.html";

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => "editor" in window);
  await expect(page.getByTestId("sheet")).toBeVisible();
}

const ed = <T, A = undefined>(page: Page, fn: (editor: any, arg: A) => T, arg?: A) =>
  page.evaluate(([src, a]) => new Function("e", "a", `return (${src})(e, a)`)((window as any).editor, a), [fn.toString(), arg] as const) as Promise<T>;

/** Every request the page (and its frames) makes for the sample page. */
function sampleLoads(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === SAMPLE) seen.push(r.url());
  });
  return seen;
}

/** Pastes `text` onto the page as a person would (Ctrl+V), the pointer at (x, y). */
async function paste(page: Page, text: string, x = 700, y = 450) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.mouse.move(x, y);
  await page.keyboard.press("Control+v");
}

const embeds = (page: Page) => ed(page, (e) => e.getCurrentPageShapes().filter((s: any) => s.type === "web-embed").map((s: any) => ({ id: s.id, ...s.props })));

test("a pasted address becomes a web embed: a preview with the page's title and picture, no load of the site until \"Load site\"", async ({ page, baseURL }) => {
  const loads = sampleLoads(page);
  await open(page);
  const url = `${new URL(baseURL!).origin}${SAMPLE}?t=${Date.now()}`;
  await paste(page, url);
  await expect.poll(() => embeds(page)).toHaveLength(1);
  const card = page.getByTestId("web-embed");
  await expect(card).toHaveAttribute("data-state", "preview");
  await expect(page.getByTestId("web-embed-title")).toHaveText("Embed sample");
  await expect(card.locator("img")).toHaveAttribute("src", /\/favicon\.svg$/);
  const [e] = await embeds(page);
  expect(e.url).toBe(url);
  expect(e.frameable).toBe("yes");
  // Only the preview: the site itself not loaded, no frame.
  await page.waitForTimeout(500);
  expect(loads).toEqual([]);
  await expect(page.getByTestId("web-embed-frame")).toHaveCount(0);
  // A click on "Load site": the live page, and it takes the pointer.
  await page.getByTestId("web-embed-load").click();
  await expect(card).toHaveAttribute("data-state", "live");
  await expect(page.frameLocator('[data-testid="web-embed-frame"]').getByText("Embed sample: the live page.")).toBeVisible();
  expect(loads).toHaveLength(1);
  await expect(page.getByTestId("web-embed-frame")).toHaveCSS("pointer-events", "auto");
  // One undo takes the whole embed away (its preview isn't a step of its own).
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(() => embeds(page)).toHaveLength(0);
});

test("after a reload, or back from another page, an embed is a preview again; an embed on another page never loads", async ({ page, baseURL }) => {
  const loads = sampleLoads(page);
  await open(page);
  await paste(page, `${new URL(baseURL!).origin}${SAMPLE}?t=${Date.now()}`);
  await expect(page.getByTestId("web-embed-load")).toBeEnabled();
  await page.getByTestId("web-embed-load").click();
  await expect(page.getByTestId("web-embed")).toHaveAttribute("data-state", "live");
  expect(loads).toHaveLength(1);
  // To a new, second page: the embed (on page 1) is gone from view and loads nothing.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /next page/i }).click();
  await expect.poll(() => ed(page, (e) => e.getPages().length)).toBe(2);
  await expect(page.getByTestId("web-embed")).toHaveCount(0);
  // A reload on page 2: still nothing of page 1's embed.
  await page.reload();
  await page.waitForFunction(() => "editor" in window);
  await page.waitForTimeout(1000);
  expect(loads).toHaveLength(1);
  // Back on page 1: the preview, not the site.
  await page.getByRole("button", { name: /previous page/i }).click();
  await expect(page.getByTestId("web-embed")).toHaveAttribute("data-state", "preview");
  await page.waitForTimeout(500);
  expect(loads).toHaveLength(1);
});

test("the ⋮ menu's Web embed asks for an address (key I too) and adds the embed", async ({ page, baseURL }) => {
  await open(page);
  await page.getByTestId("tools.more-button").click();
  await page.getByTestId("tools.more.embed").click();
  await page.getByTestId("web-embed-url").fill(`${new URL(baseURL!).host}${SAMPLE}`.replace(/^localhost/, "http://localhost"));
  await page.getByTestId("web-embed-url").press("Enter");
  await expect.poll(() => embeds(page)).toHaveLength(1);
  await expect(page.getByTestId("web-embed-title")).toHaveText("Embed sample");
});

test("a site that won't be shown inside a page gets \"Open in new tab\", no Load", async ({ page }) => {
  // The preview as /api/unfurl gives it for such a site (its headers say no).
  await page.route("**/api/unfurl?**", (r) =>
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ url: "https://example.com/", title: "Example Domain", image: "", site: "example.com", frameable: "no" }) }),
  );
  await open(page);
  await paste(page, "https://example.com/");
  await expect(page.getByTestId("web-embed-title")).toHaveText("Example Domain");
  await expect(page.getByTestId("web-embed-open")).toHaveAttribute("href", "https://example.com/");
  await expect(page.getByTestId("web-embed-load")).toHaveCount(0);
  await expect(page.getByTestId("web-embed-frame")).toHaveCount(0);
});
