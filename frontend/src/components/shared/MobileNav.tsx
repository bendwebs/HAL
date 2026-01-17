'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { MessageSquare, FolderOpen, Brain, User, Shield } from 'lucide-react';

export default function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const items = [
    { href: '/chat', icon: MessageSquare, label: 'Chat' },
    { href: '/library', icon: FolderOpen, label: 'Library' },
    { href: '/memories', icon: Brain, label: 'Memory' },
    { href: '/settings', icon: User, label: 'Profile' },
    ...(isAdmin ? [{ href: '/admin', icon: Shield, label: 'Admin' }] : []),
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bg-secondary border-t border-border flex items-center justify-around px-2 z-30">
      {items.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[60px]",
            pathname.startsWith(item.href)
              ? "text-accent"
              : "text-text-muted"
          )}
        >
          <item.icon className="w-5 h-5" />
          <span className="text-xs">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
