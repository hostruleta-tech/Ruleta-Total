import type { RotationDirection, StyleOption, StyleOptionDefault } from "./types";

export interface RouletteOptions {
  size: number;
  initialAngle: number;
  rotationDirection: RotationDirection;
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  // Duración de la fase de giro a velocidad máxima antes de empezar a frenar.
  spinDuration: number;
  // Duración del frenado en milisegundos (a mayor valor, más suave y lento).
  stopDuration: number;
  determineAngle: number;
  showArrow: boolean;
  style: StyleOption;
}

export interface DefaultRouletteOptions extends RouletteOptions {
  style: StyleOptionDefault;
}

// default color theming by tailwindcss (https://tailwindcss.com/docs/customizing-colors)
export const defaultOptions: DefaultRouletteOptions = {
  size: 400,
  maxSpeed: 100,
  rotationDirection: "clockwise",
  acceleration: 1,
  deceleration: 1,
  spinDuration: 2500,
  stopDuration: 6500,
  initialAngle: 0,
  determineAngle: 45,
  showArrow: true,
  style: {
    canvas: {
      bg: "#fff",
    },
    arrow: {
      bg: "#E31821",
      size: 18,
    },
    label: {
      font: "800 20px Arial",
      align: "center",
      baseline: "middle",
      offset: 0.63,
      defaultColor: "#FFFFFF",
    },
    pie: {
      border: true,
      borderColor: "#e2e8f0",
      borderWidth: 1.5,
      theme: [
        {
          bg: "#007B85",
          color: "#FFFFFF",
        },
        {
          bg: "#E31821",
          color: "#FFFFFF",
        },
        {
          bg: "#022B30",
          color: "#FFFFFF",
        },
        {
          bg: "#FFFFFF",
          color: "#022B30",
        },
      ],
    },
    image: {
      offset: 0.78,
      size: 0.36,
      shadowColor: "rgba(0,0,0,0.35)",
      shadowBlur: 6,
    },
  },
} as const;