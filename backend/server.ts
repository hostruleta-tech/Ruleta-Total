import express from 'express';
import cors from 'cors';

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
 * POST /api/command
 * The admin panel sends actions ('spin', 'stop') to this endpoint.
 */
app.post('/api/command', (req, res) => {
  const { action, prize } = req.body;

  if (action === 'spin') {
    if (rouletteState.command === 'spinning') {
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
    if (!prize) {
      return res.status(400).json({ message: 'A prize must be specified to stop.' });
    }
    rouletteState = {
      command: 'stopped',
      targetPrize: prize,
      timestamp: Date.now(),
    };
    console.log(`State updated: stopping at ${prize}`);
    return res.status(200).json({ message: 'Stop command received.', state: rouletteState });
  }

  return res.status(400).json({ message: 'Invalid action.' });
});

app.listen(port, () => {
  console.log(`Keyton Roulette backend server listening on http://localhost:${port}`);
});
