import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

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

// --- Database Logic ---
const dbPath = path.resolve(__dirname, 'db.json');

interface Prize {
  name: string;
  backgroundColor: string;
  probability: number;
}

interface Db {
  prizes: Prize[];
}

let prizeConfiguration: Prize[] = [];

const readDb = (): void => {
  try {
    const data = fs.readFileSync(dbPath, 'utf-8');
    const db: Db = JSON.parse(data);
    prizeConfiguration = db.prizes;
    console.log('Prize configuration loaded from db.json');
  } catch (error) {
    console.error('Error reading db.json, using default. Please create db.json if it does not exist.', error);
    prizeConfiguration = [{ name: 'Default Prize', backgroundColor: '#fff', probability: 100 }];
  }
};

const writeDb = (data: Db): void => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log('db.json has been updated.');
  } catch (error) {
    console.error('Error writing to db.json', error);
  }
};

// Initialize DB on startup
readDb();

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
 * The admin panel uses this to get the current prize configuration.
 */
app.get('/api/configuracion', (req, res) => {
  res.json({ prizes: prizeConfiguration });
});

/**
 * POST /api/configuracion
 * The admin panel uses this to save the prize configuration.
 */
app.post('/api/configuracion', (req, res) => {
  const { prizes } = req.body as { prizes: Prize[] };
  writeDb({ prizes });
  readDb(); // Re-read the config into memory
  res.status(200).json({ message: 'Configuration saved successfully.' });
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

app.listen(port, () => {
  console.log(`Keyton Roulette backend server listening on http://localhost:${port}`);
});
