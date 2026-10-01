/**
 * ============================================================
 * stores/use-intake.ts — État local de la prise en charge vidéo
 * ------------------------------------------------------------
 * Mémoire de travail partagée entre l'accueil (où l'utilisateur choisit sa
 * vidéo) et la page d'import (qui l'envoie réellement) : un lien, ou le
 * fichier lui-même.
 *
 * Le fichier reste en MÉMOIRE uniquement (`File` n'est pas sérialisable et
 * ne doit jamais être persisté) : c'est ce qui évite de le re-sélectionner
 * entre deux écrans navigués côté client. Une navigation complète
 * (rechargement, redirection de connexion) vide la mémoire, et l'utilisateur
 * re-choisit sa source — c'est volontaire : un fichier de 10 Go n'a rien à
 * faire dans un stockage de navigateur.
 * ============================================================
 */
import { create } from 'zustand';

export type IntakeSource = 'url' | 'file';

export type IntakeState = {
  source: IntakeSource | null;
  url: string;
  /** Fichier réellement sélectionné (mémoire seule, jamais sérialisé). */
  file: File | null;
  fileName: string | null;
  fileSize: number | null;
  setUrl: (url: string) => void;
  setFile: (file: File) => void;
  reset: () => void;
};

export const useIntake = create<IntakeState>()(set => ({
  source: null,
  url: '',
  file: null,
  fileName: null,
  fileSize: null,
  setUrl: (url: string) =>
    set({ source: 'url', url, file: null, fileName: null, fileSize: null }),
  setFile: (file: File) =>
    set({ source: 'file', url: '', file, fileName: file.name, fileSize: file.size }),
  reset: () => set({ source: null, url: '', file: null, fileName: null, fileSize: null })
}));
