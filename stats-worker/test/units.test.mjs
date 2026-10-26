// The pure modules, without a Worker: UA parsing, channels, the address cut, the sanitizer, the clock and periods.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUA, isBot, channelOf, refKey, outType, alwaysShown, truncIp } from '../src/ua.js';
import { sanitizeBeacon, sanitizeFeedback, checkSelector, scrubLabel, scrubText } from '../src/sanitize.js';
import { lisbon, nextLisbon, period, isoWeek, weekday, clock } from '../src/time.js';
import { binEng, binCls, VBIN, canon, rating } from '../src/derive.js';

test('UA: the Playwright profiles of the simulator and common browsers', () => {
  const cases = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', 1, ['mobile', 'iOS 15', 'Safari 26', null]],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Mobile Safari/537.36', 1, ['mobile', 'Android 14', 'Chrome 141', null]],
    ['Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', 1, ['tablet', 'iOS 12', 'Safari 26', null]],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36', 0, ['desktop', 'Windows', 'Chrome 141', null]],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36 Edg/141.0.7390.37', 0, ['desktop', 'Windows', 'Edge 141', null]],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0.1) Gecko/20100101 Firefox/142.0.1', 0, ['desktop', 'Windows', 'Firefox 142', null]],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 0, ['desktop', 'macOS', 'Safari 26', null]],
    // an iPad asking for the desktop site
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 1, ['tablet', 'iPadOS', 'Safari 26', null]],
    ['Mozilla/5.0 (Linux; Android 8.1.0; SM-T837A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.37 Safari/537.36', 1, ['tablet', 'Android 8', 'Chrome 141', null]],
    ['Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 1, ['mobile', 'Android 14', 'Samsung Internet 25', null]],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0 (iPhone14,5; iOS 18_1; pt_PT)', 1, ['mobile', 'iOS 18', 'Instagram 300', 'instagram']],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.98;FBBV/1]', 1, ['mobile', 'iOS 18', 'Facebook 480', 'facebook']],
    ['Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 musical_ly_2023', 1, ['mobile', 'Android 14', 'TikTok', 'tiktok']],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 0, ['desktop', 'ChromeOS', 'Chrome 141', null]],
  ];
  for (const [ua, pc, [dev, os, br, app]] of cases) assert.deepEqual(parseUA(ua, pc), { dev, os, br, app }, ua);
  for (const b of ['Googlebot/2.1', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'facebookexternalhit/1.1', 'WhatsApp/2.23.20.0 A',
    'Mozilla/5.0 HeadlessChrome/141.0.0.0', 'python-requests/2.31', 'curl/8.4.0', 'Go-http-client/2.0', '', 'x'.repeat(513), 'Mozilla/5.0 (Linux) Chrome-Lighthouse']) assert.equal(isBot(b), true, b);
  assert.equal(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Mobile/15E148 Instagram 300.0.0.0'), false);
});

test('channels, referrer keys, outbound types, the always-shown hosts', () => {
  const c = (ref, app = null) => channelOf(ref, app);
  assert.equal(c('direto'), 'direto');
  assert.equal(c('direto', 'instagram'), 'social');
  assert.equal(c('interno', 'instagram'), 'interno');
  assert.equal(c('l.instagram.com'), 'social');
  assert.equal(c('google.com'), 'pesquisa');
  assert.equal(c('google.pt'), 'pesquisa');
  assert.equal(c('google.co.uk'), 'pesquisa');
  assert.equal(c('gemini.google.com'), 'ia');
  assert.equal(c('mail.google.com'), 'mensagens');
  assert.equal(c('app:com.whatsapp'), 'mensagens');
  assert.equal(c('chatgpt.com'), 'ia');
  assert.equal(c('strava.com'), 'desporto');
  assert.equal(c('blog.example.net'), 'outros');
  assert.equal(refKey('direto', 'instagram'), 'instagram (app)');
  assert.equal(refKey('l.instagram.com', 'instagram'), 'l.instagram.com');
  assert.equal(outType('instagram.com'), 'instagram');
  assert.equal(outType('ig.me'), 'instagram');
  assert.equal(outType('open.spotify.com'), 'spotify');
  assert.equal(outType('whatsapp'), 'whatsapp');
  assert.equal(outType('mailto'), 'email');
  assert.equal(outType('marca.pt', 1), 'patrocinador');
  assert.equal(outType('marca.pt'), 'outro');
  for (const k of ['google.com', 'l.instagram.com', 'm.facebook.com', 't.co', 'app:com.whatsapp', 'instagram (app)']) assert.equal(alwaysShown(k), true, k);
  for (const k of ['blog.example.net', 'notgoogle.com.evil']) assert.equal(alwaysShown(k), false, k);
});

