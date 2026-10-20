import { describe, expect, it } from "vitest";
import { verifyOperatorPassword } from "../auth";

describe("contraseña de operador", () => {
	it("acepta la contraseña correcta", () => {
		expect(verifyOperatorPassword("secreta", "secreta")).toBe("ok");
	});

	it("rechaza contraseñas ausentes o incorrectas", () => {
		expect(verifyOperatorPassword(undefined, "secreta")).toBe("unauthorized");
		expect(verifyOperatorPassword("", "secreta")).toBe("unauthorized");
		expect(verifyOperatorPassword("otra", "secreta")).toBe("unauthorized");
	});

	it("indica cuando falta configuración", () => {
		expect(verifyOperatorPassword("secreta", undefined)).toBe("missing-config");
	});
});
