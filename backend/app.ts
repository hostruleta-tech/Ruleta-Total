import express, { Router } from "express";
import {
  createRoulette,
  deleteRoulette,
  getActiveRouletteWithPrizes,
  getAllRoulettes,
  getDb,
  getPrizeImage,
  getRouletteWithPrizes,
  setActiveRoulette,
  type Prize,
  updateRoulette,
} from "./database";
import { requireOperator } from "./auth/session";
import { createAuthRouter } from "./auth/router";
import { createTicketsRouter } from "./tickets/router";
import { hashTicketToken } from "./tickets/token";
import {
  getBatchById,
  reserveTicket,
  redeemTicket,
  validateTicket,
  listBatches,
  listBatchTickets,
  type PrizeInfo,
} from "./tickets/repository";
import { withEffectiveStatus, effectiveStatus } from "./tickets/types";
import { buildBatchQrZip, getBatchDetail } from "./tickets/service";

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

// Auth routes (login, logout, me) - públicas
router.use("/auth", createAuthRouter(getDb));

// Administración de tickets QR (todas las rutas requieren operador autenticado).
router.use("/tickets", createTicketsRouter(getDb));

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
 * El participante escanea un QR, valida su token, reserva el ticket,
 * el servidor sortea con la plantilla activa, canjea el ticket y
 * devuelve el premio junto con el ID del ticket como código de reclamación.
 * Body: { token: string }
 *
 * Modo demo (admin): sin token + sesión de operador válida -> gira sin consumir ticket.
 */
