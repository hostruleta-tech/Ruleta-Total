import React, { useState, useEffect, useRef } from 'react';
import { useRoulette } from './hooks/use-roulette';
import type { RouletteItem } from './types';
import { Roulette } from './components/roulette';
import { PrizeModal } from './prize-modal';

interface RouletteState {
  command: 'stopped' | 'spinning';
  targetPrize: string | null;
  timestamp: number;
}

const API_URL = 'http://localhost:3001/api';

const RouletteGame: React.FC<{ items: RouletteItem[]; onPrizeWon: (prize: string) => void; isPaused: boolean }> = ({ items, onPrizeWon, isPaused }) => {
  const { roulette, onStart, onStop } = useRoulette({
    items,
    onSpinEnd: (result: string) => {
      onPrizeWon(result);
    },
  });
  const lastCommandTimestamp = useRef<number>(0);
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        if (isPaused) {
          return;
        }

        const response = await fetch(`${API_URL}/state`);
        if (!response.ok) return;

        const state: RouletteState = await response.json();

        if (state.timestamp > lastCommandTimestamp.current) {
          lastCommandTimestamp.current = state.timestamp;

          if (state.command === 'spinning') {
            if (!isSpinning) {
              setIsSpinning(true);
              onStart();
            }
          } else if (state.command === 'stopped' && isSpinning) {
            onStop(); // Stop the wheel
            setIsSpinning(false);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      clearInterval(pollInterval);
    };
  }, [isSpinning, onStart, onStop, isPaused]);

  return (
    <>
      <Roulette roulette={roulette} />
    </>
  );
};

export const RouletteViewHook: React.FC = () => {
  const [rouletteItems, setRouletteItems] = useState<RouletteItem[] | null>(null);
  const [finalResult, setFinalResult] = useState<string | null>(null);
  const isModalOpen = finalResult !== null;

  useEffect(() => {
    const fetchPrizes = async () => {
      // No actualizamos la configuración si el modal está abierto
      if (isModalOpen) {
        return;
      }

      try {
        const response = await fetch(`${API_URL}/configuracion`);
        const data = await response.json();
        const formattedPrizes = (data.prizes || []).map((p: any) => ({
          name: p.name,
          bg: p.backgroundColor,
          weight: p.probability,
        }));
        setRouletteItems(formattedPrizes);
      } catch (error) {
        console.error('Failed to fetch prizes', error);
      }
    };

    fetchPrizes();
    const configPollInterval = setInterval(fetchPrizes, 5000);
    return () => clearInterval(configPollInterval);
  }, [isModalOpen]); // Dependemos del estado del modal para reanudar el sondeo

  return (
    <div className="w-screen h-screen bg-gray-800 flex flex-col items-center justify-center text-white">
      <h1 className="text-4xl font-bold mb-4">Keyton Roulette (React Hook Roulette)</h1>
      {rouletteItems ? (
        <RouletteGame items={rouletteItems} onPrizeWon={setFinalResult} isPaused={isModalOpen} />
      ) : (
        <p>Cargando ruleta...</p>
      )}
      {isModalOpen && (
        <PrizeModal prize={finalResult} onClose={() => setFinalResult(null)} />
      )}
    </div>
  );
};