test('the address is cut before anything else sees it', () => {
  assert.equal(truncIp('203.0.113.77'), '203.0.113.0');
  assert.equal(truncIp('::ffff:198.51.100.9'), '198.51.100.0');
  assert.equal(truncIp('2001:db8:abcd:12:1::5'), '2001:db8:abcd::/48');
  assert.equal(truncIp('2001:DB8:ABCD:FFFF::1'), '2001:db8:abcd::/48');
  assert.equal(truncIp(''), 'sem-ip');
});

test('selectors: only the 4.5 grammar, attribute values from the page enums only', () => {
  for (const s of ['#rc-body > li.rc-row[data-id="peito"] > button.nm', '#top img', '#stage > canvas', 'body > footer > p:nth-of-type(2)',
    '#view-row > button[data-view="left"]', '#pay-tabs > button[role="tab"]', 'div.stage > button[data-act="zoom-in"]', '#nav']) assert.equal(checkSelector(s), s, s);
  for (const s of ['#a[data-id="912345678"]', '#x1234', 'div[data-id="joao"]', 'a[href="mailto:x@y.pt"]', 'div.c1234x', 'div > ', ' div',
    'div >  p', 'div:hover', '#a, #b', 'x'.repeat(81), 'input[value="x"]', 'li[data-focus="nuca"]:nth-of-type(1)']) assert.equal(checkSelector(s), undefined, s);
});

test('scrub: emails drop a label; URLs, digit runs masked; whitespace collapsed', () => {
  assert.equal(scrubLabel('joao@mail.pt'), undefined);
  assert.equal(scrubLabel('Fala comigo: 912 345 678'), 'Fala comigo: [n]');
  assert.equal(scrubLabel('  Ver\n\tmais  '), 'Ver mais');
  assert.equal(scrubLabel('x'.repeat(50)).length, 40);
  assert.equal(scrubText('fail at https://gocarmo.com/a?b=1 for a@b.pt, id 2026-10-23', 100), 'fail at [url] for [email], id [n]');
  assert.equal(scrubText('PT50 0035 0000 1234 5678 9015 4', 100), 'PT[n]');
});

test('the beacon sanitizer keeps only the allowlist', () => {
  const b = { v: 1, pv: '5b8e0c2e-7a41-4f7e-9d2a-1c3b5e6f7a8b', f: 2, t: 'h', vis: 0, path: '/', lang: 'pt', bl: 'PT-pt', ref: 'l.instagram.com',
    vw: 'm', vh: 844, nav: 'navigate', pc: 1, b: '033e031d', land: '#fato', int: 1, eng: 4000, scr: 63, scr1: 1, ex: 'o-fato',
    sec: { top: 9.6, nope: 3, 'o-fato': 9999, reserva: 0 }, rz: ['top', 'top', 'x'], perf: { lcp: 2349, inp: 251, cls: 0.044, lcpT: '#top img', inpT: 'a[href="x"]', inpK: 'touch' },
    extra: 'drop me', e: [{ i: 1, k: 'ev', n: 'spot_select', p: { spot: 'peito', item: 'suit', from: 'tabela', who: 'x' } }, { i: 1, k: 'ev', n: 'menu_open' }, { i: 2, k: 'nope' }] };
  const s = sanitizeBeacon(b);
  assert.equal(s.page.bl, 'xx');
  assert.equal(s.page.vh, 800);
  assert.equal(s.page.land, '#fato');
  assert.equal(s.int, 1);
  assert.deepEqual(s.snap.sec, { top: 10, 'o-fato': 1800 });
  assert.deepEqual(s.snap.rz, ['top']);
  assert.equal(s.snap.eng, 3600);
  assert.equal(s.snap.scr, 65);
  assert.deepEqual(s.snap.perf, { lcp: 2350, inp: 250, cls: 0.04, lcpT: '#top img' });
  assert.deepEqual(s.events, [{ i: 1, k: 'ev', n: 'spot_select', p: { spot: 'peito', item: 'suit', from: 'tabela' } }]);
  assert.equal(JSON.stringify(s).includes('drop me'), false);
  assert.deepEqual(sanitizeBeacon({ ...b, v: 2 }), { error: 'versao' });
  assert.deepEqual(sanitizeBeacon([]), { error: 'json' });
  assert.deepEqual(sanitizeBeacon({ ...b, ref: 'https://x.com/a' }), { error: 'esquema' });
  assert.deepEqual(sanitizeFeedback({ v: 1, q: 'patrocinio', a: 'sim', lang: 'pt', pv: 'nope', ex: 'o-fato', who: 'x' }), { q: 'patrocinio', a: 'sim', lang: 'pt', int: 0, ex: 'o-fato' });
  assert.deepEqual(sanitizeFeedback({ v: 1, q: 'patrocinio', a: 'precos', lang: 'pt' }), { error: 'esquema' });
});

