import QRCode from "qrcode";
import type {
	QRCodeErrorCorrectionLevel,
	QRCodeToBufferOptions,
} from "qrcode";

export const QR_PRINT_WIDTH = 512;
export const QR_PREVIEW_WIDTH = 256;

const BASE_OPTIONS = {
	margin: 2,
	errorCorrectionLevel: "M" as QRCodeErrorCorrectionLevel,
	color: {
		dark: "#000000",
		light: "#ffffff",
	},
};

/**
 * Genera un PNG del QR. El contenido debe ser únicamente la URL de
 * participación; nunca datos personales ni premios.
 */
export async function renderQrPng(
	data: string,
	width: number = QR_PRINT_WIDTH,
): Promise<Buffer> {
	const options: QRCodeToBufferOptions = {
		...BASE_OPTIONS,
		type: "png",
		width,
	};
	return QRCode.toBuffer(data, options);
}

/** Igual que `renderQrPng`, pero devuelve una data URL para vistas previas. */
export async function renderQrPngDataUrl(
	data: string,
	width: number = QR_PREVIEW_WIDTH,
): Promise<string> {
	return QRCode.toDataURL(data, {
		...BASE_OPTIONS,
		width,
	});
}
