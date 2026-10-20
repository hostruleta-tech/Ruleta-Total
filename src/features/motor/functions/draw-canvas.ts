import type { DefaultRouletteOptions } from "../config";
import type {
  Geometry,
  Pie,
  Point,
  RouletteItem,
  StyleOption,
  StyleOptionDefault,
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
 * Dibuja el nombre del premio pegado a su sector: la palabra gira con la rueda
 * y sigue el arco (orientación tangencial). Así, cuando el sector queda bajo la
 * flecha superior el texto se lee horizontal, y en la parte inferior aparece
 * boca abajo, como en una ruleta física.
 * Si hay imágenes, el nombre se dibuja más cerca del centro y admite hasta dos
 * líneas, reduciendo el tamaño de fuente hasta que entre.
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
}: DrawPieLabel): void => {
  const { labelX, labelY, labelAngle } = calculateLabelPosition({
    geometry,
    segmentStartAngle,
    anglePerSegment,
    labelOffset,
  });

  // Ancho disponible: el arco del sector en el radio de la etiqueta. La palabra
  // corre en dirección tangencial, es decir, a lo largo de ese arco.
  const labelRadius = geometry.radius * labelOffset;
  const arcWidth = labelRadius * ((anglePerSegment * Math.PI) / 180) * 0.92;
  const maxWidth = Math.max(16, arcWidth);

  const fontSizeMatch = FONT_SIZE_PATTERN.exec(style.label.font);
  const baseSize = fontSizeMatch ? Number.parseFloat(fontSizeMatch[0]) : 16;

  context.save();
  // Matriz fijada desde cero y giro tangencial (+90° sobre el ángulo del
  // sector): el texto queda anclado a su porción y gira con la rueda.
  context.setTransform(1, 0, 0, 1, labelX, labelY);
  context.rotate(labelAngle + Math.PI / 2);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = pie.color;
  context.font = style.label.font;

  let fontSize = baseSize;
  let lines = wrapText(context, pie.name, maxWidth, maxLines);

  // Reduce el tamaño hasta que las líneas entren (sin deformar el texto).
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

  // Si aun así no cabe (nombre muy largo), se recorta con elipsis.
  lines = lines.map((line) => truncateText(context, line, maxWidth));

  const lineHeight = fontSize * 1.05;
  const firstLineOffset = -((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, 0, firstLineOffset + index * lineHeight);
  });

  context.restore();
};

export interface DrawPieImage {
  context: CanvasRenderingContext2D;
  geometry: Geometry;
  pie: Pie;
  segmentStartAngle: number;
  anglePerSegment: number;
  style: StyleOptionDefault;
}

/**
 * Dibuja la imagen del premio dentro de su sector, tangencial a la rueda y
 * recortada al triángulo para que no invada los sectores vecinos.
 */
const drawPieImage = ({
  context,
  geometry,
  pie,
  segmentStartAngle,
  anglePerSegment,
  style,
}: DrawPieImage): void => {
  const image = getOrRequestImage(pie.image);
  if (!image) return;

  const midDeg = degreesToCanvasRadians(
    segmentStartAngle + anglePerSegment / 2,
  );
  const centerX =
    geometry.center.x + geometry.radius * style.image.offset * Math.cos(midDeg);
  const centerY =
    geometry.center.y + geometry.radius * style.image.offset * Math.sin(midDeg);

  const box = geometry.radius * style.image.size;
  const scale = Math.min(
    box / image.naturalWidth,
    box / image.naturalHeight,
  );
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return;
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

  context.setTransform(1, 0, 0, 1, centerX, centerY);
  context.rotate(midDeg + Math.PI / 2);
  context.shadowColor = style.image.shadowColor;
  context.shadowBlur = style.image.shadowBlur;
  context.shadowOffsetY = 2;
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
};

export interface DrawPie {
  context: CanvasRenderingContext2D;
  geometry: Geometry;
  pie: Pie;
  segmentStartAngle: number;
  anglePerSegment: number;
  style: StyleOption;
}

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
  context.beginPath();
  context.moveTo(geometry.center.x, geometry.center.y);
  context.fillStyle = pie.bg;
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
  // has border
  context.beginPath();
  context.strokeStyle = style.pie.borderColor;
  context.lineWidth = style.pie.borderWidth;
  context.moveTo(geometry.center.x, geometry.center.y);
  context.lineTo(
    geometry.center.x + geometry.radius * Math.cos(startDeg),
    geometry.center.y + geometry.radius * Math.sin(startDeg),
  );
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

    return {
      name: pie.name,
      bg,
      image: pie.image ?? null,
      // Los verdes de la paleta por defecto siempre llevan texto blanco;
      // cualquier otro fondo se resuelve con auto-contraste.
      color: pie.color || (isDefaultGreen(bg) ? "#FFFFFF" : getContrastColor(bg)),
    };
  });

  // Con imágenes, el nombre se acerca al centro (para dejar sitio a la imagen)
  // y admite dos líneas. Sin imágenes se conserva el diseño original.
  const hasImages = resolvedPieList.some((pie) => Boolean(pie.image));
  const labelOffset = hasImages
    ? Math.min(style.label.offset, 0.58)
    : style.label.offset;
  const labelMaxLines = hasImages ? 2 : 1;

  for (const pie of resolvedPieList) {
    const segmentStartAngle = (segmentEndAngle - anglePerSegment + 360) % 360;
    drawPie({
      context,
      geometry,
      pie,
      segmentStartAngle,
      anglePerSegment,
      style,
    });
    drawPieImage({
      context,
      geometry,
      pie,
      segmentStartAngle,
      anglePerSegment,
      style,
    });
    drawPieLabel({
      context,
      geometry,
      pie,
      segmentStartAngle,
      anglePerSegment,
      style,
      labelOffset,
      maxLines: labelMaxLines,
    });
    segmentEndAngle = segmentStartAngle;
  }

  // has border

  if (
    style?.pie?.border === false ||
    style?.pie?.borderWidth == null ||
    style?.pie?.borderColor == null
  ) {
    return;
  }

  const lineWidth = style.pie.borderWidth;
  context.beginPath();
  context.strokeStyle = style.pie.borderColor;
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

export const drawCanvas = ({
  rouletteItemList,
  mergedOptions,
  context,
  geometry,
  rouletteRef,
}: DrawCanvas) => {
  context.beginPath();
  context.fillStyle = mergedOptions.style.canvas.bg;
  context.fillRect(0, 0, geometry.radius * 2, geometry.radius * 2);

  drawRoulette({
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