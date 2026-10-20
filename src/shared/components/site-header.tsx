import React from "react";
import logoTotal from "@/assets/logotipo-total.png";

interface SiteHeaderProps {
  className?: string;
  /** Texto del distintivo en la esquina superior derecha. */
  badge?: string;
  /** Mostrar el ribbon diagonal "TOTAL" en la esquina superior derecha. */
  showRibbon?: boolean;
  /** Mostrar el distintivo "Promoción en tienda". */
  showBadge?: boolean;
  /** Versión compacta (≈50% altura) para páginas que necesitan más espacio. */
  compact?: boolean;
}

export const SiteHeader: React.FC<SiteHeaderProps> = ({
  className = "",
  badge = "Promoción en tienda",
  showRibbon = true,
  showBadge = true,
  compact = false,
}) => {
  // Diagonal cut values (px from right edge at bottom)
  const cutNormal = 90;
  const cutCompact = 60;
  const cut = compact ? cutCompact : cutNormal;
  
  // Badge margin: needs to clear the cut area + ribbon
  const badgeMarginRight = compact ? 90 : 125;

  // Ribbon position: centered on the diagonal cut line at ~20% down
  // Diagonal goes from (right, 0) to (right - cut, 100%)
  // At 20% down: x offset from right = 0.2 * cut
  const ribbonOffsetX = compact ? Math.round(0.2 * cutCompact) : Math.round(0.2 * cutNormal); // 12px / 18px
  const ribbonWidth = compact ? 90 : 100;
  const ribbonFontSize = compact ? 9 : 10;
  const ribbonPadding = compact ? 4 : 5;

  return (
    <header
      className={`relative z-40 w-full shrink-0 ${className}`}
      style={{
        padding: compact ? "13px 16px 10px 16px" : "31px 23px 26px 26px",
      }}
      role="banner"
    >
      {/* Background layer with diagonal clip-path */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: "linear-gradient(90deg, #005a61 0%, #00454b 100%)",
          borderBottom: "2.5px solid #28b8c5",
          clipPath: `polygon(0 0, 100% 0, calc(100% - ${cut}px) 100%, 0 100%)`,
        }}
        aria-hidden="true"
      >
        {/* White inner line near the bottom edge */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: compact ? "6px" : "8px",
            height: compact ? "2.5px" : "3px",
            background: "#ffffff",
          }}
        />
      </div>

      {/* RIBBON TOTAL - placed across the diagonal cut, going \ */}
      {showRibbon && (
        <div
          className="absolute pointer-events-none"
          style={{
            right: compact ? "-150px" : "-180px",
            top: compact ? "30px" : "34px",
            width: compact ? "400px" : "500px",
            textAlign: "center",
            color: "#fff",
            fontSize: compact ? "13px" : "14px",
            fontWeight: 900,
            fontStyle: "italic",
            letterSpacing: "0.5px",
            padding: `${ribbonPadding}px 0`,
            backgroundColor: "#e31821",
            transform: "rotate(37deg)",
            transformOrigin: "center",
            zIndex: 60,
            boxShadow: "0 3px 10px rgba(0, 0, 0, 0.3)",
          }}
        >
          TOTAL
        </div>
      )}

      {/* Content layer (not clipped) */}
      <div className="relative z-10 flex items-center justify-between">
        {/* Brand group - Logo + Slogan */}
        <div className="flex items-center gap-3">
          <img
            src={logoTotal}
            alt="TOTAL"
            draggable={false}
            className={compact ? "h-[44px] w-auto select-none" : "h-[42px] w-auto select-none"}
            style={{
              filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))",
            }}
          />
          <span
            className={compact ? "text-[10px] font-semibold text-[#e4f5f7] tracking-[0.3px] whitespace-nowrap" : "text-[13px] font-semibold text-[#e4f5f7] tracking-[0.3px] whitespace-nowrap"}
          >
            One-Stop Tools Station
          </span>
        </div>

        {/* Store badge - Promoción en tienda (moved left to clear diagonal cut) */}
        {showBadge && (
          <div
            className="flex items-center gap-1.5 rounded-full"
            style={{
              background: "rgba(255, 255, 255, 0.12)",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              padding: compact ? "4px 13px" : "8px 18px",
              backdropFilter: "blur(4px)",
              marginRight: `${badgeMarginRight}px`,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={compact ? "w-[18px] h-[18px] text-white shrink-0" : "w-[18px] h-[18px] text-white shrink-0"}
              aria-hidden="true"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className={compact ? "whitespace-nowrap text-[10px] font-semibold text-white" : "whitespace-nowrap text-[13px] font-semibold text-white"}>
              {badge}
            </span>
          </div>
        )}
      </div>
    </header>
  );
};