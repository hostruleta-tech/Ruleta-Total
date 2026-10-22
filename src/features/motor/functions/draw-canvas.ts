import type { DefaultRouletteOptions } from "../config";
import type {
  Geometry,
  Pie,
  Point,
  RouletteItem,
  StyleOption,
  StyleOptionDefault,
  LabelMode,
} from "../types";

import { isDefaultGreen } from "@/shared/prize-colors";
import { getOrRequestImage } from "./image-cache";
import {
  calculateLabelPosition,
  calculateSegmentAngle,
  degreesToCanvasRadians,
} from "./utils";

/** Texto oscuro de marca para fondos claros (evita el negro puro). */
const DARK_TEXT_COLOR = "#063f43";

const channelLuminance = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (r: number, g: number, b: number) =>
  0.2126 * channelLuminance(r) +
  0.7152 * channelLuminance(g) +
  0.0722 * channelLuminance(b);

const contrastRatio = (first: number, second: number) => {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};

const DARK_TEXT_LUMINANCE = relativeLuminance(0x06, 0x3f, 0x43);

/**
 * Devuelve el color de texto con mayor contraste para un fondo dado.
 * Fondos oscuros → texto blanco; fondos claros → verde oscuro de marca.
 */
const getContrastColor = (background: string): string => {
  const hex = background.trim().replace("#", "");
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return DARK_TEXT_COLOR;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  const luminance = relativeLuminance(r, g, b);
  const contrastWithWhite = contrastRatio(luminance, 1);
  const contrastWithDarkText = contrastRatio(luminance, DARK_TEXT_LUMINANCE);

  return contrastWithDarkText >= contrastWithWhite
    ? DARK_TEXT_COLOR
    : "#FFFFFF";
};

interface ArrowParams {
  context: CanvasRenderingContext2D;
  geometry: Geometry;
  determineAngle: number;
  style: StyleOptionDefault;
}

export const drawArrow = ({
  context,
  geometry,
  determineAngle,
  style,
}: ArrowParams) => {
  const radian = degreesToCanvasRadians(determineAngle);

  const dimension = style.arrow.size;
  // El punto interior de la flecha (la punta)
  const arrowTipX = geometry.center.x + (geometry.radius - dimension) * Math.cos(radian);
  const arrowTipY = geometry.center.y + (geometry.radius - dimension) * Math.sin(radian);

  // El centro de la base de la flecha, en la circunferencia
  const baseCenterX = geometry.center.x + geometry.radius * Math.cos(radian);
  const baseCenterY = geometry.center.y + geometry.radius * Math.sin(radian);

  // Los otros dos vértices de la base del triángulo
  const leftX = baseCenterX - dimension * Math.sin(radian);
  const leftY = baseCenterY + dimension * Math.cos(radian);
  const rightX = baseCenterX + dimension * Math.sin(radian);
  const rightY = baseCenterY - dimension * Math.cos(radian);

  context.beginPath();
  context.moveTo(arrowTipX, arrowTipY);
  context.lineTo(leftX, leftY);
  context.lineTo(rightX, rightY);
  context.closePath();
  context.fillStyle = style.arrow.bg;
  context.fill();
};

/**
 * Info de ancla de la imagen dibujada, para que el label se coloque debajo.
 */
interface ImageAnchor {
  centerX: number;
  centerY: number;
  height: number;
}

const FONT_SIZE_PATTERN = /\d+(?:\.\d+)?px/;

const withFontSize = (font: string, size: number): string =>
  font.replace(FONT_SIZE_PATTERN, `${size}px`);

/**
 * Reparte el texto en líneas que quepan en `maxWidth`. Si sobran palabras,
 * las acumula en la última línea (luego se recorta con elipsis).
 */
const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    const candidate = `${current} ${word}`;
    const isLastAllowedLine = lines.length >= maxLines - 1;
    if (isLastAllowedLine || context.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);

  while (lines.length > maxLines) {
    const overflow = lines.pop() as string;
    lines[lines.length - 1] = `${lines[lines.length - 1]} ${overflow}`;
  }

  return lines;
};

