import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Maximize, Minimize, LayoutDashboard, Bell } from "lucide-react";
import type { RouletteItem } from "@/features/motor/types";
import { RouletteWheel, type RouletteWheelControls, type WheelCalibration } from "./roulette-wheel";
import {
  WHEEL_DISK_OFFSET_X_PX,
  WHEEL_DISK_OFFSET_Y_PX,
  WHEEL_DISK_ROTATION,
  WHEEL_DISK_SCALE,
} from "./wheel-design";
import { PrizeModal } from "./prize-modal";
import { SpinAgainNotice } from "./spin-again-notice";
import { soundManager } from "@/shared/sound-manager";
import { useFullscreen } from "@/shared/use-fullscreen";
import { API_URL } from "@/shared/api";
import { APP_FONT_FAMILY } from "@/shared/typography";
import heroTaller from "@/assets/hero-taller.jpg";
import { SiteHeader } from "@/shared/components/site-header";
import { SiteFooter } from "@/shared/components/site-footer";

// La ruleta ya no tiene marco cromado: el disco PNG trae su propio borde.
// Solo se reserva aire lateral (y espacio para la flecha superior).
const FRAME_THICKNESS = 0;
const WHEEL_MARGIN = 24;
const FRAME_PADDING = FRAME_THICKNESS * 2 + WHEEL_MARGIN;
const MIN_WHEEL = 180;
// Tope máximo para pantallas muy grandes
const MAX_WHEEL = 560;

