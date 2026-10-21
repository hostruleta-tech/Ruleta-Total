import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole, Eye, EyeOff, Loader2 } from "lucide-react";
import { API_URL } from "@/shared/api";
import { BrandButton, BrandInput, BrandLabel } from "@/features/panel/panel-ui";

export function LoginAdmin() {
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [expired, setExpired] = useState(false);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("expired") === "1") setExpired(true);

		// Si ya hay sesión, redirigir al menú
		const checkAuth = async () => {
			try {
				const res = await fetch(`${API_URL}/auth/me`, {
					credentials: "same-origin",
					cache: "no-store",
				});
				const data = (await res.json().catch(() => ({}))) as { authenticated?: boolean };
				if (data.authenticated) {
					window.location.replace("/?view=menu");
				}
			} catch {
				// Ignorar errores, dejar que el usuario intente login
			}
		};
		checkAuth();
	}, []);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError("");
		setLoading(true);

		try {
			const res = await fetch(`${API_URL}/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "same-origin",
				body: JSON.stringify({ password }),
			});

			const data = await res.json().catch(() => ({}));

			if (res.ok) {
				window.location.replace("/?view=menu");
			} else if (res.status === 401) {
				setError("Contraseña incorrecta.");
			} else if (res.status === 429) {
				setError("Demasiados intentos. Espera unos minutos.");
			} else if (res.status === 503) {
				setError("El acceso no está configurado.");
			} else {
				setError(data.message ?? "Error al iniciar sesión.");
			}
		} catch {
			setError("No se pudo conectar con el servidor. Revisa tu conexión.");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-[#e6edef] p-4">
			<div className="w-full max-w-sm">
				{expired && (
					<div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm font-medium text-amber-800" role="alert">
						La sesión expiró. Vuelve a entrar.
					</div>
				)}

				<form onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl" noValidate>
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#005f63] text-white shadow">
							<LockKeyhole className="h-5 w-5" aria-hidden="true" />
						</div>
						<div>
							<h1 className="text-lg font-black tracking-tight text-[#1A2C35]">
								Acceso operador
							</h1>
							<div className="mt-1 h-0.5 w-12 bg-[#e51a24]" />
						</div>
					</div>

					<p className="mt-3 text-sm font-medium text-slate-500">
						Introduce la contraseña para acceder al menú y al panel.
					</p>

					{error && (
						<div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 text-sm font-medium text-red-700" role="alert">
							{error}
						</div>
					)}

					<div className="mt-4 grid gap-1.5">
						<BrandLabel htmlFor="operator-password">Contraseña</BrandLabel>
						<div className="relative">
							<BrandInput
								id="operator-password"
								type={showPassword ? "text" : "password"}
								autoComplete="current-password"
								autoFocus
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								disabled={loading}
							/>
							<button
								type="button"
								onClick={() => setShowPassword(!showPassword)}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
								aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
							>
								{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
							</button>
						</div>
					</div>

					<BrandButton
						type="submit"
						className="mt-5 w-full"
						disabled={loading || !password.trim()}
					>
						{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
					</BrandButton>

					<p className="mt-4 text-center text-sm font-medium text-slate-500">
						<a href="/" className="underline hover:text-[#005f63]">
							Volver a la ruleta
						</a>
					</p>
				</form>
			</div>
		</div>
	);
}