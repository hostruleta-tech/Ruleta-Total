import { useEffect, useState } from "react";
import { API_URL } from "@/shared/api";

export function AdminGate({ children }: { children: React.ReactNode }) {
	const [checking, setChecking] = useState(true);
	const [authenticated, setAuthenticated] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const checkAuth = async () => {
			try {
				const res = await fetch(`${API_URL}/auth/me`, {
					credentials: "same-origin",
					cache: "no-store",
				});
				if (!cancelled) {
					const data = (await res.json().catch(() => ({}))) as { authenticated?: boolean };
					setAuthenticated(data.authenticated === true);
				}
			} catch {
				if (!cancelled) setAuthenticated(false);
			} finally {
				if (!cancelled) setChecking(false);
			}
		};

		checkAuth();
		return () => { cancelled = true; };
	}, []);

	if (checking) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-[#e6edef]">
				<div className="flex flex-col items-center gap-3 text-slate-600">
					<div className="w-10 h-10 border-4 border-[#005f63] border-t-transparent rounded-full animate-spin" />
					<p className="text-sm font-medium">Verificando acceso…</p>
				</div>
			</div>
		);
	}

	if (!authenticated) {
		if (typeof window !== "undefined") {
			window.location.replace("/login-admin");
		}
		return null;
	}

	return (
		<>
			<meta name="robots" content="noindex, nofollow" />
			{children}
		</>
	);
}