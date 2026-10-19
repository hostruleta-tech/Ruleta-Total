import {
	AlertTriangle,
	CheckCircle2,
	Info,
	type LucideIcon,
	X,
} from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/utils";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
	id: number;
	message: string;
	tone: ToastTone;
}

interface ToastApi {
	success: (message: string) => void;
	error: (message: string) => void;
	info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 5000;

const TONE_STYLES: Record<
	ToastTone,
	{ border: string; bar: string; icon: string; Icon: LucideIcon }
> = {
	success: {
		border: "border-[#005f63]/25",
		bar: "bg-[#005f63]",
		icon: "text-[#005f63]",
		Icon: CheckCircle2,
	},
	error: {
		border: "border-[#E52421]/30",
		bar: "bg-[#E52421]",
		icon: "text-[#E52421]",
		Icon: AlertTriangle,
	},
	info: {
		border: "border-slate-300",
		bar: "bg-slate-400",
		icon: "text-slate-500",
		Icon: Info,
	},
};

/**
 * Proveedor de notificaciones (toasts) con estética de marca.
 * Las notificaciones aparecen en la esquina inferior derecha.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const counter = useRef(0);

	const remove = useCallback((id: number) => {
		setToasts((prev) => prev.filter((toast) => toast.id !== id));
	}, []);

	const push = useCallback((message: string, tone: ToastTone) => {
		if (!message) return;
		counter.current += 1;
		setToasts((prev) => [...prev, { id: counter.current, message, tone }]);
	}, []);

	const api = useMemo<ToastApi>(
		() => ({
			success: (message) => push(message, "success"),
			error: (message) => push(message, "error"),
			info: (message) => push(message, "info"),
		}),
		[push],
	);

	return (
		<ToastContext.Provider value={api}>
			{children}
			<ToastViewport toasts={toasts} onDismiss={remove} />
		</ToastContext.Provider>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error("useToast debe usarse dentro de <ToastProvider>.");
	}
	return context;
}

function ToastViewport({
	toasts,
	onDismiss,
}: {
	toasts: ToastItem[];
	onDismiss: (id: number) => void;
}) {
	if (typeof document === "undefined") return null;

	return createPortal(
		<>
			<style>{`
				@keyframes panel-toast-in {
					from { opacity: 0; transform: translateX(24px) scale(0.98); }
					to { opacity: 1; transform: translateX(0) scale(1); }
				}
				.panel-toast-in { animation: panel-toast-in 0.25s ease-out both; }

				@media (prefers-reduced-motion: reduce) {
					.panel-toast-in { animation-duration: 0.001ms !important; }
				}
			`}</style>
			<div
				className="pointer-events-none fixed bottom-6 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-3 sm:right-6"
				aria-live="polite"
				aria-relevant="additions"
			>
				{toasts.map((toast) => (
					<ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
				))}
			</div>
		</>,
		document.body,
	);
}

function ToastCard({
	toast,
	onDismiss,
}: {
	toast: ToastItem;
	onDismiss: (id: number) => void;
}) {
	const { border, bar, icon, Icon } = TONE_STYLES[toast.tone];

	useEffect(() => {
		const timer = window.setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
		return () => window.clearTimeout(timer);
	}, [toast.id, onDismiss]);

	return (
		<div
			role={toast.tone === "error" ? "alert" : "status"}
			className={cn(
				"panel-toast-in pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-2xl border bg-white py-3.5 pl-5 pr-3 shadow-xl",
				border,
			)}
		>
			<span
				aria-hidden="true"
				className={cn("absolute left-0 top-0 bottom-0 w-1.5", bar)}
			/>
			<Icon className={cn("mt-0.5 h-5 w-5 shrink-0", icon)} aria-hidden="true" />
			<p className="flex-1 pt-0.5 text-sm font-semibold leading-snug text-slate-700">
				{toast.message}
			</p>
			<button
				type="button"
				onClick={() => onDismiss(toast.id)}
				aria-label="Cerrar notificación"
				className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	);
}
