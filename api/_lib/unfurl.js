// A web page's preview for the whiteboard's web embeds (src/embed/): its
// title, picture and site name, and whether it lets itself be shown inside
// another page. Used by the site's own /api/unfurl (api/unfurl.js, a
// Vercel function) and by the local proxy (scripts/dev-proxy.mjs), so a
// pasted address goes only to this site, never to a third party's service.

/** At most this much of a page is read for its tags. */
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;

/** Addresses on this computer or a private network: never fetched from the
    deployed site (anyone could ask it to). The local proxy allows them, for
    the tests' own pages. */
export function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "::" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (w, n) => ENTITIES[n.toLowerCase()] ?? w)
    .replace(/\s+/g, " ")
    .trim();

/** A <meta> tag's content by its property or name, else "". */
function meta(html, key) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() !== key) continue;
    const content = /\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i.exec(tag);
    if (content) return decode(content[1] ?? content[2] ?? "");
  }
  return "";
}

/** Title, picture (absolute) and site name from a page's HTML. Pure. */
export function readPage(html, pageUrl) {
  const head = html.slice(0, MAX_BYTES);
  const title = meta(head, "og:title") || meta(head, "twitter:title") || decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? "");
  const rawImage = meta(head, "og:image") || meta(head, "og:image:url") || meta(head, "twitter:image");
  let image = "";
  try {
    image = rawImage ? new URL(rawImage, pageUrl).href : "";
  } catch {
    image = "";
  }
  if (image && !/^https?:/.test(image)) image = "";
  const site = meta(head, "og:site_name");
  return { title, image, site };
}

/** Whether the page's headers let another site show it in a frame. Pure. */
export function frameable(headers) {
  const xfo = (headers.get("x-frame-options") ?? "").toLowerCase();
  if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
  const csp = headers.get("content-security-policy") ?? "";
  const ancestors = /frame-ancestors([^;]*)/i.exec(csp)?.[1].trim();
  if (ancestors !== undefined) return ancestors.split(/\s+/).includes("*");
  return true;
}

/**
 * The preview of `address`: { url, title, image, site, frameable } —
 * `frameable` "yes", "no", or "unknown" when the page couldn't be read.
 * Never throws; a page it can't reach still gets a preview with its
 * address only.
 */
export async function unfurl(address, { allowPrivate = false, fetchImpl = fetch } = {}) {
  let url;
  try {
    url = new URL(address);
  } catch {
    return { url: address, title: "", image: "", site: "", frameable: "unknown", error: "not an address" };
  }
  const empty = { url: url.href, title: "", image: "", site: url.hostname, frameable: "unknown" };
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ...empty, error: "only http and https" };
  if (!allowPrivate && isPrivateHost(url.hostname)) return { ...empty, error: "private address" };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url.href, {
      redirect: "follow",
      signal: abort.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; GauntletPreview/1.0; +https://gauntlet-home.vercel.app)", accept: "text/html,*/*;q=0.5" },
    });
    const finalUrl = res.url || url.href;
    if (!allowPrivate && isPrivateHost(new URL(finalUrl).hostname)) return { ...empty, error: "private address" };
    const canFrame = frameable(res.headers) ? "yes" : "no";
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) {
      return { ...empty, url: finalUrl, frameable: canFrame, image: type.startsWith("image/") ? finalUrl : "" };
    }
    // Only the start of the page: the tags are in its head.
    let html = "";
    const reader = res.body?.getReader();
    const text = new TextDecoder();
    while (reader && html.length < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += text.decode(value, { stream: true });
    }
    reader?.cancel().catch(() => {});
    const page = readPage(html, finalUrl);
    return { url: finalUrl, title: page.title, image: page.image, site: page.site || new URL(finalUrl).hostname, frameable: canFrame };
  } catch (e) {
    return { ...empty, error: String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

/** The /api/unfurl answer: `?url=` in, the preview as JSON out (Node's
    request and response, as on Vercel and in the local proxy). */
export async function handleUnfurl(req, res, options = {}) {
  const address = new URL(req.url, "http://x").searchParams.get("url") ?? "";
  const preview = await unfurl(address, options);
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  // The same page's preview for an hour, at Vercel's edge too.
  res.setHeader("cache-control", "public, max-age=0, s-maxage=3600");
  res.end(JSON.stringify(preview));
}
