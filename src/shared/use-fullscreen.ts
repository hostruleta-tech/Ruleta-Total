import { useState, useEffect } from "react";

export const useFullscreen = () => {
	const [isFullscreen, setIsFullscreen] = useState(
		() => !!document.fullscreenElement,
	);

	const toggleFullscreen = () => {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	};

	useEffect(() => {
		const onFullscreenChange = () =>
			setIsFullscreen(!!document.fullscreenElement);
		document.addEventListener("fullscreenchange", onFullscreenChange);
		return () =>
			document.removeEventListener("fullscreenchange", onFullscreenChange);
	}, []);

	return { isFullscreen, toggleFullscreen };
};