const truncateText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  if (context.measureText(text).width <= maxWidth) return text;

  let truncated = text;
  while (
    truncated.length > 1 &&
    context.measureText(`${truncated}…`).width > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
};

/**
 * Dibuja el nombre del premio. Si vertical=true (solo texto, sin imagen),
 * renderiza cada carácter apilado verticalmente. Si false, horizontal.
 */
const drawPieLabel = ({
  context,
  geometry,
  pie,
  segmentStartAngle,
  anglePerSegment,
  style,
  labelOffset,
  maxLines,
  imageAnchor,
  imgOffset,
  midDeg,
  vertical = false,
}: DrawPieLabel): void => {
  // Siempre posicionar el texto en el centro del sector (labelOffset)
  // independientemente de si hay imagen o no
  const pos = calculateLabelPosition({
    geometry,
    segmentStartAngle,
    anglePerSegment,
    labelOffset,
  });
  const labelX = pos.labelX;
  const labelY = pos.labelY;
  const labelRadius = geometry.radius * labelOffset;

  // Ancho disponible: cuerda del sector en el radio del texto
  const chordHalfAngle = (anglePerSegment * Math.PI) / 360;
  const chordWidth = 2 * labelRadius * Math.sin(chordHalfAngle) * 0.92;
  const maxWidth = Math.max(16, chordWidth);

  const fontSizeMatch = FONT_SIZE_PATTERN.exec(style.label.font);
  const baseSize = fontSizeMatch ? Number.parseFloat(fontSizeMatch[0]) : 16;

  context.save();
  // Texto SIEMPRE horizontal (sin rotación)
  context.setTransform(1, 0, 0, 1, labelX, labelY);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = pie.color;
  context.font = style.label.font;

  // RENDER VERTICAL: solo para premios sin imagen
  if (vertical) {
    const chars = [...pie.name.trim()];
    if (chars.length === 0) {
      context.restore();
      return;
    }

    let fontSize = baseSize;
    const lineHeight = fontSize * 1.15;

    // Reducir tamaño hasta que la altura total quepa en el ancho disponible (chordWidth)
    while (fontSize > 9 && chars.length * fontSize * 1.15 > chordWidth) {
      fontSize = Math.max(9, fontSize - 1);
    }

    context.font = withFontSize(style.label.font, fontSize);
    const finalLineHeight = fontSize * 1.15;
    const firstOffset = -((chars.length - 1) * finalLineHeight) / 2;

    chars.forEach((char, idx) => {
      context.fillText(char, 0, firstOffset + idx * finalLineHeight);
    });

    context.restore();
    return;
  }

  // RENDER HORIZONTAL (original): para premios con imagen
  let fontSize = baseSize;
  let lines = wrapText(context, pie.name, maxWidth, maxLines);

  // Reduce el tamaño hasta que las líneas entren
  if (fontSizeMatch) {
    while (
      fontSize > 9 &&
      lines.some((line) => context.measureText(line).width > maxWidth)
    ) {
      fontSize = Math.max(9, fontSize - 1);
      context.font = withFontSize(style.label.font, fontSize);
      lines = wrapText(context, pie.name, maxWidth, maxLines);
    }
  }

  // Si aun así no cabe, se recorta con elipsis
  lines = lines.map((line) => truncateText(context, line, maxWidth));

  const hLineHeight = fontSize * 1.05;
  const firstLineOffset = -((lines.length - 1) * hLineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, 0, firstLineOffset + index * hLineHeight);
  });

  context.restore();
};

/**
 * Dibuja la imagen del premio ROTADA con el sector y devuelve su ancla.
 * La imagen gira junto con su porción de ruleta (mantiene orientación relativa).
 */
