import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type FormEvent,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { LockKeyhole } from "lucide-react";
import { API_URL } from "@/shared/api";
import { OperatorAuthContext, type OperatorAuthValue } from "./operator-auth-context";
import { BrandButton, BrandInput, BrandLabel } from "./panel-ui";

const PASSWORD_HEADER = "X-Operator-Password";

interface PasswordPrompt {
	message: string;
	resolve: (value: string | null) => void;
}

/**
 * Provider de autenticación de operador basado en cookie HttpOnly.
 * La contraseña solo se envía al hacer login; luego la sesión la maneja la cookie.
 */
export function OperatorAuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [checkingAuth, setCheckingAuth] = useState(true);
	const promptRef = useRef<PasswordPrompt | null>(null);
	const [prompt, setPrompt] = useState<PasswordPrompt | null>(null);
	const [draft, setDraft] = useState("");

	useEffect(() => {
		if (prompt) setDraft("");
	}, [prompt]);

	// Verificar autenticación al montar y al volver a la pestaña
	const checkAuth = useCallback(async () => {
		try {
			const res = await fetch(`${API_URL}/auth/me`, {
				credentials: "same-origin",
				cache: "no-store",
			});
			const data = (await res.json().catch(() => ({}))) as { authenticated?: boolean };
			setIsAuthenticated(data.authenticated === true);
		} catch {
			setIsAuthenticated(false);
		} finally {
			setCheckingAuth(false);
		}
	}, []);

	useEffect(() => {
		checkAuth();
		const handleVisibilityChange = () => {
			if (!document.hidden) checkAuth();
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
	}, [checkAuth]);

	// Limpiar contraseña antigua de sessionStorage si existe
	useEffect(() => {
		try {
			window.sessionStorage.removeItem("ruleta:operator-password");
		} catch {
			// Ignorar
		}
	}, []);

	const finishPrompt = useCallback((value: string | null) => {
		const current = promptRef.current;
		promptRef.current = null;
		setPrompt(null);
		current?.resolve(value);
	}, []);

	const requestPassword = useCallback((message: string) => {
		return new Promise<string | null>((resolve) => {
			promptRef.current?.resolve(null);
			const next: PasswordPrompt = { message, resolve };
			promptRef.current = next;
			setPrompt(next);
		});
	}, []);

	const doFetch = useCallback(
		(path: string, init: RequestInit | undefined, _value: string) => {
			// Con cookie, no necesitamos añadir la cabecera; la cookie se envía automáticamente
			return fetch(`${API_URL}${path}`, {
				...init,
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json",
					...(init?.headers as Record<string, string> | undefined),
				},
			});
		},
		[],
	);

	const operatorFetch = useCallback(
		async (path: string, init?: RequestInit): Promise<Response | null> => {
			// Primer intento con cookie
			let response = await doFetch(path, init, "");

			// Si 401, la cookie expiró o no es válida -> pedir contraseña
			if (response.status === 401) {
				const entered = await requestPassword(
					"La sesión expiró. Introduce la contraseña de operador para continuar.",
				);
				if (!entered) return null;

				// Login con la contraseña para renovar la cookie
				const loginRes = await fetch(`${API_URL}/auth/login`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "same-origin",
					body: JSON.stringify({ password: entered }),
				});

				if (!loginRes.ok) {
					setIsAuthenticated(false);
					throw new Error("Contraseña de operador incorrecta.");
				}

				setIsAuthenticated(true);
				// Reintentar la petición original con la nueva cookie
				response = await doFetch(path, init, "");
			}

			if (response.status === 401) {
				setIsAuthenticated(false);
				throw new Error("Contraseña de operador incorrecta.");
			}

			return response;
		},
		[doFetch, requestPassword],
	);

	const logout = useCallback(async () => {
		try {
			await fetch(`${API_URL}/auth/logout`, {
				method: "POST",
				credentials: "same-origin",
			});
		} catch {
			// Ignorar errores
		}
		setIsAuthenticated(false);
	}, []);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = draft.trim();
		if (!value) return;
		finishPrompt(value);
	};

	const value = useMemo<OperatorAuthValue>(
		() => ({
			isAuthenticated,
			operatorFetch,
			logout,
			checkingAuth,
		}),
		[isAuthenticated, operatorFetch, logout, checkingAuth],
	);

	return (
		<OperatorAuthContext.Provider value={value}>
			{children}

			{prompt &&
				createPortal(
					<div
						className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
						onKeyDown={(event) => {
							if (event.key === "Escape") finishPrompt(null);
						}}
					>
						<form
							onSubmit={handleSubmit}
							role="dialog"
							aria-modal="true"
							aria-labelledby="operator-password-title"
							aria-describedby="operator-password-description"
							className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
						>
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#005f63] text-white shadow">
									<LockKeyhole className="h-5 w-5" aria-hidden="true" />
								</div>
								<div>
									<h2
										id="operator-password-title"
										className="text-lg font-black tracking-tight text-[#1A2C35]"
									>
										Contraseña de operador
									</h2>
									<div className="mt-1 h-0.5 w-12 bg-[#e51a24]" />
								</div>
							</div>

							<p
								id="operator-password-description"
								className="mt-3 text-sm font-medium text-slate-500"
							>
								{prompt.message}
							</p>

							<div className="mt-4 grid gap-1.5">
								<BrandLabel htmlFor="operator-password">
									Contraseña
								</BrandLabel>
								<BrandInput
									id="operator-password"
									type="password"
									autoComplete="current-password"
									autoFocus
									value={draft}
									onChange={(event) => setDraft(event.target.value)}
									placeholder="••••••••"
								/>
							</div>

							<p className="mt-2 text-[11px] font-medium text-slate-400">
								La sesión se mantiene con cookie segura (8 h).
							</p>

							<div className="mt-5 flex justify-end gap-2">
								<BrandButton
									type="button"
									variant="light"
									size="sm"
									onClick={() => finishPrompt(null)}
								>
									Cancelar
								</BrandButton>
								<BrandButton
									type="submit"
									size="sm"
									disabled={!draft.trim()}
								>
									Continuar
								</BrandButton>
							</div>
						</form>
					</div>,
					document.body,
				)}
		</OperatorAuthContext.Provider>
	);
}

// Necesario para el useMemo
import { useMemo } from "react";