#!/usr/bin/env tsx
/**
 * Datos iniciales de las plantillas.
 * Se usan tanto en el seed manual (backend/seed.ts) como en el
 * auto-seed de una base vacía (backend/database.ts).
 *
 * La ruleta tiene 6 sectores fijos. Cada plantilla debe tener exactamente
 * una entrada por sector, con `sectorIndex` de 0 a 5.
 */
export interface SeedPrize {
	name: string;
	backgroundColor: string;
	probability: number;
	/** Sector fijo de la ruleta (0-5). */
	sectorIndex: number;
	/** true = casilla "Inténtalo de nuevo" (no consume el ticket). */
	isSpinAgain?: boolean;
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
			{
				name: "Premio 1",
				backgroundColor: "#8A2BE2",
				probability: 10,
				sectorIndex: 0,
			},
			{
				name: "Premio 2",
				backgroundColor: "#FF7F50",
				probability: 20,
				sectorIndex: 1,
			},
			{
				name: "Premio 3",
				backgroundColor: "#3CB371",
				probability: 5,
				sectorIndex: 2,
			},
			{
				name: "Inténtalo de nuevo",
				backgroundColor: "#DC143C",
				probability: 65,
				sectorIndex: 3,
				isSpinAgain: true,
			},
			{
				name: "Premio 5",
				backgroundColor: "#0A4E58",
				probability: 10,
				sectorIndex: 4,
			},
			{
				name: "Premio 6",
				backgroundColor: "#00767C",
				probability: 10,
				sectorIndex: 5,
			},
		],
	},
	{
		name: "Promoción Total Tools",
		isActive: true,
		prizes: [
			{
				name: "Premio 1",
				backgroundColor: "#0A4E58",
				probability: 10,
				sectorIndex: 0,
			},
			{
				name: "Premio 2",
				backgroundColor: "#00767C",
				probability: 10,
				sectorIndex: 1,
			},
			{
				name: "Premio 3",
				backgroundColor: "#008087",
				probability: 10,
				sectorIndex: 2,
			},
			{
				name: "Premio 4",
				backgroundColor: "#1C7C54",
				probability: 10,
				sectorIndex: 3,
			},
			{
				name: "Premio 5",
				backgroundColor: "#2E8B57",
				probability: 10,
				sectorIndex: 4,
			},
			{
				name: "Premio 6",
				backgroundColor: "#4A7C3F",
				probability: 10,
				sectorIndex: 5,
			},
		],
	},
	{
		name: "test",
		isActive: false,
		prizes: [
			{
				name: "test 1",
				backgroundColor: "#FFFFFF",
				probability: 10,
				sectorIndex: 0,
			},
			{
				name: "test 2",
				backgroundColor: "#dfd2d2",
				probability: 10,
				sectorIndex: 1,
			},
			{
				name: "test 3",
				backgroundColor: "#c20000",
				probability: 70,
				sectorIndex: 2,
			},
			{
				name: "test 4",
				backgroundColor: "#1b7c0e",
				probability: 10,
				sectorIndex: 3,
			},
			{
				name: "test 5",
				backgroundColor: "#0A4E58",
				probability: 10,
				sectorIndex: 4,
			},
			{
				name: "test 6",
				backgroundColor: "#00767C",
				probability: 10,
				sectorIndex: 5,
			},
		],
	},
];