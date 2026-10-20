import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TicketConfigError } from "../errors";
import { generateTicketToken } from "../token";
import { buildParticipationUrl, getPublicAppUrl } from "../url";
import { restoreEnv, setTestEnv, TEST_BASE_URL } from "./helpers";

describe("URL de participación", () => {
	let saved: ReturnType<typeof setTestEnv>;

	beforeEach(() => {
		saved = setTestEnv();
	});

	afterEach(() => {
		restoreEnv(saved);
	});

	it("coloca el token solo en el fragmento", () => {
		const token = generateTicketToken();
		const url = new URL(buildParticipationUrl(token));
		const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));

		expect(url.origin).toBe(TEST_BASE_URL);
		expect(url.searchParams.get("view")).toBe("play");
		expect(url.searchParams.get("t")).toBeNull();
		expect(fragment.get("t")).toBe(token);
	});

	it("respeta una ruta base configurada", () => {
		process.env.PUBLIC_APP_URL = `${TEST_BASE_URL}/promo/`;
		const url = new URL(buildParticipationUrl("token-de-prueba"));
		expect(url.pathname).toBe("/promo/");
		expect(getPublicAppUrl()).toBe(`${TEST_BASE_URL}/promo/`);
	});

	it("exige HTTPS en producción", () => {
		process.env.NODE_ENV = "production";
		process.env.PUBLIC_APP_URL = "http://inseguro.test";

		expect(() => getPublicAppUrl()).toThrow(TicketConfigError);
	});

	it("falla si no hay URL pública en producción", () => {
		process.env.NODE_ENV = "production";
		delete process.env.PUBLIC_APP_URL;
		delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

		expect(() => getPublicAppUrl()).toThrow(TicketConfigError);
	});
});
