import React, { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3001/api';

export interface Prize {
  roulette_id?: number;
  name: string;
  backgroundColor: string;
  probability: number;
}

interface PrizeManagerProps {
  templateId: number;
  isActive: boolean;
  onDelete: () => void;
  onSetActive: () => void;
}

export const PrizeManager: React.FC<PrizeManagerProps> = ({ templateId, isActive, onDelete, onSetActive }) => {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [newPrize, setNewPrize] = useState<Omit<Prize, 'id' | 'roulette_id'>>({ name: '', backgroundColor: '#FFFFFF', probability: 10 });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');

  useEffect(() => {
    const fetchPrizes = async () => {
      if (!templateId) return;
      try {
        const response = await fetch(`${API_URL}/roulettes/${templateId}`)
        const data = await response.json();
        setPrizes(data.prizes || []);
        setTemplateName(data.name);
      } catch (error) {
        console.error('Failed to fetch prizes', error);
      }
    };
    fetchPrizes();
  }, [templateId]);

  const handleSaveConfiguration = async () => {
    setIsLoading(true);
    setFeedback('');
    try {
      const response = await fetch(`${API_URL}/roulettes/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName, prizes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setFeedback('Template saved!');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to save.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPrize = () => {
    if (newPrize.name.trim() === '') return;
    setPrizes([...prizes, { ...newPrize, probability: Number(newPrize.probability) || 0, roulette_id: templateId }]);
    setNewPrize({ name: '', backgroundColor: '#FFFFFF', probability: 10 });
  };

  const handleRemovePrize = (index: number) => {
    setPrizes(prizes.filter((_, i) => i !== index));
  };

  const handlePrizeChange = (index: number, field: keyof Prize, value: string | number) => {
    const updatedPrizes = [...prizes];
    const prizeToUpdate = { ...updatedPrizes[index] };

    // Asegurarse de que la probabilidad sea un número
    const processedValue = field === 'probability' ? Number(value) || 0 : value;

    (prizeToUpdate as any)[field] = processedValue;
    updatedPrizes[index] = prizeToUpdate;
    setPrizes(updatedPrizes);
  };

  return (
    <div className="mt-6 p-6 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-2xl font-bold">Editing Template:</h3>
        <input
          type="text"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          className="bg-gray-700 p-2 rounded text-2xl font-bold"
        />
      </div>

      {/* Prize List */}
      <div className="space-y-2 mb-6">
        {prizes.map((prize, index) => (
          <div key={index} className="flex items-center space-x-2">
            <input type="text" value={prize.name} onChange={(e) => handlePrizeChange(index, 'name', e.target.value)} className="bg-gray-700 p-2 rounded w-1/3" />
            <input type="color" value={prize.backgroundColor} onChange={(e) => handlePrizeChange(index, 'backgroundColor', e.target.value)} className="bg-gray-700 p-1 h-10 rounded" />
            <input type="number" value={prize.probability} onChange={(e) => handlePrizeChange(index, 'probability', Number(e.target.value))} className="bg-gray-700 p-2 rounded w-24" />
            <button onClick={() => handleRemovePrize(index)} className="bg-red-700 hover:bg-red-800 p-2 rounded">Remove</button>
          </div>
        ))}
      </div>

      {/* Add New Prize */}
      <div className="flex items-center space-x-2 border-t border-gray-700 pt-4">
        <input
          type="text"
          placeholder="Prize Name"
          value={newPrize.name}
          onChange={(e) => setNewPrize({ ...newPrize, name: e.target.value })}
          className="bg-gray-600 p-2 rounded w-1/3"
        />
        <input
          type="color"
          value={newPrize.backgroundColor}
          onChange={(e) => setNewPrize({ ...newPrize, backgroundColor: e.target.value })}
          className="bg-gray-600 p-1 h-10 rounded"
        />
        <input
          type="number"
          placeholder="Probability"
          value={newPrize.probability}
          onChange={(e) => setNewPrize({ ...newPrize, probability: Number(e.target.value) })}
          className="bg-gray-600 p-2 rounded w-24"
        />
        <button onClick={handleAddPrize} className="bg-green-600 hover:bg-green-700 p-2 rounded">Add Prize</button>
      </div>

      {/* Save Button */}
      <div className="mt-6 flex justify-between items-center">
        <button
          onClick={handleSaveConfiguration}
          disabled={isLoading}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded disabled:opacity-50"
        >
          Save Configuration
        </button>
        <div className="flex space-x-2">
          <button
            onClick={onSetActive}
            disabled={isLoading || isActive}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {isActive ? 'Is Active' : 'Set as Active'}
          </button>
          <button onClick={onDelete} disabled={isLoading} className="bg-red-800 hover:bg-red-900 text-white font-bold py-2 px-4 rounded disabled:opacity-50">
            Delete Template
          </button>
        </div>
        {feedback && <p className="mt-2 text-sm text-purple-300">{feedback}</p>}
      </div>
    </div>
  );
};