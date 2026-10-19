import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

/**
 * Carga `.env` sin depender de cuál sea el directorio de trabajo.
 *
 * `tsx watch` relanza el proceso con cwd = `backend/`, mientras que
 * `npm run db:seed` lo ejecuta con cwd = raíz del proyecto. Probamos
 * ambas ubicaciones para que funcione en los dos casos.
 */
const candidates = [
	resolve(process.cwd(), ".env"),
	resolve(process.cwd(), "..", ".env"),
];

for (const path of candidates) {
	if (existsSync(path)) {
		config({ path });
		break;
	}
}
