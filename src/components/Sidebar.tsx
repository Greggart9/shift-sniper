"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CreditCard,
  HelpCircle,
  History as HistoryIcon,
  FlaskConical,
  Terminal,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

export default function Sidebar() {
  const pathname = usePathname();

  const operationsItems: NavItem[] = [
    { name: "Sniper", href: "/", icon: Zap },
    { name: "Burner Wallet", href: "/burner", icon: CreditCard },
    { name: "Active Snipes", href: "/activeSnipes", icon: Terminal },
    { name: "History", href: "/history", icon: HistoryIcon },
  ];

  const systemItems: NavItem[] = [{ name: "Instructions", href: "/instructions", icon: HelpCircle }];

  const renderItem = (item: NavItem) => {
    const isActive = item.href !== "#" && pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.name}
        href={item.href}
        className={`flex items-center justify-between px-3 py-2.5 rounded-md border transition-colors ${
          isActive
            ? "bg-slate-800/60 border-slate-700/60"
            : "border-transparent hover:bg-slate-800/30"
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon size={18} className={isActive ? "text-shift-lime" : "text-shift-textMuted"} />
          <span className={`text-sm font-medium ${isActive ? "text-white" : "text-shift-textMuted"}`}>
            {item.name}
          </span>
        </span>
        {!!item.badge && <span className="text-xs font-bold text-amber-400">{item.badge}</span>}
      </Link>
    );
  };

  return (
    <aside className="w-64 border-r border-slate-800 flex flex-col p-5 h-screen sticky top-0 bg-[#0B1022]">
      <div className="flex items-center space-x-3 mb-8 px-1">
        <div className="w-9 h-9 bg-shift-lime rounded-sm flex items-center justify-center text-slate-900 font-bold text-lg">
          S
        </div>
        <div className="flex flex-col">
          <h1 className="text-sm font-bold tracking-widest text-slate-300">SHIFT</h1>
          <p className="text-sm tracking-[0.06em] text-slate-400 ">Sniping cockpit</p>
        </div>
      </div>

      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-shift-textMuted">
        Operations
      </div>
      <nav className="space-y-1 mb-8">{operationsItems.map(renderItem)}</nav>

      <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-shift-textMuted">
        System
      </div>
      <nav className="space-y-1">{systemItems.map(renderItem)}</nav>

      <div className="mt-auto p-4 rounded-xl border border-yellow-500/50 bg-yellow-950/20 text-sm">
        <div className="flex items-center space-x-2 mb-2 text-yellow-400">
          <FlaskConical size={16} />
          <span className="font-bold">Testing Mode</span>
        </div>
        <p className="text-shift-textMuted text-xs">NFT Gate temporarily bypassed for development.</p>
      </div>
    </aside>
  );
}