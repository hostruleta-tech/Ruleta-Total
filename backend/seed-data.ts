/**
 * Datos iniciales de las plantillas.
 * Se usan tanto en el seed manual (backend/seed.ts) como en el
 * auto-seed de una base vacía (backend/database.ts).
 */

export interface SeedPrize {
	name: string;
	backgroundColor: string;
	probability: number;
}

export interface SeedTemplate {
	name: string;
	isActive: boolean;
	prizes: SeedPrize[];
}

export const SEED_TEMPLATES: SeedTemplate[] = [
	{
		name: "Default",
		isActive: false,
		prizes: [
			{ name: "Premio 1", backgroundColor: "#8A2BE2", probability: 10 },
			{ name: "Premio 2", backgroundColor: "#FF7F50", probability: 20 },
			{ name: "Premio 3", backgroundColor: "#3CB371", probability: 5 },
			{
				name: "Inténtalo de nuevo",
				backgroundColor: "#DC143C",
				probability: 65,
			},
		],
	},
	{
		name: "Promoción Total Tools",
		isActive: true,
		prizes: [
			{ name: "Premio 1", backgroundColor: "#0A4E58", probability: 10 },
			{ name: "Premio 2", backgroundColor: "#00767C", probability: 10 },
			{ name: "Premio 3", backgroundColor: "#008087", probability: 10 },
			{ name: "Premio 4", backgroundColor: "#1C7C54", probability: 10 },
			{ name: "Premio 5", backgroundColor: "#2E8B57", probability: 10 },
			{ name: "Premio 6", backgroundColor: "#4A7C3F", probability: 10 },
			{ name: "10% de descuento", backgroundColor: "#E52421", probability: 90 },
		],
	},
	{
		name: "test",
		isActive: false,
		prizes: [
			{ name: "test 1", backgroundColor: "#FFFFFF", probability: 10 },
			{ name: "test 2", backgroundColor: "#dfd2d2", probability: 10 },
			{ name: "test 3", backgroundColor: "#c20000", probability: 70 },
			{ name: "test 4", backgroundColor: "#1b7c0e", probability: 10 },
		],
	},
];
