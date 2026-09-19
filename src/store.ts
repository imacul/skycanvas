import type { SkyDocument } from "./types";

export const starter: SkyDocument = {
  version: 1,
  id: crypto.randomUUID(),
  name: "Untitled design",
  width: 1440,
  height: 900,
  background: "#ffffff",
  nodes: [],
};

export const load = (): SkyDocument => {
  try {
    const raw = localStorage.getItem("skycanvas:document");
    return raw ? (JSON.parse(raw) as SkyDocument) : starter;
  } catch {
    return starter;
  }
};

export const save = (document: SkyDocument) =>
  localStorage.setItem("skycanvas:document", JSON.stringify(document));