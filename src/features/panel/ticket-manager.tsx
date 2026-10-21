import {
	Ban,
	ChevronLeft,
	ChevronRight,
	Download,
	Loader2,
	QrCode,
	RotateCcw,
	Search,
	Ticket as TicketIcon,
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
	available: "bg-[#005f63]/10 text-[#005f63]",
	reserved: "bg-amber-100 text-amber-700",
	redeemed: "bg-slate-200 text-slate-700",
	expired: "bg-[#E52421]/10 text-[#c81d1a]",
	void: "bg-slate-200 text-slate-500",
};

const DATE_FORMAT_SHORT = new Intl.DateTimeFormat("es-VE", {
	dateStyle: "medium",
	timeStyle: "short",
});

function formatDateShort(value: string | null): string {
	if (!value) return "Sin vencimiento";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Fecha inválida";
	return DATE_FORMAT_SHORT.format(date);
}

function shortId(id: string): string {
	return id.slice(0, 8).toUpperCase();
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

export function TicketManager() {
	const toast = useToast();
	const { operatorFetch, isAuthenticated, logout } = useOperatorAuth();

	// --- Generación de tickets ---
	const [quantity, setQuantity] = useState("1");
	const [label, setLabel] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);

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

	// --- Live polling para actualizar estados de tickets visibles ---
	const refreshStatusesRef = useRef(loadTickets);
	refreshStatusesRef.current = loadTickets;

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
	const handleGenerate = async () => {
		const count = Number(quantity);
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

			setQuantity("1");
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
				className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 relative"
			>
				{/* Badge de estado */}
				<div className="absolute -top-2 -right-2">
					<span
						className={cn(
							"rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
							STATUS_STYLES[status],
						)}
					>
						{STATUS_LABELS[status].slice(0, 3)}
					</span>
				</div>

				{/* QR */}
				<div className="flex justify-center mb-2">
					{isLoadingQr ? (
						<Loader2 className="h-8 w-8 animate-spin text-[#005f63]" />
					) : qrDataUrl ? (
						<img
							src={qrDataUrl}
							alt={`QR ticket ${shortId(ticket.id)}`}
							className="h-24 w-24 rounded-lg bg-white p-1 border border-slate-200"
						/>
					) : (
						<div className="h-24 w-24 rounded-lg bg-slate-100 flex items-center justify-center">
							<QrCode className="h-8 w-8 text-slate-300" />
						</div>
					)}
				</div>

				{/* Info */}
				<div className="space-y-1 text-xs">
					<div className="font-mono text-slate-600">
						#{shortId(ticket.id)}
					</div>
					{isRedeemedOrVoid && ticket.prizeName && (
						<div className="text-[10px] font-medium text-[#005f63] truncate">
							{ticket.prizeName}
						</div>
					)}

					<div className="flex items-center justify-between pt-1 border-t border-slate-200">
						{/* Descargar PNG */}
						<BrandButton
							variant="ghost"
							size="sm"
							onClick={() => handleDownloadTicket(ticket.id)}
							disabled={isBusy || isLoadingQr}
							className="gap-1"
						>
							<Download className="h-3.5 w-3.5" />
							<span>PNG</span>
						</BrandButton>

						{/* Anular (solo disponibles/reservados) */}
						{!isRedeemedOrVoid && (
							<BrandButton
								variant="ghost"
								size="sm"
								onClick={() => handleVoidTicket(ticket.id)}
								disabled={isBusy}
								className="gap-1 text-red-600 hover:bg-red-50"
							>
								<Ban className="h-3.5 w-3.5" />
								<span>Anular</span>
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

	return (
		<div className="flex min-h-[calc(100vh-4rem)] flex-col gap-5 p-5 lg:p-8">
			{/* Columna izquierda: Generar tickets */}
			<div className="w-full lg:w-80 flex-shrink-0">
				<BrandCard>
					<SectionHeading
						icon={QrCode}
						title="Generar tickets QR"
						subtitle="Cada QR abre la ruleta móvil con su propio token."
					/>

					<form
						onSubmit={(event) => {
							event.preventDefault();
							handleGenerate();
						}}
						className="mt-4 space-y-3"
					>
						<div className="grid grid-cols-2 gap-3">
							<div className="grid gap-1.5">
								<BrandLabel htmlFor="ticket-quantity">Cantidad</BrandLabel>
								<BrandInput
									id="ticket-quantity"
									type="number"
									min={1}
									max={MAX_BATCH_SIZE}
									step={1}
									value={quantity}
									onChange={(event) => setQuantity(event.target.value)}
								/>
							</div>

							<div className="grid gap-1.5">
								<BrandLabel htmlFor="ticket-expiry">
									Vence (opcional)
								</BrandLabel>
								<BrandInput
									id="ticket-expiry"
									type="datetime-local"
									min={minExpiry}
									value={expiresAt}
									onChange={(event) => setExpiresAt(event.target.value)}
								/>
							</div>
						</div>

						<div className="grid gap-1.5">
							<BrandLabel htmlFor="ticket-label">
								Etiqueta del lote
							</BrandLabel>
							<BrandInput
								id="ticket-label"
								type="text"
								maxLength={80}
								placeholder="Ej. Tienda Centro - Octubre"
								value={label}
								onChange={(event) => setLabel(event.target.value)}
							/>
						</div>

						<BrandButton
							type="submit"
							disabled={isGenerating}
							className="w-full"
						>
							<QrCode className="h-4 w-4" />
							{isGenerating
								? "Generando..."
								: Number(quantity) === 1
								? "Generar ticket"
								: `Generar ${quantity || 0} tickets`}
						</BrandButton>

						<p className="text-[11px] font-medium text-slate-400">
							Máximo {MAX_BATCH_SIZE} por lote. El QR no contiene datos
							personales ni premios.
						</p>
					</form>
				</BrandCard>
			</div>

			{/* Columna derecha: Lista de tickets */}
			<div className="min-w-0 flex-1">
				<BrandCard>
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
									className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
										ticketView === "active"
											? "bg-white shadow-sm text-slate-900"
											: "text-slate-600 hover:text-slate-900"
									}`}
								>
									<TicketIcon className="h-4 w-4" />
									<span>Activos</span>
								</button>
								<button
									type="button"
									onClick={() => setTicketView("redeemed")}
									className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
										ticketView === "redeemed"
											? "bg-white shadow-sm text-slate-900"
											: "text-slate-600 hover:text-slate-900"
									}`}
								>
									<RotateCcw className="h-4 w-4" />
									<span>Canjeados</span>
								</button>
							</div>

							<div className="relative w-full sm:w-[280px]">
								<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
								<input
									type="text"
									placeholder="Buscar código..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#005f63]/20 w-full"
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
						<div className="mt-6 flex items-center justify-center gap-2">
							<BrandButton
								variant="light"
								size="sm"
								onClick={() => handlePageChange(currentPage - 1)}
								disabled={currentPage === 1}
							>
								<ChevronLeft className="h-4 w-4" />
							</BrandButton>
							<span className="px-3 text-sm font-medium text-slate-600">
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
					)}
				</BrandCard>
			</div>
		</div>
	);
}