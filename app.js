const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const MOBILE_API = location.hostname === 'localhost' && !location.port ? 'http://127.0.0.1:4173' : '';
async function apiFetch(input, options) { const url = MOBILE_API && String(input).startsWith('/api/') ? `${MOBILE_API}${input}` : input; if (!MOBILE_API) return fetch(url, options); let last; for (let i=0;i<90;i++) { try { const response=await fetch(url,options); if(response.status!==404)return response; last=new Error('Lokalny adapter jeszcze się uruchamia.'); } catch(error){last=error;} await new Promise(resolve=>setTimeout(resolve,350)); } throw last || new Error('Lokalny adapter nie uruchomił się.'); }
const KEYS = { profiles: 'moj-plan-profiles-v1', active: 'moj-plan-active-profile-v1', theme: 'moj-plan-theme-v1', cache: 'moj-plan-data-cache-v1' };
const DAYS = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];
const DAY_SHORT = ['PN', 'WT', 'ŚR', 'CZ', 'PT'];
const MAX_WEEKS = 8;
const VULCAN_CACHE_TTL = 15 * 60_000;
const STUDENT_KEY = 'moj-plan-vulcan-pupil-v1';
const ICONS = {
  home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  tasks:'<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="m8 9 1.5 1.5L12 8M8 15l1.5 1.5L12 14M14.5 9.5H17M14.5 15.5H17"/>',
  grades:'<path d="M5 20V12M12 20V5M19 20V9"/><path d="M3 20h18"/>',
  messages:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7.5 8 6 8-6"/>',
  attendance:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  settings:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  more:'<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  left:'<path d="m15 5-7 7 7 7"/>',
  right:'<path d="m9 5 7 7-7 7"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.5l1.7-2"/><path d="M20 20v-4.5h-4.5"/>',
  edit:'<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17l-1 3Z"/><path d="m14.5 7.5 3 3"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  palette:'<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.1-.4-1.2.3-2.4 1.6-2.4H17a3.5 3.5 0 0 0 3.5-3.5C20.5 7 16.8 3.5 12 3.5Z"/><circle cx="7.8" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor"/><circle cx="15" cy="7.8" r="1" fill="currentColor"/>'
};
const icon = (name) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
function hydrateIcons(root = document) { root.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); }); }
hydrateIcons();

