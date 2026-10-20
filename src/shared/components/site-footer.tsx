import React from "react";
import logoTotal from "@/assets/logotipo-total.png";

interface SiteFooterProps {
  className?: string;
  /** Respeta el gesto/barra inferior cuando la app va a pantalla completa. */
  safeArea?: boolean;
}

export const SiteFooter: React.FC<SiteFooterProps> = ({
  className = "",
  safeArea = false,
}) => {
  return (
    <footer
      className={`flex items-center justify-between relative overflow-hidden ${className}`}
      style={{
        backgroundColor: "#011d21",
        borderTop: "1.5px solid #00565e",
        padding: "10px 18px",
        paddingBottom: safeArea
          ? "calc(10px + env(safe-area-inset-bottom))"
          : undefined,
      }}
      role="contentinfo"
    >
      <div className="flex items-center gap-2 z-10">
        <img
          src={logoTotal}
          alt="TOTAL"
          draggable={false}
          className="h-[18px] w-auto select-none"
          style={{ letterSpacing: "-0.5px" }}
        />
        <span
          className="text-[8.5px] font-semibold"
          style={{ color: "#e4f5f7" }}
        >
          One-Stop Tools Station
        </span>
      </div>

      {/* Rayas angulares deportivas */}
      <div
        className="flex items-center gap-[5px]"
        style={{ transform: "skewX(-32deg)", marginRight: "-10px" }}
      >
        <div
          className="rounded-[2px]"
          style={{ width: "7px", height: "24px", backgroundColor: "#009aa7" }}
        />
        <div
          className="rounded-[2px]"
          style={{ width: "7px", height: "24px", backgroundColor: "#009aa7" }}
        />
        <div
          className="rounded-[2px]"
          style={{ width: "24px", height: "24px", backgroundColor: "#e31821" }}
        />
      </div>
    </footer>
  );
};