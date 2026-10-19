import React, { useState } from 'react';
import { PrizeManager } from './prize-manager';

const API_URL = 'http://localhost:3001/api';

export const AdminPanel: React.FC = () => {
  const handleCommand = async (action: 'spin' | 'stop') => {
    setIsLoading(true);
    setFeedback('');
    try {
      const body = { action };

      const response = await fetch(`${API_URL}/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'An error occurred.');
      }

      setFeedback(result.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');

  return (
    <div className="p-8 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Keyton Roulette - Control Panel</h1>
      <div className="space-y-4 max-w-md">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => handleCommand('spin')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
            disabled={isLoading}
          >
            Girar (Spin)
          </button>
          <button
            onClick={() => handleCommand('stop')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
            disabled={isLoading}
          >
            Detener (Stop)
          </button>
        </div>
        {feedback && <p className="mt-4 text-sm">{feedback}</p>}
      </div>
      <PrizeManager />
    </div>
  );
};
