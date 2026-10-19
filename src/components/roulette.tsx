import type { RouletteCanvas } from "../types";

export const Roulette = ({
  roulette,
}: {
  roulette: RouletteCanvas;
}) => {
  const { size } = roulette;
  return <canvas ref={roulette.canvasRef} width={size} height={size} />;
};