'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, fetchUser, isLoading } = useAuthStore();
  
  useEffect(() => {
    const checkAuth = async () => {
      await fetchUser();
    };
    checkAuth();
  }, [fetchUser]);
  
  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/chat');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);
  
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="text-center">
        <div className="text-6xl mb-4">🤖</div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">HAL</h1>
        <p className="text-text-secondary">Loading...</p>
      </div>
    </main>
  );
}
