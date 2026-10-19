import { AdminPanel } from "./admin-panel";
import Menu from "./components/menu";
import { RouletteViewHook } from "./roulette-view-hook";

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