test('Lisbon clock, the nightly alarm time across DST, periods', () => {
  assert.deepEqual(lisbon(Date.parse('2026-10-23T22:59:00Z')), { day: '2026-10-23', hr: 23, min: 59 });
  assert.deepEqual(lisbon(Date.parse('2026-10-23T23:01:00Z')), { day: '2026-10-24', hr: 0, min: 1 });
  assert.deepEqual(lisbon(Date.parse('2026-12-31T23:30:00Z')), { day: '2026-12-31', hr: 23, min: 30 });
  // 00:20 Lisbon: 23:20 UTC in summer, 00:20 UTC in winter; the night of the October change
  assert.equal(new Date(nextLisbon(Date.parse('2026-10-23T12:00:00Z'), 0, 20)).toISOString(), '2026-10-23T23:20:00.000Z');
  assert.equal(new Date(nextLisbon(Date.parse('2026-10-24T12:00:00Z'), 0, 20)).toISOString(), '2026-10-24T23:20:00.000Z');
  assert.equal(new Date(nextLisbon(Date.parse('2026-10-25T12:00:00Z'), 0, 20)).toISOString(), '2026-10-26T00:20:00.000Z');
  assert.equal(new Date(nextLisbon(Date.parse('2026-03-28T12:00:00Z'), 0, 20)).toISOString(), '2026-03-29T00:20:00.000Z');
  assert.equal(new Date(nextLisbon(Date.parse('2026-03-29T12:00:00Z'), 0, 20)).toISOString(), '2026-03-29T23:20:00.000Z');
  const c = clock(Date.parse('2026-10-23T13:30:00Z'));      // 14:30 Lisbon
  const p7 = period({ p: '7d' }, c);
  assert.deepEqual([p7.range.from, p7.range.to, p7.range.days, p7.range.partial, p7.prev.from, p7.prev.to], ['2026-10-16', '2026-10-22', 7, false, '2026-10-09', '2026-10-15']);
  const p24 = period({ p: '24h' }, c);
  assert.deepEqual(p24.win.hours, [['2026-10-22', 15, 23], ['2026-10-23', 0, 14]]);
  assert.deepEqual(p24.pwin.hours, [['2026-10-21', 15, 23], ['2026-10-22', 0, 14]]);
  const late = period({ p: '24h' }, clock(Date.parse('2026-10-23T22:30:00Z')));   // 23:30 Lisbon
  assert.deepEqual(late.win.hours, [['2026-10-23', 0, 23]]);
  assert.equal(period({ p: 'custom', from: '2026-10-23', to: '2026-10-23' }, c).range.partial, true);
  assert.deepEqual(period({ p: 'custom', from: '2026-10-24', to: '2026-10-24' }, c), { error: 'periodo' });
  assert.deepEqual(period({ p: 'custom', from: '2024-09-01', to: '2024-09-02' }, c), { error: 'periodo' });
  assert.equal(period({ p: '7d', cmp: 0 }, c).prev, null);
  assert.equal(isoWeek('2026-01-01'), '2026-W01');
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
  assert.equal(weekday('2026-10-26'), 1);
  assert.equal(weekday('2026-10-25'), 7);
});

test('bins and ratings', () => {
  assert.equal(binEng(0), 0); assert.equal(binEng(599), 595); assert.equal(binEng(600), 600); assert.equal(binEng(3600), 3540);
  assert.equal(VBIN.lcp(2350), '2300'); assert.equal(VBIN.lcp(12000), '10000+'); assert.equal(VBIN.inp(2100), '2000+'); assert.equal(VBIN.ttfb(330), '300');
  assert.equal(binCls(0.04), '0.04'); assert.equal(binCls(0.1), '0.10'); assert.equal(binCls(1.2), '1+');
  assert.equal(canon({ spot: 'peito', from: 'tabela', item: 'suit' }), 'from=tabela&item=suit&spot=peito');
  assert.equal(rating('lcp', 2500), 'good'); assert.equal(rating('lcp', 2550), 'ni'); assert.equal(rating('cls', 0.26), 'poor');
});
