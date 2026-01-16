'use client';

import { useState, useEffect } from 'react';
import { personas } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Users, Plus, Trash2, Edit2, Bot, Globe, Lock } from 'lucide-react';

interface Persona {
  id: string;
  name: string;
  description: string;
  system_prompt?: string;
  avatar_emoji: string;
  temperature: number;
  is_public: boolean;
  is_system: boolean;
  is_owner?: boolean;
  created_at: string;
}

export default function PersonasPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [personaList, setPersonaList] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState('🤖');
  const [temperature, setTemperature] = useState(0.7);
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    loadPersonas();
  }, []);

  const loadPersonas = async () => {
    try {
      setIsLoading(true);
      const data = await personas.list();
      setPersonaList(data);
    } catch (err) {
      console.error('Failed to load personas:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setSystemPrompt('');
    setAvatarEmoji('🤖');
    setTemperature(0.7);
    setIsPublic(false);
    setEditingPersona(null);
  };

  const openEditModal = async (persona: Persona) => {
    try {
      // Fetch full persona details including system_prompt
      const fullPersona = await personas.get(persona.id);
      setEditingPersona(fullPersona);
      setName(fullPersona.name);
      setDescription(fullPersona.description || '');
      setSystemPrompt(fullPersona.system_prompt || '');
      setAvatarEmoji(fullPersona.avatar_emoji || '🤖');
      setTemperature(fullPersona.temperature || 0.7);
      setIsPublic(fullPersona.is_public || false);
      setShowModal(true);
    } catch (err) {
      console.error('Failed to load persona details:', err);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) return;
    
    const data = {
      name,
      description,
      system_prompt: systemPrompt,
      avatar_emoji: avatarEmoji,
      temperature,
      is_public: isPublic,
    };
    
    try {
      if (editingPersona) {
        await personas.update(editingPersona.id, data);
      } else {
        await personas.create(data);
      }
      setShowModal(false);
      resetForm();
      loadPersonas();
    } catch (err) {
      console.error('Failed to save persona:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this persona?')) return;
    
    try {
      await personas.delete(id);
      setPersonaList(personaList.filter(p => p.id !== id));
    } catch (err) {
      console.error('Failed to delete persona:', err);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Personas</h1>
          
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Persona</span>
          </button>
        </div>

        {/* Personas Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 bg-surface animate-pulse rounded-xl" />
            ))}
          </div>
        ) : personaList.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-text-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">No personas yet</h2>
            <p className="text-text-secondary mb-6">
              Create custom AI personalities for different tasks
            </p>
            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Your First Persona
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {personaList.map(persona => (
              <div
                key={persona.id}
                className="p-4 bg-surface border border-border rounded-xl hover:border-border-hover transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{persona.avatar_emoji}</span>
                    <div>
                      <h3 className="font-medium text-text-primary">{persona.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        {persona.is_system ? (
                          <span className="flex items-center gap-1">
                            <Bot className="w-3 h-3" /> System
                          </span>
                        ) : persona.is_public ? (
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" /> Public
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Private
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-text-secondary mb-4 line-clamp-2">
                  {persona.description || 'No description'}
                </p>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">
                    Temp: {persona.temperature}
                  </span>
                  
                  {(persona.is_owner || isAdmin) && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(persona)}
                        className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {!persona.is_system && (
                        <button
                          onClick={() => handleDelete(persona.id)}
                          className="p-2 text-text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => { setShowModal(false); resetForm(); }}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-bg-elevated border border-border rounded-xl shadow-lg z-50 p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              {editingPersona ? 'Edit Persona' : 'Create Persona'}
            </h2>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div>
                  <label className="block text-sm text-text-secondary mb-1.5">Avatar</label>
                  <input
                    type="text"
                    value={avatarEmoji}
                    onChange={(e) => setAvatarEmoji(e.target.value)}
                    className="w-16 h-16 text-center text-3xl rounded-lg bg-bg-tertiary border border-border focus:outline-none focus:border-accent"
                  />
                </div>
                
                <div className="flex-1">
                  <label className="block text-sm text-text-secondary mb-1.5">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Persona name"
                    className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description"
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                />
              </div>
              
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">System Prompt</label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Instructions for the AI..."
                  className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent resize-none"
                  rows={5}
                />
              </div>
              
              <div>
                <label className="block text-sm text-text-secondary mb-1.5">
                  Temperature ({temperature})
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-text-muted mt-1">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>
              
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
                <div>
                  <p className="text-text-primary">Make public</p>
                  <p className="text-xs text-text-muted">Other users can use this persona</p>
                </div>
              </label>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
              >
                {editingPersona ? 'Save Changes' : 'Create Persona'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
