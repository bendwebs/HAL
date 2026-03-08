'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';
import { auth as authApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  
  useEffect(() => {
    authApi.registrationStatus()
      .then(res => setRegistrationEnabled(res.registration_enabled))
      .catch(() => setRegistrationEnabled(true)); // Default to showing if check fails
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      await login(username, password);
      router.push('/chat');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };
  
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0a0a1a] p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-transparent to-purple-900/10 pointer-events-none" />
      <div className="w-full max-w-sm relative z-10 animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-4xl">🤖</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Welcome to HAL</h1>
          <p className="text-text-secondary mt-1">Sign in to continue</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-bg-tertiary border border-border 
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-accent focus:shadow-[0_0_20px_rgba(20,184,166,0.15)] transition-all duration-200"
              placeholder="Enter username"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-bg-tertiary border border-border 
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:border-accent focus:shadow-[0_0_20px_rgba(20,184,166,0.15)] transition-all duration-200"
              placeholder="Enter password"
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
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        
        {registrationEnabled && (
          <p className="text-center mt-6 text-text-secondary text-sm">
            Don't have an account?{' '}
            <Link href="/register" className="text-accent hover:underline">
              Create one
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
