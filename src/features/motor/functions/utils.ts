import type { Geometry, RotationDirection, RouletteItem } from "../types";

// Ángulo (en grados) hacia donde apunta la flecha visible de la ruleta.
// 90° corresponde a la parte superior de la rueda.
export const POINTER_ANGLE = 90;

export const degreesToCanvasRadians = (degrees: number): number => {
  return ((360 - degrees) * Math.PI) / 180;
};

export const calculateLabelPosition = ({
  geometry,
  segmentStartAngle,
  anglePerSegment,
  labelOffset,
}: {
  geometry: Geometry;
  segmentStartAngle: number;
  anglePerSegment: number;
  labelOffset: number;
}): {
  labelX: number;
  labelY: number;
  labelAngle: number;
} => {
  const startDeg = degreesToCanvasRadians(segmentStartAngle);
  const endDeg = degreesToCanvasRadians(segmentStartAngle + anglePerSegment);

  const labelRadius = geometry.radius * labelOffset;
  const labelAngle = startDeg + (endDeg - startDeg) / 2;

  const labelX = geometry.center.x + labelRadius * Math.cos(labelAngle);
  const labelY = geometry.center.y + labelRadius * Math.sin(labelAngle);

  return {
    labelX,
    labelY,
    labelAngle,
  };
};

// Reparte el círculo en partes iguales: todos los premios ocupan el mismo
// espacio, sin importar su probabilidad.
export const calculateSegmentAngle = (itemCount: number): number =>
  itemCount > 0 ? 360 / itemCount : 0;

// Elige el índice ganador con un sorteo ponderado por `weight` (probabilidad).
// Los pesos <= 0 nunca salen; si todos son <= 0, el reparto es uniforme.
export const pickWeightedIndex = (pieList: RouletteItem[]): number => {
  if (pieList.length === 0) return -1;

  const weights = pieList.map((pie) => {
    const value = pie.weight == null ? 1 : Number(pie.weight);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
  const total = weights.reduce((acc, weight) => acc + weight, 0);

  if (total <= 0) {
    return Math.floor(Math.random() * pieList.length);
  }

  let random = Math.random() * total;
  for (let index = 0; index < pieList.length; index += 1) {
    random -= weights[index];
    if (random < 0) return index;
  }
  return pieList.length - 1;
};

// Índice del sector que queda justo debajo del puntero para una rotación dada.
export const getSegmentIndexAtPointer = ({
  totalRotation,
  itemCount,
  startAngle,
  pointerAngle = POINTER_ANGLE,
}: {
  totalRotation: number;
  itemCount: number;
  startAngle: number;
  pointerAngle?: number;
}): number => {
  if (itemCount <= 0) return -1;

  const anglePerSegment = calculateSegmentAngle(itemCount);
  const relative = totalRotation + startAngle - pointerAngle;
  const normalized = ((relative % 360) + 360) % 360;

  let index = Math.ceil(normalized / anglePerSegment) - 1;
  if (index < 0) index = itemCount - 1;
  if (index >= itemCount) index = 0;
  return index;
};

export const getResultName = ({
  rouletteItemList,
  totalRotation,
  startAngle = 0,
  pointerAngle = POINTER_ANGLE,
}: {
  rouletteItemList: RouletteItem[];
  totalRotation: number;
  startAngle?: number;
  pointerAngle?: number;
}): string => {
  const index = getSegmentIndexAtPointer({
    totalRotation,
    itemCount: rouletteItemList.length,
    startAngle,
    pointerAngle,
  });
  return index >= 0 ? rouletteItemList[index].name : "No Result";
};

// Calcula la rotación final necesaria para que el sector ganador quede debajo
// del puntero, en un punto aleatorio dentro del sector (no siempre el centro).
export const calculateTargetRotation = ({
  currentRotation,
  winnerIndex,
  itemCount,
  rotationDirection,
  startAngle,
  desiredDistance,
  minTurns = 1,
  pointerAngle = POINTER_ANGLE,
  marginRatio = 0.08,
}: {
  currentRotation: number;
  winnerIndex: number;
  itemCount: number;
  rotationDirection: RotationDirection;
  startAngle: number;
  desiredDistance: number;
  minTurns?: number;
  pointerAngle?: number;
  marginRatio?: number;
}): number => {
  const anglePerSegment = calculateSegmentAngle(itemCount);

  // Posición aleatoria dentro del sector ganador: 0 = un borde, 1 = el otro.
  const position = marginRatio + Math.random() * (1 - marginRatio * 2);

  // Rotación (mod 360) que deja el puntero en ese punto del sector ganador.
  const desiredAngle =
    pointerAngle - startAngle + (winnerIndex + 1 - position) * anglePerSegment;
  const desiredMod = ((desiredAngle % 360) + 360) % 360;

  const direction = rotationDirection === "clockwise" ? -1 : 1;
  // Distancia base (0..360) que cumple la congruencia para la dirección dada.
  const baseDistance =
    (((direction * (desiredMod - currentRotation)) % 360) + 360) % 360;

  // Añadimos vueltas completas para conservar la sensación de giro.
  const rawTurns = Math.round((desiredDistance - baseDistance) / 360);
  const turns = Math.max(minTurns, rawTurns);
  const distance = baseDistance + turns * 360;

  return currentRotation + direction * distance;
};

export const setupCanvas = (canvas: HTMLCanvasElement | null) => {
  if (!canvas) throw new Error("Canvas is not available.");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not obtain 2D context from canvas.");

  return {
    canvas,
    context,
  };
};