const drawPieImage = ({
  context,
  geometry,
  pie,
  segmentStartAngle,
  anglePerSegment,
  style,
  imageOptions,
}: DrawPieImage): ImageAnchor | null => {
  const image = getOrRequestImage(pie.image);
  if (!image) return null;

  // Usar opciones personalizadas o las del estilo por defecto
  const imgOffset = imageOptions?.offset ?? style.image.offset;
  const imgSize = imageOptions?.size ?? style.image.size;

  // Ángulo central del sector en radianes de canvas (incluye rotación de la ruleta)
  const midDeg = degreesToCanvasRadians(
    segmentStartAngle + anglePerSegment / 2,
  );

  const box = geometry.radius * imgSize;

  // --- Tamaño adaptativo: limitar la caja para que quepa en el sector ---
  const sectorHalfAngleRad = (anglePerSegment / 2) * Math.PI / 180;
  const chordAtCenter = 2 * geometry.radius * imgOffset * Math.sin(sectorHalfAngleRad);
  const maxBox = chordAtCenter * 0.85;
  const clampedBox = Math.min(box, maxBox);
  const finalBox = Math.max(clampedBox, geometry.radius * 0.08);

  const scale = Math.min(
    finalBox / image.naturalWidth,
    finalBox / image.naturalHeight,
  );
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const startDeg = degreesToCanvasRadians(segmentStartAngle);
  const endDeg = degreesToCanvasRadians(segmentStartAngle + anglePerSegment);

  context.save();
  context.beginPath();
  context.moveTo(geometry.center.x, geometry.center.y);
  context.arc(
    geometry.center.x,
    geometry.center.y,
    geometry.radius * 0.99,
    startDeg,
    endDeg,
    true,
  );
  context.closePath();
  context.clip();

  // Imagen SIEMPRE horizontal (sin rotación), posicionada en el centro del sector
  const centerX = geometry.center.x + geometry.radius * imgOffset * Math.cos(midDeg);
  const centerY = geometry.center.y + geometry.radius * imgOffset * Math.sin(midDeg);
  context.setTransform(1, 0, 0, 1, centerX, centerY);
  context.shadowColor = style.image.shadowColor;
  context.shadowBlur = style.image.shadowBlur;
  context.shadowOffsetY = 2;
  context.drawImage(image, -width / 2, -height / 2, width, height);

  context.restore();

  // Devolver posición del centro de la imagen (para compatibilidad)
  return { centerX, centerY, height };
};

export interface DrawPieImage {
  context: CanvasRenderingContext2D;
  geometry: Geometry;
  pie: Pie;
  segmentStartAngle: number;
  anglePerSegment: number;
  style: StyleOptionDefault;
  imageOptions?: { offset: number; size: number };
}

export interface DrawPieLabel {
  context: CanvasRenderingContext2D;
  geometry: Geometry;
  pie: Pie;
  segmentStartAngle: number;
  anglePerSegment: number;
  style: StyleOptionDefault;
  /** Distancia del centro como fracción del radio (0..1). */
  labelOffset: number;
  /** Máximo de líneas del nombre (2 cuando hay imágenes). */
  maxLines: number;
  /** Ancla de la imagen (si existe) para colocar el texto debajo. */
  imageAnchor?: ImageAnchor | null;
  /** Offset radial de la imagen (para aplicar la misma transformación). */
  imgOffset?: number;
  /** Ángulo central del sector en radianes de canvas. */
  midDeg?: number;
  /** Renderizar texto en vertical (solo texto, sin imagen). */
  vertical?: boolean;
}

export interface DrawPie {
  context: CanvasRenderingContext2D;
  geometry: Geometry;
  pie: Pie;
  segmentStartAngle: number;
  anglePerSegment: number;
  style: StyleOption;
}

/** Oscurece un color hex en un porcentaje (0-1). */
const darkenColor = (hex: string, amount: number): string => {
  const c = hex.replace("#", "");
  const [r, g, b] = c.length === 3
    ? c.split("").map((x) => Number.parseInt(x + x, 16))
    : [Number.parseInt(c.slice(0, 2), 16), Number.parseInt(c.slice(2, 4), 16), Number.parseInt(c.slice(4, 6), 16)];
  const f = 1 - amount;
  const to = (v: number) => Math.round(Math.max(0, v * f)).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
};