const state = { classes: [], schedule: null, replacements: null, vulcanStudent: null, vulcanGrades: null, day: Math.min(Math.max(new Date().getDay() - 1, 0), 4), weekOffset: 0 };
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const readProfiles = () => { try { const v = JSON.parse(localStorage.getItem(KEYS.profiles) || '[]'); return Array.isArray(v) ? v.filter((p) => p?.id && p.className).map((p) => ({ id: p.id, className: p.className, group: Number(p.group) || 0, grades: Array.isArray(p.grades) ? p.grades : [] })) : []; } catch { return []; } };
const writeProfiles = (profiles) => localStorage.setItem(KEYS.profiles, JSON.stringify(profiles.map(({ id, className, group, grades }) => ({ id, className, group: Number(group) || 0, grades }))));
function readDataCache(key) { try { return JSON.parse(localStorage.getItem(KEYS.cache) || '{}')[key] || null; } catch { return null; } }
function writeDataCache(key, value) { try { const cache = JSON.parse(localStorage.getItem(KEYS.cache) || '{}'); cache[key] = value; localStorage.setItem(KEYS.cache, JSON.stringify(cache)); } catch {  } }
function clearVulcanCache() { try { const cache = JSON.parse(localStorage.getItem(KEYS.cache) || '{}'); for (const key of Object.keys(cache)) if (key.startsWith('vulcan:')) delete cache[key]; localStorage.setItem(KEYS.cache, JSON.stringify(cache)); } catch { localStorage.removeItem(KEYS.cache); } }
const currentProfile = () => readProfiles().find((p) => p.id === localStorage.getItem(KEYS.active));
const readGrades = (profile = currentProfile()) => profile?.grades || [];
const saveGrades = (grades) => { const profiles = readProfiles(); const i = profiles.findIndex((p) => p.id === localStorage.getItem(KEYS.active)); if (i < 0) return; profiles[i].grades = grades; writeProfiles(profiles); };
const minutes = (value) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const mondayOf = (date) => { const monday = new Date(date); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7); monday.setHours(0, 0, 0, 0); return monday; };
const weekMonday = () => { const now = new Date(); const date = mondayOf(now); if (now.getDay() === 0 || now.getDay() === 6) date.setDate(date.getDate() + 7); date.setDate(date.getDate() + state.weekOffset * 7); return date; };
const selectedDate = (day = state.day) => { const date = weekMonday(); date.setDate(date.getDate() + day); return date; };
const dateLabel = (date, options = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('pl-PL', options).format(date);
const replacementDate = (dateText = '') => { const m = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (!m) return null; const date = new Date(+m[3], +m[2] - 1, +m[1]); date.setHours(0, 0, 0, 0); return date; };

function setActiveProfile(profile) { localStorage.setItem(KEYS.active, profile.id); renderProfile(); renderGrades(); renderGradePreview(); renderVulcanGradeStats(); renderLocalTasks(); renderWeek(); renderSchedule(); loadSchoolData(); }
function renderProfile() {
  const profile = currentProfile(); const student = state.vulcanStudent;
  $('#avatar').textContent = profile?.className || '?'; $('#profile-label').textContent = profile?.className || 'Klasa';
  $('#greeting').textContent = student ? [student.firstName, student.lastName].filter(Boolean).join(' ') : 'Dzień dobry!';
  $('#date-caption').textContent = profile ? `Klasa ${profile.className}${profile.group ? ` · grupa ${profile.group}` : ''} · plan lekcji, zastępstwa i dane z eduVULCAN.` : 'Plan lekcji i ważne informacje szkolne w jednym miejscu.';
  $('.profile-menu')?.remove();
}
function openProfileDialog() {
  $('#profile-dialog-title').textContent = currentProfile() ? 'Dodaj lub wybierz klasę' : 'Wybierz klasę';
  $('#class-select').value = currentProfile()?.className || state.classes[0]?.name || '';
  $('#group-select').value = String(currentProfile()?.group || 0);
  $('#profile-dialog').showModal();
}
const fieldNames = { subject: 'Przedmiot', subjectname: 'Przedmiot', subjectdisplayname: 'Przedmiot', name: 'Nazwa', lesson: 'Lekcja', lessonnumber: 'Numer lekcji', grade: 'Ocena', gradevalue: 'Ocena', value: 'Ocena', symbol: 'Ocena', date: 'Data', dateat: 'Data zajęć', sentat: 'Wysłano', createdat: 'Dodano', eventdate: 'Data', category: 'Forma', categoryname: 'Forma', description: 'Opis', comment: 'Opis', comments: 'Opis', note: 'Opis', teacher: 'Wystawił', teachername: 'Wystawił', weight: 'Waga', deadline: 'Termin', deadlineat: 'Termin', title: 'Temat', content: 'Treść', homework: 'Treść', starttime: 'Godzina', time: 'Godzina', status: 'Status', type: 'Rodzaj', period: 'Okres', semester: 'Okres', room: 'Sala', code: 'Kod', creator: 'Nauczyciel', isanswerrequired: 'Wymaga odpowiedzi', isexcused: 'Usprawiedliwiona', isabsent: 'Nieobecność', present: 'Obecność', attendance: 'Frekwencja', attendancepercent: 'Frekwencja' };
function recordsOf(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return value == null ? [] : [{ value }];
  for (const key of ['Items', 'Results', 'Grades', 'Homework', 'Exams', 'Lessons', 'Attendance', 'Data', 'Rows']) if (Array.isArray(value[key])) return value[key];
  const list = Object.values(value).find((v) => Array.isArray(v) && v.some((x) => x && typeof x === 'object'));
  return list || [value];
}
function flattenRecord(record, prefix = '', out = []) {
  if (!record || typeof record !== 'object') { if (record != null && record !== '') out.push([prefix || 'Dane', record]); return out; }
  for (const [key, value] of Object.entries(record)) {
    const lower = key.toLowerCase(); const normalized = lower.replace(/[\s_-]/g, ''); if (/^(id.*|.*id|.*key|tenant|raw|contentraw|attachments?|didactics|position|modifiedat|modifier|pupil|calculatepresence|unit|school)$/.test(normalized) || value == null || value === '') continue;
    if ((normalized === 'name' || normalized === 'surname') && prefix === 'Wystawił') continue;
    const label = normalized === 'displayname' && prefix ? prefix : fieldNames[normalized] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toLocaleUpperCase('pl-PL'));
    if (Array.isArray(value)) { const scalar = value.filter((x) => typeof x !== 'object' && x != null); if (scalar.length) out.push([label, scalar.join(', ')]); else value.forEach((x) => flattenRecord(x, label, out)); }
    else if (typeof value === 'object') {
      const first = value.FirstName || value.firstName || value.Name || value.name || '';
      const last = value.Surname || value.surname || '';
      const display = value.DisplayName || value.displayName || (first && last ? `${first} ${last}` : first);
      if (display) out.push([label, display]); else flattenRecord(value, label, out);
    }
    else { const isIsoDate = typeof value === 'string' && /^\d{4}-\d\d-\d\d(?:T|$)/.test(value); const date = isIsoDate ? new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', ...(value.includes('T') ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value)) : typeof value === 'boolean' ? (value ? 'Tak' : 'Nie') : typeof value === 'string' && /<[a-z][\s\S]*>/i.test(value) ? new DOMParser().parseFromString(value, 'text/html').body.textContent.replace(/\s+/g, ' ').trim() : value; out.push([label, date]); }
  }
  return out;
}
function displayVulcanData(host, value, kind) {
  if (kind === 'messages') return displayVulcanMessages(host, value);
  if (kind === 'attendance') return displayVulcanAttendance(host, value);
  if (kind === 'homework' || kind === 'exams') return displayVulcanTasks(host,value,kind);
  if (kind === 'grades') { state.vulcanGrades = recordsOf(value); renderGradePreview(); renderVulcanGradeStats(); return displayVulcanGrades(host,state.vulcanGrades); }
  host.replaceChildren(); const records = recordsOf(value).filter((x) => x && typeof x === 'object');
  if (!records.length || records.every((r) => !flattenRecord(r).length)) { host.textContent = kind === 'grades' ? 'Brak ocen w pobranym okresie.' : kind === 'homework' ? 'Brak zadań domowych w wybranym okresie.' : kind === 'exams' ? 'Brak zaplanowanych sprawdzianów.' : 'Brak wpisów frekwencji w tym okresie.'; return; }
  for (const record of records.slice(0, 24)) {
    const fields = flattenRecord(record).filter(([label]) => !(['homework', 'exams'].includes(kind) && label === 'Dodano')); if (!fields.length) continue;
    const card = document.createElement('div'); card.className = `vulcan-record ${kind === 'grades' ? 'grade-record' : ''}`;
    const prominent = fields.find(([label]) => ['Przedmiot', 'Temat', 'Lekcja'].includes(label));
    if (prominent) { const title = document.createElement('strong'); title.className = 'vulcan-record-title'; title.textContent = String(prominent[1]); card.append(title); }
    const list = document.createElement('div'); list.className = 'vulcan-record-fields';
    for (const [label, value] of fields) {
      if (prominent?.[0] === label && String(prominent[1]) === String(value)) continue;
      const line = document.createElement('div'); line.className = label === 'Ocena' ? 'vulcan-grade-value' : '';
      const key = document.createElement('span'); key.textContent = label;
      const val = document.createElement('span'); val.textContent = String(value);
      line.append(key, val); list.append(line);
    }
    card.append(list); host.append(card);
  }
  if (records.length > 24) { const more = document.createElement('small'); more.className = 'vulcan-more'; more.textContent = `Pozostałe wpisy: ${records.length - 24}`; host.append(more); }
}
function findNested(record, names) {
  if (!record || typeof record !== 'object') return undefined;
  for (const [key, value] of Object.entries(record)) if (names.includes(key.toLowerCase().replace(/[\s_-]/g, ''))) return value;
  for (const value of Object.values(record)) { const found = findNested(value, names); if (found !== undefined) return found; }
}
function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'object') { const first=value.FirstName||value.firstName||''; const last=value.Surname||value.surname||''; return String(value.DisplayName || value.displayName || (first&&last?`${first} ${last}`:'') || value.Name || value.name || ''); }
  return String(value);
}
function displayDate(value) { if (!value) return ''; const date=new Date(value); return Number.isNaN(+date) ? String(value) : dateLabel(date,{day:'numeric',month:'short',year:date.getFullYear()!==new Date().getFullYear()?'numeric':undefined}); }
function cleanText(value) { return value == null ? '' : new DOMParser().parseFromString(String(value),'text/html').body.textContent.replace(/\s+/g,' ').trim(); }
function displayVulcanTasks(host,value,kind) {
  host.replaceChildren(); const items=recordsOf(value).filter(x=>x&&typeof x==='object');
  if(!items.length){host.textContent=kind==='homework'?'Brak prac domowych.':'Brak zaplanowanych sprawdzianów.';return;}
  items.sort((a,b)=>new Date(findNested(a,['deadlineat','dateat','eventdate'])||0)-new Date(findNested(b,['deadlineat','dateat','eventdate'])||0));
  for(const item of items){const subject=textValue(findNested(item,['subjectname','subjectdisplayname','subject']))||(kind==='homework'?'Praca domowa':'Sprawdzian');const title=cleanText(textValue(findNested(item,['content','title','name','description'])));const type=cleanText(textValue(findNested(item,['type','category','categoryname'])));const teacher=textValue(findNested(item,['creator','teachername','teacher']));const due=displayDate(findNested(item,['deadlineat','deadline','dateat','eventdate']));const card=document.createElement('article');card.className='vulcan-task-record';const top=document.createElement('div');top.className='vulcan-task-top';const sub=document.createElement('strong');sub.textContent=subject;const badge=document.createElement('span');badge.textContent=kind==='homework'?'Zadanie':type||'Sprawdzian';top.append(sub,badge);card.append(top);if(title){const detail=document.createElement('p');detail.textContent=title;card.append(detail);}const meta=[due?`Termin: ${due}`:'',teacher].filter(Boolean);if(meta.length){const foot=document.createElement('small');foot.textContent=meta.join(' · ');card.append(foot);}host.append(card);}
}
function gradeRequiresRetake(record) { const grade=numberGrade(record); const source=textValue(findNested(record,['type','category','categoryname','column','comment'])); return Boolean(grade && grade.value < 2 && grade.value > 0 && /sprawdzian|praca klasowa|test|kontrol/i.test(source)); }
function displayVulcanGrades(host,records) {
  host.replaceChildren(); const groups=new Map();
  for(const record of records){const grade=numberGrade(record);if(!grade)continue;const subject=textValue(findNested(record,['subjectname','subjectdisplayname','subject']))||'Inne';const list=groups.get(subject)||[];list.push({record,grade});groups.set(subject,list);}
  if(!groups.size){host.textContent='Brak ocen w pobranym okresie.';return;}
  for(const [subject,items] of groups){const avg=items.reduce((sum,x)=>sum+x.grade.value,0)/items.length;const card=document.createElement('section');card.className='vulcan-subject-card';const heading=document.createElement('div');heading.className='vulcan-subject-heading';const title=document.createElement('strong');title.textContent=subject;const mean=document.createElement('span');mean.textContent=`Średnia ${fmtAverage(avg)}`;heading.append(title,mean);card.append(heading);const marks=document.createElement('div');marks.className='vulcan-marks';for(const item of items){const date=displayDate(findNested(item.record,['createdat','dateat','date']));const type=textValue(findNested(item.record,['type','category','categoryname','column']))||'Ocena';const note=cleanText(textValue(findNested(item.record,['comment','description','note'])));const retake=gradeRequiresRetake(item.record);const chip=document.createElement('div');chip.className=`vulcan-mark ${item.grade.value<2?'mark-fail':''} ${retake?'mark-retake':''}`;const number=document.createElement('strong');number.textContent=item.grade.label;const caption=document.createElement('small');caption.textContent=[retake?'Do poprawy':type,date].filter(Boolean).join(' · ');chip.append(number,caption);if(note){const tooltip=document.createElement('span');tooltip.textContent=note;chip.append(tooltip);}marks.append(chip);}card.append(marks);host.append(card);}
}
function displayVulcanMessages(host, value) {
  host.replaceChildren(); const messages = recordsOf(value).filter((m) => m && typeof m === 'object');
  messages.sort((a, b) => new Date(findNested(b, ['sentat','date','createdat']) || 0) - new Date(findNested(a, ['sentat','date','createdat']) || 0));
  if (!messages.length) { host.textContent = 'Brak wiadomości.'; return; }
  for (const message of messages.slice(0, 8)) {
    const title = textValue(findNested(message, ['title','subject','topic','name'])) || 'Wiadomość';
    const rawBody = textValue(findNested(message, ['content','body','message','text']));
    const body = new DOMParser().parseFromString(rawBody, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
    const sent = findNested(message, ['sentat','date','createdat']);
    const card = document.createElement('div'); card.className = 'message-record';
    const heading = document.createElement('strong'); heading.textContent = title; card.append(heading);
    if (sent) { const when = document.createElement('small'); when.textContent = dateLabel(new Date(sent), { day: 'numeric', month: 'short', year: 'numeric' }); card.append(when); }
    if (body) { const excerpt = document.createElement('p'); excerpt.textContent = body.length > 260 ? `${body.slice(0,260)}…` : body; card.append(excerpt); }
    host.append(card);
  }
  if (messages.length > 8) { const more = document.createElement('small'); more.className = 'vulcan-more'; more.textContent = `Pokazano 8 z ${messages.length} wiadomości.`; host.append(more); }
}
function displayVulcanAttendance(host, value) {
  host.replaceChildren(); const records = recordsOf(value).filter((r) => r && typeof r === 'object');
  if (!records.length) { host.textContent = 'Brak wpisów frekwencji w tym okresie.'; return; }
  const flag = (v) => v === true || v === 1 || ['true','1','tak','yes'].includes(String(v).toLowerCase());
  const absent = records.filter((r) => flag(findNested(r, ['absence','isabsent']))).length;
  const late = records.filter((r) => flag(findNested(r, ['late','islate']))).length;
  const summary = document.createElement('div'); summary.className = 'attendance-summary';
  for (const [label, amount] of [['Obecności', records.length - absent], ['Nieobecności', absent], ['Spóźnienia', late]]) { const item = document.createElement('div'); item.innerHTML = `<strong>${amount}</strong><small>${label}</small>`; summary.append(item); }
  host.append(summary);
  records.sort((a,b) => new Date(findNested(b,['dayat','date','createdat']) || 0) - new Date(findNested(a,['dayat','date','createdat']) || 0));
  const list = document.createElement('div'); list.className = 'attendance-recent';
  for (const record of records.slice(0, 5)) { const fields = flattenRecord(record); const title = fields.find(([key]) => ['Przedmiot','Lekcja'].includes(key)); const date = fields.find(([key]) => key === 'Data'); const status = flag(findNested(record,['absence','isabsent'])) ? 'Nieobecność' : flag(findNested(record,['late','islate'])) ? 'Spóźnienie' : 'Obecność'; const row = document.createElement('div'); row.className = 'attendance-row'; const left = document.createElement('span'); left.textContent = [date?.[1], title?.[1]].filter(Boolean).join(' · ') || 'Lekcja'; const right = document.createElement('strong'); right.textContent = status; row.append(left,right); list.append(row); }
  host.append(list);
}
async function loadVulcanStatus() {
  try {
    const response = await apiFetch('/api/vulcan/status'); const status = await response.json();
    const select = $('#vulcan-student'); select.innerHTML = status.students.length ? status.students.map((s) => `<option value="${s.pupilId}">${escapeHtml([s.firstName, s.lastName].filter(Boolean).join(' '))} · ${escapeHtml(s.className || s.unitName || '')}</option>`).join('') : '<option value="">Najpierw połącz konto</option>';
    select.disabled = !status.students.length; $('#vulcan-disconnect').hidden = !status.connected;
    const stored = localStorage.getItem(STUDENT_KEY); if (stored && status.students.some((s) => String(s.pupilId) === stored)) select.value = stored;
    state.vulcanStudent = status.students.find((s) => String(s.pupilId) === select.value) || null; if (state.vulcanStudent) writeDataCache('vulcan:student', state.vulcanStudent); renderProfile();
    if (status.connected) { localStorage.setItem(STUDENT_KEY, select.value); loadVulcanData(); }
    else { $('#vulcan-grades').textContent = 'Połącz konto eduVULCAN, aby wyświetlić oceny.'; $('#vulcan-homework').textContent = 'Połącz konto eduVULCAN, aby pobrać swoje dane.'; $('#vulcan-messages').textContent = 'Wiadomości pojawią się po połączeniu.'; $('#vulcan-attendance').textContent = 'Dane frekwencji pojawią się po połączeniu.'; }
    return status;
  } catch { const student = readDataCache('vulcan:student'); if (student) { state.vulcanStudent = student; renderProfile(); for (const [key, host, kind] of [['grades','#vulcan-grades','grades'],['homework','#vulcan-homework','homework'],['attendance','#vulcan-attendance','attendance'],['messages','#vulcan-messages','messages'],['exams','#vulcan-homework','exams']]) { const saved = readDataCache(`vulcan:${student.pupilId}:${key}`); if (saved) { if (kind === 'exams') { const title = document.createElement('strong'); title.className = 'vulcan-subheading'; title.textContent = 'Sprawdziany · zapisane'; const section = document.createElement('div'); section.className = 'vulcan-subsection'; $(host).append(title, section); displayVulcanData(section, saved.data, kind); } else displayVulcanData($(host), saved.data, kind); } } } return { connected: false, students: [] }; }
}
async function loadVulcanData(force = false) {
  const status = await apiFetch('/api/vulcan/status').then((r) => r.json()).catch(() => ({ connected: false }));
  if (!status.connected) return;
  const pupilId = $('#vulcan-student').value || localStorage.getItem(STUDENT_KEY) || '';
  const today = new Date(); const schoolYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1; const from = new Date(schoolYear, 8, 1); const to = new Date(schoolYear + 1, 6, 31);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const q = `pupilId=${encodeURIComponent(pupilId)}&from=${iso(from)}&to=${iso(to)}`;
  const jobs = [['grades','/api/vulcan/data/grades'], ['homework','/api/vulcan/data/homework'], ['attendance','/api/vulcan/data/attendance'], ['messages','/api/vulcan/data/messages']];
  await Promise.all(jobs.map(async ([key, url]) => {
    const target = key === 'grades' ? $('#vulcan-grades') : key === 'attendance' ? $('#vulcan-attendance') : key === 'messages' ? $('#vulcan-messages') : $('#vulcan-homework');
    const cacheKey = `vulcan:${pupilId}:${key}`; const saved = readDataCache(cacheKey); if (saved) displayVulcanData(target, saved.data, key); if (saved && !force && Date.now() - saved.savedAt < VULCAN_CACHE_TTL) return;
    try { const response = await apiFetch(`${url}?${q}`); const result = await response.json(); if (!response.ok) throw new Error(result.error); writeDataCache(cacheKey, { data: result.data, savedAt: Date.now() }); displayVulcanData(target, result.data, key); }
    catch (error) { if (!saved) target.textContent = error.message || 'Nie udało się pobrać danych.'; }
  }));
  const examCacheKey = `vulcan:${pupilId}:exams`; const savedExams = readDataCache(examCacheKey);
  if (savedExams && !force && Date.now() - savedExams.savedAt < VULCAN_CACHE_TTL) { const target = $('#vulcan-homework'); const heading = document.createElement('strong'); heading.className = 'vulcan-subheading'; heading.textContent = 'Sprawdziany'; const section = document.createElement('div'); section.className = 'vulcan-subsection'; target.append(heading, section); displayVulcanData(section, savedExams.data, 'exams'); return; }
  try { let data; if (savedExams) data = savedExams.data; const response = await apiFetch(`/api/vulcan/data/exams?${q}`); const result = await response.json(); if (!response.ok) throw new Error(result.error); data = result.data; writeDataCache(examCacheKey, { data, savedAt: Date.now() }); const target = $('#vulcan-homework'); const heading = document.createElement('strong'); heading.className = 'vulcan-subheading'; heading.textContent = 'Sprawdziany'; const section = document.createElement('div'); section.className = 'vulcan-subsection'; target.append(heading, section); displayVulcanData(section, data, 'exams'); } catch (error) { const target = $('#vulcan-homework'); if (savedExams) { const heading = document.createElement('strong'); heading.className = 'vulcan-subheading'; heading.textContent = 'Sprawdziany · zapisane'; const section = document.createElement('div'); section.className = 'vulcan-subsection'; target.append(heading, section); displayVulcanData(section, savedExams.data, 'exams'); } else { const note = document.createElement('p'); note.textContent = `Sprawdziany: ${error.message}`; target.append(note); } }
}
function toggleProfileMenu() {
  if ($('.profile-menu')) { $('.profile-menu').remove(); return; }
  const profiles = readProfiles(); const active = localStorage.getItem(KEYS.active); const menu = document.createElement('div'); menu.className = 'profile-menu';
  menu.innerHTML = profiles.map((p) => `<button class="${p.id === active ? 'active' : ''}" type="button" data-profile-id="${escapeHtml(p.id)}"><span class="profile-avatar">${escapeHtml(p.className)}</span><span>Klasa ${escapeHtml(p.className)}${p.group ? ` · grupa ${p.group}` : ''}</span></button>`).join('') + '<button class="menu-add" type="button" id="menu-add-profile">＋ Dodaj klasę</button><button type="button" id="menu-settings">⚙ Personalizuj ekran główny</button><button type="button" id="menu-attendance">◷ Frekwencja</button>';
  $('.topbar').append(menu);
  menu.querySelectorAll('[data-profile-id]').forEach((b) => b.addEventListener('click', () => { const p = readProfiles().find((item) => item.id === b.dataset.profileId); if (p) setActiveProfile(p); }));
  $('#menu-add-profile').addEventListener('click', openProfileDialog);
  $('#menu-settings').addEventListener('click', () => { menu.remove(); switchView('settings'); });
  $('#menu-attendance').addEventListener('click', () => { menu.remove(); switchView('attendance'); });
  document.addEventListener('click', function close(e) { if (!menu.contains(e.target) && !$('#profile-button').contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } });
}
async function loadClasses() {
  try {
    const response = await apiFetch('/api/classes'); if (!response.ok) throw new Error(); const data = await response.json();
    if (data.classes?.length) { const preferred = currentProfile()?.className || $('#class-select').value || ''; state.classes = data.classes; $('#class-select').innerHTML = data.classes.map((x) => `<option value="${escapeHtml(x.name)}">${escapeHtml(x.name)}</option>`).join(''); $('#class-select').value = data.classes.some((x) => x.name === preferred) ? preferred : data.classes[0].name; }
  } catch {  }
}
async function loadSchoolData() {
  const className = currentProfile()?.className || $('#class-select').value || state.classes[0]?.name || '';
  const cacheKey = `school:${className}`;
  const saved = readDataCache(cacheKey);
  if (saved?.schedule) { state.schedule = saved.schedule; state.replacements = saved.replacements || { replacements: [], dateText: '' }; $('#schedule-status').textContent = `Plan zapisany ${dateLabel(new Date(saved.savedAt), { hour: '2-digit', minute: '2-digit' })}${currentProfile()?.group ? ` · grupa ${currentProfile().group}` : ''}`; $('#sync-label').textContent = 'Dane zapisane'; renderSchedule(); renderWeek(); renderReplacements(); }
  $('#sync-label').textContent = 'Aktualizowanie'; $('#schedule-status').className = 'status-message'; $('#schedule-status').textContent = 'Łączenie z planem szkoły…';
  try {
    const [scheduleResponse, replacementResponse] = await Promise.all([apiFetch(`/api/schedule?class=${encodeURIComponent(className)}`), apiFetch(`/api/replacements?class=${encodeURIComponent(className)}`)]);
    if (!scheduleResponse.ok) throw new Error((await scheduleResponse.json()).error || 'Plan jest teraz niedostępny.');
    state.schedule = await scheduleResponse.json(); state.replacements = replacementResponse.ok ? await replacementResponse.json() : { replacements: [], dateText: '' };
    writeDataCache(cacheKey, { schedule: state.schedule, replacements: state.replacements, savedAt: Date.now() });
    $('#sync-label').textContent = 'Źródła szkoły'; $('#schedule-status').textContent = `Klasa ${className}${currentProfile()?.group ? ` · grupa ${currentProfile().group}` : ''} · aktualizacja ${new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' }).format(new Date(state.schedule.updatedAt))}`;
  } catch (error) { $('#sync-label').textContent = saved ? 'Dane zapisane' : 'Brak połączenia'; $('#schedule-status').textContent = saved ? `Pokazuję zapisany plan. Odświeżenie nie powiodło się: ${error.message}` : `${error.message} Sprawdź dostępność strony szkoły.`; $('#schedule-status').className = 'status-message error'; }
  renderSchedule(); renderWeek(); renderReplacements();
}
function renderDayStrip() {
  const monday = weekMonday();
  $('#day-strip').innerHTML = DAY_SHORT.map((short, i) => { const date = new Date(monday); date.setDate(date.getDate() + i); const active = state.day === i; const today = date.toDateString() === new Date().toDateString(); return `<button type="button" class="day-button ${active ? 'selected' : ''} ${today ? 'today' : ''}" data-day="${i}" aria-pressed="${active}"><span>${short}</span><strong>${date.getDate()}</strong></button>`; }).join('');
  $$('#day-strip [data-day]').forEach((b) => b.addEventListener('click', () => { state.day = +b.dataset.day; renderSchedule(); renderWeek(); }));
}
const getDayLessons = (day) => (currentPlanLessons() || []).filter((lesson) => lesson.day === day).sort((a, b) => a.number - b.number);
function replacementsForDate(targetDate) {
  const date = replacementDate(state.replacements?.dateText || '');
  return date && date.toDateString() === targetDate.toDateString() ? state.replacements?.replacements || [] : [];
}
function replacementsForSelectedDate(day) { return replacementsForDate(selectedDate(day)); }
function changeDetails(change) {
  const body = change.description.replace(/^\s*\d+\s*[A-Z](?:\(\d+\))?\s*-\s*/i, '').trim();
  const room = body.match(/^(?:sala\s*)?(\d+[A-Za-z-]*)$/i)?.[1] || '';
  const replacementSubject = change.note?.match(/^\s*(.+?)\s+z\s+\d+\s*godz(?:\.|in)?\s+lekcyjnej/i)?.[1]?.trim() || '';
  return { body, room, replacementSubject, cancelled: /zwolnieni|zwolniona|zwolniony|do domu/i.test(body), changedSubject: Boolean(replacementSubject) || /zajęcia świetlicowe|świetlica/i.test(body) };
}
const shortPerson = (s) => { const m = String(s).match(/^(za )?([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)\s+([A-ZĄĆĘŁŃÓŚŹŻ][\p{L}-]+)$/u); return m ? `${m[1] || ''}${m[2][0]}. ${m[3]}` : s; };
function displaySubject(subject) {
  const normalized = String(subject || '').trim();
  const aliases = { 'j.ang.': 'Język angielski', 'j.ang': 'Język angielski', 'j.polski': 'Język polski', 'j.niemiecki': 'Język niemiecki', 'j.niem.': 'Język niemiecki' };
  return aliases[normalized.toLocaleLowerCase('pl-PL')] || normalized;
}
function changeAppliesToEntry(change, entry) {
  const classGroup = change.description.match(/\b\d+\s*[A-Z]\((\d+)\)/i)?.[1];
  const entryGroup = entry.subject.match(/-(\d+)\s*\/\s*\d+\s*$/)?.[1];
  const selectedGroup = currentProfile()?.group;
  if (classGroup && selectedGroup) return classGroup === String(selectedGroup);
  if (classGroup && entryGroup) return entryGroup === classGroup;
  return true;
}
function visibleEntries(lesson) { const group = currentProfile()?.group; return lesson.entries.filter((entry) => { if (!group || entry.vulcan) return true; const match = entry.subject.match(/-(\d+)\s*\/\s*(\d+)\s*$/); return !match || Number(group) > Number(match[2]) || Number(match[1]) === Number(group); }); }
function renderSchedule() {
  renderDayStrip(); const lessons = getDayLessons(state.day).filter((lesson) => !currentProfile()?.group || visibleEntries(lesson).length > 0); const changes = replacementsForSelectedDate(state.day);
  const now = new Date(); const currentDay = (now.getDay() + 6) % 7; const nowMinute = now.getHours() * 60 + now.getMinutes(); const list = $('#schedule-list'); list.innerHTML = '';
  $('#empty-day').classList.toggle('hidden', lessons.length > 0 || !state.schedule); if (!state.schedule) { $('#empty-day').classList.add('hidden'); return; }
  for (const lesson of lessons) {
    const lessonChanges = changes.filter((x) => x.lesson === lesson.number); const start = minutes(lesson.time.split('-')[0]); const end = minutes(lesson.time.split('-')[1]);
    const isCurrent = state.weekOffset === 0 && state.day === currentDay && nowMinute >= start && nowMinute <= end; const isPast = state.weekOffset === 0 && state.day === currentDay && nowMinute > end;
    const entries = visibleEntries(lesson).map((entry) => {
      const change = lessonChanges.find((c) => changeAppliesToEntry(c, entry)); const details = change && changeDetails(change); const applies = Boolean(change); let subject = entry.subject; let teacher = entry.teacher || ''; let room = entry.room || '';
      if (applies && details) { if (details.room) room = details.room; if (change.substitute) teacher = change.substitute; if (details.replacementSubject) subject = displaySubject(details.replacementSubject); else if (details.cancelled || details.changedSubject) subject = details.body.replace(/^\d+\s*[A-Z](?:\(\d+\))?\s*-\s*/i, ''); }
      const chips = [teacher, applies && change?.substitute && change.teacher ? `za ${change.teacher}` : '', room ? `sala ${room}` : ''].filter(Boolean);
      const note = applies ? change?.note : '';
      const original = applies && (details?.cancelled || details?.changedSubject) ? entry.subject.replace(/-(\d+)\s*\/\s*(\d+)\s*$/, ' · grupa $1/$2') : '';
      const canceled = applies && details?.cancelled;
      return `<div class="lesson-content ${canceled ? 'lesson-cancelled' : ''} ${applies && (details?.cancelled || details?.changedSubject) ? 'lesson-replaced' : ''}"><div class="lesson-title ${canceled ? 'cancel-notice' : applies && details?.changedSubject ? 'replacement-subject' : ''}">${applies ? '<span class="change-tag">ZMIANA</span> ' : ''}${escapeHtml(subject)}</div><div class="lesson-meta">${chips.map((item) => `<span class="meta-chip ${/^sala /.test(item) ? 'chip-room' : ''}">${escapeHtml(shortPerson(item))}</span>`).join('')}</div>${original ? `<div class="lesson-original">${escapeHtml(displaySubject(original))}</div>` : ''}${note ? `<div class="lesson-change-note">${escapeHtml(note)}</div>` : ''}</div>`;
    }).join('');
    list.insertAdjacentHTML('beforeend', `<div data-num="${lesson.number}" class="lesson ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''}"><div class="lesson-time"><strong>${escapeHtml(lesson.time)}</strong><span>${isCurrent ? 'TERAZ' : `${lesson.number}. lekcja`}</span></div><div>${entries || '<div class="lesson-title">Brak szczegółów</div>'}</div><div class="lesson-number">${lesson.number}</div></div>`);
  }
  const shown = new Set(lessons.map((l) => l.number));
  for (const c of changes.filter((x) => !shown.has(x.lesson))) { const d = changeDetails(c); list.insertAdjacentHTML('beforeend', `<div class="lesson"><div class="lesson-time"><strong>${c.lesson}. lekcja</strong><span>zmiana</span></div><div><div class="lesson-content ${d.cancelled ? 'lesson-cancelled' : ''}"><div class="lesson-title ${d.cancelled ? 'cancel-notice' : ''}"><span class="change-tag">ZMIANA</span> ${escapeHtml(d.body || 'Zmiana w planie')}</div><div class="lesson-meta">${[c.substitute, c.teacher ? `za ${c.teacher}` : ''].filter(Boolean).map((i) => `<span class="meta-chip">${escapeHtml(i)}</span>`).join('')}</div>${c.note ? `<div class="lesson-change-note">${escapeHtml(c.note)}</div>` : ''}</div></div><div class="lesson-number">${c.lesson}</div></div>`); }
  if (changes.length && !lessons.length) $('#empty-day').classList.add('hidden');
}
function weekRange(monday) { const friday = new Date(monday); friday.setDate(friday.getDate() + 4); return `${dateLabel(monday)} – ${dateLabel(friday, { day: 'numeric', month: 'short', year: monday.getFullYear() !== friday.getFullYear() ? 'numeric' : undefined })}`; }
function renderWeek() {
  const monday = weekMonday();
  $('#week-range').textContent = state.weekOffset === 0 ? `${[0, 6].includes(new Date().getDay()) ? 'Najbliższy tydzień' : 'Ten tydzień'} · ${weekRange(monday)}` : weekRange(monday);
  $('#prev-week').disabled = state.weekOffset <= -1; $('#next-week').disabled = state.weekOffset >= MAX_WEEKS;
  $('#week-grid').innerHTML = DAYS.map((name, i) => {
    const date = new Date(monday); date.setDate(date.getDate() + i);
    const dayChanges = replacementsForDate(date);
    const lessons = getDayLessons(i).filter((lesson) => !currentProfile()?.group || visibleEntries(lesson).length > 0).slice(0, 6);
    const cards = lessons.length ? lessons.map((lesson) => {
      const entries = visibleEntries(lesson);
      const lc = dayChanges.filter((item) => item.lesson === lesson.number);
      const change = lc.find((c) => entries.some((entry) => changeAppliesToEntry(c, entry)));
      const details = change && changeDetails(change);
      const applies = Boolean(change);
      const subjects = entries.map((entry) => {
        const ec = lc.find((c) => changeAppliesToEntry(c, entry)); const ed = ec && changeDetails(ec); const changed = ec && ed && (ed.cancelled || ed.changedSubject);
        return changed ? ed.replacementSubject ? displaySubject(ed.replacementSubject) : ed.body : displaySubject(entry.subject.replace(/-(\d+)\/(\d+)$/, ' · grupa $1/$2'));
      }).join(' / ');
      const room = applies && details?.room ? details.room : entries.find((entry) => entry.room)?.room || '';
      const teacher = applies && change?.substitute ? change.substitute : entries.find((entry) => entry.teacher)?.teacher || '';
      const meta = [lesson.time.split('-')[0], `${lesson.number}.`, shortPerson(teacher), room ? `s. ${room}` : ''].filter(Boolean).join(' · ');
      const original = applies && (details?.cancelled || details?.changedSubject) ? entries.map((entry)=>entry.subject.replace(/-(\d+)\s*\/\s*\d+\s*$/,' · grupa $1')).join(' / ') : '';
      return `<div data-day="${i}" data-num="${lesson.number}" data-subj="${escapeHtml(entries.map((e) => e.subject).join(' | '))}" data-teach="${escapeHtml(entries.map((e) => e.teacher || '').join(' | '))}" class="week-lesson ${applies ? 'has-change' : ''} ${applies && details?.cancelled ? 'week-cancelled' : applies && details?.changedSubject ? 'week-replaced' : ''}">${applies ? '<span class="change-tag">ZMIANA</span>' : ''}<strong>${escapeHtml(subjects)}</strong><small>${escapeHtml(meta)}</small>${original?`<em class="week-original">${escapeHtml(original)}</em>`:''}</div>`;
    }).join('') : '<div class="week-empty">Wolne</div>';
    return `<button type="button" class="week-column ${state.day === i ? 'active' : ''}" data-week-day="${i}" aria-label="${name}, ${dateLabel(date, { day: 'numeric', month: 'long' })}"><span class="week-title">${DAY_SHORT[i]} <span>${date.getDate()}</span></span>${cards}</button>`;
  }).join('');
  $$('#week-grid [data-week-day]').forEach((button) => button.addEventListener('click', () => { state.day = +button.dataset.weekDay; renderSchedule(); renderWeek(); }));
}
function renderReplacements() {
  const root = $('#replacements-content'); if (!state.replacements) { root.innerHTML = '<div class="mini-loading"><span class="spinner"></span> Pobieranie zmian…</div>'; return; }
  const changes = state.replacements.replacements || []; const date = state.replacements.dateText || 'brak nowej publikacji';
  if (!changes.length) { root.innerHTML = `<div class="replacement-date">${escapeHtml(date)}</div><div class="no-replacements"><span class="no-repl-icon">✓</span><span>Brak zmian dla klasy ${escapeHtml(state.schedule?.className || currentProfile()?.className || '4J')} w tej publikacji.</span></div>`; return; }
  root.innerHTML = `<div class="replacement-date">Opublikowano · ${escapeHtml(date)}</div><div class="replacement-list">${changes.map((change) => { const details = changeDetails(change); const meta = [change.substitute, details.room ? `sala ${details.room}` : '', change.teacher].filter(Boolean); const description = details.cancelled ? details.body : details.replacementSubject ? displaySubject(details.replacementSubject) : details.room ? 'Zmiana sali' : details.body || 'Zmiana w planie'; return `<div class="replacement-item"><div class="replacement-top"><span class="replacement-lesson">${change.lesson}. lekcja</span><span class="change-tag">ZMIANA</span></div><div class="replacement-desc">${escapeHtml(description)}</div>${meta.length ? `<div class="replacement-meta">${meta.map(escapeHtml).join(' · ')}</div>` : ''}${change.note ? `<div class="replacement-note">${escapeHtml(change.note)}</div>` : ''}</div>`; }).join('')}</div>`;
}
function average(grades) { const weight = grades.reduce((sum, x) => sum + Number(x.weight || 1), 0); return weight ? grades.reduce((sum, x) => sum + Number(x.value) * Number(x.weight || 1), 0) / weight : null; }
const fmtAverage = (value) => value == null ? '—' : value.toFixed(2).replace('.', ',');
function renderGradePreview() {
  if (state.vulcanGrades) {
    const groups = new Map();
    for (const record of state.vulcanGrades) {
      const subject = textValue(findNested(record, ['subjectname','subjectdisplayname','subject'])) || 'Inne';
      let raw = findNested(record, ['grade','gradevalue','symbol','value']);
      if (raw && typeof raw === 'object') raw = findNested(raw, ['symbol','gradevalue','value','mark','number','name']) ?? raw.DisplayName ?? raw.Name;
      if (raw == null || raw === '') continue;
      const mark=numberGrade(record); const list = groups.get(subject) || []; list.push({ label:mark?.label ?? String(raw), value:mark?.value ?? null, weight:weightOf(record) }); groups.set(subject, list);
    }
    const gi = gradeItems(); const gavg = gi.length ? wAvg(gi) : null; $('#average-value').textContent = gavg != null ? fmtAverage(gavg) : '—'; $('#average-caption').textContent = 'ŚREDNIA';
    const items = [...groups.entries()].slice(0, 4);
    $('#preview-subjects').innerHTML = items.length ? items.map(([subject, values]) => { const numbers=values.filter(x=>x.value!=null); const tw=numbers.reduce((a,x)=>a+x.weight,0); const avg=numbers.length&&tw?fmtAverage(numbers.reduce((a,x)=>a+x.value*x.weight,0)/tw):values.slice(-3).map(x=>x.label).join(' · '); return `<div class="preview-row"><span>${escapeHtml(subject)}</span><span class="preview-grade">${escapeHtml(avg)}</span></div>`; }).join('') : '<span class="muted">Brak bieżących ocen.</span>';
    return;
  }
  $('#average-caption').textContent = 'ŚREDNIA';
  const grades = readGrades(); $('#average-value').textContent = fmtAverage(average(grades)); const map = new Map(); grades.forEach((g) => { const group = map.get(g.subject) || []; group.push(g); map.set(g.subject, group); }); const items = [...map.entries()].slice(0, 4);
  $('#preview-subjects').innerHTML = items.length ? items.map(([subject, list]) => `<div class="preview-row"><span>${escapeHtml(subject)}</span><span class="preview-grade">${fmtAverage(average(list))}</span></div>`).join('') : '<span class="muted">Dodaj oceny, aby zobaczyć średnią.</span>';
}
function renderGrades() {
  const grades = readGrades(); $('#grades-average').textContent = fmtAverage(average(grades)); $('#grades-count').textContent = `${grades.length} ${grades.length === 1 ? 'ocena' : 'ocen'}`; $('#grades-empty').classList.toggle('hidden', grades.length > 0); const host = $('#grades-list'); host.innerHTML = '';
  if (!grades.length) { renderGradePreview(); return; }
  const map = new Map(); grades.forEach((g) => { const group = map.get(g.subject) || []; group.push(g); map.set(g.subject, group); });
  for (const [subject, items] of map) { const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt); host.insertAdjacentHTML('beforeend', `<section class="subject-group"><div class="subject-title"><span>${escapeHtml(subject)}</span><span class="subject-average">średnia ${fmtAverage(average(items))}</span></div>${sorted.map((g) => `<div class="grade-row"><span class="grade-mark">${escapeHtml(g.value)}</span><span class="grade-note">${escapeHtml(g.note || 'Ocena')}${Number(g.weight) > 1 ? ` · waga ×${Number(g.weight)}` : ''}</span><span class="grade-date">${escapeHtml(dateLabel(new Date(g.createdAt), { day: 'numeric', month: 'short' }))}</span><button class="delete-grade" type="button" data-grade-id="${escapeHtml(g.id)}" aria-label="Usuń ocenę">×</button></div>`).join('')}</section>`); }
  host.querySelectorAll('[data-grade-id]').forEach((b) => b.addEventListener('click', () => { saveGrades(readGrades().filter((g) => g.id !== b.dataset.gradeId)); renderGrades(); renderGradePreview(); })); renderGradePreview();
}
const VIEW_BLOCKS = { calendar: ['schedule-card','week-card','changes-card'], tasks: ['tasks-card'], messages: ['messages-card'], attendance: ['attendance-card'] };
function switchView(name) {
  const view = name === 'plan' ? 'home' : name; renderDashboardOrder();
  if(view==='home'){ $('#schedule-card').classList.remove('calendar-week-hidden'); $('#week-card').classList.remove('calendar-week-hidden'); }
  document.body.dataset.view = view; $$('.view').forEach((v) => v.classList.toggle('active', v.id === `${name}-view`)); $$('.nav-item').forEach((b) => b.classList.toggle('selected', b.dataset.view === name || (b.closest('.bottom-nav') && b.dataset.view === 'more' && ['tasks','attendance','settings'].includes(name))));
  if (view === 'calendar') { for (const id of VIEW_BLOCKS.calendar) { const block=$(`[data-dashboard-block="${id}"]`); if (block) $('#calendar-content').append(block); } ($('[data-calendar-mode].selected') || $('[data-calendar-mode="day"]')).click(); }
  if (view === 'tasks') { const block=$('[data-dashboard-block="tasks-card"]'); if (block) $('#tasks-content').append(block); renderLocalTasks(); }
  if (view === 'messages') { const block=$('[data-dashboard-block="messages-card"]'); if (block) $('#messages-content').append(block); }
  if (view === 'attendance') { const block=$('[data-dashboard-block="attendance-card"]'); if (block) $('#attendance-content').append(block); }
  if (name === 'grades') renderGrades(); if (name === 'settings') { renderDashboardSettings(); renderLookSettings(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function applyTheme(theme) { document.documentElement.dataset.theme = theme; localStorage.setItem(KEYS.theme, theme); $('#theme-button').setAttribute('aria-label', theme === 'dark' ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'); }

const DASHBOARD_KEY = 'moj-plan-dashboard-v1';
const WSIZE_DEFAULT = { 'schedule-card':'auto','changes-card':'m','grade-preview-card':'m','tasks-card':'m','messages-card':'m','attendance-card':'s','week-card':'auto','tip-card':'auto' };
const WSIZE_LABEL = [['auto','Auto'],['s','S'],['m','M'],['l','L']];
const DASHBOARD_IDS = ['schedule-card','changes-card','grade-preview-card','tasks-card','messages-card','attendance-card','week-card','tip-card'];
function renderDashboardOrder() {
  const grid = $('.dashboard-grid'); if (!grid) return;
  const cards = new Map([...document.querySelectorAll('[data-dashboard-block]')].map((el) => [el.dataset.dashboardBlock, el]));
  let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(DASHBOARD_KEY) || '{}'); } catch {}
  const order = [...new Set([...(prefs.order || []), ...DASHBOARD_IDS])].filter((id) => cards.has(id));
  for (const id of order) { const el = cards.get(id); if (el) { el.hidden = Array.isArray(prefs.hidden) && prefs.hidden.includes(id); el.dataset.wsize = prefs.size?.[id] || WSIZE_DEFAULT[id] || 'auto'; grid.append(el); } }
}
function renderDashboardSettings() {
  const host = $('#dashboard-settings-list'); if (!host) return;
  let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(DASHBOARD_KEY) || '{}'); } catch {}
  const order = [...new Set([...(prefs.order || []), ...DASHBOARD_IDS])];
  const labels = { 'schedule-card':'Plan dnia','changes-card':'Zastępstwa','grade-preview-card':'Oceny','tasks-card':'Prace domowe i sprawdziany','messages-card':'Wiadomości','attendance-card':'Frekwencja','week-card':'Plan tygodnia','tip-card':'Krótka wskazówka' };
  host.innerHTML = order.map((id, i) => `<div class="widget-setting"><label><input type="checkbox" data-widget-visible="${id}" ${prefs.hidden?.includes(id) ? '' : 'checked'}>${labels[id]}</label><span class="ws-ctl"><select class="ws-size" data-widget-size="${id}" aria-label="Rozmiar bloku">${WSIZE_LABEL.map(([v,l])=>`<option value="${v}" ${(prefs.size?.[id]||WSIZE_DEFAULT[id]||'auto')===v?'selected':''}>${l}</option>`).join('')}</select><button type="button" data-widget-move="${i}" data-direction="-1" aria-label="Przesuń wyżej" ${i===0?'disabled':''}>${icon('up')}</button><button type="button" data-widget-move="${i}" data-direction="1" aria-label="Przesuń niżej" ${i===order.length-1?'disabled':''}>${icon('down')}</button></span></div>`).join('');
  host.querySelectorAll('[data-widget-visible]').forEach((input) => input.addEventListener('change', () => { const next = JSON.parse(localStorage.getItem(DASHBOARD_KEY) || '{}'); next.hidden = [...host.querySelectorAll('[data-widget-visible]:not(:checked)')].map((x) => x.dataset.widgetVisible); localStorage.setItem(DASHBOARD_KEY, JSON.stringify(next)); renderDashboardOrder(); }));
  host.querySelectorAll('[data-widget-size]').forEach((sel) => sel.addEventListener('change', () => { const next = JSON.parse(localStorage.getItem(DASHBOARD_KEY) || '{}'); next.size = { ...(next.size || {}), [sel.dataset.widgetSize]: sel.value }; localStorage.setItem(DASHBOARD_KEY, JSON.stringify(next)); renderDashboardOrder(); }));
  host.querySelectorAll('[data-widget-move]').forEach((button) => button.addEventListener('click', () => { const next = JSON.parse(localStorage.getItem(DASHBOARD_KEY) || '{}'); const ids = [...new Set([...(next.order || []), ...DASHBOARD_IDS])]; const from = Number(button.dataset.widgetMove), to = from + Number(button.dataset.direction); [ids[from],ids[to]]=[ids[to],ids[from]]; next.order=ids; localStorage.setItem(DASHBOARD_KEY,JSON.stringify(next)); renderDashboardSettings(); renderDashboardOrder(); }));
}

function localTasks() { try { return JSON.parse(localStorage.getItem(`moj-plan-tasks-${currentProfile()?.id}`) || '[]'); } catch { return []; } }
function saveLocalTasks(tasks) { localStorage.setItem(`moj-plan-tasks-${currentProfile()?.id}`, JSON.stringify(tasks)); try { if (state.schedule) { renderSchedule(); renderWeek(); } } catch (e) { console.warn(e); } }
function renderLocalTasks() {
  const host = $('#personal-task-list'); if (!host) return;
  const tasks = localTasks().sort((a,b)=>a.date.localeCompare(b.date));
  host.innerHTML = tasks.length ? tasks.map(t=>{const due=displayDate(`${t.date}T12:00:00`);const overdue=!t.done&&t.date<new Date().toISOString().slice(0,10);return `<article class="personal-task ${t.done?'is-done':''} ${overdue?'is-overdue':''}"><label><input type="checkbox" data-task-done="${t.id}" ${t.done?'checked':''}><span><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(t.subject || 'Własny wpis')} · ${escapeHtml(t.type)} · ${escapeHtml(due)}</small></span></label><button type="button" data-task-delete="${t.id}" aria-label="Usuń wpis">×</button></article>`;}).join('') : '<p class="empty-note">Dodaj własną pracę domową lub sprawdzian — pojawi się tutaj razem z danymi z dziennika.</p>';
  host.querySelectorAll('[data-task-done]').forEach(b=>b.addEventListener('change',()=>{const list=localTasks();const task=list.find(t=>t.id===b.dataset.taskDone);if(task)task.done=b.checked;saveLocalTasks(list);renderLocalTasks();}));
  host.querySelectorAll('[data-task-delete]').forEach(b=>b.addEventListener('click',()=>{saveLocalTasks(localTasks().filter(t=>t.id!==b.dataset.taskDelete));renderLocalTasks();}));
}

function numberGrade(record) {
  const dm = String(record?.Content ?? record?.content ?? '').match(/^\s*([1-6])\s*([+-])?\s*$/);
  if (dm) return { label: dm[1] + (dm[2] || ''), value: Number(dm[1]) + (dm[2] === '+' ? .5 : dm[2] === '-' ? -.5 : 0) };
  if (record && typeof record === 'object' && ('Content' in record || 'content' in record) && !/[1-6]/.test(String(record.Content ?? record.content ?? ''))) return null;
  let raw = findNested(record, ['grade','gradevalue','symbol','value','mark','numerator']);
  if (raw && typeof raw === 'object') raw = findNested(raw, ['symbol','gradevalue','value','mark','number','name','numerator']);
  const match = String(raw ?? '').match(/[1-6](?:[+-])?/); if (!match) return null;
  const base = Number(match[0][0]) + (match[0].endsWith('+') ? .5 : match[0].endsWith('-') ? -.5 : 0);
  return { label: match[0], value: base };
}
function renderVulcanGradeStats() {
  const host = $('#grade-stats'); if (!host) return;
  const groups = new Map(); const grades = [];
  for (const record of state.vulcanGrades || []) { const mark=numberGrade(record); if (!mark) continue; const subject=textValue(findNested(record,['subjectname','subjectdisplayname','subject']))||'Inne'; const list=groups.get(subject)||[]; list.push(mark); groups.set(subject,list); grades.push(mark); }
  const avg = list => list.length ? list.reduce((s,x)=>s+x.value,0)/list.length : null;
  host.innerHTML = groups.size ? `<div class="stats-total"><span>Średnia ogólna</span><strong>${fmtAverage(avg(grades))}</strong><small>${grades.length} ocen z eduVULCAN</small></div><div class="stats-subjects">${[...groups].map(([name,list])=>`<div><span>${escapeHtml(name)}</span><strong>${fmtAverage(avg(list))}</strong></div>`).join('')}</div>` : '<p class="empty-note">Średnie pojawią się po pobraniu ocen.</p>';
  const canvas=$('#grade-chart'); if(canvas) { const buckets=Array.from({length:6},()=>0); for(const r of state.vulcanGrades||[]){const raw=findNested(r,['createdat','date','dateat']);const d=raw?new Date(raw):null;if(d&&!Number.isNaN(+d))buckets[Math.max(0,Math.min(5,Math.floor((Date.now()- +d)/(30*86400000))))]++;} const max=Math.max(1,...buckets); canvas.innerHTML=buckets.map((v,i)=>`<div class="chart-column"><span style="height:${Math.max(5,Math.round(v/max*100))}%"></span><small>${i===0?'Teraz':`${i} mies.`}</small></div>`).join(''); }
  const alert=$('#retake-alerts'); if(alert){const needs=(state.vulcanGrades||[]).filter(gradeRequiresRetake);alert.innerHTML=needs.length?`<strong>Do poprawy: ${needs.length}</strong><p>${needs.map(r=>`${escapeHtml(textValue(findNested(r,['subjectname','subjectdisplayname','subject']))||'Przedmiot')} · ${escapeHtml(numberGrade(r)?.label||'1')}`).join(' · ')}. Cel: co najmniej 2−.</p>`:'';}
}

$('#profile-form').addEventListener('submit', (event) => { event.preventDefault(); const className = $('#class-select').value; const group = Number($('#group-select').value) || 0; if (!className) return; const profiles = readProfiles(); let profile = profiles.find((p) => p.className === className); if (!profile) { profile = { id: crypto.randomUUID(), className, group, grades: [] }; profiles.push(profile); } else profile.group = group; writeProfiles(profiles); localStorage.setItem(KEYS.active, profile.id); $('#profile-dialog').close(); renderProfile(); renderGrades(); renderGradePreview(); loadSchoolData(); });
$('#grade-form').addEventListener('submit', (event) => { event.preventDefault(); if (!currentProfile()) { openProfileDialog(); return; } const grades = readGrades(); grades.push({ id: crypto.randomUUID(), subject: $('#grade-subject').value.trim(), value: Number($('#grade-value').value), weight: Number($('#grade-weight').value || 1), note: $('#grade-note').value.trim(), createdAt: Date.now() }); saveGrades(grades); $('#grade-dialog').close(); $('#grade-form').reset(); renderGrades(); renderGradePreview(); });
async function connectWithAp(ap, source) {
  const buttons = [$('#connection-button'), $('#paste-connect-button')].filter(Boolean), output = $('#connection-status');
  buttons.forEach((b) => { b.disabled = true; }); output.className = 'connection-status'; output.textContent = 'Łączenie z eduVULCAN…';
  try { const response = await apiFetch('/api/vulcan/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ap }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); $('#vulcan-ap').value = ''; output.className = 'connection-status ok'; output.textContent = `Połączono. Znaleziono uczniów: ${result.students.map((s) => `${s.firstName} ${s.lastName} (${s.className})`).join(', ')}.`; await loadVulcanStatus(); loadVulcanData?.(true); return true; }
  catch (error) { output.className = 'connection-status bad'; output.textContent = `${error.message}${source === 'field' ? ' Wklejone dane pozostają w polu, aby można było poprawić próbę.' : ''}`; return false; }
  finally { buttons.forEach((b) => { b.disabled = false; }); }
}
$('#connection-button').addEventListener('click', () => { const ap = $('#vulcan-ap').value.trim(); const output = $('#connection-status'); if (!ap) { output.className = 'connection-status bad'; output.textContent = 'Wklej zawartość strony /api/ap po zalogowaniu.'; return; } connectWithAp(ap, 'field'); });
const looksLikeAp = (t) => /"?Tokens"?\s*:|id=['"]ap['"]/.test(t || '');
async function readClipboardText() { try { const cap = window.Capacitor?.Plugins?.Clipboard; if (cap) { const r = await cap.read(); return r?.value || ''; } } catch {} try { return await navigator.clipboard.readText(); } catch { return ''; } }
$('#paste-connect-button')?.addEventListener('click', async () => { const output = $('#connection-status'); const text = (await readClipboardText()).trim(); if (looksLikeAp(text)) { $('#vulcan-ap').value = text; connectWithAp(text, 'field'); } else { output.className = 'connection-status bad'; output.textContent = 'W schowku nie ma danych z eduVULCAN. Na stronie połączenia zaznacz cały tekst i skopiuj go, albo wklej go ręcznie w pole poniżej.'; $('#vulcan-ap').focus(); } });
document.addEventListener('visibilitychange', async () => { if (document.visibilityState !== 'visible' || !$('#profile-dialog').open) return; const text = (await readClipboardText()).trim(); if (looksLikeAp(text) && !$('#vulcan-ap').value) { $('#vulcan-ap').value = text; $('#connection-status').className = 'connection-status'; $('#connection-status').textContent = 'Wykryto skopiowane dane — naciśnij „Wklej i połącz”.'; } });
$('#copy-command-button').addEventListener('click', async () => { const button = $('#copy-command-button'); try { await navigator.clipboard.writeText($('#ap-copy-command').textContent); button.textContent = 'Skopiowano — wklej w konsoli'; } catch { button.textContent = 'Zaznacz polecenie i skopiuj ręcznie'; } });
$('#vulcan-student').addEventListener('change', () => { localStorage.setItem(STUDENT_KEY, $('#vulcan-student').value); loadVulcanStatus(); });
$('#vulcan-grades-reload').addEventListener('click', () => loadVulcanData(true)); $('#vulcan-reload').addEventListener('click', () => loadVulcanData(true));
$('#vulcan-disconnect').addEventListener('click', async () => { if (!confirm('Usunąć lokalny klucz urządzenia i dane połączenia eduVULCAN?')) return; await apiFetch('/api/vulcan/session', { method: 'DELETE' }); localStorage.removeItem(STUDENT_KEY); clearVulcanCache(); state.vulcanStudent = null; state.vulcanGrades = null; renderProfile(); $('#connection-status').textContent = 'Usunięto lokalne połączenie.'; await loadVulcanStatus(); });
$('#profile-button').addEventListener('click', toggleProfileMenu); $('#add-profile-top').addEventListener('click', openProfileDialog); $('#add-grade-button').addEventListener('click', () => currentProfile() ? $('#grade-dialog').showModal() : openProfileDialog()); $('#add-first-grade').addEventListener('click', () => currentProfile() ? $('#grade-dialog').showModal() : openProfileDialog()); $('#refresh-button').addEventListener('click', loadSchoolData);
$('#prev-week').addEventListener('click', () => { if (state.weekOffset > -1) { state.weekOffset--; renderSchedule(); renderWeek(); renderReplacements(); } }); $('#next-week').addEventListener('click', () => { if (state.weekOffset < MAX_WEEKS) { state.weekOffset++; renderSchedule(); renderWeek(); renderReplacements(); } });
$('#theme-button').addEventListener('click', () => saveLook({ mode: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' })); $$('button[data-view]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view))); $$('[data-close]').forEach((b) => b.addEventListener('click', () => $(`#${b.dataset.close}`).close())); document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
$('#settings-profile-button').addEventListener('click', openProfileDialog);
$('#add-task-button').addEventListener('click', () => currentProfile() ? $('#task-dialog').showModal() : openProfileDialog());
$('#add-task-top').addEventListener('click', () => currentProfile() ? $('#task-dialog').showModal() : openProfileDialog());
$('#task-form').addEventListener('submit', (event) => { event.preventDefault(); const list=localTasks(); list.push({id:crypto.randomUUID(),title:$('#task-title').value.trim(),subject:$('#task-subject').value.trim(),type:$('#task-type').value,date:$('#task-date').value,done:false}); saveLocalTasks(list); $('#task-dialog').close(); $('#task-form').reset(); renderLocalTasks(); });
$$('[data-calendar-mode]').forEach(button=>button.addEventListener('click',()=>{ $$('[data-calendar-mode]').forEach(x=>x.classList.toggle('selected',x===button)); $('#schedule-card').classList.toggle('calendar-week-hidden',button.dataset.calendarMode==='week'); $('#week-card').classList.toggle('calendar-week-hidden',button.dataset.calendarMode==='day'); }));
const storedProfiles = readProfiles(); if (localStorage.getItem(KEYS.profiles)) writeProfiles(storedProfiles);
const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (v) => escapeHtml(String(v ?? ''));
const asDate = (v) => { if (v && typeof v === 'object') v = v.Timestamp ?? v.Date ?? v.DateDisplay; if (v == null || v === '') return null; const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v); return Number.isNaN(+d) ? null : d; };
const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a, b) => a && b && dayStart(a).getTime() === dayStart(b).getTime();
const shortDate = (d) => dateLabel(d, { day: 'numeric', month: 'short' });
const weekday = (d) => dateLabel(d, { weekday: 'short' }).replace('.', '');
const subjectOf = (r) => textValue(findNested(r, ['subjectname', 'subjectdisplayname', 'subject'])) || 'Inne';
const htmlToText = (raw) => { const s = String(raw ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n'); return new DOMParser().parseFromString(s, 'text/html').body.textContent.replace(/\n{3,}/g, '\n\n').trim(); };
const readSet = (key) => { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } };
const writeSet = (key, set) => localStorage.setItem(key, JSON.stringify([...set]));
function sheet(title, build) {
  let dlg = $('#sheet-dialog'); if (!dlg) { dlg = h('dialog', 'modal sheet'); dlg.id = 'sheet-dialog'; dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); document.body.append(dlg); }
  dlg.replaceChildren(); const top = h('div', 'sheet-top'); const t = h('h2', null, esc(title)); const x = h('button', 'close-button', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Zamknij'); x.onclick = () => dlg.close(); top.append(t, x); const body = h('div', 'sheet-body'); dlg.append(top, body); build(body, dlg); dlg.showModal();
}

state.gradeMode = state.gradeMode || 'year';
const weightOf = (r) => { const w = Number(findNested(r, ['weight'])); return Number.isFinite(w) && w >= 0 ? w : 1; };
const wClass = (w) => `w${Math.min(5, Math.max(1, Math.round(w)))}`;
const gradeItems = () => (state.vulcanGrades || []).map((record) => { const grade = numberGrade(record); return grade && { record, grade, subject: subjectOf(record), date: asDate(findNested(record, ['createdat', 'dateat', 'date'])), weight: weightOf(record) }; }).filter(Boolean);
const plOcen = (n) => `${n} ${n === 1 ? 'ocena' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'oceny' : 'ocen'}`;
const wAvg = (list) => { const w = list.reduce((s, x) => s + x.weight, 0); return w ? list.reduce((s, x) => s + x.grade.value * x.weight, 0) / w : null; };
displayVulcanGrades = function (host) {
  host.replaceChildren(); const items = gradeItems(); const groups = new Map();
  for (const it of items) (groups.get(it.subject) || groups.set(it.subject, []).get(it.subject)).push(it);
  if (!groups.size) { host.textContent = 'Brak ocen w pobranym okresie.'; return; }
  host.append(h('div', 'weight-legend', ['1', '2', '3', '4', '5+'].map((l, i) => `<span class="gchip w${i + 1}">${l}</span>`).join('') + '<small>waga oceny</small>'));
  for (const [subject, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0], 'pl'))) {
    list.sort((a, b) => (a.date || 0) - (b.date || 0));
    const row = h('button', 'grade-row2', `<span class="gr-name">${esc(subject)}</span><span class="gr-chips">${list.map((x) => `<span class="gchip ${wClass(x.weight)} ${x.grade.value < 2 ? 'fail' : ''}">${esc(x.grade.label)}</span>`).join('')}</span><span class="gr-avg">${fmtAverage(wAvg(list))}</span>`);
    row.type = 'button'; row.onclick = () => openSubject(subject, list); host.append(row);
  }
};
function openSubject(subject, list) {
  sheet(subject, (body) => {
    body.append(h('p', 'sheet-sub', `Średnia ważona ${fmtAverage(wAvg(list))} · ${plOcen(list.length)}`));
    for (const x of [...list].reverse()) {
      const desc = cleanText(textValue(findNested(x.record, ['comment', 'description']))) || textValue(findNested(x.record, ['column', 'name'])) || '';
      const cat = textValue(findNested(x.record, ['categoryname', 'category', 'type']));
      body.append(h('div', 'grade-detail', `<span class="gbig ${wClass(x.weight)}">${esc(x.grade.label)}</span><div><strong>${esc(desc || cat || 'Ocena')}</strong><small>${esc([cat && cat !== desc ? cat : '', `waga ${x.weight}`].filter(Boolean).join(' · '))}</small></div><time>${x.date ? esc(shortDate(x.date)) : ''}</time>`));
    }
  });
}
function gradeChartSvg(items, mode) {
  const now = new Date(); const start = new Date(now); const sy = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  if (mode === 'week') start.setDate(now.getDate() - 6); else if (mode === 'month') start.setDate(now.getDate() - 29); else start.setTime(new Date(sy, 8, 1).getTime());
  start.setHours(0, 0, 0, 0); const end = new Date(now); end.setHours(23, 59, 59, 0); const span = Math.max(1, end - start);
  const W = 340, H = 200, L = 24, R = 14, T = 12, B = 26;
  const X = (d) => L + (Math.min(Math.max(d - start, 0), span) / span) * (W - L - R); const Y = (v) => T + ((6.2 - v) / 5.4) * (H - T - B);
  const dated = items.filter((i) => i.date).sort((a, b) => a.date - b.date);
  const byDay = new Map(); const acc = []; for (const i of dated) { acc.push(i); byDay.set(i.date.toDateString(), { date: i.date, avg: wAvg(acc) }); }
  const days = [...byDay.values()]; const inWin = days.filter((d) => d.date >= start); const prev = days.filter((d) => d.date < start).pop();
  const pts = []; if (prev) pts.push([X(start), Y(prev.avg)]); inWin.forEach((d) => pts.push([X(d.date), Y(d.avg)]));
  const last = days.length ? days[days.length - 1] : null; if (last && pts.length) pts.push([X(end), Y(last.avg)]);
  const win = dated.filter((i) => i.date >= start); const perDay = new Map(); win.forEach((i) => { const k = i.date.toDateString(); perDay.set(k, (perDay.get(k) || 0) + 1); });
  const seen = new Map(); state._chartPts = win;
  const dots = win.map((p, idx) => { const k = p.date.toDateString(); const n = perDay.get(k); const s = seen.get(k) || 0; seen.set(k, s + 1); const dx = (s - (n - 1) / 2) * 8; return `<circle data-gi="${idx}" cx="${(X(p.date) + dx).toFixed(1)}" cy="${Y(p.grade.value).toFixed(1)}" r="5" class="gdot ${wClass(p.weight)}"/>`; }).join('');
  const ticks = [0, 1 / 3, 2 / 3, 1].map((q) => new Date(+start + span * q));
  const poly = pts.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
  const area = pts.length > 1 ? `<polygon points="${pts[0][0].toFixed(1)},${Y(1)} ${poly} ${pts[pts.length - 1][0].toFixed(1)},${Y(1)}" class="garea"/>` : '';
  const endLabel = last && pts.length ? `<text x="${W - R}" y="${(Y(last.avg) - 8).toFixed(1)}" class="gt gend" text-anchor="end">${fmtAverage(last.avg)}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="gchart" role="img" aria-label="Wykres ocen">${[1, 2, 3, 4, 5, 6].map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${L - 6}" y="${Y(v) + 4}" class="gt" text-anchor="end">${v}</text>`).join('')}${ticks.map((d, i) => `<text x="${X(d)}" y="${H - 7}" class="gt" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${esc(shortDate(d))}</text>`).join('')}${win.length === 0 ? `<text x="${W / 2}" y="${H / 2}" class="gt" text-anchor="middle">Brak ocen w tym okresie</text>` : ''}${area}${pts.length > 1 ? `<polyline points="${poly}" class="gline"/>` : ''}${dots}${endLabel}</svg>`;
}
renderVulcanGradeStats = function () {
  const stats = $('#grade-stats'); const chart = $('#grade-chart'); if (!stats || !chart) return; const all = gradeItems(); const subs = [...new Set(all.map((x) => x.subject))].sort((x, y) => x.localeCompare(y, 'pl')); if (state.gradeSubject && !subs.includes(state.gradeSubject)) state.gradeSubject = ''; const items = state.gradeSubject ? all.filter((x) => x.subject === state.gradeSubject) : all;
  if (!all.length) { stats.innerHTML = '<p class="empty-note">Wykres pojawi się po pobraniu ocen.</p>'; chart.innerHTML = ''; }
  else {
    stats.innerHTML = `<div class="gsum"><div><strong>${fmtAverage(wAvg(items))}</strong><small>średnia ważona · ${plOcen(items.length)}</small></div><div class="segmented-control" role="group">${[['week', 'Tydzień'], ['month', 'Miesiąc'], ['year', 'Rok']].map(([k, l]) => `<button type="button" data-gm="${k}" class="${state.gradeMode === k ? 'selected' : ''}">${l}</button>`).join('')}</div></div><select id="gsubj" class="gsel" aria-label="Przedmiot"><option value="">Wszystkie przedmioty</option>${subs.map((s) => `<option ${s === state.gradeSubject ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>`;
    chart.innerHTML = gradeChartSvg(items, state.gradeMode);
    qa('.gdot', chart).forEach((c) => c.addEventListener('click', () => { const p = state._chartPts?.[Number(c.dataset.gi)]; if (!p) return; sheet(p.subject, (body) => { body.append(h('p', 'sheet-sub', `${esc(p.grade.label)} · waga ${p.weight}${p.date ? ` · ${esc(dateLabel(p.date, { day: 'numeric', month: 'long' }))}` : ''}`), h('p', null, esc(textValue(findNested(p.record, ['comment'])) || textValue(findNested(p.record, ['name'])) || ''))); }); }));
    $('#gsubj', stats).onchange = (e) => { state.gradeSubject = e.target.value; renderVulcanGradeStats(); };
    qa('[data-gm]', stats).forEach((b) => b.onclick = () => { state.gradeMode = b.dataset.gm; renderVulcanGradeStats(); });
  }
  const alert = $('#retake-alerts'); if (alert) { const needs = (state.vulcanGrades || []).filter(gradeRequiresRetake); alert.innerHTML = needs.length ? `<strong>Do poprawy: ${needs.length}</strong><p>${needs.map((r) => `${esc(subjectOf(r))} · ${esc(numberGrade(r)?.label || '1')}`).join(' · ')}</p>` : ''; }
};

state.vtasks = state.vtasks || {}; state.archiveWeek = state.archiveWeek || {};
displayVulcanTasks = function (host, value, kind) {
  host.replaceChildren();
  const items = recordsOf(value).filter((x) => x && typeof x === 'object').map((x) => ({ kind, subject: subjectOf(x) === 'Inne' ? (kind === 'homework' ? 'Praca domowa' : 'Sprawdzian') : subjectOf(x), title: cleanText(textValue(findNested(x, ['content', 'title', 'name', 'description']))), type: cleanText(textValue(findNested(x, ['type', 'category', 'categoryname']))), teacher: x.Creator?.DisplayName || textValue(findNested(x, ['creator', 'teachername', 'teacher'])), code: x.Subject?.Kod || '', due: asDate(findNested(x, ['deadlineat', 'deadline', 'dateat', 'eventdate'])) })).sort((a, b) => (a.due || 0) - (b.due || 0));
  state.vtasks[kind] = items; if (typeof renderSchedule === 'function' && state.schedule) { renderSchedule(); renderWeek(); }
  if (!items.length) { host.textContent = kind === 'homework' ? 'Brak prac domowych.' : 'Brak zaplanowanych sprawdzianów.'; return; }
  const today = dayStart(new Date()); const upcoming = items.filter((i) => !i.due || i.due >= today); const past = items.filter((i) => i.due && i.due < today);
  let tab = 'now'; const tabs = h('div', 'segmented-control task-tabs', `<button type="button" data-t="now" class="selected">Zadane (${upcoming.length})</button><button type="button" data-t="old">Archiwum</button>`); const list = h('div', 'task-list'); host.append(tabs, list);
  const card = (i, old) => { const days = i.due ? Math.round((dayStart(i.due) - today) / 864e5) : null; const when = i.due ? `${weekday(i.due)} ${shortDate(i.due)}${!old && days != null ? ` · ${days === 0 ? 'dziś' : days === 1 ? 'jutro' : `za ${days} dni`}` : ''}` : 'bez terminu'; return h('article', `task-card ${i.kind === 'exams' ? 'exam' : 'hw'} ${!old && days != null && days <= 1 ? 'soon' : ''}`, `<div class="task-top"><strong>${esc(i.subject)}</strong><span>${i.kind === 'exams' ? esc(i.type || 'Sprawdzian') : 'Zadanie'}</span></div>${i.title ? `<p>${esc(i.title.length > 220 ? `${i.title.slice(0, 220)}…` : i.title)}</p>` : ''}<small>${esc([when, i.teacher].filter(Boolean).join(' · '))}</small>`); };
  const draw = () => {
    list.replaceChildren(); qa('button', tabs).forEach((b) => b.classList.toggle('selected', b.dataset.t === tab));
    if (tab === 'now') { if (!upcoming.length) list.append(h('p', 'empty-note', 'Nic nie jest zadane. Odpocznij.')); upcoming.forEach((i) => list.append(card(i, false))); return; }
    const off = state.archiveWeek[kind] ?? 0; const mon = mondayOf(new Date()); mon.setDate(mon.getDate() - 7 * (off + 1)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59);
    const nav = h('div', 'archive-nav', `<button type="button" class="icon-button" data-a="1" aria-label="Wcześniej">‹</button><span>${esc(shortDate(mon))} – ${esc(shortDate(sun))}</span><button type="button" class="icon-button" data-a="-1" aria-label="Później" ${off === 0 ? 'disabled' : ''}>›</button>`);
    qa('button', nav).forEach((b) => b.onclick = () => { state.archiveWeek[kind] = Math.max(0, off + Number(b.dataset.a)); draw(); }); list.append(nav);
    const inWeek = past.filter((i) => i.due >= mon && i.due <= sun); if (!inWeek.length) list.append(h('p', 'empty-note', 'W tym tygodniu nic nie było zadane.')); inWeek.forEach((i) => list.append(card(i, true)));
  };
  qa('button', tabs).forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); }); draw();
};
const localTaskItems = () => localTasks().filter((t) => t.date && !t.done).map((t) => ({ kind: /spraw|kart|test|egzam/i.test(t.type || '') ? 'exams' : 'homework', subject: t.subject || t.title || 'Własny wpis', title: t.title || '', type: t.type || '', teacher: '', code: '', due: asDate(t.date), local: true }));
const tasksOn = (date) => [...Object.values(state.vtasks || {}).flat(), ...localTaskItems()].filter((i) => i.due && sameDay(i.due, date));
const _renderSchedule = renderSchedule;
renderSchedule = function () {
  _renderSchedule();
  try {
    qa('#day-strip .day-button').forEach((b, i) => { const t = tasksOn(selectedDate(i)); b.classList.toggle('has-exam', t.some((x) => x.kind === 'exams')); b.classList.toggle('has-hw', t.some((x) => x.kind === 'homework')); });
    const t = tasksOn(selectedDate(state.day)); qa('.day-tasks').forEach((n) => n.remove()); if (!t.length) return;
    $('#schedule-list').append(h('div', 'day-tasks', t.map((i) => `<div class="dt ${i.kind === 'exams' ? 'exam' : 'hw'}"><b>${i.kind === 'exams' ? 'Sprawdzian' : 'Zadanie'}</b><span>${esc(i.subject)}${i.title ? ` — ${esc(i.title.slice(0, 80))}` : ''}</span></div>`).join('')));
  } catch (e) { console.warn(e); }
};
const _renderWeek = renderWeek;
const _norm = (s) => String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\d+\s*\/\s*\d+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const _tok = (s, n = 3) => _norm(s).split(' ').filter((t) => t.length >= n);
function taskMatches(task, subjCsv, teachCsv) {
  const cp = (s) => _norm(s).replace(/ /g, ''); const c1 = cp(task.code); const subs = String(subjCsv || '').split('|').map(cp).filter(Boolean);
  if (c1.length >= 3 && subs.some((s) => s.startsWith(c1) || c1.startsWith(s))) return true;
  const ts = _tok(task.subject); const ls = _tok(subjCsv);
  if (ts.some((x) => ls.some((y) => x.startsWith(y.slice(0, Math.min(y.length, 4))) || y.startsWith(x.slice(0, Math.min(x.length, 4)))))) return true;
  if (ls.length) return false;
  const tt = _tok(task.teacher, 4), lt = _tok(teachCsv, 4); return tt.some((x) => lt.includes(x));
}
const taskTag = (t) => t.kind !== 'exams' ? 'ZAD' : /kart/i.test(t.type) ? 'KART' : /prac.*klas/i.test(t.type) ? 'PK' : /spraw/i.test(t.type) ? 'SPR' : /odpow|ustn/i.test(t.type) ? 'ODP' : /proj/i.test(t.type) ? 'PROJ' : (String(t.type || 'TEST').split(/\s+/)[0].slice(0, 4).toUpperCase());
renderWeek = function () {
  _renderWeek();
  try {
    qa('#week-grid .week-column').forEach((c, i) => {
      const date = selectedDate(i); const t = tasksOn(date); const title = c.querySelector('.week-title'); if (!t.length) return;
      if (title) title.insertAdjacentHTML('beforeend', `<i class="wk-dot ${t.some((x) => x.kind === 'exams') ? 'exam' : 'hw'}"></i>`);
      const used = new Set();
      qa('.week-lesson', c).forEach((card) => {
        const hit = t.filter((x) => taskMatches(x, card.dataset.subj, card.dataset.teach)); if (!hit.length) return; hit.forEach((x) => used.add(x));
        const ex = hit.some((x) => x.kind === 'exams'); card.classList.add(ex ? 'k-exam' : 'k-hw'); if (ex && hit.some((x) => x.kind !== 'exams')) card.classList.add('k-both');
        card.insertAdjacentHTML('afterbegin', `<span class="wk-tags">${hit.map((x) => `<span class="wk-tag ${x.kind === 'exams' ? 'exam' : 'hw'}">${esc(taskTag(x))}</span>`).join('')}</span>`);
      });
      const rest = t.filter((x) => !used.has(x)); if (rest.length) c.insertAdjacentHTML('beforeend', rest.map((x) => `<div class="week-extra ${x.kind === 'exams' ? 'exam' : 'hw'}"><span class="wk-tag ${x.kind === 'exams' ? 'exam' : 'hw'}">${esc(taskTag(x))}</span> ${esc(x.subject)}</div>`).join(''));
    });
    if (!$('.week-legend')) $('#week-grid').insertAdjacentHTML('afterend', '<div class="week-legend"><span><i class="lg exam"></i>sprawdzian / kartkówka</span><span><i class="lg hw"></i>zadanie domowe</span><span><i class="lg chg"></i>zmiana w planie</span></div>');
  } catch (e) { console.warn(e); }
};


