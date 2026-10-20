import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

export const OPERATOR_PASSWORD_HEADER = "x-operator-password";

export type PasswordCheck = "ok" | "missing-config" | "unauthorized";

function safeEqual(a: string, b: string): boolean {
	// Comparar digests evita filtrar la longitud de la contraseña.
	const digestA = createHash("sha256").update(a, "utf8").digest();
	const digestB = createHash("sha256").update(b, "utf8").digest();
	return timingSafeEqual(digestA, digestB);
}

export function verifyOperatorPassword(
	provided: string | undefined,
	expected: string | undefined = process.env.OPERATOR_PASSWORD,
): PasswordCheck {
	if (!expected) return "missing-config";
	if (!provided) return "unauthorized";
	return safeEqual(provided, expected) ? "ok" : "unauthorized";
}

/**
 * Protege las acciones de administración (crear/editar ruletas y gestionar
 * tickets). No hay sesión ni token: se compara la contraseña en cada petición.
 */
export const requireOperatorPassword: RequestHandler = (req, res, next) => {
	const result = verifyOperatorPassword(
		req.get(OPERATOR_PASSWORD_HEADER) ?? undefined,
	);

	if (result === "missing-config") {
		return res.status(503).json({
			message:
				"Falta configurar OPERATOR_PASSWORD en el servidor para proteger esta acción.",
		});
	}

	if (result === "unauthorized") {
		return res.status(401).json({
			message: "Contraseña de operador incorrecta.",
		});
	}

	return next();
};
