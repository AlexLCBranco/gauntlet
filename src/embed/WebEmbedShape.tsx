import { useEffect } from "react";
import {
  atom,
  BaseBoxShapeUtil,
  createShapeId,
  DEFAULT_EMBED_DEFINITIONS,
  getEmbedInfo,
  HTMLContainer,
  react,
  T,
  useEditor,
  useIsEditing,
  useValue,
  type Editor,
  type RecordProps,
  type TLShape,
  type TLShapeId,
} from "tldraw";

import { pageBox } from "../pages/keepFilled";
import { insideDelta, SHEET } from "../pages/sheet";
import "./embed.css";

export const WEB_EMBED_TYPE = "web-embed";

/** "loading" until the preview comes back; then whether the site lets
    itself be shown inside a page ("unknown": it couldn't be read). */
export type Frameable = "loading" | "yes" | "no" | "unknown";

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [WEB_EMBED_TYPE]: {
      w: number;
      h: number;
      /** The address as given (pasted or typed). */
      url: string;
      /** The preview (api/unfurl.js): the page's title, picture, site. */
      title: string;
      image: string;
      site: string;
      frameable: string;
    };
  }
}

export type WebEmbedShape = TLShape<typeof WEB_EMBED_TYPE>;

/** Embeds showing the live site. In memory only: a reload, or leaving the
    page, brings back the preview (owner: the live site loads only after a
    click into it). */
const live = atom<ReadonlySet<TLShapeId>>("live web embeds", new Set());

/** What the frame shows: a known service's own embed address (YouTube,
    Figma, ... as tldraw knows them), else the address itself. */
export function frameAddress(url: string): string {
  return getEmbedInfo(DEFAULT_EMBED_DEFINITIONS, url)?.embedUrl ?? url;
}

/** An address as typed: "example.com" means https://example.com. Null when
    it isn't a web address. */
export function normalizeAddress(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    const web = u.protocol === "http:" || u.protocol === "https:";
    return web && (u.hostname.includes(".") || u.hostname === "localhost") ? u.href : null;
  } catch {
    return null;
  }
}

const fetching = new Set<TLShapeId>();

/** Asks this site's /api/unfurl for the preview and puts it on the shape
    (not an undo step of its own: it belongs to the paste). */
async function fetchPreview(editor: Editor, id: TLShapeId) {
  const shape = editor.getShape<WebEmbedShape>(id);
  if (!shape || fetching.has(id)) return;
  fetching.add(id);
  try {
    const res = await fetch(`/api/unfurl?url=${encodeURIComponent(shape.props.url)}`);
    const p = (await res.json()) as { title?: string; image?: string; site?: string; frameable?: string };
    const now = editor.getShape<WebEmbedShape>(id);
    if (!now) return;
    editor.run(
      () =>
        editor.updateShape<WebEmbedShape>({
          id,
          type: WEB_EMBED_TYPE,
          props: { title: p.title ?? "", image: p.image ?? "", site: p.site ?? new URL(now.props.url).hostname, frameable: p.frameable ?? "unknown" },
        }),
      { history: "ignore" },
    );
  } catch {
    const now = editor.getShape<WebEmbedShape>(id);
    if (now) editor.run(() => editor.updateShape<WebEmbedShape>({ id, type: WEB_EMBED_TYPE, props: { frameable: "unknown" } }), { history: "ignore" });
  } finally {
    fetching.delete(id);
  }
}

/** A web embed for `url`, centred on `at` (the middle of the view when not
    given), kept inside the page, selected; its preview follows. One undo
    step. */
export function addWebEmbed(editor: Editor, url: string, at?: { x: number; y: number }) {
  const { w, h } = editor.getShapeUtil<WebEmbedShape>(WEB_EMBED_TYPE).getDefaultProps();
  const c = at ?? editor.getViewportPageBounds().center;
  const box = { x: c.x - w / 2, y: c.y - h / 2, w, h };
  const d = insideDelta(box, pageBox.get() ?? SHEET);
  const id = createShapeId();
  editor.markHistoryStoppingPoint("add web embed");
  editor.createShape<WebEmbedShape>({ id, type: WEB_EMBED_TYPE, x: box.x + d.x, y: box.y + d.y, props: { url } });
  editor.setCurrentTool("select");
  editor.select(id);
  void fetchPreview(editor, id);
  return id;
}