function safeMsgHtml(raw) {
  const doc = new DOMParser().parseFromString(String(raw || ''), 'text/html'); const out = document.createDocumentFragment();
  const okUrl = (u) => /^https?:\/\//i.test(u || '');
  const linkify = (text, parent) => { const re = /(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/gi; let last = 0, m; while ((m = re.exec(text))) { parent.append(text.slice(last, m.index)); const a = document.createElement('a'); a.href = m[0]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = m[0]; parent.append(a); last = m.index + m[0].length; } parent.append(text.slice(last)); };
  const walk = (node, parent) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { linkify(n.textContent, parent); continue; } if (n.nodeType !== 1) continue; const tag = n.tagName.toLowerCase();
      if (tag === 'br') { parent.append(document.createElement('br')); continue; }
      if (tag === 'a') { const href = n.getAttribute('href'); if (okUrl(href)) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; walk(n, a); if (!a.textContent.trim()) a.textContent = href; parent.append(a); } else walk(n, parent); continue; }
      if (['p', 'div', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'u', 'h1', 'h2', 'h3'].includes(tag)) { const el = document.createElement(['h1', 'h2', 'h3'].includes(tag) ? 'strong' : tag === 'div' ? 'p' : tag); walk(n, el); parent.append(el); continue; }
      if (['script', 'style', 'iframe', 'object'].includes(tag)) continue; walk(n, parent);
    }
  };
  walk(doc.body, out); return out;
}
function msgBody(x) {
  const wrap = h('div', 'msg-wrap', ''); const body = h('div', 'msg-body', ''); body.append(safeMsgHtml(x.rawBody)); if (!body.textContent.trim()) body.textContent = 'Brak treści.'; wrap.append(body);
  if (x.atts.length) { const box = h('div', 'msg-atts', '<strong>Załączniki</strong>'); for (const f of x.atts) { const link = document.createElement('a'); link.className = 'msg-att'; link.textContent = f.Name || 'Załącznik'; if (/^https?:\/\//i.test(f.Link || '')) { link.href = f.Link; link.target = '_blank'; link.rel = 'noopener noreferrer'; } box.append(link); } wrap.append(box); }
  return wrap;
}

const MSG_READ = 'moj-plan-msg-read', MSG_DEL = 'moj-plan-msg-del';
displayVulcanMessages = function (host, value) {
  host.replaceChildren(); const read = readSet(MSG_READ), del = readSet(MSG_DEL);
  const all = recordsOf(value).filter((m) => m && typeof m === 'object').map((m, n) => { const raw = findNested(m, ['isread', 'read']); const status = textValue(findNested(m, ['status'])); return { m, id: String(findNested(m, ['globalkey', 'id']) ?? `${n}-${textValue(findNested(m, ['title', 'subject']))}`), sender: textValue(findNested(m, ['sender', 'senderfullname', 'from', 'creator'])) || 'Nadawca', title: textValue(findNested(m, ['title', 'subject', 'topic', 'name'])) || '(bez tematu)', body: htmlToText(textValue(findNested(m, ['content', 'body', 'message', 'text']))), date: asDate(findNested(m, ['sentat', 'date', 'createdat'])), serverUnread: ('ReadAt' in m) ? !m.ReadAt : (raw === false || /unread|nieprzeczyt/i.test(status)), atts: (Array.isArray(m.Attachments) ? m.Attachments : []).filter((f) => f && (f.Link || f.Name)), rawBody: textValue(findNested(m, ['content', 'body', 'message', 'text'])) }; }).filter((x) => !del.has(x.id)).sort((a, b) => (b.date || 0) - (a.date || 0));
  if (!all.length) { host.textContent = 'Brak wiadomości.'; return; }
  const unread = (x) => x.serverUnread && !read.has(x.id);
  const bar = h('div', 'msg-bar', `<span>${all.filter(unread).length} nieprzeczytanych</span><div><button type="button" class="text-link" data-a="read">Przeczytaj wszystkie</button><button type="button" class="text-link danger" data-a="del">Usuń wszystkie</button></div>`);
  bar.onclick = (e) => { const a = e.target.dataset.a; if (a === 'read') { all.forEach((x) => read.add(x.id)); writeSet(MSG_READ, read); displayVulcanMessages(host, value); } if (a === 'del' && confirm('Ukryć wszystkie wiadomości na tym urządzeniu? W eduVULCAN zostaną bez zmian.')) { all.forEach((x) => del.add(x.id)); writeSet(MSG_DEL, del); displayVulcanMessages(host, value); } };
  host.append(bar);
  for (const x of all.slice(0, 80)) {
    const ini = x.sender.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
    const row = h('button', `msg-row ${unread(x) ? 'unread' : 'seen'}`, `<span class="msg-av">${esc(ini)}</span><span class="msg-main"><b>${esc(x.sender)}</b><span>${esc(x.title)}${x.atts.length ? ' <i class="msg-clip" title="Załączniki">📎</i>' : ''}</span></span><time>${x.date ? `${esc(shortDate(x.date))}<br>${esc(dateLabel(x.date, { hour: '2-digit', minute: '2-digit' }))}` : ''}</time>`); row.type = 'button';
    row.onclick = () => { read.add(x.id); writeSet(MSG_READ, read); row.classList.replace('unread', 'seen'); sheet(x.title, (body) => { body.append(h('p', 'sheet-sub', `${esc(x.sender)}${x.date ? ` · ${esc(dateLabel(x.date, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))}` : ''}`), msgBody(x)); }); };
    host.append(row);
  }
};

const ATT = { present: ['Obecność', '#2f9e6e'], absent: ['Nieusprawiedliwiona', '#e5484d'], excused: ['Usprawiedliwiona', '#3b82f6'], late: ['Spóźnienie', '#e5a000'], lateEx: ['Spóźn. usprawiedliwione', '#9b59d0'], released: ['Zwolnienie', '#2fa6c8'], school: ['Przyczyny szkolne', '#7c8aa5'] };
function attStatus(r) {
  const pt = findNested(r, ['presencetype']); if (!pt || typeof pt !== 'object') return null; const name = String(pt.Name || pt.CategoryName || '');
  if (pt.Absence) return pt.AbsenceJustified ? 'excused' : /szkoln/i.test(name) ? 'school' : 'absent'; if (pt.Late) return pt.AbsenceJustified ? 'lateEx' : 'late'; if (/zwoln/i.test(name)) return 'released'; if (pt.LegalAbsence) return 'school'; return 'present';
}
displayVulcanAttendance = function (host, value) {
  host.replaceChildren();
  const rows = recordsOf(value).filter((r) => r && typeof r === 'object').map((r) => { const ts = findNested(r, ['timeslot']) || {}; return { st: attStatus(r), date: asDate(findNested(r, ['dayat', 'date', 'createdat'])), subject: subjectOf(r), start: ts.Start || '', end: ts.End || '', pos: ts.Position ?? ts.Display ?? '' }; }).filter((r) => r.st && r.date);
  if (!rows.length) { host.textContent = 'Brak wpisów frekwencji w tym okresie.'; return; }
  const count = (list) => { const c = Object.fromEntries(Object.keys(ATT).map((k) => [k, 0])); list.forEach((r) => c[r.st]++); return c; };
  const pct = (c, n) => n ? `${(((n - c.absent - c.excused) / n) * 100).toFixed(1)}%` : '—';
  const block = (title, list) => { const c = count(list); return `<section class="att-block"><div class="att-head"><strong>${esc(title)}</strong><span class="att-pct">${pct(c, list.length)}</span></div><div class="att-grid">${Object.entries(ATT).map(([k, [l, col]]) => `<div class="${c[k] ? '' : 'zero'}"><i style="background:${col}">${c[k]}</i><span>${l}</span></div>`).join('')}</div></section>`; };
  let tab = 'week'; const tabs = h('div', 'segmented-control task-tabs', [['week', 'Tydzień'], ['stats', 'Statystyka'], ['subj', 'Przedmioty']].map(([k, l]) => `<button type="button" data-t="${k}">${l}</button>`).join('')); const body = h('div', 'att-body'); host.append(tabs, body);
  let off = 0, day = new Date();
  const draw = () => {
    qa('button', tabs).forEach((b) => b.classList.toggle('selected', b.dataset.t === tab)); body.replaceChildren();
    if (tab === 'week') {
      const mon = mondayOf(new Date()); mon.setDate(mon.getDate() + off * 7); const days = [0, 1, 2, 3, 4].map((i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; }); if (!days.some((d) => sameDay(d, day))) day = days[0];
      const nav = h('div', 'archive-nav', `<button type="button" class="icon-button" data-o="-1" aria-label="Poprzedni tydzień">‹</button><span>${esc(shortDate(days[0]))} – ${esc(shortDate(days[4]))}</span><button type="button" class="icon-button" data-o="1" aria-label="Następny tydzień" ${off >= 0 ? 'disabled' : ''}>›</button>`);
      qa('button', nav).forEach((b) => b.onclick = () => { off += Number(b.dataset.o); draw(); });
      const strip = h('div', 'att-days', days.map((d, i) => `<button type="button" data-d="${i}" class="${sameDay(d, day) ? 'selected' : ''}"><span>${esc(weekday(d))}</span><b>${d.getDate()}</b></button>`).join('')); qa('button', strip).forEach((b) => b.onclick = () => { day = days[Number(b.dataset.d)]; draw(); });
      const lessons = rows.filter((r) => sameDay(r.date, day)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
      body.append(nav, strip); if (!lessons.length) body.append(h('p', 'empty-note', 'Brak wpisów w tym dniu.'));
      lessons.forEach((r) => body.append(h('div', 'att-lesson', `<i style="background:${ATT[r.st][1]}"></i><div><strong>${esc(r.subject)}</strong><small>${esc([r.pos && `${r.pos}.`, r.start && `${r.start}–${r.end}`].filter(Boolean).join(' '))} · ${ATT[r.st][0]}</small></div>`)));
    } else if (tab === 'stats') {
      body.insertAdjacentHTML('beforeend', block('Cały rok', rows)); const months = new Map(); rows.forEach((r) => { const k = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, '0')}`; (months.get(k) || months.set(k, []).get(k)).push(r); });
      [...months].sort((a, b) => b[0].localeCompare(a[0])).forEach(([, list]) => body.insertAdjacentHTML('beforeend', block(dateLabel(list[0].date, { month: 'long', year: 'numeric' }), list)));
    } else { const by = new Map(); rows.forEach((r) => (by.get(r.subject) || by.set(r.subject, []).get(r.subject)).push(r)); [...by].sort((a, b) => a[0].localeCompare(b[0], 'pl')).forEach(([s, list]) => body.insertAdjacentHTML('beforeend', block(s, list))); }
  };
  qa('button', tabs).forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); }); draw();
};


const LOOK_KEY = 'moj-plan-look-v1';
const ACCENTS = [['indigo','Indygo','#5b4bdc'],['teal','Morski','#0f8f8a'],['green','Leśny','#2f8f4e'],['orange','Bursztyn','#c4570f'],['rose','Róża','#d6336c'],['blue','Kobalt','#1f6fe0']];
const readLook = () => { try { return { mode: 'system', accent: 'indigo', scale: 1, round: 24, ...JSON.parse(localStorage.getItem(LOOK_KEY) || '{}') }; } catch { return { mode: 'system', accent: 'indigo', scale: 1, round: 24 }; } };
function applyLook() {
  const look = readLook(); const root = document.documentElement;
  const dark = look.mode === 'dark' || (look.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  applyTheme(dark ? 'dark' : 'light');
  if (look.accent && look.accent !== 'indigo') root.dataset.accent = look.accent; else delete root.dataset.accent;
  root.style.setProperty('--rcard', `${look.round}px`); document.body.style.zoom = look.scale === 1 ? '' : String(look.scale);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
}
const saveLook = (patch) => { localStorage.setItem(LOOK_KEY, JSON.stringify({ ...readLook(), ...patch })); applyLook(); renderLookSettings(); };
function renderLookSettings() {
  const host = document.getElementById('look-settings'); if (!host) return; const look = readLook();
  const seg = (key, opts) => `<div class="segmented-control" role="radiogroup">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${String(look[key]) === String(v)}" class="${String(look[key]) === String(v) ? 'selected' : ''}" data-look="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
  host.innerHTML = `<h2>${icon('palette')} Wygląd</h2><p class="muted">Motyw, kolor i rozmiar zapisują się na tym telefonie.</p>
  <div class="look-row"><span>Motyw</span>${seg('mode', [['system', 'Systemowy'], ['light', 'Jasny'], ['dark', 'Ciemny']])}</div>
  <div class="look-row"><span>Kolor akcentu</span><div class="swatches" role="radiogroup">${ACCENTS.map(([id, name, hex]) => `<button type="button" class="swatch" role="radio" aria-label="${name}" aria-checked="${look.accent === id}" data-look="accent" data-val="${id}" style="--sw:${hex}">${icon('check')}</button>`).join('')}</div></div>
  <div class="look-row"><span>Rozmiar tekstu</span>${seg('scale', [[0.92, 'Mały'], [1, 'Normalny'], [1.1, 'Duży']])}</div>
  <div class="look-row"><span>Zaokrąglenie</span>${seg('round', [[10, 'Ostre'], [24, 'Standard'], [32, 'Okrągłe']])}</div>`;
  host.querySelectorAll('[data-look]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.look; const v = b.dataset.val; saveLook({ [k]: k === 'scale' || k === 'round' ? Number(v) : v }); }));
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (readLook().mode === 'system') applyLook(); });

applyLook(); renderLookSettings();
applyTheme(localStorage.getItem(KEYS.theme) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')); renderProfile(); renderDayStrip(); renderGrades(); renderGradePreview(); renderVulcanGradeStats(); renderDashboardOrder(); renderLocalTasks(); renderReplacements(); renderWeek(); loadVulcanStatus(); if (!currentProfile()) openProfileDialog(); await loadClasses(); if (currentProfile()) { $('#class-select').value = currentProfile().className; loadSchoolData(); }
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => {});
setInterval(() => { if (document.visibilityState === 'visible') loadVulcanData(false); }, VULCAN_CACHE_TTL);


function renderLatestGrades() {
  const host = document.getElementById('latest-grades'); if (!host) return;
  const items = gradeItems().filter((x) => x.date).sort((x, y) => y.date - x.date).slice(0, 6);
  host.innerHTML = items.length ? `<div class="lg-title">Ostatnie oceny</div><div class="lg-row">${items.map((x) => `<button type="button" class="lg-chip ${wClass(x.weight)}" data-lg="${esc(x.subject)}"><b>${esc(x.grade.label)}</b><span>${esc(x.subject.length > 14 ? x.subject.slice(0, 13) + '…' : x.subject)}</span><small>${esc(shortDate(x.date))}</small></button>`).join('')}</div>` : '';
  host.querySelectorAll('[data-lg]').forEach((b) => b.addEventListener('click', () => { state.gradeSubject = b.dataset.lg; switchView('grades'); renderVulcanGradeStats(); }));
}
const _rgpHome = renderGradePreview;
renderGradePreview = function () { _rgpHome(); try { renderLatestGrades(); } catch (e) { console.warn(e); } };
async function loadLucky() {
  try {
    if (!state.vulcanStudent) return;
    const r = await apiFetch(`/api/vulcan/data/lucky?pupilId=${state.vulcanStudent.pupilId}`); if (!r.ok) return; const j = await r.json();
    const num = findNested(j.data, ['number', 'luckynumber']); if (num == null || num === '') return;
    let chip = document.getElementById('lucky-chip'); if (!chip) { const anchor = document.querySelector('#plan-view .hero-sub, #plan-view .hero p, #plan-view p'); if (!anchor) return; anchor.insertAdjacentHTML('afterend', '<div id="lucky-chip" class="lucky-chip"></div>'); chip = document.getElementById('lucky-chip'); }
    const mine = j.pupilNumber != null && Number(j.pupilNumber) === Number(num);
    chip.classList.toggle('mine', mine); chip.innerHTML = `${icon('check')}<span>Szczęśliwy numer: <b>${esc(num)}</b>${j.pupilNumber != null ? ` · Twój numer: ${esc(j.pupilNumber)}` : ''}${mine ? ' · to Ty!' : ''}</span>`;
  } catch (e) { console.warn('lucky', e); }
}
setTimeout(() => { renderGradePreview(); loadLucky(); }, 2500);


function changesJump() {
  const list = state.replacements?.replacements || []; const d = replacementDate(state.replacements?.dateText || ''); if (!d || !list.length) return null;
  const day = (d.getDay() + 6) % 7; if (day > 4) return null;
  const base = weekMonday(); base.setDate(base.getDate() - state.weekOffset * 7);
  return { off: Math.round((mondayOf(d) - base) / (7 * 864e5)), day, date: d, count: list.length };
}
function changesBanner(anchor, where) {
  qa('.changes-banner', anchor.parentElement).forEach((n) => n.remove()); const j = changesJump(); if (!j) return;
  const here = j.off === state.weekOffset && (where === 'week' || j.day === state.day); if (here) return;
  const el = h('div', 'changes-banner', `<span><b>Zastępstwa na ${esc(weekday(j.date))} ${esc(shortDate(j.date))}</b> · ${j.count} ${j.count === 1 ? 'zmiana' : 'zmiany'}</span><button type="button" class="outline-button">Pokaż</button>`);
  el.querySelector('button').onclick = () => { state.weekOffset = j.off; state.day = j.day; renderSchedule(); renderWeek(); renderReplacements(); };
  anchor.before(el);
}
const _rsJ = renderSchedule;
renderSchedule = function () { _rsJ(); try { const j = changesJump(); qa('#day-strip .day-button').forEach((b, i) => b.classList.toggle('has-change', !!j && j.off === state.weekOffset && j.day === i)); changesBanner($('#schedule-list'), 'day'); } catch (e) { console.warn(e); } };
const _rwJ = renderWeek;
renderWeek = function () { _rwJ(); try { const j = changesJump(); qa('#week-grid .week-column').forEach((c, i) => c.classList.toggle('has-change-day', !!j && j.off === state.weekOffset && j.day === i)); changesBanner($('#week-grid'), 'week'); } catch (e) { console.warn(e); } };
renderSchedule(); renderWeek();


function updateDayWeekNav() {
  const lab = $('#day-week-label'); if (!lab) return; const mon = weekMonday(); const fri = new Date(mon); fri.setDate(fri.getDate() + 4);
  lab.textContent = `${shortDate(mon)} – ${shortDate(fri)}${state.weekOffset === 0 ? ' · ' + ([0, 6].includes(new Date().getDay()) ? 'najbliższy' : 'ten tydzień') : ''}`;
  $('#day-prev').disabled = state.weekOffset <= -1; $('#day-next').disabled = state.weekOffset >= MAX_WEEKS;
}
const goWeek = (delta) => { const n = state.weekOffset + delta; if (n < -1 || n > MAX_WEEKS) return; state.weekOffset = n; renderSchedule(); renderWeek(); renderReplacements(); };
$('#day-prev')?.addEventListener('click', () => goWeek(-1)); $('#day-next')?.addEventListener('click', () => goWeek(1));
$('#day-week-label')?.addEventListener('click', () => { state.weekOffset = 0; renderSchedule(); renderWeek(); renderReplacements(); });
const _rsNav = renderSchedule; renderSchedule = function () { _rsNav(); try { updateDayWeekNav(); } catch (e) { console.warn(e); } };
(() => { let x0 = null, y0 = 0; const el = document.getElementById('schedule-list'); if (!el) return; el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true }); el.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null; if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) { const d = state.day + (dx < 0 ? 1 : -1); if (d >= 0 && d <= 4) { state.day = d; renderSchedule(); renderWeek(); } else goWeek(dx < 0 ? 1 : -1); } }, { passive: true }); })();
renderSchedule();


state.vplan = {}; const vplanBusy = new Set(); const vplanFailed = new Set();
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const vplanKey = () => isoLocal(weekMonday());
function currentPlanLessons() { const v = state.vplan?.[vplanKey()]; return v && v.length ? v : (state.schedule?.lessons || []); }
function vulcanToLessons(records, monday) {
  const map = new Map();
  for (const r of records || []) {
    if (!r?.DateAt || !r.TimeSlot || r.Visible === false) continue;
    const date = new Date(`${r.DateAt}T12:00:00`); const day = Math.round((date - new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 12)) / 864e5);
    if (day < 0 || day > 4) continue;
    const slot = r.TimeSlot, number = Number(slot.Position); const time = String(slot.Display || `${slot.Start}-${slot.End}`).replace(/\b0(\d:)/g, '$1').replace(/\s+/g, '');
    const kod = String(r.Subject?.Kod || r.Subject?.Name || r.Event || 'Lekcja').replace(/\s+/g, '');
    const group = r.Distribution?.Shortcut || r.Distribution?.Name;
    const entry = { subject: group ? `${kod}-${group}` : kod, fullSubject: r.Subject?.Name || '', teacher: r.TeacherPrimary?.DisplayName || '', room: r.Room?.Code || '', vulcan: true, changeType: r.Change?.Type ?? null, event: r.Event || null };
    const key = `${day}:${number}`; const lesson = map.get(key) || { day, dayName: DAYS[day] || '', number, time, entries: [] };
    if (!lesson.entries.some((e) => e.subject === entry.subject && e.teacher === entry.teacher)) lesson.entries.push(entry); map.set(key, lesson);
  }
  return [...map.values()];
}
async function ensureVulcanPlan() {
  const key = vplanKey(); if (state.vplan[key] !== undefined || vplanBusy.has(key) || vplanFailed.has(key)) return;
  const pupilId = state.vulcanStudent?.pupilId; if (!pupilId) return;
  vplanBusy.add(key); const monday = weekMonday(); const friday = new Date(monday); friday.setDate(friday.getDate() + 4);
  const cacheKey = `vplan:${pupilId}:${key}`; const saved = readDataCache(cacheKey);
  if (saved?.lessons) { state.vplan[key] = saved.lessons; }
  try {
    const r = await apiFetch(`/api/vulcan/data/schedule?pupilId=${encodeURIComponent(pupilId)}&from=${key}&to=${isoLocal(friday)}`); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'plan');
    const lessons = vulcanToLessons(j.data, monday); state.vplan[key] = lessons; writeDataCache(cacheKey, { lessons, savedAt: Date.now() });
  } catch (e) { vplanFailed.add(key); if (state.vplan[key] === undefined) state.vplan[key] = null; }
  finally { vplanBusy.delete(key); }
  try { renderSchedule(); renderWeek(); } catch (e) { console.warn(e); }
}
const _rsV = renderSchedule; renderSchedule = function () { _rsV(); ensureVulcanPlan(); };
const _rwV = renderWeek; renderWeek = function () { _rwV(); ensureVulcanPlan(); };
{ const _lvs = loadVulcanStatus; loadVulcanStatus = async function () { const r = await _lvs.apply(this, arguments); try { renderSchedule(); renderWeek(); } catch (e) { console.warn(e); } return r; }; }


