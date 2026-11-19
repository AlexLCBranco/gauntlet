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

## Feature backlog, built list and ideas (owner's standing workflow, updated 2026-11-15)

Three lists, never mixed:
- `FEATURE_BACKLOG.md`: planned work only. Nothing built is ever in it. It is the only list of planned work:
  "next", "queued" or "plan" sections in other docs are history, not the plan.
- `BUILT.md`: shipped work only, newest first.
- `IDEAS.md`: ideas the owner mentioned that are not planned (maybe later, maybe never). Never built from directly.

The owner's messages. Always read the lists from `main` on GitHub, never from your local checkout or branch
(Claude Code sessions run on a branch made at session start, so `git pull` there does NOT bring in backlog
items added later): run `git fetch origin main`, then read with `git show origin/main:FEATURE_BACKLOG.md`
(same for `BUILT.md` and `IDEAS.md`). Before building, merge `origin/main` into your branch.
- "build what's planned" / "build the backlog": build only the items under Ready in `FEATURE_BACKLOG.md` on
  `origin/main`. If there are none, say "Backlog is empty" and stop. Never build from `IDEAS.md`, `PLAN.md` or
  any other doc, and never fill gaps in a spec with your own defaults: ask.
- "what's planned" / "what's in the backlog": read `FEATURE_BACKLOG.md` only. List each item as
  `GT-n — title — one plain sentence on what changes in the app`. Build nothing.
- "what's built" / "what shipped" (maybe "since <date>" or "last N"): read `BUILT.md` only and list it.
- "ideas" / "what ideas": read `IDEAS.md` only and list it as `I-n — idea`.
- "next batch" / "build the backlog": every item, top to bottom. "next": the top item only. "build GT-n": that item only.
- "promote I-n": cut it from `IDEAS.md` and add it at the bottom of Ready in `FEATURE_BACKLOG.md` with the next free
  GT ID and a `From I-n` line. Build it only if the owner also asks for that.

Before building, list the IDs and titles you are about to build, in plain words.

When an item ships: in the same commit/PR as the code, cut it from `FEATURE_BACKLOG.md` and add it at the top of
`BUILT.md` under that day's `## <YYYY-MM-DD>` heading (one heading per day, newest first) as
`- GT-n — title`, then at most one plain sentence on what the owner sees. An item is never in both files. IDs are
never reused. Work shipped without a backlog item (a direct request, a fix) gets the same line without the ID:
`- title`. Housekeeping the owner can't see (handoff notes, pins, test-only or CI fixes, docs) goes under a
`### Internal` subheading at the bottom of that day, not in the main list. The same format is used in every one of
the owner's repos, so backlogkit can merge them into one `ALL_BUILT.md`.
Follow this file's other rules (branches, tests, version bump) as usual.

When the owner mentions something that isn't to be built now (an aside, "later", "someday", "maybe"), add it at the
bottom of `IDEAS.md` as `- I-n — the idea in plain words (YYYY-MM-DD)` and say so in the report. Never put an idea
in the backlog yourself.

If an item is unclear or blocked, don't guess: leave it in `FEATURE_BACKLOG.md` with a `Blocked:` note saying what's
missing, and continue with the next one. Don't add, rewrite or reorder backlog items yourself; only remove shipped
ones and add `Blocked:` notes. End with a short report: built / blocked / ideas added / what the owner must test by
hand (only what couldn't be automated). Also save that report at the top of `REPORTS.md` (newest first: date, item IDs, the report text) in the same commit, so the owner's Claude chat can read it without a paste. A pasted prompt overrides this section.

Guard: `scripts/check-lists.mjs` runs with the checks (before `npm test`) and fails if an ID is both planned and built, an
ID repeats, or package.json's version has no `BUILT.md` entry. Fix the lists, never the check.

`ALL_BUILT.md` (every repo's built list) and `ALL_BACKLOG.md` (every repo's planned items) live in backlogkit
(https://github.com/AlexLCBranco/backlogkit), built daily by its `all-built` workflow from every repo on GitHub.

## backlogkit formats (owner's rule, 2026-11-19; same text in every repo)

backlogkit (the owner's site that shows every repo's lists) reads these lines; keep them exact.
- Specs: every item in `FEATURE_BACKLOG.md` has, as the first line under its `### ID — title` heading,
  `**In short:** <one plain sentence: what the owner will see change, no code words>`. If nothing visible changes,
  say so ("Nothing changes on screen: ...").
- Blocked: a `Blocked:` line means the item waits on the owner. "build the backlog", "next batch" and "next" skip
  blocked items (they stay where they are) until the owner answers. An answer replaces the `Blocked:` line with
  `**Answered (YYYY-MM-DD):** <the question> → <the answer>`; from then on the item is built normally.
- Ideas: every idea in `IDEAS.md` ends with one reason tag saying why it isn't planned: `[why: waiting]` waits on
  something (a data source, a key or account, another feature, an outside event; the idea's text says which),
  `[why: decision]` needs the owner to decide something, `[why: too-big]` needs splitting first, `[why: later]` not
  important yet, `[why: never]` probably never. Tag only from what the owner said; if he gave no reason, leave the tag
  off (backlogkit shows it under "No reason yet"). The owner can also set it from backlogkit.
