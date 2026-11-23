import express from 'express';
import * as cheerio from 'cheerio';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
x509.cryptoProvider.set(crypto.webcrypto);

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;
const PLAN_ROOT = 'https://plan.zse.bydgoszcz.pl';
const REPLACEMENTS_URL = 'https://zastepstwa.zse.bydgoszcz.pl/';
const STAFF_URL = 'https://archiwalna.zse.bydgoszcz.pl/nauczyciele/';
const VULCAN_URL = 'https://uczen.eduvulcan.pl/bydgoszcz/';
const SESSION_FILE = path.join(process.env.MOJ_PLAN_DATA_DIR || path.join(root, 'data'), 'vulcan-session.json');
const AP_URL = 'https://eduvulcan.pl/api/ap';
const cache = new Map();
const DAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];
const clean = (text = '') => text.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
const classPattern = (name) => {
  const match = name.match(/^(\d+)([A-Z])$/);
  return new RegExp(`(^|[^\\dA-Z])${match[1]}\\s*${match[2]}(?:\\(\\d+\\))?(?=\\s*-|\\s|$)`, 'i');
};

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await loader();
  cache.set(key, { value, until: Date.now() + 5 * 60_000 });
  return value;
}
async function fetchHtml(url) {
  let response;
  try {
    response = await fetch(url, { headers: { 'User-Agent': 'MojPlan szkolny plan reader' }, signal: AbortSignal.timeout(12_000) });
  } catch (error) {
    const cause = error?.cause;
    console.error(`[Mój Plan] Błąd pobierania ${new URL(url).hostname}: ${cause?.code || cause?.name || error.name} ${cause?.message || error.message}`);
    throw error;
  }
  if (!response.ok) throw new Error(`Źródło odpowiedziało kodem ${response.status}`);
  const bytes = await response.arrayBuffer();
  const sample = new TextDecoder('latin1').decode(bytes.slice(0, 1200));
  const charset = response.headers.get('content-type')?.match(/charset\s*=\s*([^;]+)/i)?.[1]?.replace(/["']/g, '') || sample.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'/>;]+)/i)?.[1] || 'utf-8';
  return new TextDecoder(charset).decode(bytes);
}
const normalize = (text) => text.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]/g, '');

