'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useUIStore } from '@/stores/ui';
import { auth } from '@/lib/api';
import { User, Eye, EyeOff, Save, Moon, Sun, Monitor } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const { showThinking, showActions, setShowThinking, setShowActions } = useUIStore();
  
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setMessage(null);
    
    try {
      const updates: any = {};
      if (displayName !== user?.display_name) {
        updates.display_name = displayName;
      }
      
      if (newPassword) {
        if (newPassword !== confirmPassword) {
          setMessage({ type: 'error', text: 'Passwords do not match' });
          setIsSaving(false);
          return;
        }
        updates.password = newPassword;
      }
      
      if (Object.keys(updates).length > 0) {
        await auth.update(updates);
        updateUser({ display_name: displayName });
        setMessage({ type: 'success', text: 'Settings saved successfully' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

        {message && (
          <div className={`p-3 rounded-lg ${
            message.type === 'success' 
              ? 'bg-success/10 border border-success/20 text-success' 
              : 'bg-error/10 border border-error/20 text-error'
          }`}>
            {message.text}
          </div>
        )}

        {/* Profile Section */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Username</label>
              <input
                type="text"
                value={user?.username || ''}
                disabled
                className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-muted cursor-not-allowed"
              />
              <p className="text-xs text-text-muted mt-1">Username cannot be changed</p>
            </div>
            
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </div>

        {/* Password Section */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Change Password</h2>
          
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm text-text-secondary mb-1.5">New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent pr-10"
                placeholder="Enter new password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-3 top-8 text-text-muted hover:text-text-secondary"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Confirm Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-bg-tertiary border border-border text-text-primary focus:outline-none focus:border-accent"
                placeholder="Confirm new password"
              />
            </div>
          </div>
        </div>

        {/* Chat Preferences */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Chat Preferences</h2>
          
          <div className="space-y-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-text-primary">Show Thinking Process</p>
                <p className="text-sm text-text-muted">Display AI reasoning in responses</p>
              </div>
              <input
                type="checkbox"
                checked={showThinking}
                onChange={(e) => setShowThinking(e.target.checked)}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
            </label>
            
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-text-primary">Show Actions</p>
                <p className="text-sm text-text-muted">Display tool calls and agent actions</p>
              </div>
              <input
                type="checkbox"
                checked={showActions}
                onChange={(e) => setShowActions(e.target.checked)}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
            </label>
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>

        {/* Storage Info */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Storage</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Used</span>
              <span className="text-text-primary">
                {((user?.storage_used || 0) / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Quota</span>
              <span className="text-text-primary">
                {((user?.storage_quota || 0) / 1024 / 1024 / 1024).toFixed(1)} GB
              </span>
            </div>
            <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-accent rounded-full"
                style={{ 
                  width: `${Math.min(100, ((user?.storage_used || 0) / (user?.storage_quota || 1)) * 100)}%` 
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
