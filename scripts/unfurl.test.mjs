import assert from "node:assert/strict";
import { test } from "node:test";

import { frameable, isPrivateHost, readPage, unfurl } from "../api/_lib/unfurl.js";

test("a page's title, picture and site name: Open Graph first, else <title>; the picture made absolute", () => {
  const html = `<html><head><title>Plain &amp; simple</title>
    <meta property="og:title" content="Big &quot;Game&quot; Night">
    <meta content='/img/card.png' property='og:image'>
    <meta property="og:site_name" content="Example"></head><body></body></html>`;
  assert.deepEqual(readPage(html, "https://example.com/a/b"), { title: 'Big "Game" Night', image: "https://example.com/img/card.png", site: "Example" });
  assert.deepEqual(readPage("<title> Just a  title </title>", "https://x.org/"), { title: "Just a title", image: "", site: "" });
  // A picture that isn't http(s) isn't used.
  assert.equal(readPage('<meta property="og:image" content="javascript:alert(1)">', "https://x.org/").image, "");
});

test("whether a site lets itself be shown in another page: X-Frame-Options and CSP frame-ancestors", () => {
  const h = (o) => new Headers(o);
  assert.equal(frameable(h({})), true);
  assert.equal(frameable(h({ "x-frame-options": "DENY" })), false);
  assert.equal(frameable(h({ "x-frame-options": "SAMEORIGIN" })), false);
  assert.equal(frameable(h({ "content-security-policy": "default-src 'self'; frame-ancestors 'self'" })), false);
  assert.equal(frameable(h({ "content-security-policy": "frame-ancestors *" })), true);
  assert.equal(frameable(h({ "content-security-policy": "default-src 'self'" })), true);
});

test("private and local addresses are never fetched from the deployed site", async () => {
  for (const host of ["localhost", "127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.0.1", "169.254.169.254", "[::1]", "printer.local"]) assert.equal(isPrivateHost(host.replace(/^\[|\]$/g, "")), true, host);
  for (const host of ["example.com", "8.8.8.8", "172.32.0.1", "gauntlet-home.vercel.app"]) assert.equal(isPrivateHost(host), false, host);
  let fetched = false;
  const r = await unfurl("http://169.254.169.254/latest", { fetchImpl: async () => ((fetched = true), new Response("")) });
  assert.equal(fetched, false);
  assert.equal(r.error, "private address");
  // Only http(s); anything unreadable still answers.
  assert.equal((await unfurl("file:///etc/passwd")).error, "only http and https");
  assert.equal((await unfurl("not a url")).frameable, "unknown");
});

test("a fetched page: its preview and frameability; a failed fetch still answers with the address", async () => {
  const page = new Response('<title>Hello</title><meta property="og:image" content="https://cdn.example.com/p.jpg">', {
    headers: { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY" },
  });
  const r = await unfurl("https://example.com/", { fetchImpl: async () => page });
  assert.deepEqual(r, { url: "https://example.com/", title: "Hello", image: "https://cdn.example.com/p.jpg", site: "example.com", frameable: "no" });
  const down = await unfurl("https://down.example/", {
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  assert.equal(down.site, "down.example");
  assert.equal(down.frameable, "unknown");
  assert.match(down.error, /ECONNREFUSED/);
});
