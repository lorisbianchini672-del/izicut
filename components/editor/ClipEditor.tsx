'use client';

import { useCallback, useState } from 'react';
import { Save, X, Download, Type, Shield, Layout, Scissors, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCaptionsEditor, type RelativeWord } from '@/lib/hooks/use-captions-editor';
import { EditableCaptions } from '@/components/captions/EditableCaptions';
import { type StyleConfig } from '@/types';
import { cn } from '@/lib/utils';

export type ClipEditorProps = {
  clipId: string;
  initialStyleConfig?: StyleConfig;
  initialTranscript: RelativeWord[];
  onSave?: (patch: any) => void;
  onExport?: (clipId: string) => void;
  onBack?: () => void;
  className?: string;
};

const TEMPLATES: Array<{ key: StyleConfig['template']; label: string; preview: string }> = [
  { key: 'hormozi', label: 'Hormozi', preview: 'bg-black text-white' },
  { key: 'ios_notes', label: 'iOS Notes', preview: 'bg-yellow-50 text-gray-900' },
  { key: 'tweet', label: 'Tweet', preview: 'bg-sky-50 text-gray-900' },
  { key: 'minimal', label: 'Minimal', preview: 'bg-white text-gray-800' },
  { key: 'colorful', label: 'Colorful', preview: 'bg-gradient-to-br from-cyan to-neon text-white' },
];

const SAFE_ZONE_LABELS = [
  { label: 'TikTok', color: '#ff0050' },
  { label: 'Reels', color: '#e1306c' },
  { label: 'Shorts', color: '#ff0000' },
];

