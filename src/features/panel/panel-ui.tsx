import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

/* ============================================================ */
/* Tarjeta de marca                                              */
/* ============================================================ */

const cardVariants = cva(
	"relative rounded-3xl overflow-hidden shadow-xl border transform transition-all",
	{
		variants: {
			tone: {
				light: "bg-white text-slate-800 border-slate-200/90",
				dark: "bg-gradient-to-br from-[#005256] via-[#005f63] to-[#003d40] text-white border-teal-600/40",
			},
		},
		defaultVariants: { tone: "light" },
	},
);

interface BrandCardProps
	extends ComponentProps<"div">,
		VariantProps<typeof cardVariants> {
	/** Oculta la franja vertical de marca del borde izquierdo. */
	hideStripe?: boolean;
}

export function BrandCard({
	className,
	children,
	tone = "light",
	hideStripe = false,
	...props
}: BrandCardProps) {
	return (
		<div className={cn(cardVariants({ tone }), className)} {...props}>
			{!hideStripe && (
				<div
					aria-hidden="true"
					className={cn(
						"absolute left-0 top-0 bottom-0 w-3",
						tone === "dark"
							? "bg-gradient-to-b from-[#e51a24] via-[#e51a24] to-white"
							: "bg-gradient-to-b from-[#005f63] via-[#005f63] to-[#e51a24]",
					)}
				/>
			)}
			<div className="relative pl-6 pr-5 py-5 md:pl-7 md:pr-6 md:py-6">{children}</div>
		</div>
	);
}

/* ============================================================ */
/* Botón de marca                                                */
/* ============================================================ */

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold text-sm tracking-wide shadow-md transition active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[#005f63]/50 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				primary: "bg-[#063f43] text-white hover:bg-[#00474b]",
				light: "bg-white text-[#063f43] hover:bg-slate-100 border border-slate-200",
				danger: "bg-[#E52421] text-white hover:bg-[#c81d1a]",
				outline:
					"bg-transparent text-[#063f43] border-2 border-[#063f43] hover:bg-[#063f43]/5 shadow-none",
				ghost:
					"bg-transparent text-slate-500 shadow-none hover:bg-slate-100 hover:text-[#063f43]",
			},
			size: {
				default: "px-5 py-2.5",
				sm: "px-4 py-2 text-xs",
				lg: "px-7 py-3 text-base",
				icon: "h-10 w-10 p-0 rounded-full [&_svg]:size-4",
			},
		},
		defaultVariants: { variant: "primary", size: "default" },
	},
);

interface BrandButtonProps
	extends ComponentProps<"button">,
		VariantProps<typeof buttonVariants> {}

export function BrandButton({
	className,
	variant,
	size,
	type = "button",
	...props
}: BrandButtonProps) {
	return (
		<button
			type={type}
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

/* ============================================================ */
/* Input y label de marca                                        */
/* ============================================================ */

export function BrandInput({ className, ...props }: ComponentProps<"input">) {
	return (
		<input
			className={cn(
				"h-10 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400",
				"focus:border-[#005f63] focus:ring-2 focus:ring-[#005f63]/25",
				"disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export function BrandColorInput({ className, ...props }: ComponentProps<"input">) {
	return (
		<input
			type="color"
			className={cn(
				"h-10 w-full cursor-pointer rounded-xl border border-slate-300 bg-white p-1 shadow-sm outline-none transition",
				"focus:border-[#005f63] focus:ring-2 focus:ring-[#005f63]/25",
				className,
			)}
			{...props}
		/>
	);
}

export function BrandLabel({ className, ...props }: ComponentProps<"label">) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: el control se asocia vía htmlFor/id en el uso
		<label
			className={cn(
				"block text-xs font-bold uppercase tracking-wide text-[#005f63]",
				className,
			)}
			{...props}
		/>
	);
}

/* ============================================================ */
/* Encabezado de sección                                         */
/* ============================================================ */

interface SectionHeadingProps {
	icon: LucideIcon;
	title: string;
	subtitle?: string;
	tone?: "light" | "dark";
	className?: string;
}

export function SectionHeading({
	icon: Icon,
	title,
	subtitle,
	tone = "dark",
	className,
}: SectionHeadingProps) {
	return (
		<div className={cn("flex items-center gap-3", className)}>
			<div className="w-9 h-9 shrink-0 rounded-full bg-[#005f63] text-white flex items-center justify-center shadow">
				<Icon className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
			</div>
			<div className="min-w-0">
				<h3
					className={cn(
						"text-lg md:text-xl font-bold tracking-tight",
						tone === "light" ? "text-white" : "text-slate-800",
					)}
				>
					{title}
				</h3>
				<div className="w-12 h-0.5 bg-[#e51a24] mt-1" />
				{subtitle && (
					<p
						className={cn(
							"mt-1.5 text-xs md:text-sm font-medium",
							tone === "light" ? "text-teal-100" : "text-slate-500",
						)}
					>
						{subtitle}
					</p>
				)}
			</div>
		</div>
	);
}
