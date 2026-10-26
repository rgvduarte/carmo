// The request's address and User-Agent, read in memory only and never stored. The address: cut before hashing.
// User-Agent: bots out, then device type, OS family + major and browser family + major (SPEC appendix C), and the
// traffic channel (appendix D) and outbound link type. The raw UA is read in memory only and never stored.

const BOT = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|facebookcatalog|whatsapp\/|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|embedly|quora link preview|pinterestbot|bingpreview|vkshare|w3c_validator|lighthouse|pagespeed|gtmetrix|headlesschrome|phantomjs|puppeteer|playwright|selenium|python|curl|wget|httpclient|okhttp|go-http|java\/|node-fetch|axios|postman|insomnia|preview/i;

export const isBot = (ua) => !ua || ua.length > 512 || BOT.test(ua);

// in-app browsers: [family, app id, markers, version marker]
const IN_APP = [
  ['Instagram', 'instagram', /Instagram/, /Instagram (\d+)/],
  ['Messenger', 'messenger', /FBAN\/Messenger|FB_IAB\/MESSENGER/i, /FBAV\/(\d+)/],
  ['Facebook', 'facebook', /FBAN|FBAV|FB_IAB/, /FBAV\/(\d+)/],
  ['TikTok', 'tiktok', /musical_ly|BytedanceWebview|TikTok/i, null],
  ['LinkedIn', 'linkedin', /LinkedInApp/, null],
  ['Snapchat', 'snapchat', /Snapchat/, /Snapchat\/(\d+)/],
  ['Pinterest', 'pinterest', /Pinterest\//, /Pinterest\/(\d+)/],
];
const BROWSERS = [
  ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
  ['Opera', /OPR\/(\d+)/],
  ['Samsung Internet', /SamsungBrowser\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:CriOS|Chrome)\/(\d+)/],
  ['Safari', /Version\/(\d+)[^ ]* .*Safari/],
];
const major = (m) => (m && Number(m[1]) < 10000 ? ` ${Number(m[1])}` : '');

export function parseUA(ua, pc) {
  const s = String(ua || '');
  let dev = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? 'tablet'
    : /Mobi|iPhone|iPod|Android.*Mobile/.test(s) ? 'mobile' : 'desktop';
  let os;
  if (/iPhone|iPad|iPod/.test(s)) { const m = s.match(/OS (\d+)_/); os = `iOS${major(m)}`; }
  else if (/Android/.test(s)) { const m = s.match(/Android (\d+)/); os = `Android${major(m)}`; }
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Macintosh|Mac OS X/.test(s)) os = 'macOS';
  else if (/Linux/.test(s)) os = 'Linux';
  else os = 'Outro';
  // an iPad that asks for the desktop site says "Macintosh": a coarse pointer gives it away (3.2)
  if (os === 'macOS' && pc === 1) { dev = 'tablet'; os = 'iPadOS'; }
  let br = null, app = null;
  for (const [fam, id, re, ver] of IN_APP) {
    if (re.test(s)) { app = id; br = `${fam}${ver ? major(s.match(ver)) : ''}`; break; }
  }
  if (!br) {
    for (const [fam, re] of BROWSERS) {
      const m = s.match(re);
      if (m) { br = `${fam}${major(m)}`; break; }
    }
  }
  return { dev, os, br: br || 'Outro', app };
}

// ---------- channels (appendix D) ----------
const SOCIAL = new Set(['instagram.com', 'l.instagram.com', 'facebook.com', 'm.facebook.com', 'l.facebook.com',
  'lm.facebook.com', 't.co', 'x.com', 'twitter.com', 'tiktok.com', 'linkedin.com', 'lnkd.in', 'youtube.com',
  'm.youtube.com', 'reddit.com',
  // Android apps that open links with an app referrer
  'app:com.instagram.android', 'app:com.facebook.katana', 'app:com.facebook.lite', 'app:com.zhiliaoapp.musically',
  'app:com.linkedin.android', 'app:com.twitter.android', 'app:com.google.android.youtube', 'app:com.reddit.frontpage']);
const SEARCH = new Set(['bing.com', 'duckduckgo.com', 'ecosia.org', 'search.brave.com', 'yahoo.com',
  'app:com.google.android.googlequicksearchbox']);
const GOOGLE = /^google\.(?:[a-z]{2,3}|com?\.[a-z]{2})$/;
const AI = new Set(['chatgpt.com', 'perplexity.ai', 'gemini.google.com', 'copilot.microsoft.com', 'claude.ai']);
const MESSAGES = new Set(['app:com.whatsapp', 'web.whatsapp.com', 'app:org.telegram.messenger',
  'app:com.google.android.gm', 'mail.google.com', 'outlook.live.com']);
const SPORT = new Set(['strava.com', 'ironman.com', 'gofundme.com']);

export function channelOf(ref, app) {
  if (ref === 'interno') return 'interno';
  if (app || SOCIAL.has(ref)) return 'social';
  if (AI.has(ref)) return 'ia';
  if (MESSAGES.has(ref)) return 'mensagens';
  if (SEARCH.has(ref) || GOOGLE.test(ref)) return 'pesquisa';
  if (SPORT.has(ref)) return 'desporto';
  if (ref === 'direto') return 'direto';
  return 'outros';
}

// «Sites que trazem visitas»: the referrer as the dashboard shows it. An in-app browser with no referrer shows as
// e.g. 'instagram (app)' (D6).
export const refKey = (ref, app) => (ref === 'direto' && app ? `${app} (app)` : ref);

// referrer hosts always shown, whatever their count (SPEC 2.8 k-folding)
const ALWAYS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|instagram\.com|facebook\.com|t\.co|x\.com|twitter\.com|linkedin\.com|lnkd\.in|youtube\.com|tiktok\.com|strava\.com|whatsapp\.com|gofundme\.com|gofund\.me|ironman\.com|chatgpt\.com|perplexity\.ai|reddit\.com)$/;
export const alwaysShown = (k) => ALWAYS.test(k) || k === 'app:com.whatsapp' || / \(app\)$/.test(k);

// ---------- outbound link types (appendix D) ----------
const suffix = (host, ...xs) => xs.some((x) => host === x || host.endsWith(`.${x}`));
export function outType(out, osp) {
  if (osp) return 'patrocinador';
  if (out === 'whatsapp') return 'whatsapp';
  if (out === 'mailto') return 'email';
  if (out === 'tel') return 'tel';
  if (suffix(out, 'instagram.com', 'ig.me')) return 'instagram';
  if (suffix(out, 'tiktok.com')) return 'tiktok';
  if (suffix(out, 'strava.com')) return 'strava';
  if (suffix(out, 'gofundme.com', 'gofund.me')) return 'gofundme';
  if (suffix(out, 'spotify.com', 'spotify.link')) return 'spotify';
  return 'outro';
}

// ---------- the address (privacy 2.5) ----------
// IPv4 → its /24 with the last octet zeroed; IPv6 → its /48; an IPv4-mapped IPv6 address counts as IPv4
export function truncIp(ip) {
  const a = String(ip || '').trim().toLowerCase().split('%')[0];
  if (!a) return 'sem-ip';
  const v4 = a.match(/^(?:(?:0{0,4}:){0,5}ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return `${Number(v4[1])}.${Number(v4[2])}.${Number(v4[3])}.0`;
  if (!a.includes(':')) return 'outro';
  const [head, tail] = a.split('::');
  const h = head ? head.split(':') : [], t = tail === undefined ? null : tail ? tail.split(':') : [];
  const all = t === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${all.slice(0, 3).map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16).toString(16) : '0')).join(':')}::/48`;
}
