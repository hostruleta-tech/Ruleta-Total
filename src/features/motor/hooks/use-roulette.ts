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
  onStart: (targetIndex?: number) => void;
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
  // Índice objetivo del premio ganador (venido del servidor).
  const targetWinnerIndexRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    itemsRef.current = items;
    mergedOptionsRef.current = mergedOptions;
    geometryRef.current = geometry;
    callbacksRef.current = { onSpinUp, onSpinDown, onSpinEnd };
  });

  const [status, setStatus] = useState<"stop" | "running" | "ending">("stop");

  // Auto-stop: temporizador para cambiar a "ending" tras spinDuration
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSpinTimeout = useCallback(() => {
    if (spinTimeoutRef.current) {
      clearTimeout(spinTimeoutRef.current);
      spinTimeoutRef.current = null;
    }
  }, []);

  const onStart = useCallback((targetIndex?: number) => {
    if (status !== "stop") return;

    // Guarda el índice objetivo (si viene del servidor) para la animación.
    targetWinnerIndexRef.current = targetIndex;

    clearSpinTimeout();
    setStatus("running");

    // Programa la transición automática a frenado.
    // No hace falta comprobar status: si el timeout se ejecuta, el
    // componente sigue montado y no se ha llamado a onStop/clearSpinTimeout.
    spinTimeoutRef.current = setTimeout(() => {
      setStatus("ending");
    }, mergedOptions.spinDuration);
  }, [status, mergedOptions.spinDuration, clearSpinTimeout]);

  const onStop = useCallback(() => {
    if (status !== "running") return;
    clearSpinTimeout();
    setStatus("ending");
  }, [status, clearSpinTimeout]);

  // Limpieza al desmontar
  useEffect(() => {
    return () => clearSpinTimeout();
  }, [clearSpinTimeout]);

  // Render en estado "stop" (ruleta quieta)
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
    // canvas; si no, se dibujaría con la fuente de respaldo (sans-serif).
    if (typeof document !== "undefined" && document.fonts) {
      const handleLoadingDone = () => render();
      document.fonts.addEventListener("loadingdone", handleLoadingDone);

      Promise.all([
        document.fonts.load(mergedOptions.style.label.font),
        document.fonts.ready,
      ])
        .then(render)
        .catch(render);

      return () => {
        cancelled = true;
        document.fonts.removeEventListener("loadingdone", handleLoadingDone);
      };
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [status, geometry, items, mergedOptions]);

  // Animación en "running" y "ending"
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
      targetWinnerIndex: targetWinnerIndexRef.current,
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