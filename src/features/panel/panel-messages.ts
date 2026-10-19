/** Traduce los mensajes del backend a textos claros en español. */
const DICTIONARY: Record<string, string> = {
	// Éxito (comandos de la ruleta)
	"Spin command received.": "Girando la ruleta…",
	"Stop command received.": "Deteniendo la ruleta…",
	// Errores de plantillas / premios
	"Cannot delete the active roulette template.":
		"No puedes borrar la plantilla activa. Marca otra como activa primero.",
	"Cannot delete the last roulette template.":
		"No puedes borrar la última plantilla.",
	"Failed to delete roulette.": "No se pudo borrar la plantilla.",
	"Roulette not found": "Plantilla no encontrada.",
	// Errores del control de giro
	"Roulette is already spinning.": "La ruleta ya está girando.",
	"Roulette is not spinning.": "La ruleta no está girando.",
	"Invalid action.": "Acción no válida.",
	"No active roulette configuration found.":
		"No hay una plantilla activa configurada.",
	"Failed to fetch active configuration.":
		"No se pudo obtener la configuración activa.",
	// Errores de red
	"Failed to fetch": "No se pudo conectar con el servidor.",
	"NetworkError when attempting to fetch resource.":
		"No se pudo conectar con el servidor.",
};

export function translateMessage(
	message?: string,
	fallback = "Ocurrió un error inesperado.",
): string {
	if (!message) return fallback;
	return DICTIONARY[message] ?? message;
}
