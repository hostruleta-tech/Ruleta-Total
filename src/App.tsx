import { AdminPanel } from "./admin-panel";
import { RouletteViewHook } from "./roulette-view-hook";

function App() {
	const path = window.location.pathname;

	if (path.startsWith("/admin")) {
		return <AdminPanel />;
	} else {
		return <RouletteViewHook />;
	}
}

export default App;