/**
 * Calcula el factor de oscurecimiento adaptativo según la luminosidad del color.
 * - Colores muy claros (luminancia > 0.8): 15% (muy sutil, evita bordes grisáceos en blancos/amarillos)
 * - Colores claros (luminancia 0.5-0.8): 25%
 * - Colores medios/oscuros (luminancia < 0.5): 35% (efecto 3D completo)
 */
const getAdaptiveDarkenAmount = (hex: string): number => {
  const c = hex.replace("#", "");
  const normalized =
    c.length === 3
      ? c
          .split("")
          .map((char) => char + char)
          .join("")
      : c;

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return 0.35; // fallback
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  // Luminancia relativa (sRGB)
  const channelLuminance = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b);

  // Interpolación: 15% en luminance=1.0 (blanco puro) → 35% en luminance=0
  if (luminance > 0.8) return 0.15;      // Muy claros: blanco, amarillo claro, celeste claro
  if (luminance > 0.5) return 0.25;      // Claros: verde claro, naranja claro, etc.
  return 0.35;                           // Medios/oscuros: efecto 3D completo
};

export const drawPie = ({
  context,
  geometry,
  pie,
  segmentStartAngle,
  anglePerSegment,
  style,
}: DrawPie): void => {
  const startDeg = degreesToCanvasRadians(segmentStartAngle);
  const endDeg = degreesToCanvasRadians(segmentStartAngle + anglePerSegment);

  // Gradiente radial: color original en el centro → versión oscura en el borde (adaptativo)
  const darker = darkenColor(pie.bg, getAdaptiveDarkenAmount(pie.bg));
  const grad = context.createRadialGradient(
    geometry.center.x, geometry.center.y, 0,
    geometry.center.x, geometry.center.y, geometry.radius
  );
  grad.addColorStop(0, pie.bg);
  grad.addColorStop(1, darker);

  context.beginPath();
  context.moveTo(geometry.center.x, geometry.center.y);
  context.fillStyle = grad;
  context.arc(
    geometry.center.x,
    geometry.center.y,
    geometry.radius,
    startDeg,
    endDeg,
    true,
  );
  context.fill();

  if (
    style?.pie?.border === false ||
    style?.pie?.borderWidth == null ||
    style?.pie?.borderColor == null
  ) {
    return;
  }
  // has border - metallic gradient
  const borderWidth = style.pie.borderWidth ?? 1.5;
  // Create metallic gradient from center to edge
  const gradient = context.createLinearGradient(
    geometry.center.x,
    geometry.center.y,
    geometry.center.x + geometry.radius * Math.cos((startDeg + endDeg) / 2),
    geometry.center.y + geometry.radius * Math.sin((startDeg + endDeg) / 2)
  );
  // Metallic gradient: light steel -> mid steel -> dark steel -> highlight
  gradient.addColorStop(0, "#f0f4f7");   // bright highlight (center)
  gradient.addColorStop(0.25, "#c3ccd3"); // light steel
  gradient.addColorStop(0.5, "#7b868f");  // mid steel
  gradient.addColorStop(0.75, "#4a5359"); // dark steel
  gradient.addColorStop(1, "#f0f4f7");    // bright edge highlight

  context.beginPath();
  context.strokeStyle = gradient;
  context.lineWidth = borderWidth;
  context.moveTo(
    geometry.center.x + geometry.radius * Math.cos(startDeg),
    geometry.center.y + geometry.radius * Math.sin(startDeg),
  );
  context.lineTo(geometry.center.x, geometry.center.y);
  context.moveTo(geometry.center.x, geometry.center.y);
  context.lineTo(
    geometry.center.x + geometry.radius * Math.cos(endDeg),
    geometry.center.y + geometry.radius * Math.sin(endDeg),
  );
  context.stroke();
};

export interface DrawRoulette {
  initialAngleOffset: number;
  context: CanvasRenderingContext2D;
  geometry: {
    center: Point;
    radius: number;
  };
  startAngle: number;
  pieList: RouletteItem[];
  style: StyleOptionDefault;
}

/** Opciones de dibujo de imagen por modo de etiqueta. */
interface ImageDrawOptions {
  offset: number;
  size: number;
}

