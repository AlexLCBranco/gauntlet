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
