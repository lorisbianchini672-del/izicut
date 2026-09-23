/**
 * worker/remotion/index.ts — Point d'entrée Remotion du worker.
 * ------------------------------------------------------------
 * La fonction bundle() de @remotion/bundler reçoit CE fichier :
 * il enregistre les compositions disponibles pour le rendu.
 */
import { registerRoot } from 'remotion';
import { RemotionRoot } from './ClipVertical';

registerRoot(RemotionRoot);