/** Devuelve las opciones de dibujo de imagen según labelMode, si hay imagen y si hay nombre. */
const getImageDrawOptions = (
  labelMode: LabelMode | null | undefined,
  hasImage: boolean,
  hasName: boolean,
): ImageDrawOptions => {
  // Default: offset 0.78, size 0.35 (imagen un 5% más hacia afuera)
  const defaultOffset = 0.78;
  const defaultSize = 0.35;

  // Si no hay nombre: imagen un 5% más hacia afuera
  if (!hasName && hasImage) {
    return { offset: 0.77, size: 0.38 };
  }

  // Modo "win" con imagen: misma posición que sin nombre
  if (labelMode === "win" && hasImage) {
    return { offset: 0.77, size: 0.38 };
  }

  // Modo "wheel" con imagen: un 5% más hacia afuera
  if (labelMode === "wheel" && hasImage) {
    return { offset: 0.67, size: 0.38 };
  }

  // Modo "both" con imagen: default
  return { offset: defaultOffset, size: defaultSize };
};

/** Determina si se debe dibujar el label según labelMode y si hay nombre. */
const shouldDrawLabel = (
  labelMode: LabelMode | null | undefined,
  hasImage: boolean,
  hasName: boolean,
): boolean => {
  // Si no hay nombre, nunca dibujar label
  if (!hasName) return false;

  switch (labelMode) {
    case "wheel":
      return true; // Siempre mostrar en la ruleta
    case "win":
      return !hasImage; // Solo mostrar si NO hay imagen (fallback)
    case "both":
    default:
      return true; // Mostrar siempre (comportamiento original)
  }
};

