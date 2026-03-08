'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';
import { auth as authApi } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(true);

  useEffect(() => {
    authApi.registrationStatus()
      .then(res => {
        if (!res.registration_enabled) {
          router.push('/login');
        }
        setCheckingStatus(false);
      })
      .catch(() => setCheckingStatus(false));
  }, [router]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    try {
      await register(username, password, displayName || undefined);
      router.push('/chat');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
  };

  if (checkingStatus) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-3xl animate-pulse">🤖</span>
          </div>
          <div className="skeleton h-4 w-24 mx-auto" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a] p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-transparent to-purple-900/10 pointer-events-none" />
      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-4xl">🤖</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Create Account</h1>
          <p className="text-text-secondary mt-1">Join HAL</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-bg-tertiary border border-border 
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-accent focus:shadow-[0_0_20px_rgba(20,184,166,0.15)] transition-all duration-200"
              placeholder="Choose a username"
              required
              minLength={3}
            />
          </div>
          
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">Display Name (optional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-bg-tertiary border border-border 
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-accent focus:shadow-[0_0_20px_rgba(20,184,166,0.15)] transition-all duration-200"
              placeholder="How should we call you?"
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-bg-tertiary border border-border 
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-accent focus:shadow-[0_0_20px_rgba(20,184,166,0.15)] transition-all duration-200"
              placeholder="Min 6 characters"
              required
              minLength={6}
            />
          </div>
          
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-bg-tertiary border border-border 
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-accent focus:shadow-[0_0_20px_rgba(20,184,166,0.15)] transition-all duration-200"
              placeholder="Confirm your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover
                       text-white font-medium transition-all duration-200
                       hover:shadow-lg hover:shadow-accent/20
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        
        <p className="text-center mt-6 text-text-secondary text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
