import type { DefaultRouletteOptions } from "../config";
import type {
  Geometry,
  Pie,
  Point,
  RouletteItem,
  StyleOption,
  StyleOptionDefault,
} from "../types";

import {
  calculateLabelPosition,
  calculateTotalWeight,
  degreesToCanvasRadians,
} from "./utils";
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
}

const FONT_SIZE_PATTERN = /\d+(?:\.\d+)?px/;

/**
 * Dibuja el nombre del premio SIEMPRE en horizontal (sin rotación), de forma
 * que cuando el segmento quede bajo la flecha superior el texto se lea derecho.
 * Si el nombre no cabe en el ancho del segmento, se reduce el tamaño de fuente
 * (sin deformar el texto) hasta que entre.
 */
const drawPieLabel = ({
  context,
  geometry,
  pie,
  segmentStartAngle,
  anglePerSegment,
  style,
}: DrawPieLabel): void => {
  const { labelX, labelY } = calculateLabelPosition({
    geometry,
    segmentStartAngle,
    anglePerSegment,
    labelOffset: style.label.offset,
  });

  // Ancho disponible: el menor entre el arco del segmento en ese radio y la
  // distancia radial hasta el borde de la rueda (para no salirse del círculo).
  const labelRadius = geometry.radius * style.label.offset;
  const arcWidth =
    labelRadius * ((anglePerSegment * Math.PI) / 180) * 0.92;
  const radialWidth = 2 * (geometry.radius * 0.985 - labelRadius);
  const maxWidth = Math.max(16, Math.min(arcWidth, radialWidth));

  context.save();
  context.translate(labelX, labelY);
  context.textAlign = "center";
  context.textBaseline = style.label.baseline;
  context.fillStyle = pie.color;

  context.font = style.label.font;
  const fontSizeMatch = FONT_SIZE_PATTERN.exec(style.label.font);
  if (fontSizeMatch) {
    const baseSize = Number.parseFloat(fontSizeMatch[0]);
    const textWidth = context.measureText(pie.name).width;
    if (textWidth > maxWidth) {
      const fittedSize = Math.max(9, Math.floor((maxWidth / textWidth) * baseSize));
      context.font = style.label.font.replace(
        FONT_SIZE_PATTERN,
        `${fittedSize}px`,
      );
    }
  }

  context.fillText(pie.name, 0, 0);
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
  const weightCount = calculateTotalWeight(pieList);
  const anglePerWeight = 360 / weightCount;
  let segmentEndAngle = (initialAngleOffset % 360) + startAngle;

  const resolvedPieList = pieList.map((pie, index) => {
    const bg = pie.bg || style.pie.theme[index % style.pie.theme.length].bg;
    const color =
      pie.color ||
      style.pie.theme[index % style.pie.theme.length].color ||
      style.label.defaultColor;

    const weight = pie.weight || 1;
    const anglePerSegment = anglePerWeight * weight;

    return {
      name: pie.name,
      bg,
      color,
      weight,
      anglePerWeight,
      anglePerSegment,
    };
  });

  for (const pie of resolvedPieList) {
    const anglePerSegment = anglePerWeight * pie.weight;
    const segmentStartAngle = (segmentEndAngle - anglePerSegment + 360) % 360;
    drawPie({
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