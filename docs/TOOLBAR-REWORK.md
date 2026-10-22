# Toolbar rework (owner, 2026-10-22)

The owner's request, as given. Work in steps, stop after each step, and
report what was done before moving on. Progress: step 1 done; see HANDOFF.

STEP 1 — Toolbar contents and layout
Final layout, left to right:
- Select · Rectangle · Arrow · Line
- thin vertical separator
- Board · Map (widget buttons: clicking creates a new Boardkit board / Linkkit map on the current page; if there is currently a way to insert an existing board or map, keep it reachable and tell me where it ended up)
- ⋮ "More tools" button at the far right

The ⋮ menu contains, in this order: Insert image · Web embed · Lasso selection · Markup · Text · Draw.

Remove completely from the UI: tool lock, hand tool button, diamond, ellipse, sticky note, eraser, frame tool, draw-to-shape, bucket fill, laser pointer (replaced by Markup), and any AI/generate items. Remove the existing chevron dropdown.

tldraw may automatically push tools into an overflow menu when it thinks the bar is crowded. Disable that behavior completely: the bar must always show exactly the tools listed above, at every window size. First list every tool that currently exists in the toolbar or its dropdown and tell me where each one went.

STEP 2 — Look and size, matched to Excalidraw
Do not guess values. Excalidraw is open source (github.com/excalidraw/excalidraw). Find the real CSS values for its shapes toolbar (look in packages/excalidraw/css/ for variables/theme files, and the ToolIcon and Island styles) and copy them exactly. Tell me which file each value came from. Match:
- button size, icon size, icon stroke width
- toolbar padding, gap between buttons, border radius, background, box-shadow
- selected state: replace the current solid bright-blue fill with Excalidraw's soft selected background and icon color; hover state too
- separator style
- the ⋮ menu's look: item height, icons, shortcut labels on the right, like Excalidraw's "More tools" menu
- keyboard shortcut hint: a small letter in the bottom-right corner of each bar button, same font size, color and position as Excalidraw. Only show a hint when the shortcut actually works. Markup uses K. If a tool has no shortcut, pick one that doesn't conflict and tell me which keys you chose.
Dark mode only. Do not spend time on light mode.

STEP 3 — Customizable toolbar
- Tools can be dragged from the ⋮ menu onto the bar (pin), from the bar back into the ⋮ menu (unpin), and reordered within the bar. Dragging out of the open menu must not close the menu mid-drag.
- Select cannot be removed from the bar.
- The layout is saved and survives reloads.
- "Reset toolbar to default" item at the bottom of the ⋮ menu.

STEP 4 — Tool behavior changes
1. Lines and arrows: when drawn close to horizontal or vertical (within a few degrees), they snap to perfectly straight automatically, no key needed. Holding Shift snaps to fixed angles for diagonals.
2. Panning: there is no hand tool. Scroll wheel and Space+drag pan only when the page is larger than the window, and are always clamped to the page edges. When the page fits the window, no mouse button or shortcut may move the view at all (check middle-click drag specifically).
3. Group / Ungroup must be in the right-click menu (not only Ctrl+G).
4. Web embed: pasting a URL onto the page creates an embed, the same way pasting a screenshot creates an image. The ⋮ menu item is a backup way in. Embeds show a static preview (title + thumbnail if available) and only load the live site after the user clicks into them. Embeds on pages other than the current one never load.
5. Markup tool (replaces the laser pointer):
   - draws in red; every mark stays on screen until cleared
   - while markup is active, the arrow and line tools draw red markup arrows/lines (with the same straight-line snapping)
   - markup is never saved with the board or the page
   - marks are cleared when the user leaves the page or reloads
   - a "Clear markup" button appears while marks exist
   - a "Keep marks" button converts the current marks into normal saved drawings

Verification, automated wherever possible (I want to test as little as possible by hand):
- Test that exactly the listed tools are visible on the bar without opening any menu, at a small and a large window size.
- Test that the removed tools appear nowhere in the UI.
- Test computed button size and toolbar padding against the Excalidraw values you copied.
- Test that each displayed shortcut selects its tool.
- Test pin / unpin / reorder / reset, and that the layout survives a reload; test that Select cannot be unpinned.
- Test line/arrow snapping: a line drawn 2 degrees off horizontal ends up exactly horizontal.
- Test that panning is impossible when the page fits the window, and clamped otherwise.
- Test that markup is not present in saved data and disappears after a page change and after a reload, and that "Keep marks" makes it persist.
- Test that pasting a URL creates an embed, and that an embed on another page makes no network request.
- Save screenshots of the toolbar and the open ⋮ menu so I can compare them with Excalidraw.
At the end, list what I still need to check by hand, and keep that list as short as possible.
