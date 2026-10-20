import { AlertCircle, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
	API_URL,
	adminFetch,
	clearAdminSession,
	getAdminSession,
	setAdminSession,
} from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import { AdminAuthContext } from "./admin-auth-context";
import { PanelShell } from "./panel-shell";
import { BrandButton, BrandCard, BrandInput, BrandLabel } from "./panel-ui";

interface AdminAuthProviderProps {
	children: ReactNode;
}

const CONFIG_ERROR =
	"El servidor no tiene ADMIN_USER, ADMIN_PASSWORD o ADMIN_TOKEN configurados. Revisa las variables de entorno.";

export function AdminAuthProvider({ children }: AdminAuthProviderProps) {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
	const [isChecking, setIsChecking] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;

		const checkAuth = async () => {
			const token = getAdminSession();
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
						setError(CONFIG_ERROR);
						setIsAuthenticated(false);
						clearAdminSession();
					} else {
						setIsAuthenticated(res.ok);
						if (!res.ok) clearAdminSession();
					}
				}
			} catch {
				if (mounted) {
					setIsAuthenticated(false);
					clearAdminSession();
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

	const handleLogin = async (username: string, password: string) => {
		setError(null);

		try {
			const res = await fetch(`${API_URL}/admin/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			if (res.ok) {
				const data = (await res.json()) as { token?: unknown };
				if (typeof data.token !== "string" || !data.token) {
					setError("El servidor devolvió una sesión inválida.");
					return;
				}
				setAdminSession(data.token);
				setIsAuthenticated(true);
				return;
			}

			if (res.status === 503) {
				setError(CONFIG_ERROR);
			} else if (res.status === 401) {
				setError("Usuario o contraseña incorrectos.");
			} else {
				setError("No se pudo iniciar sesión. Inténtalo de nuevo.");
			}
		} catch {
			setError("No se pudo conectar con el servidor.");
		}
	};

	const handleLogout = () => {
		clearAdminSession();
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
	onLogin: (username: string, password: string) => Promise<void>;
	error: string | null;
}) {
	const [username, setUsername] = useState("admin");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		const normalizedUsername = username.trim();
		if (!normalizedUsername || !password || isLoading) return;

		setIsLoading(true);
		try {
			await onLogin(normalizedUsername, password);
		} finally {
			setIsLoading(false);
		}
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
							Ingresa tus credenciales para acceder
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
							<BrandLabel htmlFor="admin-username" className="mb-2">
								Usuario
							</BrandLabel>
							<BrandInput
								id="admin-username"
								type="text"
								placeholder="admin"
								value={username}
								onChange={(event) => setUsername(event.target.value)}
								disabled={isLoading}
								autoComplete="username"
								autoCapitalize="none"
								spellCheck={false}
							/>
						</div>

						<div>
							<BrandLabel htmlFor="admin-password" className="mb-2">
								Contraseña
							</BrandLabel>
							<BrandInput
								id="admin-password"
								type="password"
								placeholder="Tu contraseña"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								disabled={isLoading}
								autoComplete="current-password"
								autoFocus
							/>
						</div>

						<BrandButton
							type="submit"
							className="w-full"
							size="lg"
							disabled={isLoading || !username.trim() || !password}
						>
							{isLoading ? "Accediendo..." : "Acceder al panel"}
						</BrandButton>
					</form>
				</BrandCard>
			</div>
		</PanelShell>
	);
}