export const drawRoulette = ({
  initialAngleOffset,
  context,
  startAngle,
  geometry,
  pieList,
  style,
}: DrawRoulette) => {
  const itemCount = pieList.length;
  if (itemCount === 0) return;

  // Todos los sectores son iguales: la probabilidad no modifica su tamaño.
  const anglePerSegment = calculateSegmentAngle(itemCount);
  let segmentEndAngle = (initialAngleOffset % 360) + startAngle;

  const resolvedPieList = pieList.map((pie, index) => {
    const theme = style.pie.theme[index % style.pie.theme.length];
    const bg = pie.bg || theme.bg;

    const segmentStartAngle = (segmentEndAngle - anglePerSegment + 360) % 360;
    segmentEndAngle = segmentStartAngle;

    const hasName = Boolean(pie.name && pie.name.trim());

    return {
      name: pie.name,
      bg,
      image: pie.image ?? null,
      labelMode: pie.labelMode ?? "both",
      hasName,
      // Los verdes de la paleta por defecto siempre llevan texto blanco;
      // cualquier otro fondo se resuelve con auto-contraste.
      color: pie.color || (isDefaultGreen(bg) ? "#FFFFFF" : getContrastColor(bg)),
      segmentStartAngle,
    };
  });

  // PASO 1: Dibujar todos los sectores (fondos + bordes internos)
  for (const pie of resolvedPieList) {
    drawPie({
      context,
      geometry,
      pie,
      segmentStartAngle: pie.segmentStartAngle,
      anglePerSegment,
      style,
    });
  }

  // PASO 2: Dibujar todas las imágenes y capturar sus anclas + params de rotación
  // Usando opciones de posición/tamaño según labelMode y si hay nombre
  // Keyed por índice para soportar nombres vacíos/duplicados
  const imageAnchors = new Map<number, ImageAnchor | null>();
  const imageParams = new Map<number, { imgOffset: number; midDeg: number }>();
  resolvedPieList.forEach((pie, index) => {
    if (pie.image) {
      const imageOpts = getImageDrawOptions(pie.labelMode, true, pie.hasName);
      const imgOffset = imageOpts.offset;
      const midDeg = degreesToCanvasRadians(pie.segmentStartAngle + anglePerSegment / 2);
      const anchor = drawPieImage({
        context,
        geometry,
        pie,
        segmentStartAngle: pie.segmentStartAngle,
        anglePerSegment,
        style,
        imageOptions: imageOpts,
      });
      imageAnchors.set(index, anchor);
      imageParams.set(index, { imgOffset, midDeg });
    } else {
      imageAnchors.set(index, null);
      // Para labels sin imagen, también calculamos midDeg para rotar el texto
      const midDeg = degreesToCanvasRadians(pie.segmentStartAngle + anglePerSegment / 2);
      imageParams.set(index, { imgOffset: style.label.offset, midDeg });
    }
  });

  // PASO 3: Dibujar todos los textos encima de todo (sectores + imágenes)
  // Usando la ancla de la imagen (si existe) para colocar el texto debajo.
  // Solo dibujar label si shouldDrawLabel lo permite.
  // Cada premio usa su propio labelOffset/maxLines según si TIENE imagen.
  resolvedPieList.forEach((pie, index) => {
    if (!shouldDrawLabel(pie.labelMode, Boolean(pie.image), pie.hasName)) {
      return;
    }
    const hasImage = Boolean(pie.image);
    const labelOffset = hasImage
      ? Math.min(style.label.offset, 0.51)
      : style.label.offset;
    const labelMaxLines = hasImage ? 2 : 1;
    const imageAnchor = imageAnchors.get(index) ?? null;
    const params = imageParams.get(index) ?? { imgOffset: style.label.offset, midDeg: degreesToCanvasRadians(pie.segmentStartAngle + anglePerSegment / 2) };
    drawPieLabel({
      context,
      geometry,
      pie,
      segmentStartAngle: pie.segmentStartAngle,
      anglePerSegment,
      style,
      labelOffset,
      maxLines: labelMaxLines,
      imageAnchor,
      imgOffset: params.imgOffset,
      midDeg: params.midDeg,
      vertical: !hasImage,
    });
  });

  // has border - borde exterior metálico
  if (
    style?.pie?.border === false ||
    style?.pie?.borderWidth == null ||
    style?.pie?.borderColor == null
  ) {
    return;
  }

  const lineWidth = style.pie.borderWidth ?? 1.5;
  // Outer circle border with metallic gradient
  const outerGradient = context.createLinearGradient(
    geometry.center.x - geometry.radius,
    geometry.center.y - geometry.radius,
    geometry.center.x + geometry.radius,
    geometry.center.y + geometry.radius
  );
  outerGradient.addColorStop(0, "#f0f4f7");   // top-left highlight
  outerGradient.addColorStop(0.25, "#c3ccd3"); // light steel
  outerGradient.addColorStop(0.5, "#7b868f");  // mid steel
  outerGradient.addColorStop(0.75, "#39424a"); // dark steel
  outerGradient.addColorStop(1, "#f0f4f7");    // bottom-right highlight

  context.beginPath();
  context.strokeStyle = outerGradient;
  context.lineWidth = lineWidth;
  context.arc(
    geometry.center.x,
    geometry.center.y,
    geometry.radius - lineWidth / 2,
    0,
    Math.PI * 2,
    true,
  );
  context.stroke();
};

interface DrawCanvas {
  rouletteItemList: RouletteItem[];
  mergedOptions: DefaultRouletteOptions;
  context: CanvasRenderingContext2D;
  geometry: {
    center: {
      x: number;
      y: number;
    };
    radius: number;
  };
  rouletteRef: React.MutableRefObject<{
    speed: number;
    totalRotation: number;
  }>;
}

