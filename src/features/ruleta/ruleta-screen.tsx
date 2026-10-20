import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Maximize, Minimize } from "lucide-react";
import { useRoulette } from "@/features/motor/hooks/use-roulette";
import type { RouletteItem } from "@/features/motor/types";
import { Roulette } from "@/features/motor/components/roulette";
import { PrizeModal } from "./prize-modal";
import { soundManager } from "@/shared/sound-manager";
import { useFullscreen } from "@/shared/use-fullscreen";
import { API_URL } from "@/shared/api";
import { APP_FONT_FAMILY } from "@/shared/typography";
import heroTaller from "@/assets/hero-taller.jpg";
import logoTotal from "@/assets/logotipo-total.png";
import { SiteHeader } from "@/shared/components/site-header";
import { SiteFooter } from "@/shared/components/site-footer";

// Grosor del marco cromado por lado (p-[14px] + p-[8px] + p-[2px]) + aire lateral
const FRAME_THICKNESS = 24;
const WHEEL_MARGIN = 8;
const FRAME_PADDING = FRAME_THICKNESS * 2 + WHEEL_MARGIN;
const MIN_WHEEL = 180;
// Máximo = ancho interior del marco móvil (440 - 40 padding) - FRAME_PADDING = 344
const MAX_WHEEL = 344;

/** Tamaño de la ruleta calculado a partir del área real (ResizeObserver) */
const useWheelSize = (areaRef: React.RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState(320);

  useEffect(() => {
    const element = areaRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const available = Math.min(rect.width, rect.height) - FRAME_PADDING;
      const clamped = Math.min(Math.max(available, MIN_WHEEL), MAX_WHEEL);
      setSize(Math.round(clamped));
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [areaRef]);

  return size;
};

/** Controles del motor expuestos al padre. */
interface RouletteControls {
  start: (targetIndex?: number) => void;
}

const RouletteGame: React.FC<{
  items: RouletteItem[];
  onPrizeWon: (prize: string) => void;
  onSpinStart: () => void;
  onSpinEnd: () => void;
  size: number;
  onControlsReady?: (controls: RouletteControls) => void;
}> = ({
  items,
  onPrizeWon,
  onSpinStart,
  onSpinEnd,
  size,
  onControlsReady,
}) => {
  const { roulette, onStart } = useRoulette({
    items,
    onSpinUp: onSpinStart,
    onSpinDown: onSpinEnd,
    onSpinEnd: (result: string) => {
      onPrizeWon(result);
    },
    options: {
      size,
      style: {
        canvas: { bg: "#ffffff" },
        label: {
          font: `800 ${Math.max(11, Math.round(size * 0.042))}px ${APP_FONT_FAMILY}`,
          align: "center",
          baseline: "middle",
          offset: 0.7,
        },
        arrow: { bg: "transparent" },
        pie: {
          borderWidth: 2,
          borderColor: "#e2e8f0",
          border: true,
        },
      },
    },
  });

  useEffect(() => {
    onControlsReady?.({ start: onStart });
  }, [onControlsReady, onStart]);

  return (
    <div className="relative flex items-center justify-center">
      {/* MARCO CROMADO EXTERIOR */}
      <div
        className="relative rounded-full p-[14px] shadow-[0_22px_45px_rgba(0,0,0,0.5),0_8px_18px_rgba(0,0,0,0.35)]"
        style={{
          background:
            "linear-gradient(145deg, #eef2f5 0%, #c3ccd3 20%, #6e7a84 45%, #aeb9c1 62%, #2a3238 85%, #151a1e 100%)",
        }}
      >
        {/* BISEL INTERMEDIO (ANILLO DE PROFUNDIDAD) */}
        <div
          className="relative rounded-full p-[8px] shadow-inner"
          style={{
            background:
              "linear-gradient(135deg, #232a2f 0%, #6f7b84 40%, #cfd7db 62%, #171c1f 100%)",
          }}
        >
          {/* CAPA BLANCA BAJO LA RULETA (evita que se cuele el fondo) */}
          <div className="rounded-full bg-white p-[2px] overflow-hidden flex items-center justify-center">
            <Roulette roulette={roulette} />
          </div>
        </div>
      </div>

      {/* FLECHA / PUNTERO 3D ROJO EN LA PARTE SUPERIOR */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.4)]">
        <svg
          width="42"
          height="48"
          viewBox="0 0 42 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M21 46L3.67949 11.5C1.75499 7.66987 4.54486 3 8.84937 3H33.1506C37.4551 3 40.245 7.66987 38.3205 11.5L21 46Z"
            fill="url(#arrow-gradient)"
            stroke="#8f0000"
            strokeWidth="1.5"
          />
          <defs>
            <linearGradient
              id="arrow-gradient"
              x1="4"
              y1="3"
              x2="38"
              y2="46"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#ff4d4d" />
              <stop offset="0.45" stopColor="#e30613" />
              <stop offset="1" stopColor="#8a0007" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* CENTRO DE LA RULETA (TOTAL BADGE) */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 rounded-full p-[6px] shadow-[0_5px_16px_rgba(0,0,0,0.55)] pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, #cdd5db 0%, #4d585f 50%, #e8edf0 100%)",
          width: Math.round(size * 0.28),
          height: Math.round(size * 0.28),
        }}
      >
        <div className="w-full h-full rounded-full bg-[#035157] flex items-center justify-center border-2 border-white/80 shadow-inner">
          <img
            src={logoTotal}
            alt="TOTAL"
            draggable={false}
            className="w-[72%] h-auto object-contain select-none drop-shadow-md"
          />
        </div>
      </div>
    </div>
  );
};

