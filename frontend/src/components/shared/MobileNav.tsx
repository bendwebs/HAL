'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/utils';
import { MessageSquare, FolderOpen, Brain, User, Shield, Mic, ImageIcon } from 'lucide-react';

export default function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const items = [
    { href: '/chat', icon: MessageSquare, label: 'Chat' },
    { href: '/converse', icon: Mic, label: 'Voice' },
    { href: '/generate', icon: ImageIcon, label: 'Image' },
    { href: '/library', icon: FolderOpen, label: 'Library' },
    { href: '/memories', icon: Brain, label: 'Memory' },
    ...(isAdmin ? [{ href: '/admin', icon: Shield, label: 'Admin' }] : []),
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-black/60 backdrop-blur-sm border-t border-white/10 flex items-center justify-around px-2 z-30">
      {items.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors min-w-[56px]",
            pathname.startsWith(item.href)
              ? "text-accent"
              : "text-text-muted"
          )}
        >
          <item.icon className="w-5 h-5" />
          <span className="text-[10px]">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
