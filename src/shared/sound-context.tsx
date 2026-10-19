import React, { createContext, useState, useContext, useMemo } from "react";

interface SoundContextType {
	isMuted: boolean;
	toggleMute: () => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [isMuted, setIsMuted] = useState(false);

	const toggleMute = () => {
		setIsMuted((prev) => !prev);
	};

	const value = useMemo(() => ({ isMuted, toggleMute }), [isMuted]);

	return (
		<SoundContext.Provider value={value}>{children}</SoundContext.Provider>
	);
};

export const useSound = () => {
	const context = useContext(SoundContext);
	if (context === undefined) {
		throw new Error("useSound must be used within a SoundProvider");
	}
	return context;
};