/** Tamaño de la ruleta calculado a partir del área real (ResizeObserver) */
const useWheelSize = (areaRef: React.RefObject<HTMLDivElement | null>) => {
  const [size, setSize] = useState(320);

  useEffect(() => {
    const element = areaRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      // Usa ancho completo + 20% de alto extra (evita solaparse con botón girar)
      const available = Math.min(rect.width, rect.height * 1.2) - FRAME_PADDING;
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

interface SpinResponse {
  claimCode?: string;
  ticketId?: string;
  prizeIndex: number;
  /** Sector (0-5) del premio ganador en la ruleta PNG. */
  prizeSector?: number;
  prize: string;
  prizeImageUrl?: string | null;
  /** true cuando la casilla ganadora es "Inténtalo de nuevo". */
  spinAgain?: boolean;
  prizes: {
    name: string;
    backgroundColor: string;
    probability: number;
    imageUrl?: string | null;
    labelMode?: "wheel" | "win" | "both";
    isSpinAgain?: boolean;
    sectorIndex?: number | null;
  }[];
  rouletteId: number;
  demo?: boolean;
  sectorCount?: number;
}

/** Estado del ticket leído desde el fragmento de la URL. */
type TicketState =
  | { kind: "checking" }
  | { kind: "missing" }
  | { kind: "valid"; ticketId: string }
  | { kind: "invalid"; message: string }
  | { kind: "admin" };

/** El token viaja en `#t=<token>`; nunca se envía en la URL al servidor. */
function readTokenFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const token = new URLSearchParams(hash).get("t");
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

function ticketReasonMessage(reason?: string): string {
  switch (reason) {
    case "expired":
      return "Este ticket ha expirado.";
    case "void":
      return "Este ticket fue anulado.";
    case "already_redeemed":
      return "Este ticket ya fue canjeado.";
    case "reserved_other":
      return "Este ticket está reservado en otra sesión. Espera unos minutos.";
    case "already_reserved":
    case "not_available":
      return "El ticket se está usando en otra sesión. Intenta de nuevo en unos minutos.";
    case "not_found":
      return "El ticket no es válido.";
    default:
      return "No se pudo validar el ticket.";
  }
}

const WHEEL_SECTOR_COUNT = 6;

/** Ordena los premios por sector fijo (0-5). Los sin sector van al final. */
const sortBySector = (prizes: RouletteItem[]): RouletteItem[] =>
  [...prizes].sort(
    (a, b) =>
      (a.sectorIndex ?? Number.MAX_SAFE_INTEGER) -
      (b.sectorIndex ?? Number.MAX_SAFE_INTEGER),
  );

/** Comprueba que existan exactamente los 6 sectores, uno de cada. */
const hasAllSectors = (items: RouletteItem[] | null): boolean => {
  if (!items || items.length !== WHEEL_SECTOR_COUNT) return false;
  const sectors = new Set<number>();
  for (const item of items) {
    const sector = item.sectorIndex;
    if (
      typeof sector !== "number" ||
      !Number.isInteger(sector) ||
      sector < 0 ||
      sector >= WHEEL_SECTOR_COUNT ||
      sectors.has(sector)
    ) {
      return false;
    }
    sectors.add(sector);
  }
  return sectors.size === WHEEL_SECTOR_COUNT;
};

export const RouletteViewHook: React.FC = () => {
  const wheelAreaRef = useRef<HTMLDivElement>(null);
  const wheelSize = useWheelSize(wheelAreaRef);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const [rouletteItems, setRouletteItems] = useState<RouletteItem[] | null>(null);
  const [finalResult, setFinalResult] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [claimCode, setClaimCode] = useState<string | null>(null);
  const [winnerColor, setWinnerColor] = useState<string | null>(null);
  const [winnerImage, setWinnerImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  const [ticketState, setTicketState] = useState<TicketState>({
    kind: "checking",
  });
  const [hasSpun, setHasSpun] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastSpinWasDemo, setLastSpinWasDemo] = useState(false);
  const [winnerLabelMode, setWinnerLabelMode] = useState<"wheel" | "win" | "both">("both");
  const isModalOpen = finalResult !== null;

  // Marca el giro actual como "Inténtalo de nuevo". Se usa un ref porque el
  // resultado de la animación puede llegar antes de que React re-renderice.
  const spinAgainRef = useRef(false);
  // Premio de la casilla "Inténtalo de nuevo" que se está mostrando (o null).
  const [spinAgainNotice, setSpinAgainNotice] = useState<string | null>(null);
  // Snapshot del premio ganador (modo de texto) para no depender de buscar por
  // nombre (evita fallos con nombres repetidos como las 2 casillas "Inténtalo").
  const winnerSnapshotRef = useRef<{
    labelMode: "wheel" | "win" | "both";
  } | null>(null);

  // Lee el token del fragmento, lo borra de la barra de direcciones y lo
  // valida contra el servidor sin consumir el ticket.
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const token = readTokenFromHash();

      // Verificar sesión de admin PRIMERO
      let autenticado = false;
      try {
        const res = await fetch(`${API_URL}/auth/me`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as { authenticated?: boolean };
        autenticado = data.authenticated === true;
      } catch {
        autenticado = false;
      }
      setIsAdmin(autenticado);

      if (cancelled) return;

      if (!token) {
        setTicketState({ kind: autenticado ? "admin" : "missing" });
        return;
      }

      setTicketToken(token);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );

      const validate = async () => {
        try {
          const response = await fetch(`${API_URL}/tickets/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const data = (await response.json().catch(() => ({}))) as {
            valid?: boolean;
            ticket?: { id?: string } | null;
            reason?: string;
          };

          if (cancelled) return;

          if (response.ok && data.valid && data.ticket?.id) {
            setTicketState({ kind: "valid", ticketId: String(data.ticket.id) });
          } else {
            setTicketState({
              kind: "invalid",
              message: ticketReasonMessage(data.reason),
            });
          }
        } catch {
          if (!cancelled) {
            setTicketState({
              kind: "invalid",
              message: "No se pudo validar el ticket. Revisa tu conexión.",
            });
          }
        }
      };

      validate();
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // Re-verificar sesión de admin al volver a la pestaña
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetch(`${API_URL}/auth/me`, { credentials: "same-origin", cache: "no-store" })
          .then((res) => res.json().catch(() => ({})))
          .then((data: { authenticated?: boolean }) => setIsAdmin(data.authenticated === true))
          .catch(() => setIsAdmin(false));
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const controlsRef = useRef<RouletteWheelControls | null>(null);
  const handleControlsReady = useCallback((controls: RouletteWheelControls) => {
    controlsRef.current = controls;
  }, []);

  // Calibración PNG guardada en el servidor (la usa el wheel en reposo y en
  // cada giro; el panel debug la guarda con PUT /api/wheel/calibration).
  const [wheelCalibration, setWheelCalibration] = useState<WheelCalibration | null>(null);
  const handleCalibrationSaved = useCallback(
    (calibration: WheelCalibration) => {
      setWheelCalibration(calibration);
    },
    [],
  );

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
            imageUrl?: string | null;
            labelMode?: "wheel" | "win" | "both";
            isSpinAgain?: boolean;
            sectorIndex?: number | null;
          }[]
        ).map((p) => ({
          name: p.name,
          bg: p.backgroundColor || "#0a4e58",
          weight: p.probability,
          image: p.imageUrl ?? null,
          labelMode: p.labelMode ?? "both",
          isSpinAgain: p.isSpinAgain === true,
          sectorIndex: p.sectorIndex ?? null,
        }));
        setRouletteItems(sortBySector(formattedPrizes));

        const rawCalibration = data?.calibration as
          | {
              alignmentOffset?: unknown;
              initialAngle?: unknown;
              diskOffsetX?: unknown;
              diskOffsetY?: unknown;
              diskScale?: unknown;
              diskRotation?: unknown;
            }
          | undefined;
        if (
          rawCalibration &&
          typeof rawCalibration === "object" &&
          Number.isFinite(Number(rawCalibration.alignmentOffset)) &&
          Number.isFinite(Number(rawCalibration.initialAngle))
        ) {
          const finiteOr = (value: unknown, fallback: number) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
          };
          setWheelCalibration({
            alignmentOffset: Number(rawCalibration.alignmentOffset),
            initialAngle: Number(rawCalibration.initialAngle),
            diskOffsetX: finiteOr(
              rawCalibration.diskOffsetX,
              WHEEL_DISK_OFFSET_X_PX,
            ),
            diskOffsetY: finiteOr(
              rawCalibration.diskOffsetY,
              WHEEL_DISK_OFFSET_Y_PX,
            ),
            diskScale: finiteOr(rawCalibration.diskScale, WHEEL_DISK_SCALE),
            diskRotation: finiteOr(
              rawCalibration.diskRotation,
              WHEEL_DISK_ROTATION,
            ),
          });
        }
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

    if (!sectorsReady) {
      setError(
        "La ruleta no tiene los 6 sectores configurados. Avisa al operador.",
      );
      return;
    }

    // Modo admin: puede girar sin ticket y sin límite de hasSpun
    const isAdminMode = ticketState.kind === "admin";

    if (!isAdminMode && (ticketState.kind !== "valid" || !ticketToken)) {
      setError(
        ticketState.kind === "missing"
          ? "Escanea el QR de tu ticket para poder girar."
          : ticketState.kind === "invalid"
          ? ticketState.message
          : "Validando tu ticket, espera un momento.",
      );
      return;
    }

    if (!isAdminMode && hasSpun) {
      setError("Este ticket ya fue canjeado.");
      return;
    }

    setError(null);
    setIsSpinning(true);
    soundManager.playSpinStart();

    try {
      const body = isAdminMode ? {} : { token: ticketToken };
      const response = await fetch(`${API_URL}/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          message?: string;
          reason?: string;
        };

        // Si el ticket dejó de ser válido, se refleja en la tarjeta.
        if (result.reason) {
          setTicketState({
            kind: "invalid",
            message: ticketReasonMessage(result.reason),
          });
        }

        throw new Error(result.message || "Error al girar la ruleta");
      }

      const spinData: SpinResponse = await response.json();
      const isSpinAgain = spinData.spinAgain === true;
      spinAgainRef.current = isSpinAgain;

      const formattedPrizes: RouletteItem[] = spinData.prizes.map((p) => ({
        name: p.name,
        bg: p.backgroundColor,
        weight: p.probability,
        image: p.imageUrl ?? null,
        labelMode: p.labelMode ?? "both",
        isSpinAgain: p.isSpinAgain === true,
        sectorIndex: p.sectorIndex ?? null,
      }));
      setRouletteItems(sortBySector(formattedPrizes));

      if (!spinData.demo) {
        // Si cayó en "Inténtalo de nuevo", el ticket NO se consume.
        if (!isSpinAgain) {
          setClaimCode(spinData.claimCode ?? null);
          setHasSpun(true);
        }
        setLastSpinWasDemo(false);
      } else {
        setLastSpinWasDemo(true);
      }

      const winningPrize = spinData.prizes[spinData.prizeIndex];
      winnerSnapshotRef.current = winningPrize
        ? { labelMode: winningPrize.labelMode ?? "both" }
        : null;
      setWinnerColor(winningPrize?.backgroundColor ?? null);
      setWinnerImage(
        winningPrize?.imageUrl ?? spinData.prizeImageUrl ?? null,
      );
      setWinnerLabelMode(winningPrize?.labelMode ?? "both");

      // `prizeSector` es el índice de sector (0-5) que usará el motor como
      // objetivo; si el backend no lo envía, se usa prizeIndex como respaldo.
      controlsRef.current?.start(spinData.prizeSector ?? spinData.prizeIndex);
    } catch (err) {
      console.error("Spin failed:", err);
      spinAgainRef.current = false;
      setError(err instanceof Error ? err.message : "Error al procesar el giro");
      setIsSpinning(false);
      soundManager.playSpinStart();
    }
  };

  const handleSpinStart = () => {
    // El motor ya está girando
  };

  const handleSpinEnd = () => {
    // No-op: isSpinning se limpia en handlePrizeWon, que se ejecuta
    // cuando la animación termina realmente. Si lo limpiamos aquí
    // (onSpinDown → status "ending") la ruleta todavía está frenando
    // y el botón se habilita antes de que se detenga.
  };

  const handlePrizeWon = (prize: string) => {
    // Casilla "Inténtalo de nuevo": aviso simple, sin modal de premio.
    if (spinAgainRef.current) {
      spinAgainRef.current = false;
      setSpinAgainNotice(prize);
      setIsSpinning(false);
      return;
    }

    setFinalResult(prize);
    setIsSpinning(false);
    // Respaldo: si el servidor no envió la imagen, se busca en los premios.
    const winningItem = rouletteItems?.find((item) => item.name === prize);
    setWinnerImage(
      (current) =>
        current ?? winningItem?.image ?? null,
    );
    // El modo de texto viene del snapshot del giro (evita errores con nombres
    // repetidos); el respaldo por nombre es solo para compatibilidad.
    setWinnerLabelMode(
      winnerSnapshotRef.current?.labelMode ??
        winningItem?.labelMode ??
        "both",
    );
    soundManager.playWin();
  };

  const handleSpinAgainRetry = () => {
    setSpinAgainNotice(null);
    void handleSpin();
  };

  const hasWinnerName = Boolean(finalResult && finalResult.trim().length > 0);

  // La ruleta PNG exige los 6 sectores completos para poder girar.
  const sectorsReady = hasAllSectors(rouletteItems);

  const canSpin = ((ticketState.kind === "valid" && !hasSpun) || ticketState.kind === "admin") && sectorsReady;

  return (
    <div
      className="min-h-dvh w-full flex items-center justify-center overflow-x-hidden bg-[#e6edef] sm:bg-[#0b1416]"
      style={{
        fontFamily: APP_FONT_FAMILY,
      }}
    >
      {/* MARCO SIMULADOR MÓVIL */}
      <div
        className={`w-full min-h-dvh relative overflow-hidden flex flex-col ${isFullscreen ? "max-w-none" : "max-w-none sm:max-w-[440px]"}`}
        style={{
          background:
            "linear-gradient(175deg, #f0f4f5 0%, #e6edef 45%, #d9e4e7 100%)",
          boxShadow: "0 15px 40px rgba(0, 0, 0, 0.45)",
        }}
      >
        {/* Fondo con imagen fondo-ruleta.png al 50% de opacidad */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url(/fondo-ruleta.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity: 0.5,
          }}
          aria-hidden="true"
        />
        {/* HEADER COMPARTIDO */}
        <SiteHeader showRibbon={true} showBadge={false} safeArea />

        {/* CUERPO PRINCIPAL */}
        <main
          className="flex-1 flex flex-col items-center relative isolate"
          style={{
            padding: "20px 20px 15px 20px",
            background:
              "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 65%), linear-gradient(135deg, rgba(230, 240, 243, 0.25) 0%, rgba(200, 218, 222, 0.25) 100%)",
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
              className="text-[36.8px] font-black italic leading-none tracking-tight"
              style={{ letterSpacing: "-0.5px" }}
            >
              <span style={{ color: "#123035" }}>Ruleta</span>{" "}
              <span style={{ color: "#007782" }}>Digital</span>
            </h1>
            <h2
              className="text-[17.25px] font-extrabold mt-1"
              style={{ color: "#123035" }}
            >
              ¡Gira y gana con Total Tools!
            </h2>
            <div
              className="w-[36.8px] h-[4.6px] rounded-[3px] mt-1.5"
              style={{ backgroundColor: "#e31821" }}
            />
          </section>

          {/* ÁREA RESERVADA PARA LA RULETA - ocupa todo el espacio vertical libre */}
          <section
            ref={wheelAreaRef}
            className="relative z-10 w-full flex-1 min-h-0 flex items-center justify-center px-2"
          >
            {rouletteItems ? (
              <RouletteWheel
                items={rouletteItems}
                onPrizeWon={handlePrizeWon}
                onSpinStart={handleSpinStart}
                onSpinEnd={handleSpinEnd}
                size={wheelSize}
                onControlsReady={handleControlsReady}
                calibration={wheelCalibration ?? undefined}
                onCalibrationSaved={handleCalibrationSaved}
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
              disabled={isSpinning || !rouletteItems || !canSpin}
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
                opacity: isSpinning || !canSpin ? 0.6 : 1,
                cursor: isSpinning || !canSpin ? "not-allowed" : "pointer",
              }}
              onMouseDown={(e) => {
                if (!isSpinning) {
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 10px rgba(227, 24, 33, 0.35)";
                }
              }}
              onMouseUp={(e) => {
                if (!isSpinning) {
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow =
                    "0 8px 18px rgba(227, 24, 33, 0.42), inset 0 1px 1px rgba(255, 255, 255, 0.45)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSpinning) {
                  (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
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
              <span>
                {isSpinning
                  ? "GIRANDO..."
                  : ticketState.kind === "admin"
                  ? "GIRAR (DEMO)"
                  : hasSpun
                  ? "TICKET CANJEADO"
                  : "GIRAR RULETA"}
              </span>
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

            {/* Aviso si la plantilla activa no tiene los 6 sectores */}
            {rouletteItems && !sectorsReady && (
              <div
                className="w-[90%] max-w-[340px] text-center text-sm px-3 py-2 rounded-xl"
                style={{
                  backgroundColor: "#fffbeb",
                  color: "#b45309",
                  border: "1px solid #fde68a",
                }}
              >
                La ruleta no tiene los 6 sectores configurados. Avisa al
                operador.
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
                  {finalResult
                    ? (hasWinnerName
                        ? (winnerLabelMode === "wheel" && winnerImage
                            ? "¡Ganaste!"
                            : finalResult)
                        : "¡Ganaste!")
                    : ticketState.kind === "valid"
                    ? "Ticket válido"
                    : ticketState.kind === "admin"
                    ? "Modo administrador"
                    : "Escanea tu ticket"}
                </h4>
                <p
                  className="text-[11px] font-semibold mt-0.5"
                  style={{ color: "#7b969b" }}
                >
                  {finalResult
                    ? lastSpinWasDemo
                      ? `¡Giro de prueba!${hasWinnerName ? ` Premio: ${finalResult}` : ""} (no consume ticket)`
                      : `¡Felicidades! Código: ${claimCode}`
                    : ticketState.kind === "valid"
                    ? "Pulsa GIRAR RULETA para participar."
                    : ticketState.kind === "checking"
                    ? "Validando ticket..."
                    : ticketState.kind === "missing"
                    ? "Necesitas el QR de tu ticket para girar."
                    : ticketState.kind === "admin"
                    ? "Pulsa GIRAR (DEMO) para probar la ruleta sin consumir ticket."
                    : ticketState.message}
                </p>
              </div>
            </section>

            {/* Badge modo administrador */}
            {ticketState.kind === "admin" && (
              <div className="flex items-center gap-2 text-xs font-medium text-[#005f63]">
                <Bell className="h-3.5 w-3.5" />
                <span>Modo administrador — giros ilimitados sin consumir tickets</span>
                <a
                  href="/?view=menu"
                  className="underline hover:text-[#e51a24] ml-2"
                >
                  Volver al menú
                </a>
              </div>
            )}

            {/* Botón "Girar sin ticket" si hay token inválido pero hay sesión admin */}
            {ticketState.kind === "invalid" && isAdmin && (
              <button
                type="button"
                onClick={() => {
                  window.history.replaceState(
                    null,
                    "",
                    `${window.location.pathname}${window.location.search}`,
                  );
                  setTicketState({ kind: "admin" });
                  setError(null);
                }}
                className="w-[90%] max-w-[340px] flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-[#005f63] bg-white/80 border border-[#005f63]/30 hover:bg-white transition"
              >
                <LayoutDashboard className="h-4 w-4" />
                Girar sin ticket (demo)
              </button>
            )}
          </div>
        </main>

        {/* SECCIÓN: ¿CÓMO PARTICIPAR? */}
        <section
          className="flex items-center relative"
          style={{
            backgroundColor: "#022b30",
            padding: "14px 14px 18px 14px",
            color: "#fff",
            zIndex: 10,
          }}
        >
          <div
            className="flex flex-col items-center"
            style={{ width: "25%", paddingRight: "6px", borderRight: "1px solid rgba(255, 255, 255, 0.12)" }}
          >
            <h3
              className="text-[16px] font-extrabold leading-snug text-white text-center"
              style={{ lineHeight: "1.2" }}
            >
              ¿Cómo<br />participar?
            </h3>
            <div
              className="w-6 h-[4px] rounded-[2px] mt-1.5"
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
          prizeImage={winnerImage}
          onClose={() => {
            setFinalResult(null);
            setWinnerImage(null);
          }}
          showName={hasWinnerName && (winnerLabelMode !== "wheel" || !winnerImage)}
        />
      )}

      {/* Aviso simple de la casilla "Inténtalo de nuevo" */}
      {spinAgainNotice !== null && (
        <SpinAgainNotice
          prize={spinAgainNotice}
          onRetry={handleSpinAgainRetry}
          onClose={() => setSpinAgainNotice(null)}
        />
      )}
    </div>
  );
};