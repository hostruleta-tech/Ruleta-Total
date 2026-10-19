import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { Layout } from "./components/layout.tsx";
import { SoundProvider } from "./sound-context.tsx";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<SoundProvider>
			<Layout>
				<App />
			</Layout>
		</SoundProvider>
	</StrictMode>,
);