/**
 * A web page on the whiteboard (owner, toolbar rework step 4): first a
 * static preview (picture, title, site), and the live site only after a
 * click on "Load site"; then it's interactive while edited (double-click
 * it again later, as tldraw's embeds). A site that won't be shown inside
 * another page gets "Open in new tab" instead. Only the current page's
 * shapes are drawn at all, so an embed on another page never loads.
 */
export class WebEmbedShapeUtil extends BaseBoxShapeUtil<WebEmbedShape> {
  static override type = WEB_EMBED_TYPE;
  static override props: RecordProps<WebEmbedShape> = {
    w: T.number,
    h: T.number,
    url: T.string,
    title: T.string,
    image: T.string,
    site: T.string,
    frameable: T.string,
  };

  override getDefaultProps(): WebEmbedShape["props"] {
    return { w: 480, h: 300, url: "", title: "", image: "", site: "", frameable: "loading" };
  }
  override canEdit() {
    return true;
  }
  override component(shape: WebEmbedShape) {
    return <WebEmbed shape={shape} />;
  }
  override getIndicatorPath(shape: WebEmbedShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}

function WebEmbed({ shape }: { shape: WebEmbedShape }) {
  const editor = useEditor();
  const editing = useIsEditing(shape.id);
  const isLive = useValue("embed live", () => live.get().has(shape.id), [shape.id]);
  const { url, title, image, site, frameable, w, h } = shape.props;
  // A preview cut off by a reload is asked for again.
  useEffect(() => {
    if (frameable === "loading") void fetchPreview(editor, shape.id);
  }, [editor, shape.id, frameable]);

  // The buttons take their own clicks, not tldraw.
  const own = { onPointerDown: (e: React.PointerEvent) => editor.markEventAsHandled(e) };
  const load = () => {
    live.set(new Set([...live.get(), shape.id]));
    editor.select(shape.id);
    editor.setEditingShape(shape.id);
  };
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  return (
    <HTMLContainer className="gk-embed" style={{ width: w, height: h }} data-testid="web-embed" data-state={isLive ? "live" : "preview"} data-url={url}>
      {isLive && frameable !== "no" ? (
        <iframe
          className="gk-embed__frame"
          data-testid="web-embed-frame"
          src={frameAddress(url)}
          title={title || host}
          style={{ pointerEvents: editing ? "auto" : "none" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="fullscreen; clipboard-write"
        />
      ) : (
        <div className="gk-embed__card">
          {image ? <img className="gk-embed__image" src={image} alt="" referrerPolicy="no-referrer" draggable={false} /> : <div className="gk-embed__image gk-embed__image--none" />}
          <div className="gk-embed__text">
            <div className="gk-embed__title" data-testid="web-embed-title">
              {frameable === "loading" ? "Getting the preview…" : title || host}
            </div>
            <div className="gk-embed__site">{site || host}</div>
          </div>
          <div className="gk-embed__actions">
            {frameable === "no" ? (
              <>
                <span className="gk-embed__note">This site can't be shown inside a page.</span>
                <a className="gk-embed__button" data-testid="web-embed-open" href={url} target="_blank" rel="noopener noreferrer" {...own}>
                  Open in new tab
                </a>
              </>
            ) : (
              <button type="button" className="gk-embed__button" data-testid="web-embed-load" disabled={frameable === "loading"} {...own} onClick={load}>
                Load site
              </button>
            )}
          </div>
        </div>
      )}
    </HTMLContainer>
  );
}

/** Pasting a web address makes a web embed where the pointer is (as a
    pasted screenshot makes a picture); leaving the page puts every live
    embed back to its preview. */
export function webEmbeds(editor: Editor): () => void {
  editor.registerExternalContentHandler("url", async ({ url, point }) => {
    const address = normalizeAddress(url);
    if (address) addWebEmbed(editor, address, point ?? editor.inputs.getCurrentPagePoint());
  });
  let page = editor.getCurrentPageId();
  const stop = react("web embeds off on leaving the page", () => {
    const now = editor.getCurrentPageId();
    if (now !== page) {
      page = now;
      if (live.get().size) live.set(new Set());
    }
  });
  return () => {
    stop();
    live.set(new Set());
  };
}
