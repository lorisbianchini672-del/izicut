'use client';

/**
 * ============================================================
 * app/upload/page.tsx — Import réel d'une vidéo
 * ------------------------------------------------------------
 * Trois entrées possibles (fichier, YouTube, Twitch), un seul chemin :
 * la source choisie est mémorisée dans `useIntake`, puis `MediaUploader`
 * l'envoie vraiment au compartiment privé et déclenche le pipeline.
 *
 * Rien n'est simulé ici : les états affichés viennent de l'envoi réel et
 * de la réponse de `POST /api/pipeline/process`.
 * ============================================================
 */

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Youtube, Link2, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MediaUploader } from '@/components/upload/MediaUploader';
import {
  MAX_UPLOAD_BYTES,
  SUPPORTED_VIDEO_EXTENSIONS,
  formatFileSize,
  validateVideoFile
} from '@/components/upload/validate-intake';
import { useIntake } from '@/stores/use-intake';
import { cn } from '@/lib/utils';

type IntakeTab = 'file' | 'url' | 'twitch';

const TABS: { id: IntakeTab; label: string; icon: typeof Upload }[] = [
  { id: 'file', label: 'Fichier', icon: Upload },
  { id: 'url', label: 'YouTube', icon: Youtube },
  { id: 'twitch', label: 'Twitch', icon: Link2 }
];

const FILE_ACCEPT = SUPPORTED_VIDEO_EXTENSIONS.map((extension) => `.${extension}`).join(',');

export default function UploadPage() {
  const { url, file, fileName, fileSize, setUrl, setFile } = useIntake();
  const [tab, setTab] = useState<IntakeTab>('file');
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /** Fichier choisi ou déposé : contrôle immédiat, puis mémorisation. */
  const pickFile = useCallback(
    (candidate: File | undefined | null) => {
      if (!candidate) return;
      const message = validateVideoFile({ name: candidate.name, size: candidate.size });
      setLocalError(message);
      if (message) return;
      setFile(candidate);
    },
    [setFile]
  );

  /**
   * Le lien est écrit dans le store à chaque frappe : c'est ce qui active
   * le bouton d'envoi de `MediaUploader`. Les messages d'erreur ne
   * s'affichent PAS pendant la saisie (un lien à moitié tapé n'est pas une
   * faute) : la validation définitive a lieu au moment de l'envoi.
   */
  const onUrlChange = useCallback(
    (value: string) => {
      setLocalError(null);
      setUrl(value);
    },
    [setUrl]
  );

  const isUrlTab = tab !== 'file';

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col items-center justify-center px-4 pt-20 pb-12">
      <div className="bg-orb bg-orb-purple w-[500px] h-[500px] top-0 left-0 opacity-60" />
      <div className="bg-orb bg-orb-pink w-[400px] h-[400px] bottom-0 right-0 opacity-50" />

      <div className="relative z-10 w-full max-w-xl">
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-sm font-medium text-primary mb-6">
            <Zap className="w-4 h-4" />
            Vos clips prêts en quelques minutes
          </div>
          <h1 className="font-display mb-3 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Importez votre <span className="izi-neon-text">vidéo</span>
          </h1>
          <p className="text-muted-foreground">
            Fichier local jusqu’à 800 Mo · YouTube · Twitch VOD
          </p>
        </motion.div>

        <motion.div
          className="glass rounded-3xl p-6 sm:p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Onglets */}
          <div className="flex gap-2 mb-6 p-1 bg-muted/40 rounded-2xl">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setLocalError(null);
                }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  tab === id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {isUrlTab ? (
              <motion.div
                key="url"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="space-y-4"
              >
                <div className="relative">
                  {tab === 'twitch' ? (
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  ) : (
                    <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  )}
                  <Input
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    value={url}
                    onChange={(event) => onUrlChange(event.target.value)}
                    placeholder={
                      tab === 'twitch'
                        ? 'https://www.twitch.tv/videos/…'
                        : 'https://www.youtube.com/watch?v=…'
                    }
                    className="pl-11 h-12 bg-muted/30 border-border/50 focus:border-primary"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {tab === 'twitch'
                    ? 'Rediffusions (VOD) publiques.'
                    : 'Vidéos, Shorts et diffusions publiques.'}{' '}
                  Uniquement des contenus dont vous détenez les droits.
                </p>
                <MediaUploader mode="url" />
              </motion.div>
            ) : (
              <motion.div
                key="file"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Déposer un fichier vidéo ou cliquer pour parcourir"
                  onClick={() => fileRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click();
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    pickFile(event.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    'rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors',
                    dragging
                      ? 'border-primary bg-primary/10'
                      : 'border-border/60 hover:border-primary/50 hover:bg-muted/30'
                  )}
                >
                  <Upload
                    className={cn(
                      'w-10 h-10 mx-auto mb-3',
                      dragging ? 'text-primary' : 'text-muted-foreground'
                    )}
                  />
                  <p className="font-semibold mb-1">
                    {dragging
                      ? 'Déposez votre vidéo ici'
                      : 'Glissez votre vidéo ou cliquez pour parcourir'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {SUPPORTED_VIDEO_EXTENSIONS.map((extension) => extension.toUpperCase()).join(
                      ', '
                    )}{' '}
                    — jusqu’à {Math.round(MAX_UPLOAD_BYTES / 1024 ** 3)} Go
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={FILE_ACCEPT}
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(event) => {
                      pickFile(event.target.files?.[0]);
                      event.target.value = '';
                    }}
                  />
                </div>

                {file && fileName ? (
                  <p className="text-xs text-center text-muted-foreground">
                    Sélectionné :{' '}
                    <span className="font-semibold text-foreground">{fileName}</span>
                    {fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
                  </p>
                ) : null}

                <MediaUploader mode="file" />
              </motion.div>
            )}
          </AnimatePresence>

          {localError ? (
            <p role="alert" className="mt-4 text-center text-sm text-destructive">
              {localError}
            </p>
          ) : null}

          <div className="mt-6 pt-4 border-t border-border/30 flex flex-wrap justify-center gap-2">
            {['MP4', 'MOV', 'WebM', 'MKV', 'YouTube', 'Twitch'].map((format) => (
              <span
                key={format}
                className="text-xs px-2 py-1 bg-muted/50 rounded-md text-muted-foreground font-medium"
              >
                {format}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.p
          className="text-center text-xs text-muted-foreground mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          🔒 Stockage privé, accès par URL signée · les minutes utilisées sont débitées une seule
          fois, au lancement
        </motion.p>
      </div>
    </div>
  );
}
