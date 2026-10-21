import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { DefaultColorStyle, useEditor, useValue } from "tldraw";

import { FIXED_COLORS, hexToHsv, hsvToHex, normalizeHex, pushRecent } from "./colors";

type Tri<T> = T | "mixed" | undefined;

// ---------------------------------------------------------------------------
// The last 5 custom colours, kept in this browser (shared by every row).

const RECENT_KEY = "gauntlet:recent-colors";
const listeners = new Set<() => void>();
let recentCache: string[] | null = null;

function readRecent(): string[] {
  if (recentCache) return recentCache;
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    recentCache = pushRecent(Array.isArray(v) ? v : [], "");
  } catch {
    recentCache = [];
  }
  return recentCache;
}

/** Records a custom colour as the newest recent one. */
export function rememberCustom(hex: string) {
  recentCache = pushRecent(readRecent(), hex);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentCache));
  } catch {
    // storage unavailable: kept for this visit only
  }
  for (const l of listeners) l();
}

function useRecent() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readRecent,
  );
}

// ---------------------------------------------------------------------------

function useThemeColor() {
  const editor = useEditor();
  return useValue(
    "theme colours",
    () => {
      const colors = editor.getCurrentTheme().colors[editor.getColorMode()] as unknown as Record<string, { solid: string }>;
      return (name: string) => colors[name]?.solid ?? name;
    },
    [editor],
  );
}

const COLORS = DefaultColorStyle.values;

function Swatch({ label, value, current, onPick, color, testId }: { label: string; value: string; current: Tri<string>; onPick: (v: string) => void; color: string; testId: string }) {
  return (
    <button
      type="button"
      className="gk-choice"
      aria-label={label}
      title={label}
      aria-pressed={current === value}
      data-testid={testId}
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onPick(value)}
    >
      <span className={color === "transparent" ? "gk-swatch gk-swatch--none" : "gk-swatch"} style={color === "transparent" ? undefined : { background: color }} />
    </button>
  );
}

/** A colour row: tldraw's colours (they follow dark/light mode), the fixed
    dark colours, the recent custom colours and a custom colour picker.
    Picks are tldraw colour names, "transparent", or exact "#rrggbb". */
export function ColorRow({ name, current, onPick, transparent }: { name: string; current: Tri<string>; onPick: (c: string) => void; transparent?: boolean }) {
  const color = useThemeColor();
  const recent = useRecent();
  const [open, setOpen] = useState(false);
  const custom = typeof current === "string" && current.startsWith("#") && !FIXED_COLORS.some((f) => f.hex === current) ? current : null;
  const pickCustom = (hex: string) => {
    rememberCustom(hex);
    onPick(hex);
  };
  return (
    <>
      <div className="gk-swatches" role="radiogroup" aria-label={name}>
        {transparent && <Swatch label={`${name}: transparent`} value="transparent" current={current} onPick={onPick} color="transparent" testId={`${name}-transparent`} />}
        {COLORS.map((c) => (
          <Swatch key={c} label={`${name}: ${c}`} value={c} current={current} onPick={onPick} color={color(c)} testId={`${name}-${c}`} />
        ))}
      </div>
      <div className="gk-swatches gk-swatches--fixed" role="radiogroup" aria-label={`${name}: fixed colours`}>
        {FIXED_COLORS.map((f) => (
          <Swatch key={f.id} label={`${name}: ${f.label.toLowerCase()} (same in dark and light mode)`} value={f.hex} current={current} onPick={onPick} color={f.hex} testId={`${name}-${f.id}`} />
        ))}
        {recent.map((hex) => (
          <Swatch key={hex} label={`${name}: recent ${hex}`} value={hex} current={current} onPick={pickCustom} color={hex} testId={`${name}-recent-${hex.slice(1)}`} />
        ))}
        <button
          type="button"
          className="gk-choice gk-choice--custom"
          aria-label={`${name}: custom colour`}
          title="Custom colour"
          aria-pressed={open || custom !== null}
          aria-expanded={open}
          data-testid={`${name}-custom`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="gk-swatch gk-swatch--custom" style={custom ? { background: custom } : undefined} />
        </button>
      </div>
      {open && <CustomPicker name={name} start={custom ?? (typeof current === "string" && current.startsWith("#") ? current : "#123456")} onPick={pickCustom} />}
    </>
  );
}

/** A colour area (saturation x brightness), a hue slider and a hex field.
    The colour is applied when the pointer is let go, the hue slider is
    released, or Enter is pressed in the field (each one undo step). */
function CustomPicker({ name, start, onPick: pick }: { name: string; start: string; onPick: (hex: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(start));
  const editor = useEditor();
  const [text, setText] = useState(start);
  const area = useRef<HTMLDivElement>(null);
  // Enter then leaving the field applies once, not twice.
  const applied = useRef<string | null>(null);
  const onPick = (h: string) => {
    if (h === applied.current) return;
    applied.current = h;
    pick(h);
  };
  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  useEffect(() => setText(hex), [hex]);

  const fromPointer = (e: ReactPointerEvent) => {
    const r = area.current!.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    const next = { h: hsv.h, s, v };
    setHsv(next);
    return hsvToHex(next.h, next.s, next.v);
  };
  const commitText = () => {
    const h = normalizeHex(text);
    if (!h) return setText(hex);
    setHsv(hexToHsv(h));
    onPick(h);
  };
  return (
    <div className="gk-picker" data-testid={`${name}-picker`}>
      <div
        ref={area}
        className="gk-picker-area"
        aria-label={`${name}: colour area`}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
        onPointerUp={(e) => onPick(fromPointer(e))}
      >
        <span className="gk-picker-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <input
        className="gk-picker-hue"
        type="range"
        min={0}
        max={359}
        aria-label={`${name}: hue`}
        value={Math.round(hsv.h)}
        onChange={(e) => setHsv({ ...hsv, h: Number(e.target.value) })}
        onPointerUp={() => onPick(hex)}
        onKeyUp={(e) => e.key.startsWith("Arrow") && onPick(hex)}
      />
      <div className="gk-picker-row">
        <span className="gk-swatch" style={{ background: hex }} />
        <input
          className="gk-picker-hex"
          aria-label={`${name}: hex colour`}
          data-testid={`${name}-hex`}
          value={text}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            // Enter applies and hands the keys back to the whiteboard (Ctrl+Z
            // then undoes the pick, not the typing).
            if (e.key === "Enter") {
              commitText();
              e.currentTarget.blur();
              editor.focus();
            }
          }}
          onBlur={commitText}
        />
      </div>
    </div>
  );
}