export function ClipEditor(props: ClipEditorProps) {
  const { clipId, initialStyleConfig = {}, initialTranscript = [], onSave, onExport, onBack, className } = props;
  const [styleConfig, setStyleConfig] = useState<StyleConfig>(initialStyleConfig);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(15);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [activePanel, setActivePanel] = useState<'trim' | 'style' | 'captions' | 'safezones'>('trim');

  const t = styleConfig.template ?? 'hormozi';

  const save = useCallback(() => {
    onSave?.({
      styleConfig,
      trimStart,
      trimEnd,
      transcript: transcript.map((w) => ({ word: w.word, start: w.start, end: w.end })),
    });
    setHasChanges(false);
  }, [styleConfig, trimStart, trimEnd, transcript, onSave]);

  const updateColor = useCallback((key: 'primary' | 'text' | 'highlight', value: string) => {
    setStyleConfig((p) => ({ ...p, colors: { ...p.colors, [key]: value } }));
    setHasChanges(true);
  }, []);

  const setTemplate = useCallback((tpl: StyleConfig['template']) => {
    setStyleConfig((p) => ({ ...p, template: tpl }));
    setHasChanges(true);
  }, []);

  const totalDuration = trimEnd - trimStart;

  return (
    <div className={cn('flex flex-col lg:flex-row gap-6 w-full', className)}>

      {/* ======== Aperçu 9:16 ======== */}
      <div className="flex-shrink-0 flex flex-col items-center gap-4">
        <div className="relative">
          {/* Téléphone simulé 9:16 */}
          <div className="relative w-[220px] bg-black rounded-[2rem] border-4 border-slate-700 shadow-2xl overflow-hidden"
            style={{ aspectRatio: '9 / 16' }}>

            {/* Safe Zones overlay */}
            {showSafeZones && (
              <>
                <div className="absolute top-0 left-0 right-0 h-[12%] bg-red-500/20 border-b-2 border-red-500/50 z-10 flex items-center justify-center">
                  <span className="text-[8px] text-red-400 font-bold uppercase">TikTok UI</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-red-500/20 border-t-2 border-red-500/50 z-10 flex items-center justify-center">
                  <span className="text-[8px] text-red-400 font-bold uppercase">Caption Zone</span>
                </div>
              </>
            )}

            {/* Fond vidéo simulé */}
            <div className={cn(
              'absolute inset-0 flex flex-col items-center justify-center p-4',
              TEMPLATES.find(tt => tt.key === t)?.preview ?? 'bg-black'
            )}>
              <div className="text-center">
                <div className="text-[11px] font-black uppercase tracking-wide mb-2 opacity-60">
                  Aperçu sous-titres
                </div>
                <div className="text-[14px] font-black uppercase leading-snug">
                  {initialTranscript.slice(0, 4).map((w) => w.word).join(' ')}
                </div>
              </div>
            </div>

            {/* Timeline barre en bas */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-black/80 flex items-center px-2 z-20">
              <div className="h-1 bg-muted/40 rounded-full flex-1 relative">
                <div
                  className="absolute top-0 h-full bg-primary rounded-full"
                  style={{
                    left: `${(trimStart / 300) * 100}%`,
                    width: `${(totalDuration / 300) * 100}%`,
                  }}
                />
              </div>
              <span className="text-[9px] text-muted-foreground ml-2 font-mono">
                {trimStart}s–{trimEnd}s
              </span>
            </div>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-col gap-2 w-full">
          <Button
            variant="gradient"
            className="w-full glow-primary"
            onClick={() => onExport?.(clipId)}
          >
            <Download className="w-4 h-4" />
            Exporter MP4 HD
          </Button>
          {hasChanges && (
            <Button variant="outline" className="w-full" onClick={save}>
              <Save className="w-4 h-4" />
              Enregistrer
            </Button>
          )}
          {onBack && (
            <Button variant="ghost" size="sm" className="w-full" onClick={onBack}>
              <X className="w-4 h-4" />
              Fermer
            </Button>
          )}
        </div>

        {/* Status */}
        <p className={cn('text-xs text-center', hasChanges ? 'text-amber-400' : 'text-muted-foreground')}>
          {hasChanges ? '● Modifications non enregistrées' : '✓ Tout est sauvegardé'}
        </p>
      </div>

      {/* ======== Panneau de contrôles ======== */}
      <div className="flex-1 space-y-4">
        {/* Onglets */}
        <div className="flex gap-2 p-1 bg-muted/30 rounded-xl">
          {(
            [
              { key: 'trim', label: 'Trim', icon: <Scissors className="w-4 h-4" /> },
              { key: 'style', label: 'Style', icon: <Layout className="w-4 h-4" /> },
              { key: 'captions', label: 'Sous-titres', icon: <Type className="w-4 h-4" /> },
              { key: 'safezones', label: 'Safe Zones', icon: <Shield className="w-4 h-4" /> },
            ] as const
          ).map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActivePanel(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200',
                activePanel === key
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Contenu du panneau actif */}
        <div className="rounded-2xl border border-border/50 bg-card/50 p-5">

          {activePanel === 'trim' && (
            <div className="space-y-5">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Scissors className="w-4 h-4 text-primary" /> Ajustement du clip
              </h3>

              {/* Début */}
              <div>
                <label className="text-sm text-muted-foreground font-medium mb-2 block">
                  Début : <span className="text-foreground font-bold">{trimStart}s</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={trimEnd - 5}
                  value={trimStart}
                  onChange={(e) => { setTrimStart(Number(e.target.value)); setHasChanges(true); }}
                  className="w-full accent-primary"
                />
              </div>

              {/* Fin */}
              <div>
                <label className="text-sm text-muted-foreground font-medium mb-2 block">
                  Fin : <span className="text-foreground font-bold">{trimEnd}s</span>
                </label>
                <input
                  type="range"
                  min={trimStart + 5}
                  max={300}
                  value={trimEnd}
                  onChange={(e) => { setTrimEnd(Number(e.target.value)); setHasChanges(true); }}
                  className="w-full accent-primary"
                />
              </div>

              {/* Boutons de précision */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs text-muted-foreground">Début :</span>
                <button type="button" onClick={() => setTrimStart(Math.max(0, trimStart - 5))} className="text-xs px-2 py-1 bg-muted rounded">-5s</button>
                <button type="button" onClick={() => setTrimStart(Math.max(0, trimStart - 1))} className="text-xs px-2 py-1 bg-muted rounded">-1s</button>
                <button type="button" onClick={() => setTrimStart(Math.min(trimEnd - 5, trimStart + 1))} className="text-xs px-2 py-1 bg-muted rounded">+1s</button>
                <button type="button" onClick={() => setTrimStart(Math.min(trimEnd - 5, trimStart + 5))} className="text-xs px-2 py-1 bg-muted rounded">+5s</button>
              </div>

              <div className="rounded-xl bg-muted/30 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Durée du clip</span>
                  <span className="font-bold">{totalDuration}s</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Coût en crédits</span>
                  <span className="font-bold text-primary">{((totalDuration / 60) + 0.1).toFixed(2)} min</span>
                </div>
              </div>
            </div>
          )}

          {activePanel === 'style' && (
            <div className="space-y-5">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Layout className="w-4 h-4 text-primary" /> Template visuel
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setTemplate(tpl.key)}
                    className={cn(
                      'group rounded-xl p-4 text-sm font-bold border-2 transition-all duration-200 text-left',
                      t === tpl.key
                        ? 'border-primary bg-primary/10 text-primary shadow-lg shadow-primary/20'
                        : 'border-border/40 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    )}
                  >
                    <div className={cn('w-full h-10 rounded-lg mb-2 flex items-center justify-center text-xs', tpl.preview)}>
                      Aa
                    </div>
                    {tpl.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3 pt-2">
                <h4 className="text-sm font-semibold">Couleurs</h4>
                {(
                  [
                    { key: 'primary' as const, label: 'Couleur principale', default: styleConfig.colors?.primary ?? '#8B5CF6' },
                    { key: 'text' as const, label: 'Texte', default: styleConfig.colors?.text ?? '#FFFFFF' },
                    { key: 'highlight' as const, label: 'Surlignage', default: styleConfig.colors?.highlight ?? '#000000' },
                  ]
                ).map(({ key, label, default: def }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground w-36">{label}</label>
                    <input
                      type="color"
                      defaultValue={def}
                      onChange={(e) => updateColor(key, e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer border border-border"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePanel === 'captions' && (
            <div className="space-y-4">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Type className="w-4 h-4 text-primary" /> Sous-titres mot-à-mot
              </h3>
              <p className="text-xs text-muted-foreground">
                Cliquez sur un mot pour le corriger. Les corrections sont immédiatement appliquées.
              </p>
              <EditableCaptions
                initialWords={transcript}
                onExport={(w, h) => {
                  if (h) {
                    setTranscript(w);
                    setHasChanges(true);
                  }
                }}
                fontSize={styleConfig.captions?.font_size ?? 72}
                activeColor={styleConfig.colors?.text ?? '#FFF'}
                readOnly={false}
              />
            </div>
          )}

          {activePanel === 'safezones' && (
            <div className="space-y-4">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Overlay Safe Zones
              </h3>
              <p className="text-sm text-muted-foreground">
                Activez l'overlay pour visualiser les zones masquées par les interfaces TikTok, Reels et Shorts.
              </p>

              <div className="flex items-center justify-between rounded-xl bg-muted/30 p-4">
                <span className="text-sm font-medium">Afficher les Safe Zones</span>
                <button
                  type="button"
                  onClick={() => setShowSafeZones(!showSafeZones)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    showSafeZones ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span className={cn(
                    'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                    showSafeZones ? 'translate-x-5' : 'translate-x-1'
                  )} />
                </button>
              </div>

              <div className="space-y-2">
                {SAFE_ZONE_LABELS.map((z) => (
                  <div key={z.label} className="flex items-center gap-3 rounded-lg bg-muted/20 p-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: z.color }} />
                    <span className="text-sm font-medium">{z.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {z.label === 'TikTok' ? 'Haut 12% + Bas 18%' :
                       z.label === 'Reels' ? 'Bas 22%' : 'Haut 8% + Bas 10%'}
                    </span>
                  </div>
                ))}
              </div>

              {showSafeZones && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                  ⚠️ Les zones rouges dans l'aperçu montrent les parties cachées par l'interface des plateformes.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}