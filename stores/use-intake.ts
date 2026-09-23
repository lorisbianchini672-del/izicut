/**
 * ============================================================
 * stores/use-intake.ts — État local de la prise en charge vidéo
 * ------------------------------------------------------------
 * Mémoire de travail de la page d'accueil : quelle vidéo l'utilisateur
 * veut-il cliper (lien ou fichier) ? Le fichier n'est PAS téléversé ici :
 * seuls son nom et sa taille sont conservés. L'upload réel (reprenable,
 * après inscription) aura lieu dans `MediaUploader`, qui lira ce store.
 *
 * Zustand plutôt qu'un useState local : l'état doit survivre à la
 * navigation vers `/auth/signup` puis `/dashboard/new`, sans passer par
 * des paramètres d'URL fragiles (un nom de fichier fait 10 Go, pas 2 Ko).
 * ============================================================
 */
import { create } from 'zustand';

export type IntakeSource = 'url' | 'file';

export type IntakeState = {
  source: IntakeSource | null;
  url: string;
  fileName: string | null;
  fileSize: number | null;
  setUrl: (url: string) => void;
  setFile: (fileName: string, fileSize: number) => void;
  reset: () => void;
};

export const useIntake = create<IntakeState>()(set => ({
  source: null,
  url: '',
  fileName: null,
  fileSize: null,
  setUrl: (url: string) => set({ source: 'url', url, fileName: null, fileSize: null }),
  setFile: (fileName: string, fileSize: number) =>
    set({ source: 'file', url: '', fileName, fileSize }),
  reset: () => set({ source: null, url: '', fileName: null, fileSize: null })
}));