function lessonInfo(day, number) {
  const date = selectedDate(day); const lesson = getDayLessons(day).find((l) => l.number === number); if (!lesson) return null;
  const entries = visibleEntries(lesson); const subj = entries.map((e) => e.subject).join(' | '); const teach = entries.map((e) => e.teacher || '').join(' | ');
  const changes = replacementsForDate(date).filter((c) => c.lesson === number && (!entries.length || entries.some((e) => changeAppliesToEntry(c, e)) || true));
  const tasks = tasksOn(date).filter((t) => taskMatches(t, subj, teach));
  return { date, lesson, entries, changes, tasks };
}
function openLessonSheet(day, number) {
  const info = lessonInfo(day, number); if (!info) return; const { date, lesson, entries, changes, tasks } = info; const e0 = entries[0] || {};
  const title = displaySubject(e0.fullSubject || e0.subject || 'Lekcja').replace(/-(\d+)\s*\/\s*(\d+)\s*$/, '');
  sheet(title, (body) => {
    body.append(h('p', 'sheet-sub', `${esc(weekday(date))} ${esc(shortDate(date))} · ${esc(lesson.time)} · ${lesson.number}. lekcja`));
    const chips = []; for (const e of entries) { const g = e.subject.match(/-(\d+\s*\/\s*\d+)\s*$/); chips.push([e.teacher, e.room && `sala ${e.room}`, g && `grupa ${g[1].replace(/\s+/g, '')}`].filter(Boolean).join(' · ')); }
    if (chips.some(Boolean)) body.append(h('div', 'lesson-meta', [...new Set(chips)].filter(Boolean).map((c) => `<span class="meta-chip">${esc(c)}</span>`).join('')));
    for (const c of changes) { const d = changeDetails(c); body.append(h('div', 'sheet-block chg', `<b>Zmiana w planie${d.cancelled ? ' · odwołana' : ''}</b><p>${esc(d.body || c.description || '')}</p>${c.substitute ? `<p>Zastępstwo: ${esc(c.substitute)}${c.teacher ? ` (za ${esc(c.teacher)})` : ''}</p>` : ''}${d.room ? `<p>Sala: ${esc(d.room)}</p>` : ''}${c.note ? `<p>${esc(c.note)}</p>` : ''}`)); }
    for (const t of tasks) body.append(h('div', `sheet-block ${t.kind === 'exams' ? 'exam' : 'hw'}`, `<b>${t.kind === 'exams' ? esc(t.type || 'Sprawdzian') : 'Zadanie domowe'}</b><p>${esc(t.title || t.subject)}</p><small>${esc([t.subject, t.teacher, t.due && `termin ${shortDate(t.due)}`].filter(Boolean).join(' · '))}</small>`));
    if (!changes.length && !tasks.length) body.append(h('p', 'empty-note', 'Brak sprawdzianów, zadań ani zmian na tę lekcję.'));
  });
}
document.addEventListener('click', (e) => {
  const w = e.target.closest?.('.week-lesson[data-num]'); if (w) { e.stopPropagation(); e.preventDefault(); openLessonSheet(+w.dataset.day, +w.dataset.num); return; }
  const l = e.target.closest?.('#schedule-list .lesson[data-num]'); if (l) { openLessonSheet(state.day, +l.dataset.num); }
}, true);
const _rsD = renderSchedule; renderSchedule = function () {
  _rsD();
  try { qa('#schedule-list .lesson[data-num]').forEach((el) => { const info = lessonInfo(state.day, +el.dataset.num); if (!info) return; const t = info.tasks; if (t.length) { const ex = t.some((x) => x.kind === 'exams'); el.classList.add(ex ? 'k-exam' : 'k-hw'); el.insertAdjacentHTML('beforeend', `<span class="wk-tags">${t.map((x) => `<span class="wk-tag ${x.kind === 'exams' ? 'exam' : 'hw'}">${esc(taskTag(x))}</span>`).join('')}</span>`); } if (info.changes.length) el.classList.add('has-chg'); }); } catch (e) { console.warn(e); }
};
document.addEventListener('click', (e) => { const blk = e.target.closest?.('.dashboard-grid>[data-dashboard-block]'); qa('.dashboard-grid>[data-dashboard-block].wfocus').forEach((b) => { if (b !== blk) b.classList.remove('wfocus'); }); if (blk && blk.classList.contains('wmore')) blk.classList.add('wfocus'); });
setInterval(() => qa('.dashboard-grid>[data-dashboard-block]').forEach((b) => b.classList.toggle('wmore', b.scrollHeight > b.clientHeight + 6 && b.dataset.wsize !== 'auto')), 1500);


