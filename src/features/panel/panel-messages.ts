/** Traduce los mensajes del backend a textos claros en español. */
const DICTIONARY: Record<string, string> = {
	// Errores de plantillas / premios
	"Cannot delete the active roulette template.":
		"No puedes borrar la plantilla activa. Marca otra como activa primero.",
	"Cannot delete the last roulette template.":
		"No puedes borrar la última plantilla.",
	"Failed to delete roulette.": "No se pudo borrar la plantilla.",
	"Roulette not found": "Plantilla no encontrada.",
	"No active roulette configuration found.":
		"No hay una plantilla activa configurada.",
	"Failed to fetch active configuration.":
		"No se pudo obtener la configuración activa.",
	"Error al procesar el giro.": "Error al procesar el giro.",
	"No hay plantilla activa con premios.":
		"No hay plantilla activa con premios.",

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