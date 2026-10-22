import {
	Ban,
	ChevronLeft,
	ChevronRight,
	Download,
	Loader2,
	Minus,
	Plus,
	QrCode,
	RotateCcw,
	Search,
	Ticket as TicketIcon,
	Trash2,
	Calendar,
	Tag,
	Eye,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import { useOperatorAuth } from "./operator-auth-context";
import { translateMessage } from "./panel-messages";
import { useToast } from "./panel-toast";
import { useLivePolling } from "./use-live-polling";
import {
	BrandButton,
	BrandCard,
	BrandInput,
	BrandLabel,
	SectionHeading,
} from "./panel-ui";

type TicketStatus =
	| "available"
	| "reserved"
	| "redeemed"
	| "expired"
	| "void";

interface TicketDto {
	id: string;
	batchId: string | null;
	status: TicketStatus;
	createdAt: string;
	expiresAt: string | null;
	reservedAt: string | null;
	reservedUntil: string | null;
	redeemedAt: string | null;
	prizeId: number | null;
	prizeName: string | null;
	rouletteId: number | null;
	qrDataUrl?: string;
}

interface TicketBatchDto {
	id: string;
	label: string | null;
	quantity: number;
	createdAt: string;
	expiresAt: string | null;
}

interface BatchResponse {
	batch: TicketBatchDto;
	tickets: TicketDto[];
	previews: TicketPreview[];
}

interface TicketPreview {
	id: string;
	qrDataUrl: string;
}

interface TicketsResponse {
	tickets: TicketDto[];
	total: number;
	limit: number;
	offset: number;
}

interface QrBatchResponse {
	qrDataUrls: Record<string, string>;
}

interface BatchStats {
	available: number;
	reserved: number;
	redeemed: number;
	expired: number;
	void: number;
	total: number;
}

const MAX_BATCH_SIZE = 500;
const TICKETS_PER_PAGE = 24;
const MAX_QR_IDS_PER_REQUEST = 60;

const STATUS_LABELS: Record<TicketStatus, string> = {
	available: "Disponible",
	reserved: "Reservado",
	redeemed: "Canjeado",
	expired: "Vencido",
	void: "Anulado",
};

const STATUS_STYLES: Record<TicketStatus, string> = {
	available: "bg-[#005f63]/10 text-[#005f63] border-[#005f63]/20",
	reserved: "bg-amber-100 text-amber-700 border-amber-200",
	redeemed: "bg-slate-100 text-slate-600 border-slate-200",
	expired: "bg-[#E52421]/10 text-[#c81d1a] border-[#E52421]/20",
	void: "bg-slate-100 text-slate-400 border-slate-200",
};

const STATUS_ICONS: Record<TicketStatus, React.ReactNode> = {
	available: <QrCode className="h-3 w-3" />,
	reserved: <Clock className="h-3 w-3" />,
	redeemed: <CheckCircle className="h-3 w-3" />,
	expired: <AlertCircle className="h-3 w-3" />,
	void: <Ban className="h-3 w-3" />,
};

function shortId(id: string): string {
	return id.slice(0, 8).toUpperCase();
}

function formatDate(value: string | null): string {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Fecha inválida";
	return new Intl.DateTimeFormat("es-VE", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(date);
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

async function responseError(res: Response): Promise<string> {
	try {
		const data = await res.json();
		if (data.message) return data.message;
	} catch {
		// Sin cuerpo JSON.
	}
	return `Error ${res.status}.`;
}

// Icon components inline to avoid extra imports
function Clock({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="12" cy="12" r="10" />
			<path d="M12 6v6l4 2" />
		</svg>
	);
}

function CheckCircle({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="12" cy="12" r="10" />
			<path d="M9 12l2 2 4-4" />
		</svg>
	);
}

function AlertCircle({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="8" x2="12" y2="12" />
			<line x1="12" y1="16" x2="12.01" y2="16" />
		</svg>
	);
}

export function TicketManager() {
	const toast = useToast();
	const { operatorFetch } = useOperatorAuth();

	// --- Generación de tickets ---
	const [quantity, setQuantity] = useState(1);
	const [label, setLabel] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [batchStats, setBatchStats] = useState<BatchStats | null>(null);
	const [statsError, setStatsError] = useState<string | null>(null);

	// --- Vista simple: lista plana con paginación ---
	const [ticketView, setTicketView] = useState<"active" | "redeemed">("active");
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [tickets, setTickets] = useState<TicketDto[]>([]);
	const [totalTickets, setTotalTickets] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [isLoadingTickets, setIsLoadingTickets] = useState(false);
	const [busyKey, setBusyKey] = useState<string | null>(null);

	// QR loading state per ticket
	const [qrLoading, setQrLoading] = useState<Set<string>>(new Set());
	const [qrCache, setQrCache] = useState<Record<string, string>>({});

	const minExpiry = new Date(
		Date.now() - new Date().getTimezoneOffset() * 60_000,
	)
		.toISOString()
		.slice(0, 16);

	// --- Debounce search ---
	useEffect(() => {
		const timeout = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
		return () => clearTimeout(timeout);
	}, [searchQuery]);

	// --- Cargar tickets ---
	const loadTickets = useCallback(async () => {
		setIsLoadingTickets(true);
		try {
			const params = new URLSearchParams({
				scope: ticketView,
				limit: String(TICKETS_PER_PAGE),
				offset: String((currentPage - 1) * TICKETS_PER_PAGE),
			});
			if (debouncedQuery) params.set("q", debouncedQuery.toUpperCase());

			const response = await operatorFetch(`/tickets?${params.toString()}`);
			if (!response) return;
			const data = (await response.json()) as TicketsResponse;

			setTickets(data.tickets ?? []);
			setTotalTickets(data.total);

			// Cargar QR para tickets visibles
			loadQrsForTickets(data.tickets ?? []);
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudieron cargar los tickets."));
		} finally {
			setIsLoadingTickets(false);
		}
	}, [operatorFetch, ticketView, currentPage, debouncedQuery]);

	// Recargar al cambiar pestaña, página o búsqueda
	useEffect(() => {
		setCurrentPage(1);
		loadTickets();
	}, [ticketView, debouncedQuery]);

	// Paginación
	useEffect(() => {
		loadTickets();
	}, [currentPage]);

	// --- Live polling para actualizar estados de tickets visibles (silencioso, sin spinner) ---
	const refreshStatusesRef = useRef<() => Promise<void>>(async () => {});
	refreshStatusesRef.current = async () => {
		const visibleIds = tickets.map(t => t.id);
		if (visibleIds.length === 0) return;
		try {
			const response = await operatorFetch("/tickets/lookup", {
				method: "POST",
				body: JSON.stringify({ ids: visibleIds }),
			});
			if (!response) return;
			const data = (await response.json()) as { tickets: TicketDto[] };
			const statusMap = new Map(data.tickets.map(t => [t.id, t.status]));
			const prizeMap = new Map(data.tickets.map(t => [t.id, t.prizeName]));
			setTickets(prev => {
				const updated = prev.map(t => {
					const newStatus = statusMap.get(t.id);
					if (newStatus && newStatus !== t.status) {
						return { ...t, status: newStatus, prizeName: prizeMap.get(t.id) ?? t.prizeName };
					}
					return t;
				});
				// Filtrar tickets que ya no coinciden con el scope actual
				// (ej. canjeados en pestaña "active")
				return updated.filter(t => {
					if (ticketView === "active") {
						return t.status === "available" || t.status === "reserved";
					}
					return t.status === "redeemed" || t.status === "void";
				});
			});
		} catch {
			// Silencioso
		}
	};

	useLivePolling("/tickets/stats", {
		enabled: true,
		intervalMs: 5000,
		onTick: () => {
			refreshStatusesRef.current();
		},
		onError: () => {
			// Silencioso
		},
	});

	// --- Cargar stats del lote activo ---
	useEffect(() => {
		const loadBatchStats = async () => {
			try {
				const response = await operatorFetch("/tickets/stats");
				if (!response) return;
				const data = await response.json();
				setBatchStats(data);
				setStatsError(null);
			} catch {
				setStatsError("No se pudieron cargar las estadísticas");
			}
		};
		loadBatchStats();
		const interval = setInterval(loadBatchStats, 10000);
		return () => clearInterval(interval);
	}, [operatorFetch]);

	// --- Cargar QR para un array de tickets (bajo demanda) ---
	const loadQrsForTickets = useCallback(async (ticketsToLoad: TicketDto[]) => {
		const ids = ticketsToLoad
			.filter(t => !qrCache[t.id] && !qrLoading.has(t.id))
			.slice(0, MAX_QR_IDS_PER_REQUEST)
			.map(t => t.id);
		if (ids.length === 0) return;

		setQrLoading(prev => {
			const next = new Set(prev);
			for (const id of ids) next.add(id);
			return next;
		});
		try {
			const response = await operatorFetch("/tickets/qrs", {
				method: "POST",
				body: JSON.stringify({ ids }),
			});
			if (!response) return;
			const data = (await response.json()) as QrBatchResponse;
			setQrCache(prev => ({ ...prev, ...data.qrDataUrls }));
		} catch {
			// Silencioso
		} finally {
			setQrLoading(prev => {
				const next = new Set(prev);
				for (const id of ids) next.delete(id);
				return next;
			});
		}
	}, [operatorFetch, qrCache, qrLoading]);

	// --- Generar tickets ---
	const handleQuantityChange = (delta: number) => {
		setQuantity(prev => Math.max(1, Math.min(MAX_BATCH_SIZE, prev + delta)));
	};

	const handleGenerate = async () => {
		const count = quantity;
		if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_SIZE) {
			toast.error(`La cantidad debe estar entre 1 y ${MAX_BATCH_SIZE}.`);
			return;
		}

		let expiresIso: string | undefined;
		if (expiresAt) {
			const date = new Date(expiresAt);
			if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
				toast.error("La fecha de expiración debe estar en el futuro.");
				return;
			}
			expiresIso = date.toISOString();
		}

		setIsGenerating(true);
		try {
			const response = await operatorFetch("/tickets/batch", {
				method: "POST",
				body: JSON.stringify({
					quantity: count,
					batchLabel: label.trim() || undefined,
					expiresAt: expiresIso,
				}),
			});
			if (!response) return;
			const data = (await response.json()) as BatchResponse & { message?: string };
			if (!response.ok) throw new Error(data.message ?? `Error ${response.status}.`);

			setQuantity(1);
			setLabel("");
			setExpiresAt("");
			toast.success(count === 1 ? "Ticket generado." : `${count} tickets generados.`);

			// Recargar lista
			await loadTickets();
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudieron generar los tickets."));
		} finally {
			setIsGenerating(false);
		}
	};

	// --- Descargar PNG individual ---
	const handleDownloadTicket = async (ticketId: string) => {
		setBusyKey(`qr-${ticketId}`);
		try {
			const response = await operatorFetch(`/tickets/${ticketId}/qr`);
			if (!response) return;
			if (!response.ok) throw new Error(await responseError(response));
			const blob = await response.blob();
			downloadBlob(blob, `ticket-${shortId(ticketId)}.png`);
			toast.success("PNG descargado.");
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudo descargar el PNG."));
		} finally {
			setBusyKey(null);
		}
	};

	// --- Anular ticket ---
	const handleVoidTicket = async (ticketId: string) => {
		if (!window.confirm("¿Anular este ticket? No se podrá deshacer.")) return;
		setBusyKey(`void-${ticketId}`);
		try {
			const response = await operatorFetch(`/tickets/${ticketId}/void`, { method: "POST" });
			if (!response) return;
			const data = (await response.json()) as { success: boolean; message?: string; reason?: string };
			if (!response.ok) throw new Error(data.message ?? `Error ${response.status}.`);
			toast.success("Ticket anulado.");
			await loadTickets();
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudo anular el ticket."));
		} finally {
			setBusyKey(null);
		}
	};

	// --- Ver QR en grande (modal) ---
	const [previewQr, setPreviewQr] = useState<string | null>(null);
	const handlePreviewQr = (qrDataUrl: string) => setPreviewQr(qrDataUrl);
	const closePreviewQr = () => setPreviewQr(null);

	// --- Render ticket card ---
	const renderTicket = (ticket: TicketDto) => {
		const status = ticket.status;
		const isRedeemedOrVoid = status === "redeemed" || status === "void";
		const qrDataUrl = qrCache[ticket.id] ?? "";
		const isLoadingQr = qrLoading.has(ticket.id);
		const isBusy = busyKey === `qr-${ticket.id}` || busyKey === `void-${ticket.id}`;

		return (
			<div
				key={ticket.id}
				className={cn(
					"relative overflow-hidden rounded-2xl border bg-white/80 p-3 transition-all duration-200",
					"hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300",
					"border-slate-200"
				)}
			>
				{/* Badge de estado */}
				<div className="absolute top-2 right-2 z-10">
					<span
						className={cn(
							"inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide border",
							STATUS_STYLES[status]
						)}
						title={STATUS_LABELS[status]}
					>
						{STATUS_ICONS[status]}
						{STATUS_LABELS[status].slice(0, 3)}
					</span>
				</div>

				{/* QR */}
				<div className="flex justify-center mb-2">
					{isLoadingQr ? (
						<Loader2 className="h-10 w-10 animate-spin text-[#005f63]" />
					) : qrDataUrl ? (
						<button
							type="button"
							onClick={() => handlePreviewQr(qrDataUrl)}
							className="h-24 w-24 rounded-lg bg-white p-1 border border-slate-200 transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98]"
							aria-label={`Ver QR del ticket ${shortId(ticket.id)}`}
						>
							<img
								src={qrDataUrl}
								alt={`QR ticket ${shortId(ticket.id)}`}
								className="h-full w-full rounded-[6px]"
							/>
						</button>
					) : (
						<div className="h-24 w-24 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
							<QrCode className="h-8 w-8 text-slate-300" />
						</div>
					)}
				</div>

				{/* Info */}
				<div className="space-y-1.5 text-xs">
					<div className="font-mono text-slate-700 tracking-wide">
						#{shortId(ticket.id)}
					</div>
					{isRedeemedOrVoid && ticket.prizeName && (
						<div className="text-[10px] font-medium text-[#005f63] truncate" title={ticket.prizeName}>
							{ticket.prizeName}
						</div>
					)}

					<div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
						{/* Descargar PNG */}
						<BrandButton
							variant="ghost"
							size="sm"
							onClick={() => handleDownloadTicket(ticket.id)}
							disabled={isBusy || isLoadingQr}
							className={cn(
								"flex-1 gap-1 justify-center transition-all",
								"hover:bg-[#005f63]/5 hover:text-[#005f63]",
								"disabled:opacity-50 disabled:cursor-not-allowed"
							)}
							title="Descargar PNG"
						>
							<Download className="h-3.5 w-3.5" />
							<span className="hidden sm:inline">PNG</span>
						</BrandButton>

						{/* Ver QR grande */}
						{qrDataUrl && !isLoadingQr && (
							<BrandButton
								variant="ghost"
								size="sm"
								onClick={() => handlePreviewQr(qrDataUrl)}
								disabled={isBusy}
								className={cn(
									"flex-1 gap-1 justify-center transition-all",
									"hover:bg-[#005f63]/5 hover:text-[#005f63]",
									"disabled:opacity-50 disabled:cursor-not-allowed"
								)}
								title="Ver QR"
							>
								<Eye className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">Ver</span>
							</BrandButton>
						)}

						{/* Anular (solo disponibles/reservados) */}
						{!isRedeemedOrVoid && (
							<BrandButton
								variant="ghost"
								size="sm"
								onClick={() => handleVoidTicket(ticket.id)}
								disabled={isBusy}
								className={cn(
									"flex-1 gap-1 justify-center transition-all",
									"text-red-600 hover:bg-red-50 hover:border-red-200 border-red-100",
									"disabled:opacity-50 disabled:cursor-not-allowed"
								)}
								title="Anular ticket"
							>
								<Ban className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">Anular</span>
							</BrandButton>
						)}
					</div>
				</div>
			</div>
		);
	};

	// Paginación
	const totalPages = Math.max(1, Math.ceil(totalTickets / TICKETS_PER_PAGE));

	const handlePageChange = (newPage: number) => {
		if (newPage >= 1 && newPage <= totalPages) {
			setCurrentPage(newPage);
		}
	};

	// QR Preview Modal
	const qrModal = previewQr ? (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
			onClick={closePreviewQr}
			role="dialog"
			aria-modal="true"
			aria-label="Vista previa del QR"
		>
			<div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
				<div className="flex items-center justify-between mb-4">
					<h3 className="font-bold text-slate-800">Código QR</h3>
					<button
						type="button"
						onClick={closePreviewQr}
						className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-500"
						aria-label="Cerrar"
					>
						<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M18 6L6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
				<div className="bg-white p-4 rounded-xl border border-slate-200 inline-block mb-4">
					<img src={previewQr} alt="QR Code" className="h-64 w-64" />
				</div>
				<p className="text-sm font-mono text-slate-600 mb-4 break-all">#{shortId(tickets.find(t => qrCache[t.id] === previewQr)?.id ?? "")}</p>
				<div className="flex gap-2">
					<BrandButton
						variant="primary"
						size="sm"
						onClick={() => {
							const ticketId = tickets.find(t => qrCache[t.id] === previewQr)?.id;
							if (ticketId) {
								handleDownloadTicket(ticketId);
								closePreviewQr();
							}
						}}
						className="flex-1"
					>
						<Download className="h-4 w-4" />
						Descargar PNG
					</BrandButton>
					<BrandButton
						variant="light"
						size="sm"
						onClick={closePreviewQr}
						className="flex-1"
					>
						Cerrar
					</BrandButton>
				</div>
			</div>
		</div>
	) : null;

	return (
		<div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start min-h-[calc(100vh-4rem)] p-5 lg:p-8">
			{/* Columna izquierda: Generar tickets */}
			<div className="min-w-0 flex-shrink-0">
				<BrandCard>
					<SectionHeading
						icon={QrCode}
						title="Generar tickets QR"
						subtitle="Cada QR abre la ruleta móvil con su propio token único."
					/>

					<form
						onSubmit={(event) => {
							event.preventDefault();
							handleGenerate();
						}}
						className="mt-4 space-y-4"
					>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-1.5">
								<BrandLabel htmlFor="ticket-quantity">Cantidad</BrandLabel>
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => handleQuantityChange(-1)}
										disabled={quantity <= 1 || isGenerating}
										className={cn(
											"h-9 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center transition-all",
											"hover:bg-slate-50 active:scale-95",
											"disabled:opacity-50 disabled:cursor-not-allowed"
										)}
										aria-label="Disminuir cantidad"
									>
										<Minus className="h-4 w-4 text-slate-600" />
									</button>
									<BrandInput
										id="ticket-quantity"
										type="number"
										min={1}
										max={MAX_BATCH_SIZE}
										step={1}
										value={quantity}
										onChange={(event) => {
											const val = Number(event.target.value);
											if (!Number.isNaN(val)) setQuantity(Math.max(1, Math.min(MAX_BATCH_SIZE, val)));
										}}
										className="flex-1 text-center font-mono text-lg"
									/>
									<button
										type="button"
										onClick={() => handleQuantityChange(1)}
										disabled={quantity >= MAX_BATCH_SIZE || isGenerating}
										className={cn(
											"h-9 w-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center transition-all",
											"hover:bg-slate-50 active:scale-95",
											"disabled:opacity-50 disabled:cursor-not-allowed"
										)}
										aria-label="Aumentar cantidad"
									>
										<Plus className="h-4 w-4 text-slate-600" />
									</button>
								</div>
								<p className="text-[10px] text-slate-400 text-center">Máx. {MAX_BATCH_SIZE}</p>
							</div>

							<div className="grid gap-1.5">
								<BrandLabel htmlFor="ticket-expiry">Vence (opcional)</BrandLabel>
								<div className="relative">
									<Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
									<BrandInput
										id="ticket-expiry"
										type="datetime-local"
										min={minExpiry}
										value={expiresAt}
										onChange={(event) => setExpiresAt(event.target.value)}
										className="pl-10"
									/>
								</div>
							</div>
						</div>

						<div className="grid gap-1.5">
							<BrandLabel htmlFor="ticket-label">Etiqueta del lote</BrandLabel>
							<div className="relative">
								<Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
								<BrandInput
									id="ticket-label"
									type="text"
									maxLength={80}
									placeholder="Ej. Tienda Centro - Octubre"
									value={label}
									onChange={(event) => setLabel(event.target.value)}
									className="pl-10"
								/>
								{label && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">{label.length}/80</span>}
							</div>
						</div>

						<BrandButton
							type="submit"
							disabled={isGenerating}
							className="w-full py-3 text-base"
							style={{
								background: "linear-gradient(135deg, #E52421 0%, #005f63 100%)",
								border: "none",
							}}
						>
							{isGenerating ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Generando...
								</>
							) : quantity === 1 ? (
								<>
									<QrCode className="h-4 w-4" />
									Generar ticket
								</>
							) : (
								<>
									<QrCode className="h-4 w-4" />
									Generar {quantity} tickets
								</>
							)}
						</BrandButton>

						<p className="text-[11px] font-medium text-slate-400 text-center">
							Máximo {MAX_BATCH_SIZE} por lote. El QR no contiene datos personales ni premios.
						</p>

						{/* Stats del lote activo */}
						{batchStats && (
							<div className="rounded-xl bg-slate-50/50 border border-slate-200 p-3 space-y-2">
								<h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Estadísticas del sistema</h4>
								<div className="grid grid-cols-3 gap-2 text-center">
									<div className="rounded-lg bg-white p-2 border border-slate-100">
										<div className="font-bold text-[#005f63] text-lg">{batchStats.available}</div>
										<div className="text-[10px] text-slate-500">Disponibles</div>
									</div>
									<div className="rounded-lg bg-white p-2 border border-slate-100">
										<div className="font-bold text-amber-600 text-lg">{batchStats.reserved}</div>
										<div className="text-[10px] text-slate-500">Reservados</div>
									</div>
									<div className="rounded-lg bg-white p-2 border border-slate-100">
										<div className="font-bold text-[#005f63] text-lg">{batchStats.redeemed}</div>
										<div className="text-[10px] text-slate-500">Canjeados</div>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-2 text-center pt-1 border-t border-slate-200">
									<div className="rounded-lg bg-white p-2 border border-slate-100">
										<div className="font-bold text-red-600 text-lg">{batchStats.expired}</div>
										<div className="text-[10px] text-slate-500">Vencidos</div>
									</div>
									<div className="rounded-lg bg-white p-2 border border-slate-100">
										<div className="font-bold text-slate-400 text-lg">{batchStats.void}</div>
										<div className="text-[10px] text-slate-500">Anulados</div>
									</div>
								</div>
							</div>
						)}
						{statsError && (
							<p className="text-[11px] text-red-500 text-center">{statsError}</p>
						)}
					</form>
				</BrandCard>
			</div>

			{/* Columna derecha: Lista de tickets */}
			<div className="min-w-0 flex-1">
				<BrandCard>
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
						<div className="min-w-0">
							<h3 className="text-lg font-black tracking-tight text-slate-800 md:text-xl">
								{ticketView === "active" ? "Tickets activos" : "Tickets canjeados"}
							</h3>
							<div className="mt-1 h-0.5 w-12 bg-[#e51a24]" />
							<p className="mt-2 text-xs font-medium text-slate-500">
								{totalTickets} {totalTickets === 1 ? "ticket" : "tickets"} en total
							</p>
						</div>

						{/* Pestañas Activos / Canjeados + Buscar */}
						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
							<div className="flex gap-1 rounded-lg bg-slate-100 p-1">
								<button
									type="button"
									onClick={() => setTicketView("active")}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
										ticketView === "active"
											? "bg-white shadow-sm text-slate-900"
											: "text-slate-600 hover:text-slate-900"
									)}
								>
									<TicketIcon className="h-4 w-4" />
									<span>Activos</span>
								</button>
								<button
									type="button"
									onClick={() => setTicketView("redeemed")}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
										ticketView === "redeemed"
											? "bg-white shadow-sm text-slate-900"
											: "text-slate-600 hover:text-slate-900"
									)}
								>
									<RotateCcw className="h-4 w-4" />
									<span>Canjeados</span>
								</button>
							</div>

							<div className="relative w-full sm:w-[320px]">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
								<input
									type="text"
									placeholder="Buscar código..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#005f63]/20"
									aria-label="Buscar ticket por código"
								/>
							</div>
						</div>
					</div>

					{isLoadingTickets && (
						<div className="flex items-center justify-center gap-2 py-8">
							<Loader2 className="h-6 w-6 animate-spin text-[#005f63]" />
							<span className="text-sm font-medium text-slate-500">Cargando tickets...</span>
						</div>
					)}

					{!isLoadingTickets && tickets.length === 0 && (
						<div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
							<TicketIcon className="h-10 w-10 text-slate-300" aria-hidden="true" />
							<p className="max-w-xs text-sm font-medium text-slate-500">
								{ticketView === "active"
									? "No hay tickets activos. Genera un lote o busca por código."
									: "No hay tickets canjeados."}
							</p>
						</div>
					)}

					{!isLoadingTickets && tickets.length > 0 && (
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
							{tickets.map(renderTicket)}
						</div>
					)}

					{/* Paginación */}
					{totalPages > 1 && (
						<div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
							<div className="flex items-center gap-2">
								<BrandButton
									variant="light"
									size="sm"
									onClick={() => handlePageChange(currentPage - 1)}
									disabled={currentPage === 1}
								>
									<ChevronLeft className="h-4 w-4" />
								</BrandButton>
								<span className="px-3 text-sm font-medium text-slate-600 whitespace-nowrap">
									Página {currentPage} de {totalPages}
								</span>
								<BrandButton
									variant="light"
									size="sm"
									onClick={() => handlePageChange(currentPage + 1)}
									disabled={currentPage === totalPages}
								>
									<ChevronRight className="h-4 w-4" />
								</BrandButton>
							</div>
							<div className="flex items-center gap-2 text-sm text-slate-500">
								<span>Mostrando</span>
								<span className="font-mono font-bold">
									{(currentPage - 1) * TICKETS_PER_PAGE + 1}
								</span>
								<span>–</span>
								<span className="font-mono font-bold">
									{Math.min(currentPage * TICKETS_PER_PAGE, totalTickets)}
								</span>
								<span>de</span>
								<span className="font-mono font-bold">{totalTickets}</span>
							</div>
						</div>
					)}
				</BrandCard>
			</div>

			{qrModal}
		</div>
	);
}