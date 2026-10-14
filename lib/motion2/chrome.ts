/**
 * Navigateur sans écran pour enregistrer les compositions image par image
 * (Chromium léger sur Vercel, Chrome local en développement via CHROME_PATH).
 * Le navigateur est gardé entre deux requêtes d'une même instance.
 */
import type { Browser, Page } from 'puppeteer-core';

let browserP: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browserP) {
    const b = await browserP.catch(() => null);
    if (b && b.connected) return b;
    browserP = null;
  }
  browserP = (async () => {
    const puppeteer = (await import('puppeteer-core')).default;
    const local = process.env.CHROME_PATH;
    if (local) return puppeteer.launch({ executablePath: local, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'] });
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, args: [...chromium.args, '--font-render-hinting=none'], defaultViewport: null });
  })();
  return browserP;
}

/** Ressources autorisées pour une composition : polices Google, images (https / data), rien d'autre. */
export async function lockDown(page: Page) {
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const type = req.resourceType();
    const ok = url.startsWith('data:') || url.startsWith('about:')
      || (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url) && (type === 'stylesheet' || type === 'font'))
      || (/^https:\/\//.test(url) && type === 'image');
    if (ok) void req.continue().catch(() => undefined);
    else void req.abort().catch(() => undefined);
  });
}

/** Charge une composition dans une page et attend qu'elle soit prête (polices + images). */
export async function openComp(html: string, w: number, h: number): Promise<{ page: Page; errors: string[] }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await lockDown(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String((e as Error).message ?? e)));
  await page.setContent(html, { waitUntil: 'load', timeout: 25_000 });
  await page.waitForFunction('window.__izReady === true', { timeout: 20_000 }).catch(() => errors.push('composition jamais prête'));
  const inner = (await page.evaluate('window.__izErrors || []').catch(() => [])) as string[];
  return { page, errors: [...errors, ...inner] };
}