router.post("/spin", async (req, res) => {
  try {
    const body = (req.body ?? {}) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";

    const active = await getActiveRouletteWithPrizes();
    if (!active || !active.prizes || active.prizes.length === 0) {
      return res
        .status(404)
        .json({ message: "No hay plantilla activa con premios." });
    }

    // MODO DEMO: sin token pero con sesión de operador
    if (!token) {
      // Verificar si hay sesión de operador (cookie o cabecera)
      const hasOperatorSession =
        req.get("x-operator-password") !== undefined ||
        (await import("./auth/session")).verifySession(req);

      if (!hasOperatorSession) {
        return res.status(400).json({ message: "Token de ticket requerido." });
      }

      // Giro demo: sortear sin tocar la base de datos
      const winnerIndex = pickWeightedIndex(active.prizes);
      const prize = active.prizes[winnerIndex];

      return res.json({
        demo: true,
        prizeIndex: winnerIndex,
        prize: prize.name,
        prizeImageUrl: prize.imageUrl ?? null,
        prizes: active.prizes.map(toPublicPrize),
        rouletteId: active.id,
      });
    }

    // FLUJO NORMAL CON TICKET
    const tokenHash = hashTicketToken(token);
    const client = await getDb();

    // 1. Validar ticket
    const validation = await validateTicket(client, tokenHash);
    if (!validation.valid || !validation.ticket) {
      const statusCode = validation.reason === "not_found" ? 404 : 410;
      return res.status(statusCode).json({
        message: validation.reason === "not_found"
          ? "Ticket no encontrado."
          : validation.reason === "expired"
          ? "Ticket expirado."
          : validation.reason === "void"
          ? "Ticket anulado."
          : validation.reason === "already_redeemed"
          ? "Ticket ya canjeado."
          : "Ticket reservado por otra sesión.",
        reason: validation.reason,
        ticket: validation.ticket ? withEffectiveStatus(validation.ticket) : null,
      });
    }

    // 2. Reservar ticket (5 min TTL)
    const reserveResult = await reserveTicket(client, tokenHash, 5);
    if (!reserveResult.success || !reserveResult.ticket) {
      return res.status(409).json({
        message: "No se pudo reservar el ticket.",
        reason: reserveResult.reason,
        ticket: reserveResult.ticket ? withEffectiveStatus(reserveResult.ticket) : null,
      });
    }

    // 3. Sortear premio
    const winnerIndex = pickWeightedIndex(active.prizes);
    const prize = active.prizes[winnerIndex];

    // 4. Canjear ticket con el premio
    const prizeInfo: PrizeInfo = {
      prizeId: prize.id ?? 0,
      prizeName: prize.name,
      rouletteId: active.id,
    };
    const redeemResult = await redeemTicket(client, tokenHash, prizeInfo);
    if (!redeemResult.success || !redeemResult.ticket) {
      // Si falla el canje, la reserva expirará en 5 min y se liberará sola
      return res.status(500).json({
        message: "Error al canjear el ticket.",
        reason: redeemResult.reason,
        ticket: redeemResult.ticket ? withEffectiveStatus(redeemResult.ticket) : null,
      });
    }

    // 5. Responder con el premio y el ticket ID como claimCode
    return res.json({
      claimCode: redeemResult.ticket.id.slice(0, 8).toUpperCase(),
      ticketId: redeemResult.ticket.id,
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
 * GET /api/tickets/batches/:id/live
 * Endpoint ligero para polling del panel en tiempo real.
 * No genera imágenes QR, solo contadores y últimos canjeados.
 * Requiere autenticación de operador.
 */
router.get("/tickets/batches/:id/live", requireOperator, async (req, res) => {
  try {
    const client = await getDb();
    const batchId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const now = new Date();
    const nowIso = now.toISOString();

    // Verificar que el lote existe
    const batch = await getBatchById(client, batchId);
    if (!batch) {
      return res.status(404).json({ message: "El lote no existe." });
    }

    // Contadores con estado efectivo
    const countsResult = await client.execute({
      sql: `SELECT
          SUM(CASE WHEN status = 'available' AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS available,
          SUM(CASE WHEN status = 'reserved' AND reserved_until > ? THEN 1 ELSE 0 END) AS reserved,
          SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed,
          SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void,
          SUM(CASE WHEN status = 'expired' OR (status = 'available' AND expires_at IS NOT NULL AND expires_at <= ?) THEN 1 ELSE 0 END) AS expired,
          COUNT(*) AS total
        FROM tickets WHERE batch_id = ?`,
      args: [nowIso, nowIso, nowIso, batchId],
    });

    const counts = countsResult.rows[0] as Record<string, number | null>;

    // Últimos 20 canjeados del lote
    const redeemedResult = await client.execute({
      sql: `SELECT id, prize_name, redeemed_at
            FROM tickets
            WHERE batch_id = ? AND status = 'redeemed'
            ORDER BY redeemed_at DESC
            LIMIT 20`,
      args: [batchId],
    });

    const redeemed = redeemedResult.rows.map((row) => ({
      id: String(row.id),
      prizeName: row.prize_name == null ? null : String(row.prize_name),
      redeemedAt: String(row.redeemed_at),
    }));

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      batchId,
      counts: {
        total: Number(counts.total ?? 0),
        available: Number(counts.available ?? 0),
        reserved: Number(counts.reserved ?? 0),
        redeemed: Number(counts.redeemed ?? 0),
        void: Number(counts.void ?? 0),
        expired: Number(counts.expired ?? 0),
      },
      redeemed,
      serverTime: now.toISOString(),
    });
  } catch (error) {
    console.error("[tickets] live error:", error);
    return res.status(500).json({ message: "No se pudo obtener el estado en vivo." });
  }
});

/**
 * GET /api/tickets/redeemed
 * Registro global de tickets canjeados con paginación y filtros.
 * Requiere autenticación de operador.
 */
router.get("/tickets/redeemed", requireOperator, async (req, res) => {
  try {
    const client = await getDb();
    const batchIdRaw = req.query.batchId;
    const batchId = typeof batchIdRaw === "string" && batchIdRaw.trim() ? batchIdRaw.trim() : undefined;
    const qRaw = req.query.q;
    const q = typeof qRaw === "string" ? qRaw.trim().toUpperCase() : undefined;
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    let where = "WHERE t.status = 'redeemed'";
    const args: (string | number)[] = [];

    if (batchId) {
      where += " AND t.batch_id = ?";
      args.push(batchId);
    }
    if (q) {
      where += " AND UPPER(t.id) LIKE ?";
      args.push(`${q}%`);
    }

    const countResult = await client.execute({
      sql: `SELECT COUNT(*) AS total FROM tickets t ${where}`,
      args,
    });

    const result = await client.execute({
      sql: `SELECT t.id, t.batch_id, b.label AS batch_label, t.prize_name, t.redeemed_at
            FROM tickets t
            LEFT JOIN ticket_batches b ON t.batch_id = b.id
            ${where}
            ORDER BY t.redeemed_at DESC, t.id DESC
            LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    });

    const tickets = result.rows.map((row) => ({
      id: String(row.id),
      batchId: row.batch_id == null ? null : String(row.batch_id),
      batchLabel: row.batch_label == null ? null : String(row.batch_label),
      prizeName: row.prize_name == null ? null : String(row.prize_name),
      redeemedAt: String(row.redeemed_at),
    }));

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset,
      tickets,
    });
  } catch (error) {
    console.error("[tickets] redeemed error:", error);
    return res.status(500).json({ message: "No se pudo obtener el registro de canjeados." });
  }
});

/**
 * GET /api/tickets/stats
 * Totales globales con estado efectivo.
 * Requiere autenticación de operador.
 */
router.get("/tickets/stats", requireOperator, async (req, res) => {
  try {
    const client = await getDb();
    const nowIso = new Date().toISOString();

    const result = await client.execute({
      sql: `SELECT
          SUM(CASE WHEN status = 'available' AND (expires_at IS NULL OR expires_at > ?) THEN 1 ELSE 0 END) AS available,
          SUM(CASE WHEN status = 'reserved' AND reserved_until > ? THEN 1 ELSE 0 END) AS reserved,
          SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed,
          SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void,
          SUM(CASE WHEN status = 'expired' OR (status = 'available' AND expires_at IS NOT NULL AND expires_at <= ?) THEN 1 ELSE 0 END) AS expired,
          COUNT(*) AS total
        FROM tickets`,
      args: [nowIso, nowIso, nowIso],
    });

    const row = result.rows[0] as Record<string, number | null>;

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      total: Number(row.total ?? 0),
      available: Number(row.available ?? 0),
      reserved: Number(row.reserved ?? 0),
      redeemed: Number(row.redeemed ?? 0),
      void: Number(row.void ?? 0),
      expired: Number(row.expired ?? 0),
    });
  } catch (error) {
    console.error("[tickets] stats error:", error);
    return res.status(500).json({ message: "No se pudieron obtener las estadísticas." });
  }
});

/**
 * GET /api/tickets/redeemed.csv
 * Exportación CSV de canjeados (sin paginación).
 * Requiere autenticación de operador.
 */
router.get("/tickets/redeemed.csv", requireOperator, async (req, res) => {
  try {
    const client = await getDb();
    const batchIdRaw = req.query.batchId;
    const batchId = typeof batchIdRaw === "string" && batchIdRaw.trim() ? batchIdRaw.trim() : undefined;

    let where = "WHERE t.status = 'redeemed'";
    const args: string[] = [];

    if (batchId) {
      where += " AND t.batch_id = ?";
      args.push(batchId);
    }

    const result = await client.execute({
      sql: `SELECT t.id, t.batch_id, b.label AS batch_label, t.prize_name, t.redeemed_at
            FROM tickets t
            LEFT JOIN ticket_batches b ON t.batch_id = b.id
            ${where}
            ORDER BY t.redeemed_at DESC, t.id DESC`,
      args,
    });

    const rows = ["codigo,lote,premio,fecha_canje"];
    for (const row of result.rows) {
      const code = String(row.id).slice(0, 8).toUpperCase();
      const batchLabel = row.batch_label == null ? "" : String(row.batch_label).replace(/"/g, '""');
      const prizeName = row.prize_name == null ? "" : String(row.prize_name).replace(/"/g, '""');
      const redeemedAt = String(row.redeemed_at);
      rows.push(`"${code}","${batchLabel}","${prizeName}","${redeemedAt}"`);
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="canjeados.csv"');
    res.setHeader("Cache-Control", "no-store");
    return res.send("\uFEFF" + rows.join("\r\n"));
  } catch (error) {
    console.error("[tickets] redeemed.csv error:", error);
    return res.status(500).json({ message: "No se pudo exportar el CSV." });
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
router.get("/roulettes", requireOperator, async (req, res) => {
  const roulettes = await getAllRoulettes();
  res.json(roulettes);
});

router.get("/roulettes/:id", requireOperator, async (req, res) => {
  const roulette = await getRouletteWithPrizes(Number(req.params.id));
  if (!roulette) return res.status(404).json({ message: "Roulette not found" });
  res.json(roulette);
});

router.post("/roulettes", requireOperator, async (req, res) => {
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

router.put("/roulettes/:id", requireOperator, async (req, res) => {
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

router.delete("/roulettes/:id", requireOperator, async (req, res) => {
  try {
    await deleteRoulette(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete roulette.";
    res.status(400).json({ message });
  }
});

router.post("/roulettes/active/:id", requireOperator, async (req, res) => {
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