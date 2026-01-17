'use client';

import { useState, useEffect } from 'react';
import { Chat, Persona } from '@/types';
import { chats as chatsApi, tts as ttsApi, personas as personasApi } from '@/lib/api';
import { useUIStore } from '@/stores/ui';
import toast from 'react-hot-toast';
import { 
  MoreVertical, 
  Edit2, 
  Share2, 
  Trash2, 
  Lock, 
  Users, 
  Globe,
  Check,
  X,
  Volume2,
  VolumeX,
  User,
  ChevronDown
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ChatHeaderProps {
  chat: Chat;
  onUpdate: (chat: Chat) => void;
}

const visibilityIcons = {
  private: Lock,
  shared: Users,
  public: Globe,
};

export default function ChatHeader({ chat, onUpdate }: ChatHeaderProps) {
  const router = useRouter();
  const { refreshChatList } = useUIStore();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const [showMenu, setShowMenu] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);

  // Check if TTS service is available
  useEffect(() => {
    ttsApi.health().then(res => {
      setTtsAvailable(res.status === 'healthy');
    }).catch(() => {
      setTtsAvailable(false);
    });
  }, []);

  // Load personas
  useEffect(() => {
    personasApi.list().then(setPersonas).catch(console.error);
  }, []);

  const VisibilityIcon = visibilityIcons[chat.visibility];

  const handleToggleTTS = async () => {
    try {
      const updated = await chatsApi.update(chat.id, { 
        tts_enabled: !chat.tts_enabled 
      });
      onUpdate(updated);
      toast.success(updated.tts_enabled ? 'TTS enabled' : 'TTS disabled');
    } catch (err) {
      console.error('Failed to toggle TTS:', err);
      toast.error('Failed to toggle TTS');
    }
  };

  const handlePersonaChange = async (personaId: string | null) => {
    try {
      const updated = await chatsApi.update(chat.id, { 
        persona_id: personaId 
      });
      onUpdate(updated);
      const personaName = personaId 
        ? personas.find(p => p.id === personaId)?.name || 'Persona'
        : 'Default';
      toast.success(`Switched to ${personaName}`);
    } catch (err) {
      console.error('Failed to change persona:', err);
      toast.error('Failed to change persona');
    }
    setShowPersonaMenu(false);
  };

  const currentPersona = personas.find(p => p.id === chat.persona_id);

  const handleSaveTitle = async () => {
    if (title.trim() && title !== chat.title) {
      try {
        const updated = await chatsApi.update(chat.id, { title: title.trim() });
        onUpdate(updated);
        refreshChatList(); // Update sidebar
        toast.success('Chat renamed');
      } catch (err) {
        console.error('Failed to update title:', err);
        setTitle(chat.title);
        toast.error('Failed to rename chat');
      }
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setShowMenu(false);
    
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Delete this chat?</p>
        <p className="text-sm text-text-secondary">This action cannot be undone.</p>
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => toast.dismiss(t.id)}
            className="px-3 py-1.5 text-sm bg-surface hover:bg-bg-tertiary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                await chatsApi.delete(chat.id);
                refreshChatList(); // Update sidebar
                toast.success('Chat deleted');
                router.push('/chat');
              } catch (err) {
                console.error('Failed to delete chat:', err);
                toast.error('Failed to delete chat');
              }
            }}
            className="px-3 py-1.5 text-sm bg-error hover:bg-error/80 text-white rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    ), {
      duration: Infinity,
    });
  };

  return (
    <div className="h-14 border-b border-border bg-bg-secondary/50 flex items-center px-4 gap-3">
      {isEditing ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') {
                setTitle(chat.title);
                setIsEditing(false);
              }
            }}
            className="flex-1 px-3 py-1.5 bg-bg-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            autoFocus
          />
          <button
            onClick={handleSaveTitle}
            className="p-2 text-success hover:bg-success/10 rounded-lg transition-colors"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setTitle(chat.title);
              setIsEditing(false);
            }}
            className="p-2 text-text-muted hover:bg-surface rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <h1 className="font-medium text-text-primary truncate flex-1">
            {chat.title}
          </h1>
          
          {/* Persona Selector */}
          <div className="relative">
            <button
              onClick={() => setShowPersonaMenu(!showPersonaMenu)}
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-text-secondary hover:bg-surface rounded-lg transition-colors"
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline max-w-[100px] truncate">
                {currentPersona?.name || 'Default'}
              </span>
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {showPersonaMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowPersonaMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-48 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => handlePersonaChange(null)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-surface flex items-center gap-2 ${
                      !chat.persona_id ? 'text-accent' : 'text-text-secondary'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    Default
                    {!chat.persona_id && <Check className="w-3 h-3 ml-auto" />}
                  </button>
                  {personas.map(persona => (
                    <button
                      key={persona.id}
                      onClick={() => handlePersonaChange(persona.id)}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-surface flex items-center gap-2 ${
                        chat.persona_id === persona.id ? 'text-accent' : 'text-text-secondary'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      <span className="truncate">{persona.name}</span>
                      {chat.persona_id === persona.id && <Check className="w-3 h-3 ml-auto" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-1 text-text-muted">
            <VisibilityIcon className="w-4 h-4" />
            <span className="text-xs capitalize hidden sm:inline">{chat.visibility}</span>
          </div>
          
          {chat.is_owner && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-surface rounded-lg transition-colors"
              >
                <MoreVertical className="w-4 h-4 text-text-secondary" />
              </button>
              
              {showMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-bg-elevated border border-border rounded-lg shadow-lg z-50 py-1">
                    <button
                      onClick={() => {
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-surface flex items-center gap-2"
                    >
                      <Edit2 className="w-4 h-4" />
                      Rename
                    </button>
                    {ttsAvailable && (
                      <button
                        onClick={() => {
                          handleToggleTTS();
                          setShowMenu(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-surface flex items-center gap-2"
                      >
                        {chat.tts_enabled ? (
                          <>
                            <VolumeX className="w-4 h-4" />
                            Disable TTS
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-4 h-4" />
                            Enable TTS
                          </>
                        )}
                      </button>
                    )}
                    {!ttsAvailable && (
                      <div className="w-full px-4 py-2 text-left text-sm text-text-muted flex items-center gap-2 cursor-not-allowed">
                        <Volume2 className="w-4 h-4 opacity-50" />
                        <span className="opacity-50">TTS (service offline)</span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        // TODO: Open share modal
                        setShowMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-secondary hover:bg-surface flex items-center gap-2"
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                    <hr className="my-1 border-border" />
                    <button
                      onClick={handleDelete}
                      className="w-full px-4 py-2 text-left text-sm text-error hover:bg-error/10 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