const UPD_KEY = 'moj-plan-update-check';
state.update = null;
function renderUpdateCard() {
  const host = document.getElementById('update-settings'); if (!host) return; const u = state.update;
  const ver = u?.current ? `build ${u.current}` : 'wersja deweloperska';
  let status = 'Kliknij „Sprawdź aktualizacje”.', action = '';
  if (u?.error) status = `Nie udało się sprawdzić: ${esc(u.error)}`;
  else if (u?.available) { status = `Dostępna nowa wersja: <b>${esc(u.tag)}</b>${u.notes ? `<br><small>${esc(u.notes)}</small>` : ''}`; action = u.platform === 'windows' || u.platform === 'android' ? '<button type="button" class="primary-button" id="update-install">Zainstaluj aktualizację</button>' : ''; }
  else if (u?.pending) status = 'Nowa wersja jest w trakcie budowania. Spróbuj za kilka minut.';
  else if (u) status = 'Masz najnowszą wersję.';
  const tokenBox = u?.hasToken ? '<p class="muted">Klucz GitHub zapisany. <button type="button" class="text-link" id="update-token-clear">Usuń klucz</button></p>' : '<details class="update-token"><summary>Dodaj klucz GitHub (tylko odczyt)</summary><p class="muted">GitHub → Settings → Developer settings → Fine-grained tokens → repozytorium Edziennik-ZSE → Contents: Read-only. Wklej klucz poniżej.</p><div class="update-actions"><input id="update-token" type="password" placeholder="github_pat_…" autocomplete="off"><button type="button" class="secondary-button" id="update-token-save">Zapisz</button></div></details>';
  host.innerHTML = `<h2>Aktualizacje</h2><p class="muted">Zainstalowana: ${esc(ver)}</p><p id="update-status">${status}</p><div class="update-actions"><button type="button" class="secondary-button" id="update-check">Sprawdź aktualizacje</button>${action}</div>${tokenBox}`;
  host.querySelector('#update-check').onclick = () => checkUpdate(true);
  const say = (t) => { const el = $('#update-status'); if (el) el.textContent = t; };
  host.querySelector('#update-token-save')?.addEventListener('click', async () => { const token = $('#update-token').value.trim(); try { const r = await apiFetch('/api/update/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); checkUpdate(true); } catch (e) { say(`Błąd: ${e.message}`); } });
  host.querySelector('#update-token-clear')?.addEventListener('click', async () => { await apiFetch('/api/update/token', { method: 'DELETE' }); checkUpdate(true); });
  const inst = host.querySelector('#update-install'); if (inst) inst.onclick = async () => {
    inst.disabled = true; say(u.platform === 'windows' ? 'Pobieranie instalatora… aplikacja zamknie się i uruchomi instalator.' : 'Pobieranie aktualizacji…');
    try { const r = await apiFetch('/api/update/install', { method: 'POST' }); const j = await r.json(); if (!r.ok) throw new Error(j.error);
      if (j.ready) { say('Gotowe. Otwieram instalację – zatwierdź ją w oknie Androida.'); window.open(`${MOBILE_API || ''}/api/update/apk`, '_blank'); inst.disabled = false; } }
    catch (e) { inst.disabled = false; say(`Błąd: ${e.message}`); } };
  let banner = document.getElementById('update-banner');
  if (u?.available) { if (!banner) { banner = h('button', 'update-banner', ''); banner.id = 'update-banner'; banner.type = 'button'; banner.onclick = () => document.querySelector('[data-view=settings]')?.click(); const where = document.querySelector('.welcome-row'); where?.parentNode.insertBefore(banner, where); } banner.innerHTML = `Dostępna aktualizacja ${esc(u.tag)} <b>Zobacz</b>`; } else banner?.remove();
}
async function checkUpdate(manual) {
  try { const r = await apiFetch('/api/update/check'); state.update = await r.json(); } catch (e) { state.update = { error: e.message || 'brak połączenia' }; }
  if (!manual && state.update?.error) state.update = { ...state.update, quiet: true };
  try { localStorage.setItem(UPD_KEY, String(Date.now())); } catch {}
  renderUpdateCard();
}
renderUpdateCard();
{ let last = 0; try { last = Number(localStorage.getItem(UPD_KEY)) || 0; } catch {} setTimeout(() => checkUpdate(false), Date.now() - last > 3 * 36e5 ? 4000 : 20000); }
