import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Konva from "konva";
import { Image as KImage, Layer, Rect, Stage } from "react-konva";
import { load, save } from "./store";
import type { SkyDocument, SkyNode } from "./types";
import "./style.css";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function imageDimensions(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}

function RasterNode({
  node,
  selected,
  onSelect,
}: {
  node: SkyNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const source = node.src || (node.svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(node.svg) : "");

  useEffect(() => {
    if (!source) return;
    const next = new Image();
    next.onload = () => setImage(next);
    next.src = source;
  }, [source]);

  if (!image) return null;

  return (
    <>
      <KImage
        image={image}
        x={node.x}
        y={node.y}
        width={node.width}
        height={node.height}
        opacity={node.opacity ?? 1}
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect(node.id);
        }}
      />
      {selected ? (
        <Rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          stroke="#746bff"
          strokeWidth={2}
          dash={[7, 5]}
          listening={false}
        />
      ) : null}
    </>
  );
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let result = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(result).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

async function encodeDocument(document: SkyDocument) {
  const input = new TextEncoder().encode(JSON.stringify(document));
  if ("CompressionStream" in window) {
    const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return "gz." + bytesToBase64(compressed);
  }
  return "raw." + bytesToBase64(input);
}

function App() {
  const [doc, setDoc] = useState<SkyDocument>(load);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: innerWidth / 2 - doc.width / 2, y: innerHeight / 2 - doc.height / 2 });
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("Paste a design anywhere");
  const [menu, setMenu] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const pastePoint = useRef<{ x: number; y: number } | null>(null);
  const hasDesign = doc.nodes.length > 0;

  useEffect(() => save(doc), [doc]);

  const centerAll = () => {
    const fit = Math.min(1, (innerWidth - 120) / Math.max(doc.width, 1), (innerHeight - 120) / Math.max(doc.height, 1));
    setScale(fit);
    setPosition({ x: (innerWidth - doc.width * fit) / 2, y: (innerHeight - doc.height * fit) / 2 });
    setNotice("Centered");
  };

  const insertImage = async (src: string, mime: string, clipboardTypes: readonly string[]) => {
    console.log("[SkyCanvas Paste] insertImage", { mime, clipboardTypes, srcLength: src.length });
    const size = await imageDimensions(src);
    const at = pastePoint.current ?? { x: hasDesign ? 40 : 0, y: hasDesign ? 40 : 0 };
    const node: SkyNode = {
      id: crypto.randomUUID(),
      type: "image",
      name: "Pasted design",
      x: at.x,
      y: at.y,
      width: size.width,
      height: size.height,
      src,
      metadata: { mime, source: "clipboard", clipboardTypes: Array.from(clipboardTypes) },
    };
    setDoc((current) => ({
      ...current,
      id: crypto.randomUUID(),
      width: Math.max(current.width, at.x + size.width),
      height: Math.max(current.height, at.y + size.height),
      nodes: [...current.nodes, node],
    }));
    setSelected(node.id);
    pastePoint.current = null;
    setNotice("Figma/design pasted");
    console.log("[SkyCanvas Paste] SUCCESS", node);
  };

  const importText = (text: string) => {
    console.log("[SkyCanvas Paste] attempting structured text", text.slice(0, 2000));
    try {
      const raw = JSON.parse(text);
      const parsed = raw?.skycanvasClipboard === 1 ? raw.document : raw;
      if (parsed?.nodes && parsed?.width && parsed?.height) {
        setDoc({ ...parsed, id: crypto.randomUUID() });
        setSelected(null);
        setNotice(raw?.skycanvasClipboard === 1 ? "Figma design imported" : "Structured design captured");
        console.log("[SkyCanvas Paste] structured import SUCCESS", parsed);
        return true;
      }
    } catch (error) {
      console.warn("[SkyCanvas Paste] text was not SkyCanvas JSON", error);
    }
    return false;
  };

  const readClipboardFallback = async () => {
    console.group("[SkyCanvas Paste] Async Clipboard API");
    console.log("secureContext", window.isSecureContext);
    console.log("hasFocus", document.hasFocus());
    console.log("navigator.clipboard", navigator.clipboard);
    try {
      setNotice("Reading clipboard...");
      const items = await navigator.clipboard.read();
      console.log("item count", items.length);
      for (const [index, item] of items.entries()) {
        console.log("item", index, "types", item.types);
        for (const type of item.types) {
          const blob = await item.getType(type);
          console.log("blob", { index, type, size: blob.size, blobType: blob.type });
          if (type.startsWith("text/")) {
            const text = await blob.text();
            console.log("text preview", type, text.slice(0, 2000));
            if (type === "text/plain" && importText(text)) return;
          }
        }
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const src = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          await insertImage(src, imageType, item.types);
          return;
        }
      }
      const allTypes = items.flatMap((item) => item.types);
      console.warn("[SkyCanvas Paste] no supported async clipboard representation", allTypes);
      setNotice(allTypes.length ? "Clipboard types: " + allTypes.join(", ") : "Clipboard is empty");
    } catch (error) {
      console.error("[SkyCanvas Paste] async clipboard FAILED", error);
      setNotice("Clipboard read failed - see console");
    } finally {
      console.groupEnd();
    }
  };

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      console.group("[SkyCanvas Paste] Native paste event");
      const data = event.clipboardData;
      console.log("event", event);
      console.log("clipboardData", data);
      if (!data) {
        console.error("[SkyCanvas Paste] clipboardData missing");
        console.groupEnd();
        return;
      }

      const types = Array.from(data.types);
      console.log("types", types);
      console.log("items", Array.from(data.items).map((item) => ({ kind: item.kind, type: item.type })));

      const plain = data.getData("text/plain");
      const html = data.getData("text/html");
      const svg = data.getData("image/svg+xml");
      console.log("text/plain preview", plain.slice(0, 2000));
      console.log("text/html preview", html.slice(0, 2000));
      console.log("image/svg+xml preview", svg.slice(0, 2000));

      if (plain && importText(plain)) {
        event.preventDefault();
        console.groupEnd();
        return;
      }

      const imageItem = Array.from(data.items).find((item) => item.type.startsWith("image/"));
      if (imageItem) {
        event.preventDefault();
        const file = imageItem.getAsFile();
        console.log("native image file", file);
        if (file) {
          const src = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          await insertImage(src, file.type || imageItem.type, types);
        }
        console.groupEnd();
        return;
      }

      console.warn("[SkyCanvas Paste] native paste had no supported representation", types);
      setNotice(types.length ? "Clipboard types: " + types.join(", ") : "Nothing pasteable found");
      console.groupEnd();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        console.log("[SkyCanvas Paste] CTRL/CMD+V keydown", {
          key: event.key,
          code: event.code,
          isTrusted: event.isTrusted,
          activeElement: document.activeElement,
        });
        window.setTimeout(readClipboardFallback, 100);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        centerAll();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        event.preventDefault();
        setDoc((current) => ({ ...current, nodes: current.nodes.filter((node) => node.id !== selected) }));
        setSelected(null);
        setNotice("Deleted");
      }
    };

    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  const copyLink = async () => {
    if (!hasDesign) return setNotice("Paste a design first");
    const payload = await encodeDocument(doc);
    await navigator.clipboard.writeText(location.origin + location.pathname + "#design=" + payload);
    setNotice("Design link copied");
    setMenu(null);
  };

  const onWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const mouse = { x: (pointer.x - position.x) / scale, y: (pointer.y - position.y) / scale };
    const next = clamp(scale * Math.pow(1.12, event.evt.deltaY > 0 ? -1 : 1), 0.05, 8);
    setScale(next);
    setPosition({ x: pointer.x - mouse.x * next, y: pointer.y - mouse.y * next });
  };

  const onContextMenu = (event: Konva.KonvaEventObject<PointerEvent>) => {
    event.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    setMenu({
      x: event.evt.clientX,
      y: event.evt.clientY,
      worldX: (pointer.x - position.x) / scale,
      worldY: (pointer.y - position.y) / scale,
    });
  };

  const pasteHere = () => {
    if (!menu) return;
    pastePoint.current = { x: menu.worldX, y: menu.worldY };
    setMenu(null);
    setNotice("Press Ctrl + V to paste here");
  };

  const copyMcp = async () => {
    await navigator.clipboard.writeText(JSON.stringify({
      mcpServers: { skycanvas: { command: "npm", args: ["run", "mcp"], cwd: "/path/to/skycanvas" } },
    }, null, 2));
    setNotice("MCP config copied");
  };

  const zoomLabel = useMemo(() => Math.round(scale * 100) + "%", [scale]);

  return (
    <main className="app" onClick={() => setMenu(null)}>
      <Stage
        ref={stageRef}
        width={innerWidth}
        height={innerHeight}
        draggable
        x={position.x}
        y={position.y}
        scaleX={scale}
        scaleY={scale}
        onClick={(event) => {
          if (event.target === event.target.getStage()) setSelected(null);
        }}
        onDragEnd={(event) => setPosition({ x: event.target.x(), y: event.target.y() })}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      >
        <Layer>
          {hasDesign ? (
            <Rect
              x={-1}
              y={-1}
              width={doc.width + 2}
              height={doc.height + 2}
              fill={doc.background}
              shadowColor="#000"
              shadowBlur={32 / scale}
              shadowOpacity={0.18}
            />
          ) : null}
          {doc.nodes.map((node) => (
            <RasterNode key={node.id} node={node} selected={selected === node.id} onSelect={setSelected} />
          ))}
        </Layer>
      </Stage>

      {!hasDesign ? (
        <div className="empty">
          <div className="mark">S</div>
          <h1>Paste your design</h1>
          <p>Copy a design and press <kbd>Ctrl</kbd> + <kbd>V</kbd></p>
          <small>Right-click anywhere for canvas actions.</small>
        </div>
      ) : null}

      <div className="brand">SKYCANVAS <span>alpha</span></div>
      <div className="controls">
        <button onClick={(event) => { event.stopPropagation(); void copyMcp(); }}><i className="dot" /> MCP</button>
        <button onClick={(event) => { event.stopPropagation(); void copyLink(); }} className="share" disabled={!hasDesign}>Copy design link</button>
      </div>

      {menu ? (
        <div className="context" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <button onClick={pasteHere}>Paste here <kbd>Ctrl V</kbd></button>
          <button onClick={() => void copyLink()} disabled={!hasDesign}>Copy design link</button>
        </div>
      ) : null}

      <div className="status"><span>{notice}</span><b>{zoomLabel}</b></div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
