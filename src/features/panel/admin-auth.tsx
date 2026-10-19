import { createContext, useContext, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { AlertCircle, Lock } from "lucide-react";
import { adminFetch, clearAdminToken, getAdminToken, setAdminToken } from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import { PanelShell } from "./panel-shell";
import { BrandButton, BrandCard, BrandInput, BrandLabel } from "./panel-ui";

interface AdminAuthValue {
	logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function useAdminAuth(): AdminAuthValue {
	const context = useContext(AdminAuthContext);
	if (!context) {
		throw new Error("useAdminAuth debe usarse dentro de AdminAuthProvider.");
	}
	return context;
}

interface AdminAuthProviderProps {
	children: ReactNode;
}

export function AdminAuthProvider({ children }: AdminAuthProviderProps) {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
	const [isChecking, setIsChecking] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;

		const checkAuth = async () => {
			const token = getAdminToken();
			if (!token) {
				if (mounted) {
					setIsAuthenticated(false);
					setIsChecking(false);
				}
				return;
			}

			try {
				const res = await adminFetch("/admin/session");
				if (mounted) {
					if (res.status === 503) {
						setError(
							"El servidor no tiene ADMIN_TOKEN configurado. Revisa las variables de entorno.",
						);
						setIsAuthenticated(false);
						clearAdminToken();
					} else {
						setIsAuthenticated(res.ok);
						if (!res.ok) clearAdminToken();
					}
				}
			} catch {
				if (mounted) {
					setIsAuthenticated(false);
					clearAdminToken();
				}
			} finally {
				if (mounted) setIsChecking(false);
			}
		};

		checkAuth();

		const handleUnauthorized = () => setIsAuthenticated(false);
		window.addEventListener("admin-unauthorized", handleUnauthorized);

		return () => {
			mounted = false;
			window.removeEventListener("admin-unauthorized", handleUnauthorized);
		};
	}, []);

	const handleLogin = async (token: string) => {
		setError(null);
		// Guardar el token ANTES de validar, porque adminFetch lo lee de sessionStorage.
		setAdminToken(token);
		try {
			const res = await adminFetch("/admin/session");
			if (res.ok) {
				setIsAuthenticated(true);
			} else if (res.status === 503) {
				clearAdminToken();
				setError(
					"El servidor no tiene ADMIN_TOKEN configurado. Revisa las variables de entorno.",
				);
			} else {
				clearAdminToken();
				setError("Token inválido o sin permisos de administrador.");
			}
		} catch {
			clearAdminToken();
			setError("No se pudo conectar con el servidor.");
		}
	};

	const handleLogout = () => {
		clearAdminToken();
		setIsAuthenticated(false);
	};

	if (isChecking) {
		return (
			<div className="flex h-[100dvh] w-full items-center justify-center">
				<div className="flex animate-pulse flex-col items-center gap-3 text-slate-500">
					<div className="h-8 w-8 rounded-full border-4 border-teal-500 border-t-transparent" />
					<p className="text-sm font-medium">Verificando acceso...</p>
				</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		return <LoginForm onLogin={handleLogin} error={error} />;
	}

	return (
		<AdminAuthContext.Provider value={{ logout: handleLogout }}>
			{children}
		</AdminAuthContext.Provider>
	);
}

function LoginForm({
	onLogin,
	error,
}: {
	onLogin: (token: string) => Promise<void>;
	error: string | null;
}) {
	const [token, setToken] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		if (!token.trim() || isLoading) return;
		setIsLoading(true);
		await onLogin(token.trim());
		setIsLoading(false);
	};

	return (
		<PanelShell badge="Acceso restringido">
			<div className="flex flex-1 items-center justify-center px-4 py-8">
				<BrandCard tone="light" className="w-full max-w-md">
					<div className="mb-6 text-center">
						<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#005f63]/10">
							<Lock className="h-8 w-8 text-[#005f63]" strokeWidth={2} />
						</div>
						<h2 className="text-2xl font-bold text-slate-800">
							Panel de Control
						</h2>
						<p className="mt-2 text-sm text-slate-500">
							Ingresa el token de administrador para acceder
						</p>
					</div>

					{error && (
						<div
							className={cn(
								"mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700",
							)}
							role="alert"
						>
							<AlertCircle className="h-5 w-5 shrink-0" />
							<span>{error}</span>
						</div>
					)}

					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<BrandLabel htmlFor="admin-token" className="mb-2">
								Token de administrador
							</BrandLabel>
							<BrandInput
								id="admin-token"
								type="password"
								placeholder="Pega tu token aquí"
								value={token}
								onChange={(event) => setToken(event.target.value)}
								disabled={isLoading}
								autoComplete="off"
								className="font-mono text-sm"
							/>
							<p className="mt-1.5 text-center text-xs text-slate-500">
								El token se guarda solo en esta pestaña (sessionStorage).
							</p>
						</div>

						<BrandButton
							type="submit"
							className="w-full"
							size="lg"
							disabled={isLoading || !token.trim()}
						>
							{isLoading ? "Accediendo..." : "Acceder al panel"}
						</BrandButton>
					</form>
				</BrandCard>
			</div>
		</PanelShell>
	);
}
