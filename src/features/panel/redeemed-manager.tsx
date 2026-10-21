import { useEffect, useState, useCallback, useRef } from "react";
import { Search, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useToast } from "./panel-toast";
import {
	BrandButton,
	BrandCard,
	BrandInput,
	BrandLabel,
	SectionHeading,
} from "./panel-ui";
import { useLivePolling } from "./use-live-polling";
import { API_URL } from "@/shared/api";

const DATE_FORMAT = new Intl.DateTimeFormat("es-VE", {
	dateStyle: "medium",
	timeStyle: "short",
});

function formatDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Fecha inválida";
	return DATE_FORMAT.format(date);
}

function shortId(id: string): string {
	return id.slice(0, 8).toUpperCase();
}

interface RedeemedTicket {
	id: string;
	batchId: string | null;
	batchLabel: string | null;
	prizeName: string | null;
	redeemedAt: string;
}

interface RedeemedResponse {
	total: number;
	limit: number;
	offset: number;
	tickets: RedeemedTicket[];
}

interface BatchOption {
	id: string;
	label: string | null;
}

export function RedeemedManager() {
	const toast = useToast();
	const [batches, setBatches] = useState<BatchOption[]>([]);
	const [selectedBatchId, setSelectedBatchId] = useState<string | "all">("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [tickets, setTickets] = useState<RedeemedTicket[]>([]);
	const [total, setTotal] = useState(0);
	const [limit, setLimit] = useState(50);
	const [offset, setOffset] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [globalStats, setGlobalStats] = useState<{
		total: number;
		redeemed: number;
		available: number;
		reserved: number;
		void: number;
		expired: number;
	} | null>(null);
	const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Cargar lotes para el filtro
	useEffect(() => {
		const loadBatches = async () => {
			try {
				const res = await fetch(`${API_URL}/tickets/batches?limit=100`, {
					credentials: "same-origin",
					cache: "no-store",
				});
				const data = (await res.json().catch(() => ({}))) as { batches?: { id: string; label: string | null }[] };
				if (data.batches) {
					setBatches(data.batches.map((b) => ({ id: b.id, label: b.label })));
				}
			} catch {
				// Silencioso
			}
		};
		loadBatches();
	}, []);

	// Cargar estadísticas globales
	useEffect(() => {
		const loadStats = async () => {
			try {
				const res = await fetch(`${API_URL}/tickets/stats`, {
					credentials: "same-origin",
					cache: "no-store",
				});
				const data = (await res.json().catch(() => ({}))) as {
					total: number;
					redeemed: number;
					available: number;
					reserved: number;
					void: number;
					expired: number;
				};
				setGlobalStats(data);
			} catch {
				// Silencioso
			}
		};
		loadStats();
		// Polling de estadísticas cada 30s
		const interval = setInterval(loadStats, 30000);
		return () => clearInterval(interval);
	}, []);

	// Polling en vivo para la tabla de canjeados
	const { isPolling, refresh: refreshTable } = useLivePolling(
		`/tickets/redeemed?batchId=${selectedBatchId === "all" ? "" : selectedBatchId}&q=${encodeURIComponent(debouncedQuery)}&limit=${limit}&offset=${offset}`,
		{
			enabled: true,
			intervalMs: 3000,
			onTick: (data) => {
				const typed = data as RedeemedResponse;
				setTickets(typed.tickets);
				setTotal(typed.total);
			},
			onError: () => {
				// Silencioso, el backoff maneja los reintentos
			},
		}
	);

	// Debounce de búsqueda
	useEffect(() => {
		if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
		searchTimeoutRef.current = setTimeout(() => {
			setDebouncedQuery(searchQuery);
			setOffset(0);
		}, 300);
		return () => {
			if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
		};
	}, [searchQuery]);

	// Reset offset cuando cambian filtros
	useEffect(() => {
		setOffset(0);
	}, [selectedBatchId, debouncedQuery]);

	const handlePageChange = (newOffset: number) => {
		if (newOffset >= 0 && newOffset < total) {
			setOffset(newOffset);
		}
	};

	const handleExportCsv = async () => {
		setIsLoading(true);
		try {
			const batchParam = selectedBatchId === "all" ? "" : `&batchId=${selectedBatchId}`;
			const res = await fetch(`${API_URL}/tickets/redeemed.csv?${batchParam}`, {
				credentials: "same-origin",
				cache: "no-store",
			});
			if (!res.ok) throw new Error("Error al exportar");

			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "canjeados.csv";
			a.style.display = "none";
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			toast.success("CSV exportado.");
		} catch {
			toast.error("No se pudo exportar el CSV.");
		} finally {
			setIsLoading(false);
		}
	};

	const totalPages = Math.ceil(total / limit) || 1;
	const currentPage = Math.floor(offset / limit) + 1;

	return (
		<BrandCard>
			<SectionHeading
				icon={Download}
				title="QR Canjeados"
				subtitle="Registro histórico de tickets canjeados. Filtra por lote o busca por código."
			/>

			{globalStats && (
				<div className="mt-4 flex flex-wrap gap-2">
					{[
						{ label: "Total", value: globalStats.total, color: "bg-slate-100 text-slate-700" },
						{ label: "Canjeados", value: globalStats.redeemed, color: "bg-[#005f63]/10 text-[#005f63]" },
						{ label: "Disponibles", value: globalStats.available, color: "bg-green-100 text-green-700" },
						{ label: "Reservados", value: globalStats.reserved, color: "bg-amber-100 text-amber-700" },
						{ label: "Vencidos", value: globalStats.expired, color: "bg-[#E52421]/10 text-[#c81d1a]" },
						{ label: "Anulados", value: globalStats.void, color: "bg-slate-200 text-slate-500" },
					].map((stat) => (
						<span key={stat.label} className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", stat.color)}>
							{stat.value} {stat.label.toLowerCase()}
						</span>
					))}
				</div>
			)}

			<div className="mt-4 flex flex-col sm:flex-row gap-3">
				{/* Buscador */}
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
					<input
						type="search"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Buscar por código (ej. A1B2C3D4)..."
						className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#005f63]/20"
						aria-label="Buscar canjeados"
					/>
				</div>

				{/* Filtro por lote */}
				<div className="w-full sm:w-[220px]">
					<select
						value={selectedBatchId}
						onChange={(e) => setSelectedBatchId(e.target.value)}
						className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#005f63]/20"
					>
						<option value="all">Todos los lotes</option>
						{batches.map((batch) => (
							<option key={batch.id} value={batch.id}>
								{batch.label || `Lote ${shortId(batch.id)}`}
							</option>
						))}
					</select>
				</div>

				{/* Exportar CSV */}
				<BrandButton
					variant="outline"
					size="sm"
					onClick={handleExportCsv}
					disabled={isLoading || total === 0}
					className="shrink-0"
				>
					<Download className="h-3.5 w-3.5" />
					{isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Exportar CSV"}
				</BrandButton>
			</div>

			{/* Tabla de canjeados */}
			<div className="mt-4">
				{isLoading && tickets.length === 0 ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-8 w-8 animate-spin text-[#005f63]" />
					</div>
				) : tickets.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center">
						<Download className="h-10 w-10 text-slate-300" aria-hidden="true" />
						<p className="text-sm font-medium text-slate-500">
							{debouncedQuery
								? `No hay canjeados que coincidan con «${debouncedQuery}».`
								: "No hay tickets canjeados en este lote."}
						</p>
					</div>
				) : (
					<>
						<div className="overflow-x-auto rounded-xl border border-slate-200">
							<table className="w-full text-sm" role="grid">
								<thead className="bg-slate-50/50">
									<tr>
										<th className="px-3 py-2 text-left font-bold text-slate-600">Código</th>
										<th className="px-3 py-2 text-left font-bold text-slate-600">Lote</th>
										<th className="px-3 py-2 text-left font-bold text-slate-600">Premio</th>
										<th className="px-3 py-2 text-left font-bold text-slate-600">Fecha de canje</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{tickets.map((ticket) => (
										<tr key={ticket.id} className="hover:bg-slate-50/50">
											<td className="px-3 py-2 font-mono font-bold text-slate-800">{shortId(ticket.id)}</td>
											<td className="px-3 py-2 text-slate-600">{ticket.batchLabel || `Lote ${shortId(ticket.batchId ?? "")}`}</td>
											<td className="px-3 py-2 font-medium text-slate-800">{ticket.prizeName || "—"}</td>
											<td className="px-3 py-2 text-slate-500">{formatDate(ticket.redeemedAt)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						{totalPages > 1 && (
							<div className="mt-4 flex items-center justify-between">
								<p className="text-sm font-medium text-slate-500">
									Página {currentPage} de {totalPages} · {total} {total === 1 ? "registro" : "registros"}
								</p>
								<div className="flex items-center gap-1.5">
									<BrandButton
										variant="light"
										size="sm"
										onClick={() => handlePageChange(offset - limit)}
										disabled={offset === 0}
									>
										<ChevronLeft className="h-3.5 w-3.5" />
									</BrandButton>
									<BrandButton
										variant="light"
										size="sm"
										onClick={() => handlePageChange(offset + limit)}
										disabled={offset + limit >= total}
									>
										<ChevronRight className="h-3.5 w-3.5" />
									</BrandButton>
								</div>
							</div>
						)}
					</>
				)}
			</div>

			{isPolling && (
				<p className="mt-2 text-right text-[10px] font-medium text-slate-400" aria-live="polite">
					Actualizado hace unos segundos
				</p>
			)}
		</BrandCard>
	);
}