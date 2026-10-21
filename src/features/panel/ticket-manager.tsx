import {
	Ban,
	Bell,
	Eye,
	Download,
	FileArchive,
	History,
	QrCode,
	RefreshCw,
	RotateCcw,
	Ticket as TicketIcon,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/shared/lib/utils";
import { useOperatorAuth } from "./operator-auth-context";
import { translateMessage } from "./panel-messages";
import { useToast } from "./panel-toast";
import { useLivePolling } from "./use-live-polling";
import { API_URL } from "@/shared/api";
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

const MAX_BATCH_SIZE = 500;

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

const DATE_FORMAT = new Intl.DateTimeFormat("es-VE", {
	dateStyle: "medium",
	timeStyle: "short",
});

function formatDate(value: string | null): string {
	if (!value) return "Sin vencimiento";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Fecha inválida";
	return DATE_FORMAT.format(date);
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
	const { operatorFetch, isAuthenticated, logout, checkingAuth } = useOperatorAuth();

	const [quantity, setQuantity] = useState("1");
	const [label, setLabel] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [isLoadingBatches, setIsLoadingBatches] = useState(false);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [result, setResult] = useState<BatchResponse | null>(null);
	const [batches, setBatches] = useState<TicketBatchSummary[]>([]);

	// Live polling state
	const [liveCounts, setLiveCounts] = useState<{
		total: number;
		available: number;
		reserved: number;
		redeemed: number;
		void: number;
		expired: number;
	} | null>(null);
	const [liveRedeemedIds, setLiveRedeemedIds] = useState<Set<string>>(new Set());
	const viewedBatchIdRef = useRef<string | null>(null);

	const minExpiry = new Date(
		Date.now() - new Date().getTimezoneOffset() * 60_000,
	)
		.toISOString()
		.slice(0, 16);

	// Live polling para el lote visto
	const { isPolling } = useLivePolling(
		viewedBatchIdRef.current ? `/tickets/batches/${viewedBatchIdRef.current}/live` : "",
		{
			enabled: !!viewedBatchIdRef.current,
			intervalMs: 3000,
			onTick: (data) => {
				const live = data as {
					batchId: string;
					counts: { total: number; available: number; reserved: number; redeemed: number; void: number; expired: number };
					redeemed: { id: string; prizeName: string | null; redeemedAt: string }[];
					serverTime: string;
				};
				setLiveCounts(live.counts);
				// Detectar nuevos canjeados
				const newRedeemed = live.redeemed.filter((r) => !liveRedeemedIds.current.has(r.id));
				for (const r of newRedeemed) {
					liveRedeemedIds.current.add(r.id);
					toast.success(`Canjeado: ${shortId(r.id)} — ${r.prizeName ?? "Premio"}`, {
						icon: Bell,
						duration: 5000,
					});
				}
				// Actualizar previews: quitar canjeados
				setResult((current) => {
					if (!current) return current;
					const redeemedIds = new Set(live.redeemed.map((r) => r.id));
					return {
						...current,
						previews: current.previews.filter((p) => !redeemedIds.has(p.id)),
						tickets: current.tickets.map((t) =>
							redeemedIds.has(t.id) ? { ...t, status: "redeemed" as TicketStatus } : t
						),
					};
				});
			},
			onError: () => {
				// Silencioso, backoff automático
			},
		}
	);

	const handleGenerate = async () => {
		const count = Number(quantity);
		if (
			!Number.isInteger(count) ||
			count < 1 ||
			count > MAX_BATCH_SIZE
		) {
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

			const data = (await response.json()) as BatchResponse & {
				message?: string;
			};
			if (!response.ok) {
				throw new Error(data.message ?? `Error ${response.status}.`);
			}

			setResult(data);
			liveRedeemedIds.current.clear();
			const summary: TicketBatchSummary = {
				...data.batch,
				...countByStatus(data.tickets),
			};
			setBatches((current) => [
				summary,
				...current.filter((batch) => batch.id !== data.batch.id),
			]);
			toast.success(
				count === 1 ? "Ticket generado." : `${count} tickets generados.`,
			);
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudieron generar los tickets.",
				),
			);
		} finally {
			setIsGenerating(false);
		}
	};

	const handleLoadBatches = async () => {
		setIsLoadingBatches(true);
		try {
			const response = await operatorFetch("/tickets/batches?limit=25");
			if (!response) return;

			const data = (await response.json()) as {
				batches?: TicketBatchSummary[];
				message?: string;
			};
			if (!response.ok) {
				throw new Error(data.message ?? `Error ${response.status}.`);
			}
			setBatches(data.batches ?? []);
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo cargar el historial.",
				),
			);
		} finally {
			setIsLoadingBatches(false);
		}
	};

	const handleViewBatch = async (batchId: string) => {
		setBusyKey(`view-${batchId}`);
		try {
			const response = await operatorFetch(`/tickets/batches/${batchId}`);
			if (!response) return;

			const data = (await response.json()) as BatchResponse & {
				message?: string;
			};
			if (!response.ok) {
				throw new Error(data.message ?? `Error ${response.status}.`);
			}
			setResult(data);
			viewedBatchIdRef.current = batchId;
			liveRedeemedIds.current.clear();
			// Inicializar IDs ya canjeados
			const redeemedIds = new Set(
				data.tickets.filter((t) => t.status === "redeemed").map((t) => t.id)
			);
			liveRedeemedIds.current = redeemedIds;
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo cargar el lote.",
				),
			);
		} finally {
			setBusyKey(null);
		}
	};

	const handleDownloadZip = async (batchId: string) => {
		setBusyKey(`zip-${batchId}`);
		try {
			const response = await operatorFetch(
				`/tickets/batches/${batchId}/qr.zip`,
			);
			if (!response) return;
			if (!response.ok) {
				throw new Error(await responseError(response));
			}

			const blob = await response.blob();
			downloadBlob(blob, `tickets-${shortId(batchId)}.zip`);
			toast.success("ZIP descargado.");
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo descargar el ZIP.",
				),
			);
		} finally {
			setBusyKey(null);
		}
	};

	const handleDownloadTicket = async (ticketId: string) => {
		setBusyKey(`qr-${ticketId}`);
		try {
			const response = await operatorFetch(`/tickets/${ticketId}/qr`);
			if (!response) return;
			if (!response.ok) {
				throw new Error(await responseError(response));
			}

			const blob = await response.blob();
			downloadBlob(blob, `ticket-${shortId(ticketId)}.png`);
			toast.success("QR descargado.");
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo descargar el QR.",
				),
			);
		} finally {
			setBusyKey(null);
		}
	};

	const handleVoidTicket = async (ticketId: string) => {
		const confirmed = window.confirm(
			`¿Anular el ticket ${shortId(ticketId)}? Esta acción no se puede deshacer.`,
		);
		if (!confirmed) return;

		setBusyKey(`void-${ticketId}`);
		try {
			const response = await operatorFetch(`/tickets/${ticketId}/void`, {
				method: "POST",
			});
			if (!response) return;

			const data = (await response.json()) as {
				success?: boolean;
				message?: string;
				reason?: string;
			};
			if (!response.ok || !data.success) {
				throw new Error(
					data.message ??
						(data.reason === "already_redeemed"
							? "No se puede anular un ticket canjeado."
							: `Error ${response.status}.`),
				);
			}

			setResult((current) =>
				current
					? {
							...current,
							tickets: current.tickets.map((ticket) =>
								ticket.id === ticketId
									? { ...ticket, status: "void" as TicketStatus }
									: ticket,
							),
						}
					: current,
			);
			toast.success("Ticket anulado.");
		} catch (error) {
			toast.error(
				translateMessage(
					error instanceof Error ? error.message : undefined,
					"No se pudo anular el ticket.",
				),
			);
		} finally {
			setBusyKey(null);
		}
	};

	const statusByTicket = new Map(
		(result?.tickets ?? []).map((ticket) => [ticket.id, ticket.status]),
	);
	const prizeByTicket = new Map(
		(result?.tickets ?? []).map((ticket) => [ticket.id, ticket.prizeName]),
	);

	// Usar contadores en vivo si están disponibles
	const displayCounts = liveCounts
		? { ...liveCounts, total: result.tickets.length }
		: countByStatus(result?.tickets ?? []);

	return (
		<div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
			{/* Columna izquierda: generación + historial */}
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

				<BrandCard>
					<div className="flex items-start justify-between gap-3">
						<SectionHeading
							icon={History}
							title="Lotes recientes"
							subtitle={
								batches.length === 0
									? "Consulta los lotes ya generados."
									: `${batches.length} ${batches.length === 1 ? "lote" : "lotes"} en la lista.`
							}
						/>
						<BrandButton
							variant="light"
							size="sm"
							onClick={handleLoadBatches}
							disabled={isLoadingBatches}
							className="shrink-0"
						>
							<RefreshCw
								className={cn(
									"h-3.5 w-3.5",
									isLoadingBatches && "animate-spin",
								)}
							/>
							{isLoadingBatches ? "Cargando..." : "Actualizar"}
						</BrandButton>
					</div>

					<div className="mt-4 space-y-2">
						{batches.length === 0 ? (
							<div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-4 text-sm font-medium text-slate-500">
								<TicketIcon className="h-5 w-5 shrink-0 text-slate-400" />
								Pulsa «Actualizar» para ver los lotes guardados.
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
												{batch.total} tickets · {formatDate(batch.createdAt)}
											</p>
											<p className="mt-0.5 text-[11px] font-medium text-slate-400">
												Vence: {formatDate(batch.expiresAt)}
											</p>
										</div>
										<span className="shrink-0 rounded-full bg-[#005f63]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#005f63]">
											{batch.available} disp.
										</span>
									</div>

									<div className="mt-2.5 flex flex-wrap gap-1.5">
										<BrandButton
											variant="light"
											size="sm"
											onClick={() => handleViewBatch(batch.id)}
											disabled={busyKey !== null}
										>
											<Eye className="h-3.5 w-3.5" />
											Ver
										</BrandButton>
										<BrandButton
											variant="outline"
											size="sm"
											onClick={() => handleDownloadZip(batch.id)}
											disabled={busyKey !== null}
										>
											<FileArchive className="h-3.5 w-3.5" />
											{busyKey === `zip-${batch.id}` ? "Descargando..." : "ZIP"}
										</BrandButton>
									</div>
								</div>
							))
						)}
					</div>

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

			{/* Columna derecha: resultado del lote */}
			<div className="min-w-0">
				{result ? (
					<BrandCard>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0">
								<h3 className="truncate text-lg font-black tracking-tight text-slate-800 md:text-xl">
									{result.batch.label || "Lote sin etiqueta"}
								</h3>
								<div className="mt-1 h-0.5 w-12 bg-[#e51a24]" />
								<p className="mt-2 text-xs font-medium text-slate-500">
									ID {shortId(result.batch.id)} · {result.tickets.length}{" "}
									{result.tickets.length === 1 ? "ticket" : "tickets"} ·{" "}
									{formatDate(result.batch.createdAt)}
								</p>
								<p className="mt-1 text-xs font-medium text-slate-400">
									Vence: {formatDate(result.batch.expiresAt)}
								</p>
							</div>

							<BrandButton
								onClick={() => handleDownloadZip(result.batch.id)}
								disabled={busyKey !== null}
								className="shrink-0"
							>
								<FileArchive className="h-4 w-4" />
								{busyKey === `zip-${result.batch.id}`
									? "Preparando..."
									: "Descargar ZIP"}
							</BrandButton>
						</div>

						<div className="mt-4 flex flex-wrap gap-1.5">
							{(
								Object.keys(STATUS_LABELS) as TicketStatus[]
							).map((status) => {
								const count = displayCounts[status] ?? 0;
								if (count === 0) return null;
								return (
									<span
										key={status}
										className={cn(
											"rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
											STATUS_STYLES[status],
										)}
									>
										{count} {STATUS_LABELS[status]}
									</span>
								);
							})}
						</div>

						<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
							{result.previews.map((preview) => {
								const status = statusByTicket.get(preview.id) ?? "available";
								const isRedeemedOrVoid = status === "redeemed" || status === "void";
								return (
									<div
										key={preview.id}
										className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
									>
										<img
											src={preview.qrDataUrl}
											alt={`Código QR del ticket ${shortId(preview.id)}`}
											className="mx-auto w-full max-w-[180px] rounded-lg border border-slate-200 bg-white"
										/>
										<p className="mt-2 text-center font-mono text-xs font-bold tracking-wide text-slate-700">
											{shortId(preview.id)}
										</p>
										<span
											className={cn(
												"mx-auto mt-1 block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
												STATUS_STYLES[status],
											)}
										>
											{STATUS_LABELS[status]}
										</span>
										{status === "redeemed" && prizeByTicket.get(preview.id) && (
											<p className="mt-1 text-center text-[10px] font-semibold text-slate-500">
												Premio: {prizeByTicket.get(preview.id)}
											</p>
										)}
										{!isRedeemedOrVoid && (
											<BrandButton
												variant="outline"
												size="sm"
												onClick={() => handleDownloadTicket(preview.id)}
												disabled={busyKey !== null}
												className="mt-2 w-full"
											>
												<Download className="h-3.5 w-3.5" />
												{busyKey === `qr-${preview.id}` ? "..." : "PNG"}
											</BrandButton>
										)}
										{!isRedeemedOrVoid && (
											<BrandButton
												variant="ghost"
												size="sm"
												onClick={() => handleVoidTicket(preview.id)}
												disabled={busyKey !== null}
												className="mt-1 w-full"
											>
												<Ban className="h-3.5 w-3.5" />
												{busyKey === `void-${preview.id}`
													? "..."
													: "Anular"}
											</BrandButton>
										)}
									</div>
								);
							})}
						</div>

						{result.tickets.length > result.previews.length && (
							<p className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700">
								Vista previa de {result.previews.length} de{" "}
								{result.tickets.length} tickets. Descarga el ZIP para obtener
								todos los PNG.
							</p>
						)}

						{isPolling && (
							<p className="mt-2 text-right text-[10px] font-medium text-slate-400" aria-live="polite">
								<Bell className="h-3 w-3 inline mr-1" /> Actualizado hace unos segundos
							</p>
						)}
					</BrandCard>
				) : (
					<div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
						<QrCode className="h-12 w-12 text-slate-300" aria-hidden="true" />
						<p className="max-w-xs text-sm font-medium text-slate-500">
							Genera un ticket o un lote para ver aquí sus códigos QR y
							descargarlos.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
