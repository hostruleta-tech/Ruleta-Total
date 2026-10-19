import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import {
	initializeDatabase,
	getActiveRouletteWithPrizes,
	getAllRoulettes,
	getRouletteWithPrizes,
	createRoulette,
	updateRoulette,
	deleteRoulette,
	setActiveRoulette,
	type Prize,
	type RouletteTemplate,
} from "./database";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json());

// Utilidad: sorteo ponderado por probabilidad
function pickWeightedIndex(prizes: Prize[]): number {
	if (prizes.length === 0) return -1;

	const weights = prizes.map((p) => {
		const v = Number(p.probability);
		return Number.isFinite(v) && v > 0 ? v : 0;
	});
	const total = weights.reduce((a, b) => a + b, 0);

	if (total <= 0) {
		return Math.floor(Math.random() * prizes.length);
	}

	let r = Math.random() * total;
	for (let i = 0; i < prizes.length; i++) {
		r -= weights[i];
		if (r < 0) return i;
	}
	return prizes.length - 1;
}

/**
 * POST /api-ruleta/spin
 * El participante (teléfono) solicita un giro.
 * El servidor sortea con la plantilla activa y devuelve el premio elegido.
 */
app.post("/api-ruleta/spin", async (req, res) => {
	try {
		const active = await getActiveRouletteWithPrizes();
		if (!active || !active.prizes || active.prizes.length === 0) {
			return res
				.status(404)
				.json({ message: "No hay plantilla activa con premios." });
		}

		const winnerIndex = pickWeightedIndex(active.prizes);
		const prize = active.prizes[winnerIndex];

		// Generar un código de reclamo simple (para fase futura de validación)
		const claimCode = randomUUID().slice(0, 8).toUpperCase();

		return res.json({
			claimCode,
			prizeIndex: winnerIndex,
			prize: prize.name,
			prizes: active.prizes.map((p) => ({
				name: p.name,
				backgroundColor: p.backgroundColor,
				probability: p.probability,
			})),
			rouletteId: active.id,
		});
	} catch (error) {
		console.error("Spin error:", error);
		return res.status(500).json({ message: "Error al procesar el giro." });
	}
});

/**
 * GET /api-ruleta/configuracion
 * La vista de la ruleta usa esto para obtener la configuración de premios ACTIVA.
 */
app.get("/api-ruleta/configuracion", async (req, res) => {
	try {
		const activeRoulette = await getActiveRouletteWithPrizes();
		if (!activeRoulette) {
			return res
				.status(404)
				.json({ message: "No active roulette configuration found." });
		}
		res.json({ prizes: activeRoulette.prizes });
	} catch (error) {
		res.status(500).json({ message: "Failed to fetch active configuration." });
	}
});

/**
 * API-ruleta para gestionar plantillas de ruleta
 */
app.get("/api-ruleta/roulettes", async (req, res) => {
	const roulettes = await getAllRoulettes();
	res.json(roulettes);
});

app.get("/api-ruleta/roulettes/:id", async (req, res) => {
	const roulette = await getRouletteWithPrizes(Number(req.params.id));
	if (!roulette) return res.status(404).json({ message: "Roulette not found" });
	res.json(roulette);
});

app.post("/api-ruleta/roulettes", async (req, res) => {
	const { name, prizes } = req.body;
	const newRoulette = await createRoulette(name, prizes);
	res.status(201).json(newRoulette);
});

app.put("/api-ruleta/roulettes/:id", async (req, res) => {
	const { name, prizes } = req.body as { name: string; prizes: Prize[] };
	const updatedRoulette = await updateRoulette(
		Number(req.params.id),
		name,
		prizes,
	);
	res.json(updatedRoulette);
});

app.delete("/api-ruleta/roulettes/:id", async (req, res) => {
	try {
		await deleteRoulette(Number(req.params.id));
		res.status(204).send();
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to delete roulette.";
		res.status(400).json({ message });
	}
});

app.post("/api-ruleta/roulettes/active/:id", async (req, res) => {
	await setActiveRoulette(Number(req.params.id));
	res.status(200).json({ message: "Active roulette updated." });
});

// Health check endpoint
app.get("/health", (req, res) => {
	res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// API-ruleta status endpoint
app.get("/api-ruleta/status", (req, res) => {
	res.json({
		status: "running",
		timestamp: new Date().toISOString(),
		environment: process.env.NODE_ENV || "development",
	});
});

initializeDatabase()
	.then(() => {
		app.listen(port, () => {
			console.log(
				`Keyton Roulette backend server listening on http://localhost:${port}`,
			);
		});
	})
	.catch((error) => {
		console.error("Error inicializando la base de datos:", error);
		process.exit(1);
	});