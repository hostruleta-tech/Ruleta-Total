import type { RouletteCanvas } from "../types";

export const Roulette = ({
  roulette,
}: {
  roulette: RouletteCanvas;
}) => {
  const { size } = roulette;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
      }}
    >
      <canvas ref={roulette.canvasRef} width={size} height={size} />
      <canvas
        ref={roulette.labelCanvasRef}
        width={size}
        height={size}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
};