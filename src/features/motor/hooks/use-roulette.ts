import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type RouletteOptions, defaultOptions } from "../config";
import { animateRoulette } from "../functions/animation-roulette";
import { drawCanvas } from "../functions/draw-canvas";
import { setupCanvas } from "../functions/utils";
import type { RouletteCanvas, RouletteItem } from "../types";

export const useRoulette = ({
  items,
  onSpinUp,
  onSpinDown,
  onSpinEnd,
  options = {},
}: {
  items: RouletteItem[];
  onSpinUp?: () => void;
  onSpinDown?: () => void;
  onSpinEnd?: (result: string) => void;
  options?: Partial<RouletteOptions>;
}): {
  roulette: RouletteCanvas;
  result: string;
  onStart: () => void;
  onStop: () => void;
} => {
  const mergedOptions = useMemo(() => {
    return {
      ...defaultOptions,
      ...options,
      style: {
        canvas: {
          ...defaultOptions.style.canvas,
          ...options.style?.canvas,
        },
        label: {
          ...defaultOptions.style.label,
          ...options.style?.label,
        },
        arrow: {
          ...defaultOptions.style.arrow,
          ...options.style?.arrow,
        },
        pie: {
          ...defaultOptions.style.pie,
          ...options.style?.pie,
          theme: [
            ...(options.style?.pie?.theme || defaultOptions.style.pie.theme),
          ],
        },
      },
    };
  }, [options]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rouletteRef = useRef<{
    speed: number;
    totalRotation: number;
  }>({
    speed: 0,
    totalRotation: mergedOptions.initialAngle,
  });
  const resultRef = useRef<string>("");

  const geometry = useMemo(() => {
    const half = mergedOptions.size / 2;
    return {
      radius: half,
      center: {
        x: half,
        y: half,
      },
    };
  }, [mergedOptions]);

  // Mantiene los datos más recientes en refs para que la animación no se
  // reinicie (ni vuelva a sortear el premio) cuando el componente se renderiza
  // de nuevo, por ejemplo al refrescar los premios mientras la ruleta gira.
  const itemsRef = useRef(items);
  const mergedOptionsRef = useRef(mergedOptions);
  const geometryRef = useRef(geometry);
  const callbacksRef = useRef({ onSpinUp, onSpinDown, onSpinEnd });

  useEffect(() => {
    itemsRef.current = items;
    mergedOptionsRef.current = mergedOptions;
    geometryRef.current = geometry;
    callbacksRef.current = { onSpinUp, onSpinDown, onSpinEnd };
  });

  const [status, setStatus] = useState<"stop" | "running" | "ending">("stop");

  const onStart = useCallback(() => {
    if (status !== "stop") return;
    setStatus("running");
  }, [status]);

  const onStop = useCallback(() => {
    if (status !== "running") return;
    setStatus("ending");
  }, [status]);

  useEffect(() => {
    if (status !== "stop") return;

    let cancelled = false;

    const render = () => {
      if (cancelled) return;
      const { context } = setupCanvas(canvasRef.current);
      drawCanvas({
        rouletteItemList: items,
        mergedOptions,
        context,
        geometry,
        rouletteRef,
      });
    };

    // Espera a que la fuente de la app esté disponible antes de dibujar en el
    // canvas, si no se dibujaría con la fuente de respaldo (Arial).
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts
        .load(mergedOptions.style.label.font)
        .then(render)
        .catch(render);
    } else {
      render();
    }

    return () => {
      cancelled = true;
    };
  }, [status, geometry, items, mergedOptions]);

  useEffect(() => {
    if (status !== "running" && status !== "ending") return;

    const callbacks = callbacksRef.current;
    if (status === "running") {
      callbacks.onSpinUp?.();
    }
    if (status === "ending") {
      callbacks.onSpinDown?.();
    }
    const { context } = setupCanvas(canvasRef.current);
    const cancelAnimation = animateRoulette({
      rouletteItemList: itemsRef.current,
      mergedOptions: mergedOptionsRef.current,
      context,
      status,
      geometry: geometryRef.current,
      rouletteRef,
      onFinish: (rouletteResult: string) => {
        setStatus("stop");
        resultRef.current = rouletteResult;
        callbacksRef.current.onSpinEnd?.(rouletteResult);
      },
    });
    return () => {
      cancelAnimation();
    };
  }, [status]);

  return {
    roulette: {
      size: mergedOptions.size,
      canvasRef,
    },

    result: resultRef.current,
    onStart,
    onStop,
  };
};