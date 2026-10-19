import React, { useState, useEffect, useRef } from 'react';
import { Wheel } from 'react-custom-roulette';

interface Prize {
  option: string;
  style?: {
    backgroundColor?: string;
    textColor?: string;
  };
}

interface RouletteState {
  command: 'stopped' | 'spinning';
  targetPrize: string | null;
  timestamp: number;
}

const API_URL = 'http://localhost:3001/api';

// Mock data, should eventually come from the backend or a shared config
const data: Prize[] = [
  { option: 'Prize 1', style: { backgroundColor: '#f82' } },
  { option: 'Prize 2', style: { backgroundColor: '#0bf' } },
  { option: 'Prize 3', style: { backgroundColor: '#f82' } },
  { option: 'Prize 4', style: { backgroundColor: '#0bf' } },
  { option: 'Prize 5', style: { backgroundColor: '#f82' } },
  { option: 'Try Again', style: { backgroundColor: '#0bf' } },
];

export const RouletteView: React.FC = () => {
  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const lastCommandTimestamp = useRef<number>(0);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/state`);
        if (!response.ok) return;

        const state: RouletteState = await response.json();

        if (state.timestamp > lastCommandTimestamp.current) {
          lastCommandTimestamp.current = state.timestamp;

          if (state.command === 'spinning') {
            setPrizeNumber(0); // Reset prize number
            setMustSpin(true);
          } else if (state.command === 'stopped' && state.targetPrize) {
            const prizeIndex = data.findIndex(p => p.option === state.targetPrize);
            if (prizeIndex !== -1) {
              setPrizeNumber(prizeIndex);
              setMustSpin(false);
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, []);

  return (
    <div className="w-screen h-screen bg-gray-800 flex items-center justify-center">
      <Wheel
        mustStartSpinning={mustSpin}
        prizeNumber={prizeNumber}
        data={data}
        onStopSpinning={() => {
          setMustSpin(false);
          console.log(`Stopped at: ${data[prizeNumber].option}`);
        }}
        backgroundColors={['#b8c', '#8cb']}
        textColors={['#fff']}
      />
    </div>
  );
};