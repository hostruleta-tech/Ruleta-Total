import { useState, useEffect } from "react";

type FullscreenElement = HTMLElement & {
	webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
	webkitFullscreenElement?: Element | null;
	webkitExitFullscreen?: () => Promise<void> | void;
};

const getFullscreenElement = (): Element | null => {
	if (typeof document === "undefined") return null;
	const doc = document as FullscreenDocument;
	return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
};

export const useFullscreen = () => {
	const [isFullscreen, setIsFullscreen] = useState(
		() => !!getFullscreenElement(),
	);

	const toggleFullscreen = async () => {
		try {
			if (!getFullscreenElement()) {
				const element = document.documentElement as FullscreenElement;
				if (element.requestFullscreen) {
					await element.requestFullscreen();
				} else if (element.webkitRequestFullscreen) {
					await element.webkitRequestFullscreen();
				}
				return;
			}

			const doc = document as FullscreenDocument;
			if (doc.exitFullscreen) {
				await doc.exitFullscreen();
			} else if (doc.webkitExitFullscreen) {
				await doc.webkitExitFullscreen();
			}
		} catch (error) {
			// En iPhone Safari el API de pantalla completa no está disponible.
			console.warn("No se pudo cambiar a pantalla completa.", error);
		}
	};

	useEffect(() => {
		const onFullscreenChange = () => setIsFullscreen(!!getFullscreenElement());
		document.addEventListener("fullscreenchange", onFullscreenChange);
		document.addEventListener("webkitfullscreenchange", onFullscreenChange);
		return () => {
			document.removeEventListener("fullscreenchange", onFullscreenChange);
			document.removeEventListener(
				"webkitfullscreenchange",
				onFullscreenChange,
			);
		};
	}, []);

	return { isFullscreen, toggleFullscreen };
};
