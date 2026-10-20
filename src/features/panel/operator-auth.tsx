import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type FormEvent,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { LockKeyhole } from "lucide-react";
import { apiFetch } from "@/shared/api";
import {
	OperatorAuthContext,
	type OperatorAuthValue,
} from "./operator-auth-context";
import { BrandButton, BrandInput, BrandLabel } from "./panel-ui";

const STORAGE_KEY = "ruleta:operator-password";
const PASSWORD_HEADER = "X-Operator-Password";

interface PasswordPrompt {
	message: string;
	resolve: (value: string | null) => void;
}

function readStoredPassword(): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function storePassword(password: string): void {
	try {
		window.sessionStorage.setItem(STORAGE_KEY, password);
	} catch {
		// Si el navegador bloquea sessionStorage, la contraseña sigue en memoria.
	}
}

function removeStoredPassword(): void {
	try {
		window.sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// Sin acción.
	}
}

/**
 * Pide la contraseña de operador cuando una acción protegida la necesita.
 * No hay sesión ni token: la contraseña se envía en cada petición y solo se
 * conserva en memoria y en sessionStorage de esta pestaña.
 */
export function OperatorAuthProvider({ children }: { children: ReactNode }) {
	const [password, setPassword] = useState<string | null>(readStoredPassword);
	const passwordRef = useRef<string | null>(password);
	const promptRef = useRef<PasswordPrompt | null>(null);
	const [prompt, setPrompt] = useState<PasswordPrompt | null>(null);
	const [draft, setDraft] = useState("");

	useEffect(() => {
		if (prompt) setDraft("");
	}, [prompt]);

	const clearPassword = useCallback(() => {
		passwordRef.current = null;
		setPassword(null);
		removeStoredPassword();
	}, []);

	const finishPrompt = useCallback((value: string | null) => {
		const current = promptRef.current;
		promptRef.current = null;
		setPrompt(null);
		current?.resolve(value);
	}, []);

	const requestPassword = useCallback((message: string) => {
		return new Promise<string | null>((resolve) => {
			// Si ya había un diálogo abierto, se cancela para no dejarlo colgado.
			promptRef.current?.resolve(null);
			const next: PasswordPrompt = { message, resolve };
			promptRef.current = next;
			setPrompt(next);
		});
	}, []);

	const doFetch = useCallback(
		(path: string, init: RequestInit | undefined, value: string) => {
			const headers = {
				...(init?.headers as Record<string, string> | undefined),
				[PASSWORD_HEADER]: value,
			};
			return apiFetch(path, { ...init, headers });
		},
		[],
	);

	const operatorFetch = useCallback(
		async (path: string, init?: RequestInit): Promise<Response | null> => {
			const current = passwordRef.current;

			if (current) {
				const response = await doFetch(path, init, current);
				if (response.status !== 401) return response;
				clearPassword();
			}

			const entered = await requestPassword(
				"Introduce la contraseña de operador para continuar.",
			);
			if (!entered) return null;

			passwordRef.current = entered;
			setPassword(entered);
			storePassword(entered);

			const response = await doFetch(path, init, entered);
			if (response.status === 401) {
				clearPassword();
				throw new Error("Contraseña de operador incorrecta.");
			}
			return response;
		},
		[clearPassword, doFetch, requestPassword],
	);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const value = draft.trim();
		if (!value) return;
		finishPrompt(value);
	};

	const value = useMemo<OperatorAuthValue>(
		() => ({
			hasPassword: password !== null,
			operatorFetch,
			clearPassword,
		}),
		[clearPassword, operatorFetch, password],
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
								Se guarda solo en esta pestaña.
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
