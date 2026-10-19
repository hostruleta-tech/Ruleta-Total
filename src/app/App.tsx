import { AdminPanel } from "@/features/panel/admin-panel";
import Menu from "@/features/menu/menu";
import { RouletteViewHook } from "@/features/ruleta/ruleta-screen";

function App() {
	const query = new URLSearchParams(window.location.search);
	const view = query.get("view");

	if (view === "admin") {
		return <AdminPanel />;
	}
	if (view === "tv") {
		return <RouletteViewHook />;
	}

	return <Menu />;
}

export default App;