function parseAp(raw) {
  const match = raw.trim().match(/id=['"]ap['"][^>]*value=(['"])([\s\S]*?)\1/);
  const value = match ? match[2].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : raw.trim();
  const ap = JSON.parse(value);
  if (!ap.Success || !Array.isArray(ap.Tokens) || !ap.Tokens.length) throw new Error(ap.ErrorMessage || 'Dane logowania eduVULCAN są nieprawidłowe.');
  return ap;
}
function decodeToken(token) { const p = token.split('.')[1]; if (!p) throw new Error('Nieprawidłowy token logowania.'); return JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); }
async function makeDevice() {
  const alg = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 };
  const subtle = crypto.webcrypto.subtle;
  const keys = await subtle.generateKey(alg, true, ['sign', 'verify']);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({ serialNumber: '01', name: 'CN=MojPlan local device', notBefore: new Date(), notAfter: new Date(Date.now() + 20 * 365 * 24 * 60 * 60 * 1000), signingAlgorithm: alg, keys });
  const der = Buffer.from(cert.rawData);
  return { certificate: der.toString('base64'), privateKey: Buffer.from(await subtle.exportKey('pkcs8', keys.privateKey)).toString('base64'), fingerprint: crypto.createHash('sha1').update(der).digest('hex') };
}
const vulcanConstants = { app: 'DzienniczekPlus 3.0', version: '25.02.14 (G)', ua: 'Dart/3.3 (dart:io)', os: 'Android', model: 'eduVULCAN local device', vapi: '1', versionCode: '621' };
function signatureHeaders(device, body, url) {
  const date = new Date().toUTCString(); const parsedUrl = new URL(url); const pathIndex = parsedUrl.pathname.toLowerCase().indexOf('/api/mobile/');
  if (pathIndex < 0) throw new Error('Nieobsługiwany adres eduVULCAN.');
  const pathPart = `${parsedUrl.pathname.slice(pathIndex + 1)}${parsedUrl.search}`;
  const canonical = encodeURIComponent(pathPart).toLowerCase(); const digest = body ? crypto.createHash('sha256').update(body).digest('base64') : '';
  const names = ['vCanonicalUrl', ...(body ? ['Digest'] : []), 'vDate']; const values = [canonical, ...(body ? [digest] : []), date].join('');
  const key = `-----BEGIN PRIVATE KEY-----\n${device.privateKey}\n-----END PRIVATE KEY-----`;
  const signed = crypto.createSign('RSA-SHA256').update(values, 'utf8').sign(key, 'base64');
  const headers = { accept: '*/*', 'accept-charset': 'UTF-8', 'content-type': 'application/json', 'user-agent': vulcanConstants.ua, vapi: vulcanConstants.vapi, vdate: date, vdevicemodel: vulcanConstants.model, vos: vulcanConstants.os, vversioncode: vulcanConstants.versionCode, signature: `keyId="${device.fingerprint}",headers="${names.join(' ')}",algorithm="sha256withrsa",signature=Base64(sha256withrsa(${signed}))`, vcanonicalurl: canonical };
  if (body) headers.digest = `SHA-256=${digest}`; return headers;
}
async function vulcanRequest(device, url, body) {
  const bodyText = body == null ? null : JSON.stringify(body); const response = await fetch(url, { method: bodyText ? 'POST' : 'GET', headers: signatureHeaders(device, bodyText, url), ...(bodyText ? { body: bodyText } : {}), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`eduVULCAN zwrócił HTTP ${response.status}.`);
  const result = await response.json(); if (result.Status?.Code) throw new Error(result.Status.Message || `Błąd eduVULCAN ${result.Status.Code}.`); return result.Envelope;
}
function saveVulcan(session) { fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true }); fs.writeFileSync(SESSION_FILE, JSON.stringify(session), { mode: 0o600 }); }
function readVulcan() { try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch { return null; } }
function localOnly(req, res, next) {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).json({ error: 'Połączenie eduVULCAN działa tylko lokalnie na tym urządzeniu.' });
  next();
}
function apiBase(session, student) { return `${student.restUrl}/${student.raw.Unit.Symbol}`; }
function currentPeriod(student) { const p = student.raw.Periods?.find((x) => x.Current); if (!p) throw new Error('Nie udało się ustalić bieżącego okresu.'); return p.Id; }
async function pupilData(session, student, endpoint, extra = {}) {
  const params = new URLSearchParams({ unitId: String(student.raw.Unit.Id), pupilId: String(student.pupilId), periodId: String(currentPeriod(student)), pageSize: '500', ...Object.fromEntries(Object.entries(extra).map(([k,v]) => [k, String(v)])) });
  return vulcanRequest(session.device, `${apiBase(session, student)}/${endpoint}?${params}`);
}
function selectedStudent(session, pupilId) { const s = session?.students?.find((x) => x.pupilId === Number(pupilId)) || (session?.students?.length === 1 ? session.students[0] : null); if (!s) throw new Error('Wybierz ucznia z podłączonego konta.'); return s; }
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ['http://localhost', 'https://localhost', 'capacitor://localhost'].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
async function teacherDirectory() {
  try {
    return await cached('teacher-directory', async () => {
      const $list = cheerio.load(await fetchHtml(`${PLAN_ROOT}/lista.html`));
      const $staff = cheerio.load(await fetchHtml(STAFF_URL));
      const staff = [];
      $staff('tr').each((_i, row) => {
        const cells = $staff(row).children('td');
        if (cells.length !== 3) return;
        const words = clean($staff(cells[0]).text()).split(/\s+/);
        if (words.length < 2) return;
        staff.push({ surname: words[0], given: words.slice(1).join(' ') });
      });
      const byCode = {};
      const bySurname = {};
      for (const person of staff) bySurname[normalize(person.surname)] = person;
      $list('a[href*="plany/n"]').each((_i, element) => {
        const label = clean($list(element).text());
        const code = label.match(/\(([^)]+)\)\s*$/)?.[1];
        const shortName = label.replace(/\s*\([^)]+\)\s*$/, '');
        const match = shortName.match(/^[^.]+\.(.+)$/);
        if (!code || !match) return;
        const person = bySurname[normalize(match[1])];
        byCode[code] = person ? `${person.given} ${person.surname}` : shortName;
      });
      return { byCode, bySurname };
    });
  } catch { return { byCode: {}, bySurname: {} }; }
}
function fullName(shortName, directory) {
  const text = clean(shortName);
  if (directory.byCode[text]) return directory.byCode[text];
  const match = text.match(/^([A-ZĄĆĘŁŃÓŚŹŻ])\.\s*(.+)$/i);
  if (!match) return text;
  const person = directory.bySurname[normalize(match[2])];
  return person && person.given[0]?.toLocaleUpperCase('pl-PL') === match[1].toLocaleUpperCase('pl-PL')
    ? `${person.given} ${person.surname}` : text;
}

