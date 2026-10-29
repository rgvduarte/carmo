// «Relatório PDF» of /admin/analytics/ (DESIGN §2): the button under the filters and its dialog (period, an optional
// brand, the language), the calls to the analytics Worker, and the two taps to get the file (make it, then save or
// share it: a share sheet needs a fresh tap). A second entry module of the page: it never touches the dashboard's state.
// The dashboard (admin-analytics.js) hands over its API client on sign-in through globalThis.gcAnalytics and the
// 'gc:analytics' event ({ api, today, oldest, base }, null on sign-out); the report uses only api.get(endpoint, params)
// with its own params (whole days, internal visits out, every device), and reads data/spots.json and data/montra.json
// from the site itself. The numbers become words in admin-report-model.js and a file in admin-report-pdf.js.
import { UI, fill, fmt } from './admin-report-text.js';
import { periods, customOk, brandsFor, buildModel, clampToData, dayDiff } from './admin-report-model.js';
import { reportPdf } from './admin-report-pdf.js';
import { MSG } from './admin-analytics-api.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const F = fmt('pt');
let gc = globalThis.gcAnalytics || null;
let files = null;          // { spots, montra } of the site, read once per sign-in
let brands = [];
let data = null;           // the answers of the last «Fazer», kept for «Fazer na mesma» { key, d, noSponsors }
let built = null;          // { bytes, name } ready to save
let busy = false;

const dlg = () => $('#report');
// status and error sit in the sticky footer, above the buttons, so a phone always shows them
const say = (s, cls = '') => { const p = $('#rp-status'); p.textContent = s || ''; p.className = `msg${cls ? ` ${cls}` : ''}`; };
const err = (s) => { $('#rp-err').textContent = s || ''; };
const shareable = (file) => { try { return typeof navigator.share === 'function' && !!navigator.canShare && matchMedia('(pointer: coarse)').matches && navigator.canShare({ files: [file] }); } catch (_) { return false; } };

// ---------- the button follows the dashboard's session ----------
function paint() {
  const bar = $('#rp-bar');
  if (bar) bar.hidden = !gc;
  if (!gc) { files = null; brands = []; data = null; built = null; if (dlg() && dlg().open) dlg().close(); }
}
document.addEventListener('gc:analytics', (e) => { gc = (e && e.detail) || null; paint(); });

// ---------- the site's files ----------
async function readJson(path, empty) {
  const res = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404 && empty) return empty;
  if (!res.ok) throw new Error('http');
  return res.json();
}
async function loadFiles() {
  if (files) return files;
  const [spots, montra] = await Promise.all([readJson('../../data/spots.json'), readJson('../../data/montra.json', { v: 1, brands: [] })]);
  files = { spots, montra };
  brands = brandsFor(spots, montra, spots.season);
  return files;
}

