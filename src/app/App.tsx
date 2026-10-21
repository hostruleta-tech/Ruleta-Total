import { AdminPanel } from "@/features/panel/admin-panel";
import Menu from "@/features/menu/menu";
import { RouletteViewHook } from "@/features/ruleta/ruleta-screen";
import { LoginAdmin } from "@/features/auth/login-admin";
import { AdminGate } from "@/features/auth/admin-gate";

function App() {
	const query = new URLSearchParams(window.location.search);
	const view = query.get("view");
	const path = window.location.pathname.replace(/\/+$/, "") || "/";

	if (path === "/login-admin") return <LoginAdmin />;

	if (view === "menu") {
		return (
			<AdminGate>
				<Menu />
			</AdminGate>
		);
	}
	if (view === "admin") {
		return (
			<AdminGate>
				<AdminPanel />
			</AdminGate>
		);
	}
	if (view === "play") {
		return <RouletteViewHook />;
	}

	// Por defecto: ruleta (raíz y vistas desconocidas)
	return <RouletteViewHook />;
}

export default App;