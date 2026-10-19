import React, { useState, useEffect } from 'react';
import { PrizeManager } from './prize-manager';

const API_URL = 'http://localhost:3001/api';

interface RouletteTemplate {
  id: number;
  name: string;
  is_active: boolean;
}

export const TemplateManager: React.FC = () => {
  const [templates, setTemplates] = useState<RouletteTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [feedback, setFeedback] = useState('');

  const fetchTemplates = async () => {
    try {
      const response = await fetch(`${API_URL}/roulettes`);
      const data: RouletteTemplate[] = await response.json();
      setTemplates(data);
      if (!selectedTemplateId && data.length > 0) {
        const activeTemplate = data.find(t => t.is_active) || data[0];
        setSelectedTemplateId(activeTemplate.id);
      }
    } catch (error) {
      console.error('Failed to fetch templates', error);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    try {
      await fetch(`${API_URL}/roulettes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTemplateName, prizes: [] }),
      });
      setNewTemplateName('');
      fetchTemplates();
      setFeedback(`Template "${newTemplateName}" created.`);
    } catch (error) {
      setFeedback('Failed to create template.');
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this template?')) return;
    try {
      const response = await fetch(`${API_URL}/roulettes/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }
      setSelectedTemplateId(null);
      fetchTemplates();
      setFeedback('Template deleted.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete template.';
      setFeedback(message);
    }
  };

  const handleSetActive = async (id: number) => {
    try {
      await fetch(`${API_URL}/roulettes/active/${id}`, { method: 'POST' });
      fetchTemplates();
      setFeedback('Active template updated.');
    } catch (error) {
      setFeedback('Failed to set active template.');
    }
  };

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Roulette Templates</h2>
      {feedback && <p className="mb-4 text-purple-300">{feedback}</p>}

      <div className="mb-6 p-4 bg-gray-800 rounded-lg">
        <h3 className="text-xl mb-2">Create New Template</h3>
        <div className="flex space-x-2">
          <input
            type="text"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="New Template Name"
            className="bg-gray-700 p-2 rounded w-full"
          />
          <button onClick={handleCreateTemplate} className="bg-green-600 hover:bg-green-700 p-2 rounded">
            Create
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label htmlFor="template-select" className="block mb-2">Select Template to Edit:</label>
        <select
          id="template-select"
          value={selectedTemplateId || ''}
          onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
          className="bg-gray-700 p-2 rounded w-full"
        >
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} {t.is_active ? '(Active)' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedTemplateId && (
        <PrizeManager
          key={selectedTemplateId}
          templateId={selectedTemplateId}
          onDelete={() => handleDeleteTemplate(selectedTemplateId)}
          onSetActive={() => handleSetActive(selectedTemplateId)}
          isActive={templates.find(t => t.id === selectedTemplateId)?.is_active || false}
        />
      )}
    </div>
  );
};