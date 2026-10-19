import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import type { Database } from 'sqlite';

export interface Prize {
  id?: number;
  roulette_id: number;
  name: string;
  backgroundColor: string;
  probability: number;
}

export interface RouletteTemplate {
  id: number;
  name: string;
  is_active: boolean;
  prizes?: Prize[];
}

let db: Database;

export async function initializeDatabase() {
  db = await open({
    filename: './roulette.db',
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS roulettes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS prizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roulette_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      backgroundColor TEXT NOT NULL,
      probability REAL NOT NULL,
      FOREIGN KEY (roulette_id) REFERENCES roulettes (id) ON DELETE CASCADE
    );
  `);

  // Seed de la plantilla por defecto si no existe ninguna
  const defaultTemplate = await db.get('SELECT * FROM roulettes WHERE name = ?', 'Default');
  if (!defaultTemplate) {
    const result = await db.run('INSERT INTO roulettes (name, is_active) VALUES (?, ?)', 'Default', 1);
    const defaultPrizes = [
      { name: 'Premio 1', backgroundColor: '#8A2BE2', probability: 10 },
      { name: 'Premio 2', backgroundColor: '#FF7F50', probability: 20 },
      { name: 'Premio 3', backgroundColor: '#3CB371', probability: 5 },
      { name: 'Inténtalo de nuevo', backgroundColor: '#DC143C', probability: 65 },
    ];
    const stmt = await db.prepare('INSERT INTO prizes (roulette_id, name, backgroundColor, probability) VALUES (?, ?, ?, ?)');
    for (const prize of defaultPrizes) {
      await stmt.run(result.lastID, prize.name, prize.backgroundColor, prize.probability);
    }
    await stmt.finalize();
    console.log('Default template created.');
  }

  // Seed de la plantilla de promoción: 6 premios en tonos verdes + 1 descuento
  // en rojo. Es idempotente por nombre: no se duplica ni se sobrescribe.
  const promoName = 'Promoción Total Tools';
  const promoExists = await db.get('SELECT * FROM roulettes WHERE name = ?', promoName);
  if (!promoExists) {
    const result = await db.run('INSERT INTO roulettes (name, is_active) VALUES (?, 0)', promoName);
    const promoPrizes = [
      { name: 'Premio 1', backgroundColor: '#0A4E58', probability: 10 },
      { name: 'Premio 2', backgroundColor: '#00767C', probability: 10 },
      { name: 'Premio 3', backgroundColor: '#008087', probability: 10 },
      { name: 'Premio 4', backgroundColor: '#1C7C54', probability: 10 },
      { name: 'Premio 5', backgroundColor: '#2E8B57', probability: 10 },
      { name: 'Premio 6', backgroundColor: '#4A7C3F', probability: 10 },
      { name: '10% de descuento', backgroundColor: '#E52421', probability: 40 },
    ];
    const stmt = await db.prepare('INSERT INTO prizes (roulette_id, name, backgroundColor, probability) VALUES (?, ?, ?, ?)');
    for (const prize of promoPrizes) {
      await stmt.run(result.lastID, prize.name, prize.backgroundColor, prize.probability);
    }
    await stmt.finalize();
    console.log('Promotion template created.');
  }
}

export const getDb = () => db;

export async function getActiveRouletteWithPrizes(): Promise<RouletteTemplate | null> {
  const roulette = await db.get<RouletteTemplate>('SELECT * FROM roulettes WHERE is_active = 1');
  if (!roulette) return null;

  roulette.prizes = await db.all<Prize[]>('SELECT * FROM prizes WHERE roulette_id = ?', roulette.id);
  return roulette;
}

export async function getAllRoulettes(): Promise<RouletteTemplate[]> {
  return db.all<RouletteTemplate[]>('SELECT * FROM roulettes ORDER BY name');
}

export async function getRouletteWithPrizes(id: number): Promise<RouletteTemplate | null> {
  const roulette = await db.get<RouletteTemplate>('SELECT * FROM roulettes WHERE id = ?', id);
  if (!roulette) return null;

  roulette.prizes = await db.all<Prize[]>('SELECT * FROM prizes WHERE roulette_id = ?', id);
  return roulette;
}

export async function createRoulette(name: string, prizes: Omit<Prize, 'id' | 'roulette_id'>[]): Promise<RouletteTemplate> {
  const result = await db.run('INSERT INTO roulettes (name, is_active) VALUES (?, 0)', name);
  const rouletteId = result.lastID!;

  const stmt = await db.prepare('INSERT INTO prizes (roulette_id, name, backgroundColor, probability) VALUES (?, ?, ?, ?)');
  for (const prize of prizes) {
    await stmt.run(rouletteId, prize.name, prize.backgroundColor, prize.probability);
  }
  await stmt.finalize();

  return (await getRouletteWithPrizes(rouletteId))!;
}

export async function updateRoulette(id: number, name: string, prizes: Prize[]): Promise<RouletteTemplate> {
  await db.run('UPDATE roulettes SET name = ? WHERE id = ?', name, id);
  await db.run('DELETE FROM prizes WHERE roulette_id = ?', id);

  const stmt = await db.prepare('INSERT INTO prizes (roulette_id, name, backgroundColor, probability) VALUES (?, ?, ?, ?)');
  for (const prize of prizes) {
    await stmt.run(id, prize.name, prize.backgroundColor, prize.probability);
  }
  await stmt.finalize();

  return (await getRouletteWithPrizes(id))!;
}

export async function deleteRoulette(id: number): Promise<void> {
  // Evitar borrar la ruleta activa o la única que queda
  const count = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM roulettes');
  if (count && count.count <= 1) {
    throw new Error('Cannot delete the last roulette template.');
  }
  const roulette = await db.get<RouletteTemplate>('SELECT * FROM roulettes WHERE id = ?', id);
  if (roulette?.is_active) {
    throw new Error('Cannot delete the active roulette template.');
  }

  await db.run('DELETE FROM roulettes WHERE id = ?', id);
  // Los premios se borran en cascada por la FK
}

export async function setActiveRoulette(id: number): Promise<void> {
  await db.run('UPDATE roulettes SET is_active = 0');
  await db.run('UPDATE roulettes SET is_active = 1 WHERE id = ?', id);
}