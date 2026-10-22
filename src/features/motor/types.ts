export type RotationDirection = "clockwise" | "counterclockwise";

export interface Point {
  x: number;
  y: number;
}

export interface Geometry {
  center: Point;
  radius: number;
}
export interface Pie {
  bg: string;
  name: string;
  color: string;
  image?: string | null;
  labelMode?: LabelMode | null;
  hasName?: boolean;
}

export type LabelMode = "wheel" | "win" | "both";

export interface RouletteItem {
  name: string;
  bg?: string;
  color?: string;
  weight?: number;
  image?: string | null;
  labelMode?: LabelMode | null;
  /** Casilla "Inténtalo de nuevo": no consume el ticket y permite girar otra vez. */
  isSpinAgain?: boolean;
}

interface CanvasStyle {
  bg: string;
}
interface ArrowStyle {
  bg: string;
  size: number;
}

interface LabelStyle {
  font: string;
  defaultColor: string;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  offset: number;
}

interface PieTheme {
  bg: string;
  color?: string;
}

interface PieStyle {
  border: boolean;
  borderColor: string;
  borderWidth: number;
  theme: PieTheme[];
}

/** Posición y tamaño de la imagen del premio dentro de su sector. */
export interface ImageStyle {
  /** Distancia del centro, como fracción del radio. */
  offset: number;
  /** Lado máximo de la imagen, como fracción del radio. */
  size: number;
  shadowColor: string;
  shadowBlur: number;
}

export interface StyleOptionDefault {
  canvas: CanvasStyle;
  label: LabelStyle;
  arrow: ArrowStyle;
  pie: PieStyle;
  image: ImageStyle;
}

export interface StyleOption {
  canvas?: Partial<CanvasStyle>;
  label?: Partial<LabelStyle>;
  arrow?: Partial<ArrowStyle>;
  pie?: Partial<PieStyle>;
  image?: Partial<ImageStyle>;
}

export interface RouletteCanvas {
  size: number;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  labelCanvasRef: React.RefObject<HTMLCanvasElement>;
}