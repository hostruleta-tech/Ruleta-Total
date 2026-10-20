import jsQR from "jsqr";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { renderQrPng, renderQrPngDataUrl } from "../qr";
import { generateTicketToken } from "../token";
import { buildParticipationUrl } from "../url";
import { TEST_BASE_URL } from "./helpers";

function decodePng(buffer: Buffer): string {
	const png = PNG.sync.read(buffer);
	const decoded = jsQR(
		new Uint8ClampedArray(png.data),
		png.width,
		png.height,
	);
	if (!decoded) throw new Error("No se pudo decodificar el QR de prueba.");
	return decoded.data;
}

describe("códigos QR", () => {
	it("cada QR contiene exactamente la URL de su ticket", async () => {
		const tokenA = generateTicketToken();
		const tokenB = generateTicketToken();
		const urlA = buildParticipationUrl(tokenA, TEST_BASE_URL);
		const urlB = buildParticipationUrl(tokenB, TEST_BASE_URL);

		const pngA = await renderQrPng(urlA);
		const pngB = await renderQrPng(urlB);

		expect(decodePng(pngA)).toBe(urlA);
		expect(decodePng(pngB)).toBe(urlB);
		expect(decodePng(pngA)).not.toBe(decodePng(pngB));
		expect(pngA.equals(pngB)).toBe(false);
	});

	it("genera una data URL PNG válida para vistas previas", async () => {
		const url = buildParticipationUrl(generateTicketToken(), TEST_BASE_URL);
		const dataUrl = await renderQrPngDataUrl(url);

		expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
		const base64 = dataUrl.split(",")[1];
		expect(decodePng(Buffer.from(base64, "base64"))).toBe(url);
	});

	it("no incluye premios ni datos personales", async () => {
		const token = generateTicketToken();
		const url = buildParticipationUrl(token, TEST_BASE_URL);
		const decoded = decodePng(await renderQrPng(url));

		expect(decoded).toBe(url);
		expect(decoded).not.toContain("premio");
		expect(decoded).not.toContain("telefono");
		expect(decoded).not.toMatch(/@/);
	});
});
