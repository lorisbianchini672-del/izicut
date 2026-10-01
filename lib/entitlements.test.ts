/**
 * ============================================================
 * entitlements.test.ts — Tests des droits par offre
 * ------------------------------------------------------------
 * Exécution : node --test lib/entitlements.test.ts
 * Zéro dépendance, zéro réseau.
 * ============================================================
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_RENDER_SETTINGS,
  ENTITLEMENTS,
  FREE_ACTIVE_COLORS,
  defaultSettingsForTier,
  hasFeature,
  overlaySignature,
  parseRenderSettings,
  requiredTier,
  resolvePlanTier,
  sanitizeRenderSettings,
  tierFromPlanKey
} from './entitlements.ts';

const EVERYTHING_ON = {
  template: 'neon',
  active_color: '#ff00aa',
  text_color: '#111111',
  layout: 'blur_fit',
  focus_x: 0.2,
  remove_silences: true,
  enhance_audio: true,
  auto_zoom: true,
  hook_title: true,
  hook_title_text: 'Mon titre',
  progress_bar: true,
  fps: 60,
  brand_text: '@monagence'
};

test('resolvePlanTier : une offre payante exige un abonnement actif', () => {
  assert.equal(resolvePlanTier('pro', 'active'), 'pro');
  assert.equal(resolvePlanTier('agency', 'trialing'), 'agency');
  assert.equal(resolvePlanTier('pro', 'canceled'), 'free');
  assert.equal(resolvePlanTier('agency', undefined), 'free');
  assert.equal(resolvePlanTier('hacker', 'active'), 'free');
  assert.equal(resolvePlanTier(null, 'active'), 'free');
});

test('tierFromPlanKey accepte les alias commerciaux', () => {
  assert.equal(tierFromPlanKey('pro'), 'pro');
  assert.equal(tierFromPlanKey('creator'), 'pro');
  assert.equal(tierFromPlanKey('studio'), 'agency');
  assert.equal(tierFromPlanKey(null), 'free');
});

test('Free : toute fonction payante forgée est retirée', () => {
  const { settings, removed } = sanitizeRenderSettings(EVERYTHING_ON, 'free');
  assert.equal(settings.template, 'hormozi');
  assert.equal(settings.active_color, FREE_ACTIVE_COLORS[0]);
  assert.equal(settings.text_color, '#FFFFFF');
  assert.equal(settings.layout, 'crop');
  assert.equal(settings.focus_x, 0.5);
  assert.equal(settings.remove_silences, false);
  assert.equal(settings.enhance_audio, false);
  assert.equal(settings.auto_zoom, false);
  assert.equal(settings.hook_title, false);
  assert.equal(settings.hook_title_text, '');
  assert.equal(settings.progress_bar, false);
  assert.equal(settings.fps, 30);
  assert.equal(settings.brand_text, '');
  for (const feature of ['premiumTemplates', 'customColors', 'removeSilences', 'fps60', 'brandText', 'blurLayout']) {
    assert.ok(removed.includes(feature as never), `${feature} devrait être signalé`);
  }
});

test('Free : une couleur de la palette gratuite est conservée', () => {
  const { settings, removed } = sanitizeRenderSettings({ active_color: FREE_ACTIVE_COLORS[1] }, 'free');
  assert.equal(settings.active_color, FREE_ACTIVE_COLORS[1]);
  assert.deepEqual(removed, []);
});

test('Pro : tout est conservé sauf la signature Agency', () => {
  const { settings, removed } = sanitizeRenderSettings(EVERYTHING_ON, 'pro');
  assert.equal(settings.template, 'neon');
  assert.equal(settings.active_color, '#FF00AA');
  assert.equal(settings.layout, 'blur_fit');
  assert.equal(settings.fps, 60);
  assert.equal(settings.remove_silences, true);
  assert.equal(settings.brand_text, '');
  assert.deepEqual(removed, ['brandText']);
});

test('Agency : tout est conservé', () => {
  const { settings, removed } = sanitizeRenderSettings(EVERYTHING_ON, 'agency');
  assert.equal(settings.brand_text, '@monagence');
  assert.deepEqual(removed, []);
});

test('parseRenderSettings borne et nettoie les valeurs arbitraires', () => {
  const s = parseRenderSettings({
    font_size: 9999,
    position: -3,
    focus_x: 7,
    active_color: 'red; background:url(x)',
    template: '<script>',
    fps: 120,
    brand_text: 'a\nb\u0000c' + 'x'.repeat(100)
  });
  assert.equal(s.font_size, 140);
  assert.equal(s.position, 0.15);
  assert.equal(s.focus_x, 1);
  assert.equal(s.active_color, DEFAULT_RENDER_SETTINGS.active_color);
  assert.equal(s.template, 'hormozi');
  assert.equal(s.fps, 30);
  assert.ok(!s.brand_text.includes('\n'));
  assert.ok(s.brand_text.length <= 40);
});

test('parseRenderSettings lit les anciennes formes de style_config', () => {
  const flat = parseRenderSettings({ font_size: 92, active_color: '#ffd400', inactive_color: '#eeeeee', position: 0.8 });
  assert.equal(flat.font_size, 92);
  assert.equal(flat.text_color, '#EEEEEE');
  assert.equal(flat.position, 0.8);

  const nested = parseRenderSettings({ captions: { font_size: 70 }, colors: { primary: '#123456' } });
  assert.equal(nested.font_size, 70);
  assert.equal(nested.active_color, '#123456');

  assert.deepEqual(parseRenderSettings(null), DEFAULT_RENDER_SETTINGS);
});

test('defaultSettingsForTier : un abonné reçoit un montage poussé par défaut', () => {
  assert.equal(defaultSettingsForTier('free').remove_silences, false);
  const pro = defaultSettingsForTier('pro');
  assert.equal(pro.remove_silences, true);
  assert.equal(pro.auto_zoom, true);
  assert.equal(pro.hook_title, true);
  // Les défauts payants survivent au rabotage de leur propre offre.
  assert.deepEqual(sanitizeRenderSettings(pro, 'pro').removed, []);
});

test('hasFeature / requiredTier / overlaySignature', () => {
  assert.equal(hasFeature('free', 'autoZoom'), false);
  assert.equal(hasFeature('pro', 'autoZoom'), true);
  assert.equal(hasFeature('free', 'noWatermark'), false);
  assert.equal(hasFeature('pro', 'noWatermark'), true);
  assert.equal(hasFeature('pro', 'brandText'), false);
  assert.equal(requiredTier('brandText'), 'agency');
  assert.equal(requiredTier('autoZoom'), 'pro');

  assert.equal(overlaySignature(DEFAULT_RENDER_SETTINGS, 'free'), 'Réalisé avec IziCut');
  assert.equal(overlaySignature(DEFAULT_RENDER_SETTINGS, 'pro'), '');
  assert.equal(overlaySignature({ ...DEFAULT_RENDER_SETTINGS, brand_text: '@moi' }, 'agency'), '@moi');
  assert.ok(ENTITLEMENTS.agency.maxClipsPerVideo > ENTITLEMENTS.free.maxClipsPerVideo);
});
