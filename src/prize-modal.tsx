import React from "react";
import Confetti from "react-confetti";

interface PrizeModalProps {
	prize: string;
	onClose: () => void;
}

export const PrizeModal: React.FC<PrizeModalProps> = ({ prize, onClose }) => {
	return (
		<div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
			<Confetti
				width={window.innerWidth}
				height={window.innerHeight}
				recycle={false}
				numberOfPieces={400}
			/>
			<div className="bg-gray-800 p-10 rounded-lg shadow-xl text-center relative animate-fade-in-down border-2 border-brand">
				<h2 className="text-2xl text-yellow-400 mb-4">¡Felicidades!</h2>
				<p className="text-4xl font-bold text-white mb-6">Has ganado:</p>
				<p className="text-5xl font-extrabold text-brand mb-8">{prize}</p>
				<button
					type="button"
					onClick={onClose}
					className="bg-brand text-white font-bold py-2 px-6 rounded"
				>
					Cerrar
				</button>
			</div>
		</div>
	);
};
