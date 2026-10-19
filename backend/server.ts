import express from 'express';
import cors from 'cors';
import path from 'path';
import {
  initializeDatabase,
  getActiveRouletteWithPrizes,
  getAllRoulettes,
  getRouletteWithPrizes,
  createRoulette,
  updateRoulette,
  deleteRoulette,
  setActiveRoulette,
  Prize,
} from './database';

const app = express();
const port = 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// In-memory state for the roulette
let rouletteState = {
  command: 'stopped', // 'stopped', 'spinning'
  targetPrize: null as string | null,
  timestamp: Date.now(),
};

// API Endpoints

/**
 * GET /api/state
 * The public roulette view polls this endpoint to get the latest command.
 */
app.get('/api/state', (req, res) => {
  res.json(rouletteState);
});

/**
 * GET /api/configuracion
 * La vista de la ruleta usa esto para obtener la configuración de premios ACTIVA.
 */
app.get('/api/configuracion', async (req, res) => {
  try {
    const activeRoulette = await getActiveRouletteWithPrizes();
    if (!activeRoulette) {
      return res.status(404).json({ message: 'No active roulette configuration found.' });
    }
    res.json({ prizes: activeRoulette.prizes });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch active configuration.' });
  }
});

/**
 * API para gestionar plantillas de ruleta
 */
app.get('/api/roulettes', async (req, res) => {
  const roulettes = await getAllRoulettes();
  res.json(roulettes);
});

app.get('/api/roulettes/:id', async (req, res) => {
  const roulette = await getRouletteWithPrizes(Number(req.params.id));
  if (!roulette) return res.status(404).json({ message: 'Roulette not found' });
  res.json(roulette);
});

app.post('/api/roulettes', async (req, res) => {
  const { name, prizes } = req.body;
  const newRoulette = await createRoulette(name, prizes);
  res.status(201).json(newRoulette);
});

app.put('/api/roulettes/:id', async (req, res) => {
  const { name, prizes } = req.body as { name: string; prizes: Prize[] };
  const updatedRoulette = await updateRoulette(Number(req.params.id), name, prizes);
  res.json(updatedRoulette);
});

app.delete('/api/roulettes/:id', async (req, res) => {
  try {
    await deleteRoulette(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete roulette.';
    res.status(400).json({ message });
  }
});

app.post('/api/roulettes/active/:id', async (req, res) => {
  await setActiveRoulette(Number(req.params.id));
  res.status(200).json({ message: 'Active roulette updated.' });
});

/**
 * POST /api/command
 * The admin panel sends actions ('spin', 'stop') to this endpoint.
 */
app.post('/api/command', (req, res) => {
  const { action, prize } = req.body;

  if (action === 'spin') {
    // Allow spinning from a 'stopped' state to reset, but prevent rapid re-spins.
    if (rouletteState.command === 'spinning' && (Date.now() - rouletteState.timestamp) < 2000) {
      return res.status(400).json({ message: 'Roulette is already spinning.' });
    }
    rouletteState = {
      command: 'spinning',
      targetPrize: null,
      timestamp: Date.now(),
    };
    console.log('State updated: spinning');
    return res.status(200).json({ message: 'Spin command received.', state: rouletteState });
  }

  if (action === 'stop') {
    if (rouletteState.command !== 'spinning') {
      return res.status(400).json({ message: 'Roulette is not spinning.' });
    }
    rouletteState = {
      command: 'stopped',
      targetPrize: null, // El frontend decidirá el premio
      timestamp: Date.now(),
    };
    console.log(`State updated: stopping`);
    return res.status(200).json({ message: 'Stop command received.', state: rouletteState });
  }

  return res.status(400).json({ message: 'Invalid action.' });
});

initializeDatabase().then(() => {
  app.listen(port, () => {
    console.log(`Keyton Roulette backend server listening on http://localhost:${port}`);
  });
});
