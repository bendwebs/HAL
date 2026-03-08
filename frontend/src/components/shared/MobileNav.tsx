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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10 flex items-center justify-around px-2 z-30 pb-[env(safe-area-inset-bottom)]">
      {items.map(item => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-3 py-2.5 rounded-lg transition-all min-w-[56px] relative",
              isActive
                ? "text-accent"
                : "text-text-muted active:scale-95"
            )}
          >
            {isActive && (
              <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-accent rounded-full" />
            )}
            <item.icon className={cn("w-5 h-5", isActive && "drop-shadow-[0_0_6px_rgba(20,184,166,0.5)]")} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
