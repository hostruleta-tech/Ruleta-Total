import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import {
  createRoulette,
  deleteRoulette,
  getActiveRouletteWithPrizes,
  getAllRoulettes,
  getPrizeImage,
  getRouletteWithPrizes,
  setActiveRoulette,
  type Prize,
  updateRoulette,
} from "./database";

const router = Router();

// Límite de peso por imagen: ~300 KB una vez decodificada.
const MAX_IMAGE_CHARS = 420_000;
// Solo imágenes rasterizadas; se rechaza SVG y cualquier otro contenido.
const PRIZE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const DEFAULT_PRIZE_COLOR = "#0A4E58";

/** Error de validación de datos enviados por el panel. */
class ValidationError extends Error {}

/**
 * Normaliza y valida los premios recibidos. Evita guardar HTML/URLs
 * arbitrarias en la columna de imagen y limita su tamaño.
 */
function sanitizePrizes(raw: unknown): Prize[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("La lista de premios no es válida.");
  }

  return raw.map((item, index) => {
    const candidate = (item ?? {}) as Partial<Prize>;
    const position = index + 1;

    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) {
      throw new ValidationError(`El premio ${position} necesita un nombre.`);
    }

    const backgroundColor =
      typeof candidate.backgroundColor === "string" &&
      candidate.backgroundColor.trim() !== ""
        ? candidate.backgroundColor.trim()
        : DEFAULT_PRIZE_COLOR;

    const probability = Number(candidate.probability);
    if (!Number.isFinite(probability) || probability < 0) {
      throw new ValidationError(
        `El peso del premio ${position} debe ser un número mayor o igual a 0.`,
      );
    }

    let image: string | null = null;
    if (candidate.image != null && candidate.image !== "") {
      if (
        typeof candidate.image !== "string" ||
        !PRIZE_IMAGE_DATA_URL.test(candidate.image)
      ) {
        throw new ValidationError(
          `La imagen del premio ${position} no es válida (solo PNG, JPG o WebP).`,
        );
      }
      if (candidate.image.length > MAX_IMAGE_CHARS) {
        throw new ValidationError(
          `La imagen del premio ${position} es demasiado grande.`,
        );
      }
      image = candidate.image;
    }

    return {
      roulette_id: Number(candidate.roulette_id) || 0,
      name,
      backgroundColor,
      probability,
      image,
    };
  });
}

/** Vista pública del premio: sin el base64, solo la URL cacheada. */
function toPublicPrize(prize: Prize) {
  return {
    id: prize.id ?? null,
    name: prize.name,
    backgroundColor: prize.backgroundColor,
    probability: prize.probability,
    imageUrl: prize.imageUrl ?? null,
  };
}

// CORS is handled at the app level in api/index.ts for local dev
// In production Vercel handles it
router.use(express.json({ limit: "4mb" }));

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
router.post("/spin", async (req, res) => {
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
      prizeImageUrl: prize.imageUrl ?? null,
      prizes: active.prizes.map(toPublicPrize),
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
// Rutas públicas: no requieren token.
router.get("/configuracion", async (req, res) => {
  try {
    const activeRoulette = await getActiveRouletteWithPrizes();
    if (!activeRoulette) {
      return res
        .status(404)
        .json({ message: "No active roulette configuration found." });
    }
    res.json({ prizes: (activeRoulette.prizes ?? []).map(toPublicPrize) });
  } catch (error) {
    console.error("Configuracion error:", error);
    res.status(500).json({ message: "Failed to fetch active configuration." });
  }
});

/**
 * GET /api/prizes/:id/image
 * Sirve la imagen del premio con caché larga. Los premios se recrean al
 * guardar, por lo que el id (y su URL) cambia si la imagen se actualiza.
 */
router.get("/prizes/:id/image", async (req, res) => {
  try {
    const image = await getPrizeImage(Number(req.params.id));
    if (!image) {
      return res.status(404).json({ message: "La imagen no existe." });
    }

    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      image,
    );
    if (!match) {
      return res.status(404).json({ message: "La imagen no es válida." });
    }

    const [, mimeType, base64] = match;
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(Buffer.from(base64, "base64"));
  } catch (error) {
    console.error("Prize image error:", error);
    return res.status(500).json({ message: "No se pudo obtener la imagen." });
  }
});

/**
 * API-ruleta para gestionar plantillas de ruleta
 */
router.get("/roulettes", async (req, res) => {
  const roulettes = await getAllRoulettes();
  res.json(roulettes);
});

router.get("/roulettes/:id", async (req, res) => {
  const roulette = await getRouletteWithPrizes(Number(req.params.id));
  if (!roulette) return res.status(404).json({ message: "Roulette not found" });
  res.json(roulette);
});

router.post("/roulettes", async (req, res) => {
  try {
    const { name, prizes } = req.body as { name: string; prizes: unknown };
    const newRoulette = await createRoulette(name, sanitizePrizes(prizes));
    return res.status(201).json(newRoulette);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Create roulette error:", error);
    return res.status(500).json({ message: "No se pudo crear la plantilla." });
  }
});

router.put("/roulettes/:id", async (req, res) => {
  try {
    const { name, prizes } = req.body as { name: string; prizes: unknown };
    const updatedRoulette = await updateRoulette(
      Number(req.params.id),
      name,
      sanitizePrizes(prizes),
    );
    return res.json(updatedRoulette);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Update roulette error:", error);
    return res.status(500).json({ message: "No se pudo guardar la plantilla." });
  }
});

router.delete("/roulettes/:id", async (req, res) => {
  try {
    await deleteRoulette(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete roulette.";
    res.status(400).json({ message });
  }
});

router.post("/roulettes/active/:id", async (req, res) => {
  await setActiveRoulette(Number(req.params.id));
  res.status(200).json({ message: "Active roulette updated." });
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// API-ruleta status endpoint
router.get("/status", (req, res) => {
  res.json({
    status: "running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

export { router };