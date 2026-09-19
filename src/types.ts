export type SkyPaint =
  | { type: "solid"; color: string; opacity?: number }
  | { type: "linear-gradient"; angle?: number; stops: { offset: number; color: string }[] };

export type SkyNode = {
  id: string;
  type: "frame" | "rect" | "text" | "image" | "svg";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  fill?: string;
  fills?: SkyPaint[];
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right";
  src?: string;
  svg?: string;
  children?: SkyNode[];
  metadata?: Record<string, unknown>;
};

export type SkyDocument = {
  version: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  nodes: SkyNode[];
  metadata?: Record<string, unknown>;
};