interface SpinResponse {
  claimCode: string;
  prizeIndex: number;
  prize: string;
  prizes: { name: string; backgroundColor: string; probability: number }[];
  rouletteId: number;
}

export const RouletteViewHook: React.FC = () => {
  const wheelAreaRef = useRef<HTMLDivElement>(null);
  const wheelSize = useWheelSize(wheelAreaRef);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [rouletteItems, setRouletteItems] = useState<RouletteItem[] | null>(null);
  const [finalResult, setFinalResult] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [winnerColor, setWinnerColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isModalOpen = finalResult !== null;

  const controlsRef = useRef<RouletteControls | null>(null);
  const handleControlsReady = useCallback((controls: RouletteControls) => {
    controlsRef.current = controls;
  }, []);

  // Carga configuración de premios (plantilla activa)
  useEffect(() => {
    const fetchPrizes = async () => {
      if (isModalOpen) return;

      try {
        const response = await fetch(`${API_URL}/configuracion`);
        const data = await response.json();
        const formattedPrizes: RouletteItem[] = (
          (data?.prizes ?? []) as {
            name: string;
            backgroundColor?: string;
            probability: number;
          }[]
        ).map((p) => ({
          name: p.name,
          bg: p.backgroundColor || "#0a4e58",
          weight: p.probability,
        }));
        setRouletteItems(formattedPrizes);
      } catch (error) {
        console.error("Failed to fetch prizes", error);
      }
    };

    fetchPrizes();
    const configPollInterval = setInterval(fetchPrizes, 5000);
    return () => clearInterval(configPollInterval);
  }, [isModalOpen]);

  const handleSpin = async () => {
    if (isSpinning || isModalOpen || !rouletteItems) return;

    setError(null);
    setIsSpinning(true);
    soundManager.playSpinStart();

    try {
      const response = await fetch(`${API_URL}/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          (result as { message?: string }).message || "Error al girar la ruleta",
        );
      }

      const spinData: SpinResponse = await response.json();

      const formattedPrizes: RouletteItem[] = spinData.prizes.map((p) => ({
        name: p.name,
        bg: p.backgroundColor,
        weight: p.probability,
      }));
      setRouletteItems(formattedPrizes);

      setClaimCode(spinData.claimCode);

      const winningPrize = spinData.prizes[spinData.prizeIndex];
      setWinnerColor(winningPrize?.backgroundColor ?? null);

      controlsRef.current?.start(spinData.prizeIndex);
    } catch (err) {
      console.error("Spin failed:", err);
      setError(err instanceof Error ? err.message : "Error al procesar el giro");
      setIsSpinning(false);
      soundManager.playSpinStart();
    }
  };

  const handleSpinStart = () => {
    // El motor ya está girando
  };

  const handleSpinEnd = () => {
    setIsSpinning(false);
  };

  const handlePrizeWon = (prize: string) => {
    setFinalResult(prize);
    soundManager.playWin();
  };

  return (
    <div
      className="min-h-dvh w-full flex items-center justify-center overflow-x-hidden bg-[#e6edef] sm:bg-[#0b1416]"
      style={{
        fontFamily: APP_FONT_FAMILY,
      }}
    >
      {/* MARCO SIMULADOR MÓVIL */}
      <div
        className={`w-full min-h-dvh relative overflow-hidden flex flex-col ${
          isFullscreen ? "max-w-none" : "max-w-none sm:max-w-[440px]"
        }`}
        style={{
          background:
            "linear-gradient(175deg, #f0f4f5 0%, #e6edef 45%, #d9e4e7 100%)",
          boxShadow: "0 15px 40px rgba(0, 0, 0, 0.45)",
        }}
      >
        {/* HEADER COMPARTIDO */}
        <SiteHeader showRibbon={true} showBadge={false} safeArea />

        {/* CUERPO PRINCIPAL */}
        <main
          className="flex-1 flex flex-col items-center relative isolate"
          style={{
            padding: "20px 20px 15px 20px",
            background:
              "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 65%), linear-gradient(135deg, rgba(230, 240, 243, 0.5) 0%, rgba(200, 218, 222, 0.5) 100%)",
          }}
        >
          {/* IMAGEN DECORATIVA DIFUMINADA - ESQUINA SUPERIOR DERECHA */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute top-0 right-0 z-0 w-[52%] max-w-[230px] aspect-square overflow-hidden"
            style={{
              opacity: 0.45,
              filter: "blur(7px) saturate(1)",
              maskImage:
                "radial-gradient(circle closest-side at 50% 50%, black 0%, black 42%, transparent 100%)",
              WebkitMaskImage:
                "radial-gradient(circle closest-side at 50% 50%, black 0%, black 42%, transparent 100%)",
            }}
          >
            <img
              src={heroTaller}
              alt=""
              draggable={false}
              decoding="async"
              fetchPriority="low"
              className="h-full w-full scale-110 object-cover object-center"
            />
          </div>

          {/* TÍTULOS - no se encogen */}
          <section className="relative z-10 shrink-0 w-full text-left mb-[10px]">
            <h1
              className="text-[32px] font-black italic leading-none tracking-tight"
              style={{ letterSpacing: "-0.5px" }}
            >
              <span style={{ color: "#123035" }}>Ruleta</span>{" "}
              <span style={{ color: "#007782" }}>Digital</span>
            </h1>
            <h2
              className="text-[15px] font-extrabold mt-1"
              style={{ color: "#123035" }}
            >
              ¡Gira y gana con Total Tools!
            </h2>
            <div
              className="w-8 h-1 rounded-[3px] mt-1.5"
              style={{ backgroundColor: "#e31821" }}
            />
          </section>

          {/* ÁREA RESERVADA PARA LA RULETA - ocupa todo el espacio vertical libre */}
          <section
            ref={wheelAreaRef}
            className="relative z-10 w-full flex-1 min-h-0 flex items-center justify-center px-2"
          >
            {rouletteItems ? (
              <RouletteGame
                items={rouletteItems}
                onPrizeWon={handlePrizeWon}
                onSpinStart={handleSpinStart}
                onSpinEnd={handleSpinEnd}
                size={wheelSize}
                onControlsReady={handleControlsReady}
              />
            ) : (
              <div className="aspect-square flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-4 border-[#035157] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold" style={{ color: "#035157" }}>
                  Cargando ruleta...
                </p>
              </div>
            )}
          </section>

          {/* BOTÓN GIRAR RULETA + TARJETA PREMIO - no se encogen */}
          <div className="relative z-10 shrink-0 w-full flex flex-col items-center gap-[10px]">
            {/* BOTÓN GIRAR RULETA */}
            <button
              onClick={handleSpin}
              disabled={isSpinning || !rouletteItems}
              type="button"
              aria-label={isSpinning ? "Girando ruleta" : "Girar Ruleta"}
              className="w-[90%] max-w-[340px] flex items-center justify-center gap-[14px] rounded-full px-5 py-3 text-white font-black uppercase tracking-wider"
              style={{
                fontSize: "18px",
                letterSpacing: "0.5px",
                background:
                  "linear-gradient(180deg, #ff2a2a 0%, #da0d15 50%, #b30007 100%)",
                boxShadow:
                  "0 8px 18px rgba(227, 24, 33, 0.42), inset 0 1px 1px rgba(255, 255, 255, 0.45)",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
                opacity: isSpinning ? 0.8 : 1,
                cursor: isSpinning ? "not-allowed" : "pointer",
              }}
              onMouseDown={(e) => {
                if (!isSpinning) {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(0.97)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 4px 10px rgba(227, 24, 33, 0.35)";
                }
              }}
              onMouseUp={(e) => {
                if (!isSpinning) {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 8px 18px rgba(227, 24, 33, 0.42), inset 0 1px 1px rgba(255, 255, 255, 0.45)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSpinning) {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 8px 18px rgba(227, 24, 33, 0.42), inset 0 1px 1px rgba(255, 255, 255, 0.45)";
                }
              }}
            >
              <svg
                className={`w-[26px] h-[26px] ${isSpinning ? "animate-spin" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{isSpinning ? "GIRANDO..." : "GIRAR RULETA"}</span>
            </button>

            {/* Mensaje de error */}
            {error && (
              <div
                className="w-[90%] max-w-[340px] text-center text-sm px-3 py-2 rounded-xl"
                style={{
                  backgroundColor: "#fef2f2",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                }}
              >
                {error}
              </div>
            )}

            {/* TARJETA NOTIFICACIÓN DE PREMIO */}
            <section
              className="w-[90%] max-w-[340px] flex items-center gap-[15px] px-4 py-3"
              style={{
                backgroundColor: "#fdfefe",
                border: "1.5px solid #d4e2e4",
                borderRadius: "14px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.04)",
              }}
            >
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: "44px", height: "44px" }}
              >
                <svg
                  width="38"
                  height="38"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#007782"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 12 20 22 4 22 4 12" />
                  <rect x="2" y="7" width="20" height="5" />
                  <line x1="12" y1="22" x2="12" y2="7" />
                  <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                  <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                </svg>
              </div>
              <div className="flex flex-col text-left">
                <h4
                  className="text-[13px] font-extrabold leading-snug"
                  style={{ color: "#0f393f" }}
                >
                  {finalResult ? finalResult : "Tu premio aparecerá aquí"}
                </h4>
                <p
                  className="text-[11px] font-semibold mt-0.5"
                  style={{ color: "#7b969b" }}
                >
                  {finalResult
                    ? `¡Felicidades! Código: ${claimCode}`
                    : "¡Buena suerte!"}
                </p>
              </div>
            </section>
          </div>
        </main>

        {/* SECCIÓN: ¿CÓMO PARTICIPAR? */}
        <section
          className="flex items-center"
          style={{
            backgroundColor: "#022b30",
            padding: "14px 14px 18px 14px",
            color: "#fff",
          }}
        >
          <div
            className="flex flex-col items-center"
            style={{ width: "25%", paddingRight: "6px", borderRight: "1px solid rgba(255, 255, 255, 0.12)" }}
          >
            <h3
              className="text-[11px] font-extrabold leading-snug text-white text-center"
              style={{ lineHeight: "1.2" }}
            >
              ¿Cómo<br />participar?
            </h3>
            <div
              className="w-5 h-[3px] rounded-[2px] mt-1"
              style={{ backgroundColor: "#e31821" }}
            />
          </div>

          <div
            className="flex items-center justify-between px-2"
            style={{ width: "75%", paddingLeft: "10px" }}
          >
            {/* Paso 1 */}
            <div className="flex flex-col items-center text-center flex-1 px-1">
              <div
                className="flex items-center justify-center mb-1"
                style={{
                  width: "34px",
                  height: "34px",
                  backgroundColor: "#007b85",
                  border: "1.5px solid #23a0aa",
                  borderRadius: "50%",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <path d="M14 14h3v3h-3z" />
                  <path d="M20 14v3" />
                  <path d="M14 20h6" />
                </svg>
              </div>
              <div className="flex items-center gap-1 mb-0.5">
                <span
                  className="w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-extrabold text-white"
                  style={{ backgroundColor: "#009aa7" }}
                >
                  1
                </span>
                <span
                  className="text-[8px] font-extrabold text-white whitespace-nowrap"
                >
                  Escanea el QR
                </span>
              </div>
              <span
                className="text-[7px] font-medium leading-snug"
                style={{ color: "#9cb8bc", lineHeight: "1.15" }}
              >
                Desde tu teléfono móvil.
              </span>
            </div>

            <span
              className="text-[14px] font-black flex-shrink-0 my-4"
              style={{ color: "#00a4b3" }}
            >
              ›
            </span>

            {/* Paso 2 */}
            <div className="flex flex-col items-center text-center flex-1 px-1">
              <div
                className="flex items-center justify-center mb-1"
                style={{
                  width: "34px",
                  height: "34px",
                  backgroundColor: "#007b85",
                  border: "1.5px solid #23a0aa",
                  borderRadius: "50%",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="6" y="2" width="12" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
                </svg>
              </div>
              <div className="flex items-center gap-1 mb-0.5">
                <span
                  className="w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-extrabold text-white"
                  style={{ backgroundColor: "#009aa7" }}
                >
                  2
                </span>
                <span
                  className="text-[8px] font-extrabold text-white whitespace-nowrap"
                >
                  Gira la ruleta
                </span>
              </div>
              <span
                className="text-[7px] font-medium leading-snug"
                style={{ color: "#9cb8bc", lineHeight: "1.15" }}
              >
                Y descubre tu premio.
              </span>
            </div>

            <span
              className="text-[14px] font-black flex-shrink-0 my-4"
              style={{ color: "#00a4b3" }}
            >
              ›
            </span>

            {/* Paso 3 */}
            <div className="flex flex-col items-center text-center flex-1 px-1">
              <div
                className="flex items-center justify-center mb-1"
                style={{
                  width: "34px",
                  height: "34px",
                  backgroundColor: "#007b85",
                  border: "1.5px solid #23a0aa",
                  borderRadius: "50%",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9l2-5h14l2 5" />
                  <path d="M21 9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9" />
                  <path d="M9 21V12h6v9" />
                </svg>
              </div>
              <div className="flex items-center gap-1 mb-0.5">
                <span
                  className="w-3 h-3 rounded-full flex items-center justify-center text-[8px] font-extrabold text-white"
                  style={{ backgroundColor: "#009aa7" }}
                >
                  3
                </span>
                <span
                  className="text-[8px] font-extrabold text-white whitespace-nowrap"
                >
                  Reclama tu premio
                </span>
              </div>
              <span
                className="text-[7px] font-medium leading-snug"
                style={{ color: "#9cb8bc", lineHeight: "1.15" }}
              >
                En el punto de atención de la tienda.
              </span>
            </div>
          </div>
        </section>

        {/* FOOTER COMPARTIDO */}
        <SiteFooter safeArea />

        {/* BOTÓN FLOTANTE PANTALLA COMPLETA - dentro del marco */}
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={
            isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
          }
          title={
            isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"
          }
          className="absolute bottom-4 right-4 z-20 h-10 w-10 rounded-full border flex items-center justify-center transition hover:bg-white/90 active:scale-95"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            borderColor: "rgba(148, 163, 184, 0.8)",
            backdropFilter: "blur(8px)",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.15)",
            color: "#0a454d",
          }}
        >
          {isFullscreen ? (
            <Minimize className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Maximize className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Modal cuando se gana un premio */}
      {isModalOpen && (
        <PrizeModal
          prize={finalResult}
          prizeColor={winnerColor}
          onClose={() => setFinalResult(null)}
        />
      )}
    </div>
  );
};