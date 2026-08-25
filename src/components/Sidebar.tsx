'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Settings, Clock, FlaskConical, Wallet, Crosshair, BookOpen } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Sniper Cockpit', href: '/', icon: Crosshair },
    { name: 'Burner Wallet', href: '/burner', icon: Wallet },
    { name: 'Instructions & Rules', href: '/instructions', icon: BookOpen },
    { name: 'Active Snipes', href: '#', icon: Activity },
    { name: 'History', href: '/history', icon: Clock },
    { name: 'Settings', href: '#', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 flex flex-col p-6 h-screen sticky top-0">
      <div className="flex items-center space-x-3 mb-10">
        <div className="w-10 h-10 bg-shift-lime rounded-full flex items-center justify-center text-shift-navy font-bold text-xl">
          🦎
        </div>
        <h1 className="text-2xl font-bold tracking-widest">SHIFT</h1>
      </div>

      <nav className="flex-1 space-y-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                isActive 
                  ? 'text-shift-lime bg-slate-800/50 border-shift-lime/20' 
                  : 'text-shift-textMuted hover:text-white border-transparent'
              }`}
            >
              <Icon size={20} />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4 rounded-xl border border-yellow-500/50 bg-yellow-950/20 text-sm">
        <div className="flex items-center space-x-2 mb-2 text-yellow-400">
          <FlaskConical size={16} />
          <span className="font-bold">Testing Mode</span>
        </div>
        <p className="text-shift-textMuted text-xs">
          NFT Gate temporarily bypassed for development.
        </p>
      </div>
    </aside>
  );
}
