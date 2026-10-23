import { useEffect } from "react";
import type { RouletteCanvas } from "../types";

export const Roulette = ({
  roulette,
}: {
  roulette: RouletteCanvas;
}) => {
  const { size, canvasRef } = roulette;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }, [size, canvasRef]);

  return <canvas ref={canvasRef} />;
};