// ---------- the period ----------
function chosen() {
  const kind = ($('input[name="rp-p"]:checked') || {}).value || 'last';
  const P = periods(gc.today, files.spots);
  if (kind === 'custom') {
    const from = $('#rp-from').value, to = $('#rp-to').value;
    return customOk(from, to, gc.today) ? { from, to } : { error: fill(UI.customBad, { min: F.day(P.custom.min) }) };
  }
  const p = P[kind];
  if (!p || p.off) return { error: offText(kind, p) };
  return { from: p.from, to: p.to };
}
// the period the numbers cover: from the counter's first day at the earliest (clampToData)
function numbersOf(per) {
  const c = clampToData(per.from, per.to, gc.oldest);
  return c.error ? { error: fill(UI.noDataYet, { day: F.day(c.oldest) }) } : c;
}
function offText(kind, p) {
  if (kind === 'month') return UI.monthOff;
  if (kind === 'season') return p && p.off === 'before' ? fill(UI.seasonOff, { season: files.spots.season, day: F.range(p.start, p.start) }) : UI.seasonNone;
  return '';
}
function paintPeriod() {
  const P = periods(gc.today, files.spots);
  $('#rp-season-l').textContent = fill(UI.season, { season: files.spots.season || '' });
  const why = [];
  for (const kind of ['month', 'season']) {
    const input = $(`input[name="rp-p"][value="${kind}"]`);
    input.disabled = !!P[kind].off;
    if (P[kind].off) { why.push(offText(kind, P[kind])); if (input.checked) $('input[name="rp-p"][value="last"]').checked = true; }
  }
  $('#rp-p-why').textContent = why.join(' ');
  $('#rp-p-why').hidden = !why.length;
  const custom = ($('input[name="rp-p"]:checked') || {}).value === 'custom';
  $('#rp-custom').hidden = !custom;
  for (const id of ['#rp-from', '#rp-to']) { $(id).min = P.custom.min; $(id).max = P.custom.max; }
  const c = chosen();
  const line = $('#rp-range');
  if (c.error) { line.textContent = custom ? c.error : ''; line.classList.toggle('bad', custom); return; }
  line.classList.remove('bad');
  const days = dayDiff(c.from, c.to) + 1;
  let s = days === 1 ? fill(UI.range1, { range: F.range(c.from, c.to) }) : fill(UI.range, { range: F.range(c.from, c.to), n: F.int(days) });
  if (gc.oldest && c.to < gc.oldest) s += ` ${fill(UI.noDataYet, { day: F.day(gc.oldest) })}`;
  else if (gc.oldest && c.from < gc.oldest) s += ` ${fill(UI.before, { day: F.day(gc.oldest) })}`;
  line.textContent = s;
}

// ---------- the brand ----------
function paintBrands() {
  const sel = $('#rp-brand'), keep = sel.value;
  sel.replaceChildren(new Option(UI.brandSite, ''));
  brands.forEach((b, i) => sel.add(new Option(b.name, String(i))));
  sel.value = brands[Number(keep)] && keep !== '' ? keep : '';
  sel.disabled = !brands.length;
  paintBrandNote();
}
const chosenBrand = () => { const v = $('#rp-brand').value; return v === '' ? null : brands[Number(v)] || null; };
function paintBrandNote() {
  const b = chosenBrand(), lines = [];
  if (!brands.length) lines.push(UI.noBrands);
  else if (b) {
    if (b.hosts.length) lines.push(fill(UI.brandHosts, { hosts: b.hosts.join(' e ') }));
    else if (b.shared) lines.push(fill(UI.brandShared, { net: b.shared }));
    else if (b.spots.length || b.title) lines.push(UI.brandNoLink);
    else lines.push(UI.brandNoSpots);
    lines.push(b.montraIds.length ? UI.brandMontra : UI.brandNoMontra);
  }
  $('#rp-brand-note').textContent = lines.join(' ');
  $('#rp-brand-note').hidden = !lines.length;
}

