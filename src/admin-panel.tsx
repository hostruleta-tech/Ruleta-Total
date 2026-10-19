import { useState } from "react";
import { TemplateManager } from "./template-manager";
import { Button } from "./components/ui/button";

const API_URL = "http://localhost:3001/api";

export const AdminPanel: React.FC = () => {
	const handleCommand = async (action: "spin" | "stop") => {
		setIsLoading(true);
		setFeedback("");
		try {
			const body = { action };

			const response = await fetch(`${API_URL}/command`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || "Ha ocurrido un error.");
			}

			setFeedback(result.message);
		} catch (error) {
			setFeedback(
				error instanceof Error ? error.message : "Ha ocurrido un error.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [feedback, setFeedback] = useState<string>("");

	return (
		<div className="px-4 w-full py-2 min-h-screen">
			<h1 className="text-3xl font-bold mb-6 mt-15">Panel de Control</h1>
			<div className="space-y-4 max-w-md">
				<div className="flex items-center justify-center space-x-4">
					<Button
						onClick={() => handleCommand("spin")}
						size={"lg"}
						disabled={isLoading}
					>
						Girar Ruleta
					</Button>
					<Button
						onClick={() => handleCommand("stop")}
						disabled={isLoading}
						size="lg"
					>
						Detener Ruleta
					</Button>
				</div>
				{feedback && <p className="mt-4 text-sm">{feedback}</p>}
			</div>
			<TemplateManager />
		</div>
	);
};
