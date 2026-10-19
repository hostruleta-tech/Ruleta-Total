import logo from "../assets/logo.webp";
import { Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import { Button } from "./ui/button";
import { useFullscreen } from "../hooks/use-fullscreen";
import { useSound } from "../sound-context";
export function Layout({ children }: { children: React.ReactNode }) {
	const { isFullscreen, toggleFullscreen } = useFullscreen();
	const { isMuted, toggleMute } = useSound();

	const path = window.location.pathname;
	const isAdmin = path.startsWith("/admin");

	return (
		<main className="dark bg-background text-foreground min-h-screen w-full relative">
			<header className="absolute top-0 left-0 right-0 px-2 py-2 flex justify-between items-center z-20 max-w-sm md:max-w-4xl md:mx-auto">
				<img src={logo} width={120} alt="Logo de Keyton" height={20} />

				{!isAdmin ? (
					<div className="flex items-center gap-2 w-full justify-end">
						<Button
							variant="outline"
							size="icon"
							onClick={toggleMute}
							className="z-30 mr-2"
						>
							{isMuted ? (
								<VolumeX className="h-4 w-4" />
							) : (
								<Volume2 className="h-4 w-4" />
							)}
						</Button>
						<Button
							variant="outline"
							size="icon"
							onClick={toggleFullscreen}
							className="z-30"
						>
							{isFullscreen ? <Minimize /> : <Maximize />}
						</Button>
					</div>
				) : (
					nullAg
				)}
			</header>

			{children}
		</main>
	);
}
