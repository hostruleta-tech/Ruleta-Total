import logo from "../assets/logo.webp";
import { Maximize, Minimize } from "lucide-react";
import { Button } from "./ui/button";
import { useFullscreen } from "../hooks/use-fullscreen";

export function Layout({ children }: { children: React.ReactNode }) {
	const { isFullscreen, toggleFullscreen } = useFullscreen();
	return (
		<main className="dark bg-background text-foreground min-h-screen w-full relative">
			<header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20">
				<img src={logo} width={120} alt="Logo de Keyton" height={20} />
				<Button
					variant="outline"
					size="icon"
					onClick={toggleFullscreen}
					className="z-30"
				>
					{isFullscreen ? (
						<Minimize className="h-4 w-4" />
					) : (
						<Maximize className="h-4 w-4" />
					)}
				</Button>
			</header>

			{children}
		</main>
	);
}
