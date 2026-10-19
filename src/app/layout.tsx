import {
	Maximize,
	Minimize,
	//  Volume2,
	//  VolumeX
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useFullscreen } from "@/shared/use-fullscreen";
// import { useSound } from "@/shared/sound-context";
export function Layout({ children }: { children: React.ReactNode }) {
	const { isFullscreen, toggleFullscreen } = useFullscreen();
	// const { isMuted, toggleMute } = useSound();

	const query = new URLSearchParams(window.location.search);
	const view = query.get("view");
	const isTv = view === "tv";

	return (
		<main className="dark bg-background text-foreground min-h-screen w-full relative">
			<header className="absolute top-0 left-0 right-0 px-2 py-2 grid grid-cols-2 md:grid-cols-3 items-center place-content-center z-20  mx-auto max-w-4xl">
				{/* <Button
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
						</Button> */}
				<div className="flex items-center gap-2 w-full justify-end">
					{isTv ? (
						<Button
							variant="outline"
							size="icon"
							onClick={toggleFullscreen}
							className="z-30"
						>
							{isFullscreen ? <Minimize /> : <Maximize />}
						</Button>
					) : null}
				</div>
			</header>

			{children}
		</main>
	);
}
