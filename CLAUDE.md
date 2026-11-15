# Gauntlet — context for Claude

## Testing policy

Automate every check that can be automated: unit, integration, and end-to-end
with Playwright against the live site, using throwaway data the test creates
and deletes itself. Never hand the owner a manual checklist for something a
script can do. Manual steps only for what truly can't be automated (browser
permission prompts like folder pickers, and judging feel/usability). Keep
those to the minimum, say why each one can't be automated, and give one short
step at a time.

Tests and scripts run headless and close every browser window and process
they open, even on failure. After any run, no test window may be left open
on the owner's PC.

## Test runs (owner, 2026-10-20)

Same policy as above (automate everything); this is how often to run what.

- While working on an item: only that area's tests + unit tests.
- Before pushing: the full local suite ONCE. After deploying: the live run once.
- Three runs in a row only when deliberately checking whether one test is flaky.
- Linkkit's suite only when a change touches Boardkit, Linkkit, or the link
  between them.
- Flaky test with no app cause found within ~30 minutes: mark it skipped with
  a one-line reason in HANDOFF and move on. A test that catches a real app bug
  is never skipped.
- Reports: results in one line (e.g. "unit 88 ✓, e2e 94 ✓, live ✓"); details
  only for failures.

## Feature backlog and built list (owner's standing workflow, updated 2026-11-15)

Two lists, never mixed:
- `FEATURE_BACKLOG.md`: planned work only. Nothing built is ever in it. It is the only list of planned work:
  "next", "queued" or "plan" sections in other docs are history, not the plan.
- `BUILT.md`: shipped work only, newest first.

The owner's messages (always `git pull` first):
- "what's planned" / "what's in the backlog": read `FEATURE_BACKLOG.md` only. List each item as
  `BK-n — title — one plain sentence on what changes in the app`. Build nothing.
- "what's built" / "what shipped" (maybe "since <date>" or "last N"): read `BUILT.md` only and list it.
- "next batch" / "build the backlog": every item, top to bottom. "next": the top item only. "build BK-n": that item only.

Before building, list the IDs and titles you are about to build, in plain words.

When an item ships: in the same commit/PR as the code, cut it from `FEATURE_BACKLOG.md` and add it at the top of
`BUILT.md` under `## <YYYY-MM-DD> — v<version>` as `- BK-n — title`. An item is never in both files. IDs are never
reused. Work shipped without a backlog item (a direct request, a fix) also gets a `BUILT.md` line, without an ID.
Follow this file's other rules (branches, tests, version bump) as usual.

If an item is unclear or blocked, don't guess: leave it in `FEATURE_BACKLOG.md` with a `Blocked:` note saying what's
missing, and continue with the next one. Don't add, rewrite or reorder backlog items yourself; only remove shipped
ones and add `Blocked:` notes. End with a short report: built / blocked / what the owner must test by hand (only what
couldn't be automated). A pasted prompt overrides this section.
