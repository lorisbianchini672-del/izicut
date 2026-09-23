/**
 * ============================================================
 * middleware.ts — Rafraîchissement de session Supabase Auth
 * ------------------------------------------------------------
 * Les jetons Supabase expirent : ce middleware échange le refresh
 * token contre un nouveau jeu de jetons À CHAQUE requête qui en a
 * besoin, puis reporte les cookies de session sur la réponse.
 * Sans lui, une session de plus d'une heure échoue silencieusement
 * côté serveur (coûteux à déboguer).
 *
 * Il sert aussi de barrière : les routes applicatives redirigent
 * vers `/login?next=…` si aucun utilisateur n'est identifié.
 * ============================================================
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/** Routes exigeant une session ; les autres sont simplement traversées. */
const PROTECTED_PREFIXES = ['/dashboard', '/project', '/editor', '/upload'];

/**
 * Démonstrations publiques : l'éditeur de démo est entièrement simulé
 * côté navigateur (données en dur, aucun appel base de données ni
 * Storage). Il doit rester accessible sans compte, comme promis sur la
 * landing (« Studio Démo Live »).
 */
const PUBLIC_DEMO_PATHS = ['/editor', '/editor/clip-demo'];

/** Ne pas gaspiller d'appel d'auth sur les assets et la vitrine. */
const PUBLIC_PREFIXES = ['/_next', '/favicon', '/api/pipeline'];

/**
 * Renvoie l'utilisateur vers la page de connexion en mémorisant la
 * destination dans `?next=` (chemin interne uniquement — la page de
 * connexion revérifie ce paramètre avant toute redirection).
 */
function redirectToLogin(request: NextRequest, pathname: string) {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/login';
  redirectUrl.search = '';
  redirectUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(redirectUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  // Normalise le slash final pour comparer les chemins exacts.
  const normalizedPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const isPublicDemo = PUBLIC_DEMO_PATHS.includes(normalizedPath);

  const isProtected =
    PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) &&
    !isPublicDemo &&
    !PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // Résilience : sans configuration Supabase (dev local, démo), on
  // saute le rafraîchissement de session plutôt que de renvoyer une
  // erreur 500 sur toutes les pages. Les routes protégées restent
  // bloquées (défaillance sûre, jamais permissive).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isProtected) {
      return redirectToLogin(request, pathname);
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        response.cookies.set(name, value, options);
      },
      remove(name: string, options: Record<string, unknown>) {
        response.cookies.set(name, '', { ...options, maxAge: 0 });
      }
    }
  });

  // Échange silencieux du refresh token (mise à jour des cookies).
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    response = redirectToLogin(request, pathname);
  }

  return response;
}

export const config = {
  // Tout sauf les fichiers statiques et le suivi de performance.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|woff2?)$).*)']
};
