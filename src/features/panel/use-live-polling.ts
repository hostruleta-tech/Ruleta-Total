import { useEffect, useRef, useCallback, useState } from "react";
import { API_URL } from "@/shared/api";

interface UseLivePollingOptions {
	enabled: boolean;
	intervalMs?: number;
	onTick?: (data: unknown) => void;
	onError?: (error: Error) => void;
}

export function useLivePolling(
	url: string,
	options: UseLivePollingOptions
) {
	const { enabled, intervalMs = 3000, onTick, onError } = options;
	const abortRef = useRef<AbortController | null>(null);
	const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const backoffRef = useRef(intervalMs);
	const [isPolling, setIsPolling] = useState(false);

	const stop = useCallback(() => {
		if (intervalRef.current) {
			clearTimeout(intervalRef.current);
			intervalRef.current = null;
		}
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
		setIsPolling(false);
	}, []);

	const tick = useCallback(async () => {
		if (!enabled) {
			stop();
			return;
		}

		abortRef.current = new AbortController();
		try {
			const res = await fetch(`${API_URL}${url}`, {
				credentials: "same-origin",
				cache: "no-store",
				signal: abortRef.current.signal,
			});

			if (!res.ok) throw new Error(`HTTP ${res.status}`);

			const data = await res.json();
			onTick?.(data);
			backoffRef.current = intervalMs; // reset backoff on success
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") return;
			onError?.(err instanceof Error ? err : new Error(String(err)));

			// Backoff exponencial: 3s -> 6s -> 12s -> 30s (máx)
			backoffRef.current = Math.min(backoffRef.current * 2, 30000);
		}

		if (enabled) {
			intervalRef.current = setTimeout(tick, backoffRef.current);
		}
	}, [enabled, intervalMs, onTick, onError, stop]);

	useEffect(() => {
		if (enabled) {
			setIsPolling(true);
			backoffRef.current = intervalMs;
			tick(); // primera ejecución inmediata
		} else {
			stop();
		}
		return stop;
	}, [enabled, tick, stop]);

	// Refresco inmediato al volver a la pestaña
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (!document.hidden && enabled) {
				backoffRef.current = intervalMs;
				tick();
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, [enabled, intervalMs, tick]);

	return { isPolling, stop, refresh: tick };
}