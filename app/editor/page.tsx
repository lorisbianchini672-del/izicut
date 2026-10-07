'use client';

import { ClipEditor } from '@/components/editor/ClipEditor';
import type { StyleConfig, RelativeWord } from '@/types';

const MOCK_STYLE_CONFIG: StyleConfig = {
  template: 'hormozi',
  colors: {
    primary: '#8B5CF6',
    text: '#FFFFFF',
    highlight: '#000000',
    background: '#0A0A0A',
  },
  crop: { default_zoom: 1.3, motion_zoom: true, face_margin: 0.1 },
  captions: { karaoke: true, active_color: '#FFFFFF', inactive_color: '#888888', font_size: 72, position: 0.82 },
};

const MOCK_TRANSCRIPT: RelativeWord[] = [
  { word: 'Les', start: 0.0, end: 0.5 },
  { word: 'gens', start: 0.5, end: 0.9 },
  { word: 'font', start: 0.9, end: 1.2 },
  { word: 'ça', start: 1.2, end: 1.5 },
  { word: 'tout', start: 1.5, end: 1.9 },
  { word: 'le', start: 1.9, end: 2.2 },
  { word: 'temps', start: 2.2, end: 2.6 },
  { word: 'mais', start: 2.6, end: 2.9 },
  { word: "c'est", start: 2.9, end: 3.2 },
  { word: 'complètement', start: 3.2, end: 3.8 },
  { word: 'inutile', start: 3.8, end: 4.3 },
  { word: 'En', start: 4.5, end: 4.7 },
  { word: 'fait', start: 4.7, end: 5.0 },
  { word: 'votre', start: 5.0, end: 5.3 },
  { word: 'cerveau', start: 5.3, end: 5.7 },
  { word: 'bloque', start: 5.7, end: 6.2 },
  { word: 'et', start: 6.2, end: 6.4 },
  { word: 'vous', start: 6.4, end: 6.7 },
  { word: 'perdez', start: 6.7, end: 7.1 },
  { word: 'tout', start: 7.1, end: 7.3 },
  { word: 'le', start: 7.3, end: 7.6 },
  { word: 'contexte', start: 7.6, end: 8.1 },
];

export default function EditorPage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Orbes d'ambiance */}
      <div className="bg-orb bg-orb-purple w-[400px] h-[400px] top-0 -left-32 opacity-30 pointer-events-none" />

      {/* Header */}
      <header className="sticky top-16 z-40 flex h-14 items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-xl px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (window.location.href = '/dashboard')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Dashboard
          </button>
          <span className="text-border/50">|</span>
          <h1 className="text-base font-bold">Éditeur de clip</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
            clip-demo
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Sauvegarde automatique active
        </div>
      </header>

      {/* Corps */}
      <main className="container mx-auto max-w-6xl py-8 px-4">
        <ClipEditor
          clipId="clip-demo"
          initialStyleConfig={MOCK_STYLE_CONFIG}
          initialTranscript={MOCK_TRANSCRIPT}
          onSave={(patch) => {
            console.log('Clip saved:', patch);
          }}
          onExport={() => {
            alert('Export MP4 HD (simulateur) — intégrez Remotion en production');
          }}
          onBack={() => (window.location.href = '/dashboard')}
        />
      </main>
    </div>
  );
}