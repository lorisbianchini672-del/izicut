'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Twitter, Youtube, Github, Send, Globe, Moon, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/landing/Logo';

const FOOTER_COLUMNS = [
  {
    title: 'Produits',
    links: [
      { label: 'Clipping Vidéo IA', href: '/upload' },
      { label: 'Générateur de Sous-titres', href: '/editor/clip-demo' },
      { label: 'Convertisseur YouTube → Shorts', href: '/upload' },
      { label: 'Extracteur de Twitch VODs', href: '/upload' },
      { label: 'Score de Viralité (0-100)', href: '/#features' },
      { label: 'Safe Zones TikTok / Reels / Shorts', href: '/#features' },
    ],
  },
  {
    title: 'Moteurs IA',
    links: [
      { label: 'OpenAI Whisper (transcription mot-à-mot)', href: '/#features' },
      { label: 'GPT-4o-mini (scoring & hooks)', href: '/#features' },
      { label: 'Remotion (rendu 9:16 React)', href: '/#features' },
      { label: 'Suivi de visage auto', href: '/#features' },
      { label: 'Split-Screen multi-intervenants', href: '/#features' },
      { label: 'Émoticônes & autocollants animés', href: '/#features' },
    ],
  },
  {
    title: 'Styles & Templates',
    links: [
      { label: 'Style Alex Hormozi', href: '/editor/clip-demo' },
      { label: 'Cyber Neon Glow', href: '/editor/clip-demo' },
      { label: 'Minimalist Clean', href: '/editor/clip-demo' },
      { label: 'iOS Notes Style', href: '/editor/clip-demo' },
      { label: 'Podcast Interview Split', href: '/editor/clip-demo' },
      { label: 'Finance & Bourse Pro', href: '/editor/clip-demo' },
    ],
  },
  {
    title: 'Ressources',
    links: [
      { label: 'Documentation API & Webhooks', href: '/docs' },
      { label: 'Guide des Formats Verticaux 9:16', href: '/guide-9-16' },
      { label: "Centre d'aide & FAQ", href: '/#faq' },
      { label: "Statut de l'infrastructure (99.9%)", href: '/dashboard' },
      { label: 'Blog créateurs (astuces IA)', href: '/blog' },
      { label: 'Support & assistance 7j/7', href: 'mailto:support@izicut.app' },
    ],
  },
];

export function Footer() {
  const currentYear = new Date().getFullYear();
  const [language, setLanguage] = useState<'FR' | 'EN'>('FR');
  const [emailInput, setEmailInput] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setSubscribed(true);
    setTimeout(() => setSubscribed(false), 4000);
    setEmailInput('');
  };

  return (
    <footer className="border-t border-border/60 bg-card/30 backdrop-blur-xl pt-16 pb-12 relative overflow-hidden text-sm">
      <div className="bg-orb bg-orb-purple w-[500px] h-[500px] -bottom-40 left-1/2 -translate-x-1/2 opacity-20 pointer-events-none" />
      <div className="container mx-auto px-4 max-w-7xl relative z-10 space-y-12">
        <div className="flex flex-col xl:flex-row justify-between gap-12">
          <div className="flex flex-col gap-6 max-w-sm">
            <Logo href="/" />
            <p className="text-muted-foreground text-sm leading-relaxed">La plateforme IA Française qui transforme vos vidéos longues en shorts viraux TikTok, Reels et Shorts en 1 clic. Propulsée par OpenAI Whisper, GPT-4o-mini et Remotion.</p>
            <div className="flex items-center gap-4 pt-2">
              <motion.a href="https://twitter.com/izicut" target="_blank" rel="noreferrer" whileHover={{ scale: 1.1, y: -2 }} className="p-2.5 rounded-xl bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-300" aria-label="Twitter X"><Twitter className="w-5 h-5" /></motion.a>
              <motion.a href="https://youtube.com/izicut" target="_blank" rel="noreferrer" whileHover={{ scale: 1.1, y: -2 }} className="p-2.5 rounded-xl bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-300" aria-label="YouTube"><Youtube className="w-5 h-5" /></motion.a>
              <motion.a href="https://github.com/izicut" target="_blank" rel="noreferrer" whileHover={{ scale: 1.1, y: -2 }} className="p-2.5 rounded-xl bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-300" aria-label="GitHub"><Github className="w-5 h-5" /></motion.a>
              <motion.a href="https://discord.gg/izicut" target="_blank" rel="noreferrer" whileHover={{ scale: 1.1, y: -2 }} className="p-2.5 rounded-xl bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-300" aria-label="Discord"><Send className="w-5 h-5" /></motion.a>
            </div>
          </div>
          <div className="flex-1 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Newsletter IziCut</h3>
            <p className="text-sm text-muted-foreground mb-4">Recevez les nouveautés, astuces IA et offres réservées aux abonnés.</p>
            {subscribed ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-3 text-green-400 bg-green-400/10 border border-green-400/30 rounded-xl p-4">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <span>Inscription enregistrée ! Vérifiez votre boîte email.</span>
              </motion.div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-3">
                <Input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="votre@email.com" className="w-full px-4 py-3 rounded-xl bg-muted/40 border border-border/50 focus:outline-none focus:border-primary/50 transition-colors text-sm placeholder-muted-foreground/60" required />
                <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full px-4 py-3 bg-gradient-to-r from-primary to-accent text-white font-semibold rounded-xl shadow-lg shadow-primary/30 transition-all duration-300 shine-hover">S'abonner</motion.button>
              </form>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-10 pt-4">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="space-y-4">
              <h4 className="text-sm font-bold text-foreground/80 uppercase tracking-[0.1em]">{column.title}</h4>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-xs text-muted-foreground hover:text-foreground transition-colors leading-snug block">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-4 sm:text-left">
            <span>© {currentYear} <strong>IziCut Technologies SAS</strong>. Fait avec ❤️ pour les créateurs.</span>
            <nav aria-label="Liens légaux" className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/mentions-legales" className="transition-colors hover:text-foreground">Mentions légales</Link>
              <Link href="/cgu" className="transition-colors hover:text-foreground">CGU</Link>
              <Link href="/confidentialite" className="transition-colors hover:text-foreground">Confidentialité</Link>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/40 border border-border/40">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <button type="button" onClick={() => setLanguage('FR')} className={`text-[11px] font-bold ${language === 'FR' ? 'text-primary' : 'text-muted-foreground'}`}>FR</button>
              <span className="text-border">/</span>
              <button type="button" onClick={() => setLanguage('EN')} className={`text-[11px] font-bold ${language === 'EN' ? 'text-primary' : 'text-muted-foreground'}`}>EN</button>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/40 border border-border/40 text-[11px] font-bold text-foreground">
              <Moon className="w-3.5 h-3.5 text-primary" />
              <span>Dark High-Tech</span>
            </div>
          </div>
        </div>
      </div>
      </footer>
    );
}