app.get('/api/classes', async (_req, res) => {
  try {
    const classes = await cached('classes', async () => {
      const $ = cheerio.load(await fetchHtml(`${PLAN_ROOT}/lista.html`));
      return $('a[href*="plany/o"]').map((_i, el) => ({
        name: clean($(el).text()).split(/\s+/)[0], href: $(el).attr('href')
      })).get().filter(x => /^\d+[A-Z]$/.test(x.name));
    });
    res.json({ classes });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/schedule', async (req, res) => {
  const className = String(req.query.class || '').toUpperCase();
  if (!/^\d+[A-Z]$/.test(className)) return res.status(400).json({ error: 'Nieprawidłowa klasa.' });
  try {
    const schedule = await cached(`schedule:${className}`, async () => {
      const $list = cheerio.load(await fetchHtml(`${PLAN_ROOT}/lista.html`));
      const link = $list('a[href*="plany/o"]').filter((_i, el) => clean($list(el).text()).split(/\s+/)[0] === className).first().attr('href');
      if (!link) throw new Error(`Nie znaleziono planu klasy ${className}.`);
      const $ = cheerio.load(await fetchHtml(new URL(link, `${PLAN_ROOT}/`).href));
      const table = $('table.tabela').first();
      if (!table.length) throw new Error('Format planu lekcji uległ zmianie.');
      const directory = await teacherDirectory();
      const lessons = [];
      table.find('tr').each((_ri, row) => {
        const cells = $(row).children('td');
        if (cells.length < 7) return;
        const number = clean($(cells[0]).text());
        const time = clean($(cells[1]).text()).replace(/\s+/g, '');
        if (!/^\d+$/.test(number) || !/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(time)) return;
        for (let day = 0; day < DAYS.length; day++) {
          const cell = $(cells[day + 2]);
          const entries = [];
          const segments = cell.html()?.split(/<br\s*\/?>/i) || [];
          for (const segment of segments) {
            const part = cheerio.load(`<div>${segment}</div>`);
            const subject = clean(part('.p').text());
            if (!subject) continue;
            entries.push({ subject, teacher: fullName(clean(part('a.n').text()), directory), room: clean(part('a.s').text()) });
          }
          if (entries.length) lessons.push({ day, dayName: DAYS[day], number: Number(number), time, entries });
        }
      });
      return { className, days: DAYS, lessons, source: PLAN_ROOT, updatedAt: new Date().toISOString() };
    });
    res.json(schedule);
  } catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/replacements', async (req, res) => {
  const className = String(req.query.class || '').toUpperCase();
  if (!/^\d+[A-Z]$/.test(className)) return res.status(400).json({ error: 'Nieprawidłowa klasa.' });
  try {
    const data = await cached('replacements', async () => {
      const $ = cheerio.load(await fetchHtml(REPLACEMENTS_URL), { decodeEntities: true });
      const directory = await teacherDirectory();
      const pageText = clean($.text());
      const dateText = pageText.match(/Zastępstwa\s+w\s+dniu\s+(\d{1,2}\.\d{1,2}\.\d{4})/i)?.[1] || '';
      const replacements = [];
      let teacher = '';
      $('tr').each((_i, row) => {
        const cells = $(row).children('td');
        if (cells.length === 1 && Number(cells.attr('colspan')) >= 4) { teacher = clean(cells.text()); return; }
        if (cells.length !== 4) return;
        const lessonRaw = clean($(cells[0]).text());
        if (!/^\d+$/.test(lessonRaw)) return;
        const description = clean($(cells[1]).text());
        if (!classPattern(className).test(description)) return;
        replacements.push({ lesson: Number(lessonRaw), description, substitute: fullName(clean($(cells[2]).text()), directory), note: clean($(cells[3]).text()), teacher: fullName(teacher, directory) });
      });
      return { dateText, replacements, source: REPLACEMENTS_URL, updatedAt: new Date().toISOString() };
    });
    res.json({ ...data, className, replacements: data.replacements.filter(x => classPattern(className).test(x.description)) });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/check', async (_req, res) => {
  const check = async (name, url) => {
    const started = Date.now();
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
      return { name, ok: response.status < 500, status: response.status, ms: Date.now() - started };
    } catch (error) {
      return { name, ok: false, status: null, ms: Date.now() - started, error: error?.cause?.code || error?.cause?.name || error.name };
    }
  };
  const services = await Promise.all([
    check('plan', `${PLAN_ROOT}/lista.html`),
    check('replacements', REPLACEMENTS_URL),
    check('vulcan', VULCAN_URL)
  ]);
  res.json({ services, checkedAt: new Date().toISOString(), accountVerified: false });
});

app.get('/api/vulcan/status', localOnly, (_req, res) => {
  const session = readVulcan();
  res.json({ connected: Boolean(session), students: session?.students?.map(({ pupilId, firstName, lastName, className, unitName }) => ({ pupilId, firstName, lastName, className, unitName })) || [] });
});
app.post('/api/vulcan/bootstrap', localOnly, async (req, res) => {
  try {
    const ap = parseAp(String(req.body?.ap || ''));
    const device = await makeDevice();
    if (ap.Tokens.some((t) => { const exp = Number(decodeToken(t).exp); return exp && exp * 1000 < Date.now(); })) throw new Error('Token wygasł (ważny ok. godziny). Zaloguj się do eduVULCAN ponownie i wklej świeże dane.');
    const tenantNames = [...new Set(ap.Tokens.map((t) => decodeToken(t).tenant).filter(Boolean))];
    if (!tenantNames.length) throw new Error('Token nie zawiera danych szkoły. Zaloguj się ponownie do eduVULCAN.');
    if (tenantNames.some((tenant) => !/^[a-z0-9_-]+$/i.test(tenant))) throw new Error('Odpowiedź zawiera nieprawidłowy identyfikator szkoły.');
    const students = [], restUrls = [];
    for (const tenant of tenantNames) {
      const host = tenant.toLowerCase() === 'lublin' ? 'https://uonetplus-komunikacja.edu.lublin.eu' : 'https://lekcjaplus.vulcan.net.pl';
      const restUrl = `${host}/${tenant}`;
      const body = { AppName: vulcanConstants.app, AppVersion: vulcanConstants.version, Envelope: { OS: vulcanConstants.os, DeviceModel: vulcanConstants.model, Certificate: device.certificate, CertificateType: 'X509', CertificateThumbprint: device.fingerprint, Tokens: ap.Tokens, selfIdentifier: crypto.randomUUID() }, NotificationToken: '', API: 1, RequestId: crypto.randomUUID(), Timestamp: Math.floor(Date.now() / 1000), TimestampFormatted: new Date().toISOString().replace('T', ' ').slice(0,19) };
      await vulcanRequest(device, `${restUrl}/api/mobile/register/jwt`, body);
      const pupils = await vulcanRequest(device, `${restUrl}/api/mobile/register/hebe?mode=2`);
      for (const raw of pupils || []) students.push({ restUrl, pupilId: raw.Pupil.Id, firstName: raw.Pupil.FirstName, lastName: raw.Pupil.Surname, className: raw.ClassDisplay, unitName: raw.Unit.DisplayName || raw.Unit.Name, raw });
      restUrls.push(restUrl);
    }
    if (!students.length) throw new Error('Konto połączono, ale nie znaleziono uczniów.');
    const session = { device, students, restUrls, createdAt: new Date().toISOString() };
    saveVulcan(session);
    res.json({ connected: true, students: session.students.map(({ pupilId, firstName, lastName, className, unitName }) => ({ pupilId, firstName, lastName, className, unitName })) });
  } catch (error) { const net = error.message === 'fetch failed'; res.status(net ? 502 : 400).json({ error: net ? 'Brak połączenia z serwerem eduVULCAN. Sprawdź internet i spróbuj ponownie.' : error.message || 'Nie udało się połączyć z eduVULCAN.' }); }
});
app.get('/api/vulcan/data/:kind', localOnly, async (req, res) => {
  try {
    const session = readVulcan(); if (!session) return res.status(409).json({ error: 'Najpierw połącz konto eduVULCAN.' });
    const student = selectedStudent(session, req.query.pupilId);
    const kind = req.params.kind;
    const endpoint = { grades: 'api/mobile/grade/byPupil', homework: 'api/mobile/homework/byPupil', exams: 'api/mobile/exam/byPupil', schedule: 'api/mobile/schedule/byPupil', changes: 'api/mobile/schedule/changes/byPupil', attendance: 'api/mobile/lesson/byPupil', messages: 'api/mobile/messages/received/byBox', lucky: 'api/mobile/school/lucky' }[kind];
    if (!endpoint) return res.status(404).json({ error: 'Nieznany rodzaj danych.' });
    const extra = {};
    if (['homework', 'exams', 'schedule', 'changes', 'attendance'].includes(kind)) {
      const from = String(req.query.from || new Date().toISOString().slice(0,10)), to = String(req.query.to || from);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return res.status(400).json({ error: 'Nieprawidłowy zakres dat.' });
      extra.dateFrom = from; extra.dateTo = to;
    }
    let data;
    if (kind === 'lucky') {
      const day = new Date().toISOString().slice(0, 10);
      const params = new URLSearchParams({ constituentId: String(student.raw.ConstituentUnit?.Id ?? student.raw.Unit?.Id ?? ''), day });
      const lucky = await vulcanRequest(session.device, `${apiBase(session, student)}/${endpoint}?${params}`);
      return res.json({ data: lucky, pupilNumber: student.raw.Journal?.PupilNumber ?? null });
    }
    if (kind === 'messages') {
      const box = student.raw.MessageBox?.GlobalKey;
      if (!box) throw new Error('Skrzynka wiadomości nie jest dostępna na koncie ucznia.');
      const params = new URLSearchParams({ box, pupilId: String(student.pupilId), folder: '1', lastId: '-2147483648', pageSize: '500' });
      data = await vulcanRequest(session.device, `${apiBase(session, student)}/${endpoint}?${params}`);
    } else data = await pupilData(session, student, endpoint, extra);
    res.json({ student: { pupilId: student.pupilId, firstName: student.firstName, lastName: student.lastName, className: student.className }, data });
  } catch (error) { res.status(502).json({ error: error.message || 'Błąd połączenia z eduVULCAN.' }); }
});
app.delete('/api/vulcan/session', localOnly, (_req, res) => { try { fs.unlinkSync(SESSION_FILE); } catch {} res.json({ connected: false }); });

const UPDATE_REPO = process.env.MOJ_PLAN_REPO || 'Diskoza/Edziennik-ZSE';
const PLATFORM = process.env.MOJ_PLAN_DESKTOP ? 'windows' : process.env.MOJ_PLAN_MOBILE ? 'android' : 'web';
const DATA_DIR = process.env.MOJ_PLAN_DATA_DIR || path.join(root, 'data');
const TOKEN_FILE = path.join(DATA_DIR, 'github-token.json');
const APK_FILE = path.join(DATA_DIR, 'update.apk');
const readToken = () => { try { const t = String(JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).token || ''); if (t) return t; } catch {} try { return String(JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8')).token || ''); } catch { return ''; } };
const ghHeaders = (extra = {}) => { const token = readToken(); return { Accept: 'application/vnd.github+json', 'User-Agent': 'moj-plan-updater', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }; };
function buildInfo() { try { return JSON.parse(fs.readFileSync(path.join(root, 'build-info.json'), 'utf8')); } catch { return { build: 0 }; } }
async function latestRelease() {
  const response = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: ghHeaders() });
  if (response.status === 404 || response.status === 401) throw new Error(readToken() ? 'Klucz GitHub nie ma dostępu do repozytorium (potrzebne: Contents – Read-only).' : 'Dodaj klucz GitHub (tylko odczyt), bo repozytorium jest prywatne.');
  if (!response.ok) throw new Error(`GitHub odpowiedział ${response.status}.`);
  return response.json();
}
const assetFor = (release) => {
  const pattern = PLATFORM === 'windows' ? /^Moj-Plan-Setup-.*\.exe$/i : PLATFORM === 'android' ? /arm64.*\.apk$/i : null;
  const asset = pattern && (release.assets || []).find((a) => pattern.test(a.name));
  return asset ? { name: asset.name, api: asset.url, size: asset.size } : null;
};
async function downloadAsset(asset, file) {
  const { Readable } = await import('node:stream'); const { pipeline } = await import('node:stream/promises');
  const response = await fetch(asset.api, { headers: ghHeaders({ Accept: 'application/octet-stream' }), redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Pobieranie nie powiodło się (${response.status}).`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file));
}
app.get('/api/update/check', localOnly, async (_req, res) => {
  const current = Number(buildInfo().build) || 0; const hasToken = Boolean(readToken());
  try {
    const release = await latestRelease(); const latest = Number(String(release.tag_name || '').replace(/\D+/g, '')) || 0; const asset = assetFor(release);
    res.json({ platform: PLATFORM, current, latest, tag: release.tag_name, hasToken, available: latest > current && Boolean(asset), pending: latest > current && !asset, asset: asset && { name: asset.name, size: asset.size }, notes: String(release.body || '').slice(0, 600) });
  } catch (error) { res.status(502).json({ platform: PLATFORM, current, hasToken, error: error.message }); }
});
app.post('/api/update/token', localOnly, async (req, res) => {
  const token = String(req.body?.token || '').trim(); if (!/^[A-Za-z0-9_\-]{20,255}$/.test(token)) return res.status(400).json({ error: 'To nie wygląda na klucz GitHub.' });
  const check = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'moj-plan-updater', Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!check) return res.status(502).json({ error: 'Brak połączenia z GitHubem.' }); if (!check.ok) return res.status(400).json({ error: `Klucz odrzucony (${check.status}). Potrzebny dostęp Contents – Read-only do ${UPDATE_REPO}.` });
  fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token }), { mode: 0o600 }); res.json({ saved: true });
});
app.delete('/api/update/token', localOnly, (_req, res) => { try { fs.unlinkSync(TOKEN_FILE); } catch {} res.json({ saved: false }); });
app.post('/api/update/install', localOnly, async (_req, res) => {
  try {
    const release = await latestRelease(); const asset = assetFor(release); if (!asset) throw new Error('Instalator nie jest jeszcze gotowy.');
    if (PLATFORM === 'windows') {
      const os = await import('node:os'); const { spawn } = await import('node:child_process'); const file = path.join(os.tmpdir(), asset.name);
      await downloadAsset(asset, file); spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
      res.json({ started: true }); setTimeout(() => { if (typeof globalThis.__mojQuit === 'function') globalThis.__mojQuit(); }, 900); return;
    }
    if (PLATFORM === 'android') { await downloadAsset(asset, APK_FILE); return res.json({ ready: true, size: fs.statSync(APK_FILE).size }); }
    res.status(400).json({ error: 'Instalacja z aplikacji działa na Windows i Androidzie.' });
  } catch (error) { res.status(502).json({ error: error.message || 'Aktualizacja nie powiodła się.' }); }
});
app.get('/api/update/apk', localOnly, (_req, res) => { if (!fs.existsSync(APK_FILE)) return res.status(404).json({ error: 'Brak pobranej aktualizacji.' }); res.setHeader('Content-Type', 'application/vnd.android.package-archive'); res.setHeader('Content-Disposition', 'attachment; filename="moj-plan-update.apk"'); fs.createReadStream(APK_FILE).pipe(res); });
app.get('/api/version', localOnly, (_req, res) => { const { token, ...info } = buildInfo(); res.json({ platform: PLATFORM, ...info }); });

if (!process.env.MOJ_PLAN_MOBILE) app.use(express.static(root));
app.listen(PORT, '127.0.0.1', () => console.log(`Mój plan działa lokalnie: http://localhost:${PORT}`));
