import {
	Ban,
	ChevronLeft,
	ChevronRight,
	Download,
	FileArchive,
	History,
	Loader2,
	QrCode,
	RefreshCw,
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

interface TicketBatchSummary extends TicketBatchDto {
	total: number;
	available: number;
	reserved: number;
	redeemed: number;
	expired: number;
	void: number;
}

interface TicketPreview {
	id: string;
	qrDataUrl: string;
}

interface BatchResponse {
	batch: TicketBatchDto;
	tickets: TicketDto[];
	previews: TicketPreview[];
}

interface DateGroup {
	date: string;           // YYYY-MM-DD
	label: string;          // Formatted label like "MIÉRCOLES, 21 DE OCTUBRE DE 2026"
	count: number;          // Total tickets for this date
	tickets: TicketDto[];   // Tickets for this date (current page only)
	statusCounts: Record<TicketStatus, number>;
}

interface DatesResponse {
	dates: Array<{ date: string; count: number }>;
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

const DATE_FORMAT_FULL = new Intl.DateTimeFormat("es-VE", {
	weekday: "long",
	year: "numeric",
	month: "long",
	day: "numeric",
});

const DATE_FORMAT_SHORT = new Intl.DateTimeFormat("es-VE", {
	dateStyle: "medium",
	timeStyle: "short",
});

function formatDateFull(value: string): string {
	const date = new Date(value + "T00:00:00");
	if (Number.isNaN(date.getTime())) return "Fecha inválida";
	return DATE_FORMAT_FULL.format(date).toUpperCase();
}

function formatDateShort(value: string | null): string {
	if (!value) return "Sin vencimiento";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Fecha inválida";
	return DATE_FORMAT_SHORT.format(date);
}

function shortId(id: string): string {
	return id.slice(0, 8).toUpperCase();
}

function countByStatus(
	tickets: TicketDto[],
): Omit<TicketBatchSummary, keyof TicketBatchDto | "total"> & {
	total: number;
} {
	const counts: Record<TicketStatus, number> = {
		available: 0,
		reserved: 0,
		redeemed: 0,
		expired: 0,
		void: 0,
	};

	for (const ticket of tickets) {
		counts[ticket.status] += 1;
	}

	return { total: tickets.length, ...counts };
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.style.display = "none";
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function responseError(response: Response): Promise<string> {
	try {
		const data = (await response.json()) as { message?: string };
		if (data.message) return data.message;
	} catch {
		// Sin cuerpo JSON.
	}
	return `Error ${response.status}.`;
}

export function TicketManager() {
	const toast = useToast();
	const { operatorFetch, isAuthenticated, logout } = useOperatorAuth();

	// --- Generación de tickets ---
	const [quantity, setQuantity] = useState("1");
	const [label, setLabel] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);

	// --- Historial de lotes ---
	const [isLoadingBatches, setIsLoadingBatches] = useState(false);
	const [batches, setBatches] = useState<TicketBatchSummary[]>([]);
	const [showBatchesHistory, setShowBatchesHistory] = useState(false);

	// --- Vista "Todos los tickets por fecha" ---
	const [selectedStatus, setSelectedStatus] = useState<TicketStatus | "all">("all");
	const [selectedDate, setSelectedDate] = useState<string | "all">("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [dates, setDates] = useState<Array<{ date: string; count: number }>>([]);
	const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
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

	// --- Cargar fechas disponibles al montar ---
	useEffect(() => {
		loadDates();
		loadBatches();
	}, []);

	// --- Cargar tickets cuando cambian filtros ---
	useEffect(() => {
		setCurrentPage(1);
		loadTicketsForDate(selectedDate);
	}, [selectedDate, selectedStatus, debouncedQuery]);

	// --- Live polling para actualizar estados de tickets visibles ---
	const refreshVisibleTicketStatuses = useCallback(async () => {
		const visibleIds = new Set<string>();
		for (const group of dateGroups) {
			for (const ticket of group.tickets) {
				visibleIds.add(ticket.id);
			}
		}
		if (visibleIds.size === 0) return;
		try {
			const res = await operatorFetch("/tickets/lookup", {
				method: "POST",
				body: JSON.stringify({ ids: Array.from(visibleIds) }),
			});
			if (!res) return;
			const data = await res.json() as { tickets: TicketDto[] };
			// Actualizar status en dateGroups
			const statusMap = new Map(data.tickets.map(t => [t.id, t.status]));
			const prizeMap = new Map(data.tickets.map(t => [t.id, t.prizeName]));
			setDateGroups(prevGroups => prevGroups.map(group => ({
				...group,
				tickets: group.tickets.map(t => {
					const newStatus = statusMap.get(t.id);
					if (newStatus && newStatus !== t.status) {
						return { ...t, status: newStatus, prizeName: prizeMap.get(t.id) ?? t.prizeName };
					}
					return t;
				}),
				statusCounts: group.tickets.reduce((acc, t) => {
					const st = statusMap.get(t.id) ?? t.status;
					acc[st] = (acc[st] ?? 0) + 1;
					return acc;
				}, {} as Record<TicketStatus, number>),
			})));
		} catch {
			// Silencioso
		}
	}, [operatorFetch, dateGroups]);

	// Ref estable para el callback de refresco (evita reiniciar el polling en cada render)
	const refreshStatusesRef = useRef(refreshVisibleTicketStatuses);
	refreshStatusesRef.current = refreshVisibleTicketStatuses;

	// Usamos el endpoint de stats global para contadores en vivo (más ligero)
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

	// --- Cargar lista de lotes ---
	const loadBatches = async () => {
		setIsLoadingBatches(true);
		try {
			const response = await operatorFetch("/tickets/batches?limit=25");
			if (!response) return;
			const data = (await response.json()) as {
				batches?: TicketBatchSummary[];
				message?: string;
			};
			if (!response.ok) throw new Error(data.message ?? `Error ${response.status}.`);
			setBatches(data.batches ?? []);
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudo cargar el historial."));
		} finally {
			setIsLoadingBatches(false);
		}
	};

	// --- Cargar fechas con contadores ---
	const loadDates = async () => {
		try {
			const params = new URLSearchParams();
			if (selectedStatus !== "all") params.set("status", selectedStatus);
			const response = await operatorFetch(`/tickets/dates?${params.toString()}`);
			if (!response) return;
			const data = (await response.json()) as DatesResponse;
			setDates(data.dates ?? []);
			// Auto-seleccionar la fecha más reciente si no hay ninguna seleccionada
			if (selectedDate === "all" && data.dates.length > 0) {
				setSelectedDate(data.dates[0].date);
			}
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudieron cargar las fechas."));
		}
	};

	// --- Cargar tickets para la fecha/estado seleccionado ---
	const loadTicketsForDate = async (date: string | "all") => {
		setIsLoadingTickets(true);
		try {
			const params = new URLSearchParams({
				limit: String(TICKETS_PER_PAGE),
				offset: String((currentPage - 1) * TICKETS_PER_PAGE),
			});
			if (selectedStatus !== "all") params.set("status", selectedStatus);
			if (date !== "all") params.set("date", date);
			if (debouncedQuery) params.set("q", debouncedQuery.toUpperCase());

			const response = await operatorFetch(`/tickets?${params.toString()}`);
			if (!response) return;
			const data = (await response.json()) as TicketsResponse;

			const tickets = data.tickets ?? [];
			setTotalTickets(data.total);

			// Si hay una sola fecha seleccionada, agrupar por esa fecha
			// Si "all", agrupar por fecha de cada ticket
			if (date !== "all") {
				const statusCounts = tickets.reduce((acc, t) => {
					acc[t.status] = (acc[t.status] ?? 0) + 1;
					return acc;
				}, {} as Record<TicketStatus, number>);
				setDateGroups([{
					date,
					label: formatDateFull(date),
					count: data.total,
					tickets,
					statusCounts,
				}]);
			} else {
				// Agrupar por fecha
				const groups = new Map<string, TicketDto[]>();
				for (const t of tickets) {
					const d = t.createdAt.slice(0, 10);
					if (!groups.has(d)) groups.set(d, []);
					groups.get(d)!.push(t);
				}
				const newGroups: DateGroup[] = [];
				for (const [d, ts] of groups) {
					const statusCounts = ts.reduce((acc, t) => {
						acc[t.status] = (acc[t.status] ?? 0) + 1;
						return acc;
					}, {} as Record<TicketStatus, number>);
					newGroups.push({
						date: d,
						label: formatDateFull(d),
						count: data.total, // Total global para esta fecha
						tickets: ts,
						statusCounts,
					});
				}
				newGroups.sort((a, b) => b.date.localeCompare(a.date));
				setDateGroups(newGroups);
			}

			// Cargar QR para tickets visibles
			loadQrsForTickets(tickets);
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudieron cargar los tickets."));
		} finally {
			setIsLoadingTickets(false);
		}
	};

	// --- Cargar QR para un array de tickets (bajo demanda) ---
	const loadQrsForTickets = useCallback(async (tickets: TicketDto[]) => {
		const ids = tickets
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

			const summary: TicketBatchSummary = {
				...data.batch,
				...countByStatus(data.tickets),
			};
			setBatches(prev => [summary, ...prev.filter(b => b.id !== data.batch.id)]);
			setQuantity("1");
			setLabel("");
			setExpiresAt("");
			toast.success(count === 1 ? "Ticket generado." : `${count} tickets generados.`);

			// Recargar fechas y tickets
			loadDates();
			await loadTicketsForDate("all");
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudieron generar los tickets."));
		} finally {
			setIsGenerating(false);
		}
	};

	// --- Descargar ZIP de un lote ---
	const handleDownloadZip = async (batchId: string) => {
		setBusyKey(`zip-${batchId}`);
		try {
			const response = await operatorFetch(`/tickets/batches/${batchId}/qr.zip?include=all`);
			if (!response) return;
			if (!response.ok) throw new Error(await responseError(response));
			const blob = await response.blob();
			downloadBlob(blob, `tickets-${shortId(batchId)}.zip`);
			toast.success("ZIP descargado.");
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudo descargar el ZIP."));
		} finally {
			setBusyKey(null);
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
			toast.success("QR descargado.");
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudo descargar el QR."));
		} finally {
			setBusyKey(null);
		}
	};

	// --- Anular ticket ---
	const handleVoidTicket = async (ticketId: string) => {
		const confirmed = window.confirm(`¿Anular el ticket ${shortId(ticketId)}? Esta acción no se puede deshacer.`);
		if (!confirmed) return;

		setBusyKey(`void-${ticketId}`);
		try {
			const response = await operatorFetch(`/tickets/${ticketId}/void`, { method: "POST" });
			if (!response) return;
			const data = (await response.json()) as { success?: boolean; message?: string; reason?: string };
			if (!response.ok || !data.success) {
				throw new Error(
					data.message ?? (data.reason === "already_redeemed" ? "No se puede anular un ticket canjeado." : `Error ${response.status}.`),
				);
			}

			// Actualizar estado local
			setDateGroups(prev => prev.map(group => ({
				...group,
				tickets: group.tickets.map(t => t.id === ticketId ? { ...t, status: "void" as TicketStatus } : t),
				statusCounts: group.tickets.reduce((acc, t) => {
					const st = t.id === ticketId ? "void" as TicketStatus : t.status;
					acc[st] = (acc[st] ?? 0) + 1;
					return acc;
				}, {} as Record<TicketStatus, number>),
			})));
			toast.success("Ticket anulado.");
		} catch (error) {
			toast.error(translateMessage(error instanceof Error ? error.message : undefined, "No se pudo anular el ticket."));
		} finally {
			setBusyKey(null);
		}
	};

	// --- Paginación ---
	const totalPages = Math.max(1, Math.ceil(totalTickets / TICKETS_PER_PAGE));

	const handlePageChange = (newPage: number) => {
		if (newPage >= 1 && newPage <= totalPages) {
			setCurrentPage(newPage);
			loadTicketsForDate(selectedDate);
		}
	};

	// --- Reset página cuando cambian filtros ---
	useEffect(() => { setCurrentPage(1); }, [selectedStatus, selectedDate, debouncedQuery]);

	// --- Recargar fechas cuando cambia filtro de estado ---
	useEffect(() => { loadDates(); }, [selectedStatus]);

	// Derived: show "Ver lote" only if we have a batch selected
	// (We don't have a single batch view anymore, but we keep the batch history)

	return (
		<div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
			{/* Columna izquierda: generación + historial de lotes plegable */}
			<div className="flex min-w-0 flex-col gap-5">
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

				{/* Historial de lotes (plegable) */}
				<BrandCard>
					<div className="flex items-center justify-between">
						<SectionHeading
							icon={History}
							title={showBatchesHistory ? "Ocultar historial de lotes" : "Historial de lotes"}
							subtitle={
								batches.length === 0
									? "Sin lotes guardados."
									: `${batches.length} ${batches.length === 1 ? "lote" : "lotes"} guardados. Click para ver ZIP.`
							}
						/>
						<BrandButton
							variant="light"
							size="sm"
							onClick={() => setShowBatchesHistory(!showBatchesHistory)}
							disabled={isLoadingBatches}
							className="shrink-0"
						>
							<RefreshCw
								className={cn(
									"h-3.5 w-3.5",
									isLoadingBatches && "animate-spin",
								)}
							/>
							{isLoadingBatches ? "Cargando..." : showBatchesHistory ? "Ocultar" : "Ver"}
						</BrandButton>
					</div>

					{showBatchesHistory && (
						<div className="mt-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
							{batches.length === 0 ? (
								<div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm font-medium text-slate-500">
									<TicketIcon className="h-5 w-5 shrink-0 text-slate-400" />
									No hay lotes guardados. Genera tu primer lote arriba.
								</div>
							) : (
								batches.map((batch) => (
									<div
										key={batch.id}
										className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
									>
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate text-sm font-bold text-slate-800">
													{batch.label || "Lote sin etiqueta"}
												</p>
												<p className="mt-0.5 text-[11px] font-medium text-slate-500">
													{batch.total} tickets · {formatDateShort(batch.createdAt)}
												</p>
												<p className="mt-0.5 text-[11px] font-medium text-slate-400">
													Vence: {formatDateShort(batch.expiresAt)}
												</p>
											</div>
											<span className="shrink-0 rounded-full bg-[#005f63]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#005f63]">
												{batch.available} disp.
											</span>
										</div>

										<div className="mt-2.5 flex flex-wrap gap-1.5">
											<BrandButton
												variant="outline"
												size="sm"
												onClick={() => handleDownloadZip(batch.id)}
												disabled={busyKey !== null}
											>
												<FileArchive className="h-3.5 w-3.5" />
												{busyKey === `zip-${batch.id}` ? "Descargando..." : "Descargar ZIP"}
											</BrandButton>
										</div>
									</div>
								))
							)}
						</div>
					)}

					{isAuthenticated && (
						<div className="mt-4 border-t border-slate-200 pt-3">
							<BrandButton
								variant="ghost"
								size="sm"
								onClick={logout}
								className="w-full"
							>
								<RotateCcw className="h-3.5 w-3.5" />
								Cerrar sesión
							</BrandButton>
						</div>
					)}
				</BrandCard>
			</div>

			{/* Columna derecha: Todos los tickets agrupados por fecha */}
			<div className="min-w-0">
				<BrandCard>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="min-w-0">
							<h3 className="text-lg font-black tracking-tight text-slate-800 md:text-xl">
								Tickets por fecha
							</h3>
							<div className="mt-1 h-0.5 w-12 bg-[#e51a24]" />
							<p className="mt-2 text-xs font-medium text-slate-500">
								{totalTickets} {totalTickets === 1 ? "ticket" : "tickets"} en total
							</p>
						</div>
					</div>

					{/* Filtros: Estado + Fecha + Buscar */}
					<div className="mt-4 space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<label htmlFor="status-filter" className="text-xs font-medium text-slate-500">Estado:</label>
							<select
								id="status-filter"
								value={selectedStatus}
								onChange={(e) => setSelectedStatus(e.target.value as TicketStatus | "all")}
								className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#005f63]/20"
							>
								<option value="all">Todos</option>
								{Object.keys(STATUS_LABELS).map((s) => (
									<option key={s} value={s}>{STATUS_LABELS[s as TicketStatus]}</option>
								))}
							</select>

							<label htmlFor="date-filter" className="text-xs font-medium text-slate-500 ml-4">Fecha:</label>
							<select
								id="date-filter"
								value={selectedDate}
								onChange={(e) => setSelectedDate(e.target.value)}
								className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#005f63]/20"
							>
								<option value="all">Todas las fechas</option>
								{dates.map((d) => (
									<option key={d.date} value={d.date}>
										{formatDateFull(d.date)} ({d.count})
									</option>
								))}
							</select>

							<div className="ml-auto flex items-center gap-2">
								<div className="relative">
									<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
									<input
										type="text"
										placeholder="Buscar código..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#005f63]/20 w-[200px]"
										aria-label="Buscar ticket por código"
									/>
								</div>
							</div>
						</div>

						{isLoadingTickets && (
							<div className="flex items-center justify-center gap-2 py-2">
								<Loader2 className="h-4 w-4 animate-spin text-[#005f63]" />
								<span className="text-sm font-medium text-slate-500">Cargando tickets...</span>
							</div>
						)}

						{!isLoadingTickets && dateGroups.length === 0 && (
							<div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
								<TicketIcon className="h-10 w-10 text-slate-300" aria-hidden="true" />
								<p className="max-w-xs text-sm font-medium text-slate-500">
									No hay tickets con los filtros actuales. Genera un lote o ajusta los filtros.
								</p>
							</div>
						)}

						{/* Grupos por fecha */}
						{dateGroups.map((group) => (
							<div key={group.date} className="space-y-3">
								<div className="flex items-center justify-between">
									<h4 className="text-sm font-bold uppercase tracking-wide text-slate-700">
										{group.label}
									</h4>
									<div className="flex flex-wrap items-center gap-1.5">
										{(
											Object.keys(STATUS_LABELS) as TicketStatus[]
										).map((status) => {
											const count = group.statusCounts[status] ?? 0;
											if (count === 0) return null;
											return (
												<span
													key={status}
													className={cn(
														"rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
														STATUS_STYLES[status],
													)}
												>
													{count} {STATUS_LABELS[status].slice(0, 3)}
												</span>
											);
										})}
										<span className="ml-2 text-xs text-slate-400">
											{group.tickets.length} de {group.count}
										</span>
									</div>
								</div>

								<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
									{group.tickets.map((ticket) => {
										const status = ticket.status;
										const isRedeemedOrVoid = status === "redeemed" || status === "void";
										const qrDataUrl = qrCache[ticket.id] ?? "";
										const isLoadingQr = qrLoading.has(ticket.id);

										return (
											<div
												key={ticket.id}
												className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 relative"
											>
												{/* QR Image */}
												<div className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-white">
													{isLoadingQr ? (
														<div className="flex items-center justify-center h-full w-full">
															<Loader2 className="h-5 w-5 animate-spin text-[#005f63]" />
														</div>
													) : qrDataUrl ? (
														<img
															src={qrDataUrl}
															alt={`Código QR del ticket ${shortId(ticket.id)}`}
															className="w-full h-full object-contain p-1"
														/>
													) : (
														<div className="flex items-center justify-center h-full w-full text-slate-300">
															<QrCode className="h-8 w-8" />
														</div>
													)}
												</div>

												<p className="mt-2 text-center font-mono text-xs font-bold tracking-wide text-slate-700">
													{shortId(ticket.id)}
												</p>
												<span
													className={cn(
														"mx-auto mt-1 block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
														STATUS_STYLES[status],
													)}
												>
													{STATUS_LABELS[status]}
												</span>
												{status === "redeemed" && ticket.prizeName && (
													<p className="mt-1 text-center text-[10px] font-semibold text-slate-500">
														Premio: {ticket.prizeName}
													</p>
												)}

												{!isRedeemedOrVoid && (
													<BrandButton
														variant="outline"
														size="sm"
														onClick={() => handleDownloadTicket(ticket.id)}
														disabled={busyKey !== null}
														className="mt-2 w-full"
													>
														<Download className="h-3.5 w-3.5" />
														{busyKey === `qr-${ticket.id}` ? "..." : "PNG"}
													</BrandButton>
												)}
												{!isRedeemedOrVoid && (
													<BrandButton
														variant="ghost"
														size="sm"
														onClick={() => handleVoidTicket(ticket.id)}
														disabled={busyKey !== null}
														className="mt-1 w-full"
													>
														<Ban className="h-3.5 w-3.5" />
														{busyKey === `void-${ticket.id}` ? "..." : "Anular"}
													</BrandButton>
												)}
											</div>
										);
									})}
								</div>
							</div>
						))}

						{/* Paginación */}
						{totalPages > 1 && (
							<div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-200">
								<BrandButton
									variant="light"
									size="sm"
									onClick={() => handlePageChange(currentPage - 1)}
									disabled={currentPage === 1}
								>
									<ChevronLeft className="h-3.5 w-3.5" />
								</BrandButton>
								<span className="text-sm font-medium text-slate-500">
									Página {currentPage} de {totalPages}
								</span>
								<BrandButton
									variant="light"
									size="sm"
									onClick={() => handlePageChange(currentPage + 1)}
									disabled={currentPage === totalPages}
								>
									<ChevronRight className="h-3.5 w-3.5" />
								</BrandButton>
							</div>
						)}
					</div>
				</BrandCard>
			</div>
		</div>
	);
}