// ---------- make, then save ----------
function reset() {
  built = null;
  delete $('#rp-go').dataset.again;
  if (!busy) { $('#rp-go').textContent = UI.go; say(''); err(''); }
}
async function make(force) {
  const asked = chosen();
  if (asked.error) { err(asked.error); return; }
  const per = numbersOf(asked);
  if (per.error) { err(per.error); return; }
  const brand = chosenBrand(), lang = ($('input[name="rp-lang"]:checked') || {}).value === 'en' ? 'en' : 'pt';
  const key = JSON.stringify([per.from, per.to, brand ? brand.name : '']);
  const q = { p: 'custom', from: per.from, to: per.to, int: 0, dev: 'all', cmp: 0 };
  const steps = [['overview', { ...q, cmp: 1 }], ['audience', q], ['content', q], ['studio', q]];
  if (brand && brand.hosts.length) steps.push(['sponsors', q]);
  if (brand && brand.montraIds.length) steps.push(['montra', q]);
  const n = steps.length + 1;
  busy = true; err(''); $('#rp-go').disabled = true; $('#rp-note').hidden = true;
  try {
    if (!force || !data || data.key !== key) {
      const d = {};
      let noSponsors = false;
      for (const [i, [ep, params]] of steps.entries()) {
        say(fill(UI.step, { i: i + 1, n }));
        $('#rp-go').textContent = fill(UI.stepShort, { i: i + 1, n });
        try { d[ep] = await gc.api.get(ep, params); } catch (e) {
          if (ep === 'sponsors' && e && e.status === 404) { d.sponsors = null; noSponsors = true; continue; }
          throw e;
        }
      }
      data = { key, d, noSponsors };
    }
    if (data.noSponsors) { $('#rp-note').textContent = UI.noSponsors; $('#rp-note').hidden = false; }
    const visits = Number(data.d.overview && data.d.overview.kpi && data.d.overview.kpi.visits && data.d.overview.kpi.visits.v) || 0;
    if (!visits && !force) { say(UI.empty, 'warn'); $('#rp-go').textContent = UI.again; $('#rp-go').dataset.again = '1'; return; }
    say(UI.writing);
    $('#rp-go').textContent = `${UI.writing}…`;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const model = buildModel({ lang, from: per.from, to: per.to, asked: per.asked, today: gc.today, oldest: gc.oldest, brand, data: data.d, spotsJson: files.spots, montraJson: files.montra });
    const bytes = reportPdf(model, new Date());
    built = { bytes, name: model.file };
    const probe = new File([bytes], model.file, { type: 'application/pdf' });
    $('#rp-go').textContent = shareable(probe) ? UI.share : UI.save;
    say(fill(UI.ready, { name: model.file, size: `${Math.max(1, Math.round(bytes.length / 1024))} KB` }), 'ok');
  } catch (e) {
    data = null;
    say('');
    $('#rp-go').textContent = UI.go;
    err((e && e.text) || (e && e.code ? MSG.server : UI.failed));
  } finally {
    busy = false; $('#rp-go').disabled = false;
  }
}
async function save() {
  const file = new File([built.bytes], built.name, { type: 'application/pdf' });
  if (shareable(file)) {
    try { await navigator.share({ files: [file], title: built.name }); say(UI.saved, 'ok'); return; } catch (e) {
      if (e && (e.name === 'AbortError' || e.name === 'InvalidStateError')) return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = built.name; a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  say(UI.saved, 'ok');
}

// ---------- the dialog ----------
async function openDialog() {
  if (!gc) return;
  err(''); say('');
  try { await loadFiles(); } catch (_) { err(UI.files); dlg().showModal(); $('#rp-go').disabled = true; return; }
  $('#rp-go').disabled = false;
  const P = periods(gc.today, files.spots);
  if (!$('#rp-from').value) $('#rp-from').value = P.last.from < P.custom.min ? P.custom.min : P.last.from;
  if (!$('#rp-to').value) $('#rp-to').value = P.custom.max;
  paintPeriod();
  paintBrands();
  if (!built) $('#rp-go').textContent = UI.go;
  dlg().showModal();
}

function wire() {
  if (!dlg()) return;
  $('#rp-open').addEventListener('click', openDialog);
  $('#rp-x').addEventListener('click', () => dlg().close());
  $('#rp-no').addEventListener('click', () => dlg().close());
  for (const r of $$('input[name="rp-p"]')) r.addEventListener('change', () => { paintPeriod(); reset(); if (r.value === 'custom' && r.checked) $('#rp-from').focus(); });
  for (const id of ['#rp-from', '#rp-to']) $(id).addEventListener('change', () => { paintPeriod(); reset(); });
  $('#rp-brand').addEventListener('change', () => { paintBrandNote(); reset(); $('#rp-note').hidden = true; });
  for (const r of $$('input[name="rp-lang"]')) r.addEventListener('change', reset);
  $('#rp-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    if (built) { save(); return; }
    const again = $('#rp-go').dataset.again === '1';
    delete $('#rp-go').dataset.again;
    make(again);
  });
  paint();
}
wire();