// Dibuja solo el contenido (sectores + imágenes) en el canvas principal
export const drawRouletteContent = ({
  initialAngleOffset,
  context,
  startAngle,
  geometry,
  pieList,
  style,
}: DrawRoulette) => {
  const itemCount = pieList.length;
  if (itemCount === 0) return;

  const anglePerSegment = calculateSegmentAngle(itemCount);
  let segmentEndAngle = (initialAngleOffset % 360) + startAngle;

  const resolvedPieList = pieList.map((pie, index) => {
    const theme = style.pie.theme[index % style.pie.theme.length];
    const bg = pie.bg || theme.bg;

    const segmentStartAngle = (segmentEndAngle - anglePerSegment + 360) % 360;
    segmentEndAngle = segmentStartAngle;

    const hasName = Boolean(pie.name && pie.name.trim());

    return {
      name: pie.name,
      bg,
      image: pie.image ?? null,
      labelMode: pie.labelMode ?? "both",
      hasName,
      color: pie.color || (isDefaultGreen(bg) ? "#FFFFFF" : getContrastColor(bg)),
      segmentStartAngle,
    };
  });

  // PASO 1: Dibujar todos los sectores (fondos + bordes internos)
  for (const pie of resolvedPieList) {
    drawPie({
      context,
      geometry,
      pie,
      segmentStartAngle: pie.segmentStartAngle,
      anglePerSegment,
      style,
    });
  }

  // PASO 2: Dibujar todos los textos (encima de sectores, debajo de imágenes)
  resolvedPieList.forEach((pie) => {
    if (!shouldDrawLabel(pie.labelMode, Boolean(pie.image), pie.hasName)) {
      return;
    }
    const hasImage = Boolean(pie.image);
    const labelOffset = hasImage
      ? Math.min(style.label.offset, 0.51)
      : style.label.offset;
    const labelMaxLines = hasImage ? 2 : 1;
    drawPieLabel({
      context,
      geometry,
      pie,
      segmentStartAngle: pie.segmentStartAngle,
      anglePerSegment,
      style,
      labelOffset,
      maxLines: labelMaxLines,
      imageAnchor: null,
      imgOffset: style.label.offset,
      midDeg: 0,
      vertical: !hasImage,
    });
  });

  // PASO 3: Dibujar todas las imágenes (ENCIMA de los textos)
  resolvedPieList.forEach((pie, index) => {
    if (pie.image) {
      const imageOpts = getImageDrawOptions(pie.labelMode, true, pie.hasName);
      drawPieImage({
        context,
        geometry,
        pie,
        segmentStartAngle: pie.segmentStartAngle,
        anglePerSegment,
        style,
        imageOptions: imageOpts,
      });
    }
  });

  // has border - borde exterior metálico
  if (
    style?.pie?.border === false ||
    style?.pie?.borderWidth == null ||
    style?.pie?.borderColor == null
  ) {
    return;
  }

  const lineWidth = style.pie.borderWidth ?? 1.5;
  const outerGradient = context.createLinearGradient(
    geometry.center.x - geometry.radius,
    geometry.center.y - geometry.radius,
    geometry.center.x + geometry.radius,
    geometry.center.y + geometry.radius
  );
  outerGradient.addColorStop(0, "#f0f4f7");
  outerGradient.addColorStop(0.25, "#c3ccd3");
  outerGradient.addColorStop(0.5, "#7b868f");
  outerGradient.addColorStop(0.75, "#39424a");
  outerGradient.addColorStop(1, "#f0f4f7");

  context.beginPath();
  context.strokeStyle = outerGradient;
  context.lineWidth = lineWidth;
  context.arc(
    geometry.center.x,
    geometry.center.y,
    geometry.radius - lineWidth / 2,
    0,
    Math.PI * 2,
    true,
  );
  context.stroke();
};

export const drawCanvas = ({
  rouletteItemList,
  mergedOptions,
  context,
  geometry,
  rouletteRef,
}: DrawCanvas) => {
  // Canvas único: fondo + sectores + textos + imágenes + flecha
  context.beginPath();
  context.fillStyle = mergedOptions.style.canvas.bg;
  context.fillRect(0, 0, geometry.radius * 2, geometry.radius * 2);

  drawRouletteContent({
    pieList: rouletteItemList,
    initialAngleOffset: rouletteRef.current.totalRotation,
    startAngle: mergedOptions.determineAngle,
    style: mergedOptions.style,
    context,
    geometry,
  });

  if (mergedOptions.showArrow) {
    drawArrow({
      context,
      style: mergedOptions.style,
      geometry,
      determineAngle: mergedOptions.determineAngle,
    });
  }
};