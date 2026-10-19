// Simple sound manager for roulette effects
class SoundManager {
	private audioContext: AudioContext | null = null;
	public soundEnabled = true;

	constructor() {
		this.initAudioContext();
	}

	private async initAudioContext() {
		try {
			this.audioContext = new (
				window.AudioContext || (window as any).webkitAudioContext
			)();
		} catch (error) {
			console.warn("Web Audio API not supported:", error);
		}
	}

	setEnabled(enabled: boolean) {
		this.soundEnabled = enabled;
	}

	private playTone(
		frequency: number,
		duration: number,
		type: OscillatorType = "sine",
	) {
		if (!this.soundEnabled || !this.audioContext) return;

		try {
			const oscillator = this.audioContext.createOscillator();
			const gainNode = this.audioContext.createGain();

			oscillator.connect(gainNode);
			gainNode.connect(this.audioContext.destination);

			oscillator.frequency.setValueAtTime(
				frequency,
				this.audioContext.currentTime,
			);
			oscillator.type = type;

			gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(
				0.01,
				this.audioContext.currentTime + duration,
			);

			oscillator.start(this.audioContext.currentTime);
			oscillator.stop(this.audioContext.currentTime + duration);
		} catch (error) {
			console.warn("Error playing sound:", error);
		}
	}

	playTick() {
		this.playTone(800, 0.05, "square");
	}

	playSpinStart() {
		// Play a rising tone sequence
		setTimeout(() => this.playTone(440, 0.1), 0); // A4
		setTimeout(() => this.playTone(554, 0.1), 50); // C#5
		setTimeout(() => this.playTone(659, 0.1), 100); // E5
		setTimeout(() => this.playTone(880, 0.2), 150); // A5
	}

	playWin() {
		// Play a celebratory chord
		setTimeout(() => this.playTone(523, 0.3), 0); // C5
		setTimeout(() => this.playTone(659, 0.3), 50); // E5
		setTimeout(() => this.playTone(784, 0.3), 100); // G5
	}
}

export const soundManager = new SoundManager();
