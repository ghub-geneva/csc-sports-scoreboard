/* =============================================================
   CSC Scoreboard - Admin logic
   Add / edit / delete games, record results, backup data.
   ============================================================= */

const $ = id => document.getElementById(id);

const el = {
  form: $('game-form'), editId: $('edit-id'), formTitle: $('form-title'),
  sport: $('f-sport'),
  wrapCat1: $('wrap-cat1'), cat1: $('f-cat1'), lblCat1: $('lbl-cat1'),
  wrapCat2: $('wrap-cat2'), cat2: $('f-cat2'), lblCat2: $('lbl-cat2'),
  teamA: $('f-teamA'), teamB: $('f-teamB'),
  date: $('f-date'), time: $('f-time'), venue: $('f-venue'),
  stage: $('f-stage'), status: $('f-status'),
  wrapScores: $('wrap-scores'), scoreA: $('f-scoreA'), scoreB: $('f-scoreB'),
  lblScoreA: $('lbl-scoreA'), lblScoreB: $('lbl-scoreB'),
  wrapSets: $('wrap-sets'), setTeamA: $('set-team-a'), setTeamB: $('set-team-b'),
  submitBtn: $('submit-btn'), cancelEdit: $('cancel-edit'),
  filterSport: $('filter-sport'), filterStatus: $('filter-status'),
  list: $('admin-list'), toast: $('toast')
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.toast.classList.remove('show'), 2200);
}
function opt(value, label) { return `<option value="${esc(value)}">${esc(label)}</option>`; }

/* ---- Populate static selects ------------------------------ */
function fillTeams(sel) {
  sel.innerHTML = '<option value="">Select team</option>' +
    TEAMS.map(t => opt(t.id, t.name)).join('');
}
fillTeams(el.teamA);
fillTeams(el.teamB);

el.sport.innerHTML = '<option value="">Select sport</option>' +
  SPORTS.map(s => opt(s.id, s.name)).join('');
el.filterSport.innerHTML = '<option value="">All sports</option>' +
  SPORTS.map(s => opt(s.id, s.name)).join('');

/* ---- Cascading category selects --------------------------- */
function refreshCat1() {
  const sport = getSport(el.sport.value);
  el.wrapCat1.style.display = 'none';
  el.wrapCat2.style.display = 'none';
  el.cat1.innerHTML = '';
  el.cat2.innerHTML = '';
  if (!sport || !sport.children) return;

  el.lblCat1.textContent = sport.id === 'pickleball' ? 'Skill level' : 'Category';
  el.cat1.innerHTML = '<option value="">Select</option>' +
    sport.children.map(c => opt(c.id, c.name)).join('');
  el.wrapCat1.style.display = '';
}

function refreshCat2() {
  const sport = getSport(el.sport.value);
  el.wrapCat2.style.display = 'none';
  el.cat2.innerHTML = '';
  if (!sport || !el.cat1.value) return;
  const kids = childrenByPath(sport, [el.cat1.value]);
  if (!kids.length) return;
  el.lblCat2.textContent = 'Division';
  el.cat2.innerHTML = '<option value="">Select</option>' +
    kids.map(c => opt(c.id, c.name)).join('');
  el.wrapCat2.style.display = '';
}

el.sport.addEventListener('change', () => { refreshCat1(); refreshCat2(); refreshScoreVisibility(); });
el.cat1.addEventListener('change', refreshCat2);

/* Read the category path from the form, validating completeness. */
function readPath() {
  const sport = getSport(el.sport.value);
  if (!sport || !sport.children) return { ok: true, path: [] };
  if (!el.cat1.value) return { ok: false, msg: 'Please choose a category.' };
  const path = [el.cat1.value];
  const kids = childrenByPath(sport, path);
  if (kids.length) {
    if (!el.cat2.value) return { ok: false, msg: 'Please choose a division.' };
    path.push(el.cat2.value);
  }
  return { ok: true, path };
}

/* ---- Status / score toggle -------------------------------- */
function refreshScoreVisibility() {
  const isFinal = el.status.value === 'final';
  const vb = isSetSport(el.sport.value);
  el.wrapScores.style.display = (isFinal && !vb) ? '' : 'none';
  el.wrapSets.style.display = (isFinal && vb) ? '' : 'none';

  const nameA = getTeam(el.teamA.value) ? getTeam(el.teamA.value).name : 'A';
  const nameB = getTeam(el.teamB.value) ? getTeam(el.teamB.value).name : 'B';
  el.lblScoreA.textContent = nameA;
  el.lblScoreB.textContent = nameB;
  el.setTeamA.textContent = nameA;
  el.setTeamB.textContent = nameB;
}
el.status.addEventListener('change', refreshScoreVisibility);
el.teamA.addEventListener('change', refreshScoreVisibility);
el.teamB.addEventListener('change', refreshScoreVisibility);

/* Read fully-filled sets from the form as [[aPts, bPts], ...]. */
function readSets() {
  const sets = [];
  for (let i = 1; i <= 3; i++) {
    const a = $('set-a-' + i).value;
    const b = $('set-b-' + i).value;
    if (a !== '' && b !== '') sets.push([Number(a), Number(b)]);
  }
  return sets;
}

/* Fill the set inputs from a sets array. */
function fillSets(sets) {
  for (let i = 1; i <= 3; i++) {
    const s = (sets || [])[i - 1];
    $('set-a-' + i).value = (s && s[0] != null) ? s[0] : '';
    $('set-b-' + i).value = (s && s[1] != null) ? s[1] : '';
  }
}

/* ---- Submit (add or edit) --------------------------------- */
el.form.addEventListener('submit', async e => {
  e.preventDefault();

  if (!el.sport.value) return toast('Please choose a sport.');
  const cat = readPath();
  if (!cat.ok) return toast(cat.msg);
  if (!el.teamA.value || !el.teamB.value) return toast('Please choose both teams.');
  if (el.teamA.value === el.teamB.value) return toast('Teams must be different.');
  if (!el.date.value) return toast('Please set a date.');

  const status = el.status.value;
  const vb = isSetSport(el.sport.value);
  let scoreA = null, scoreB = null, sets = null;

  if (status === 'final') {
    if (vb) {
      sets = readSets();
      if (!sets.length) return toast('Enter the set scores.');
      const w = setsWon(sets);
      if (Math.max(w.a, w.b) < 2)
        return toast('One team must win 2 sets (best of 3).');
      if (w.a === w.b) return toast('A best of 3 cannot end level on sets.');
      scoreA = w.a;
      scoreB = w.b;
    } else {
      if (el.scoreA.value === '' || el.scoreB.value === '')
        return toast('Enter both scores.');
      scoreA = Number(el.scoreA.value);
      scoreB = Number(el.scoreB.value);
    }
  }

  const data = {
    sportId: el.sport.value,
    path: cat.path,
    teamA: el.teamA.value,
    teamB: el.teamB.value,
    date: el.date.value,
    time: el.time.value,
    venue: el.venue.value.trim(),
    stage: el.stage.value,
    status, scoreA, scoreB
  };
  if (vb) data.sets = sets || [];

  try {
    if (el.editId.value) {
      await Store.update(el.editId.value, data);
      toast('Game updated.');
    } else {
      await Store.add(data);
      toast('Game added.');
    }
    resetForm();
    renderList();
  } catch (err) { handleWriteError(err); }
});

function resetForm() {
  el.form.reset();
  el.editId.value = '';
  el.formTitle.textContent = 'Add a Game';
  el.submitBtn.textContent = 'Add Game';
  el.cancelEdit.style.display = 'none';
  refreshCat1();
  refreshScoreVisibility();
}
el.cancelEdit.addEventListener('click', resetForm);

/* ---- Edit an existing game -------------------------------- */
function editGame(id) {
  const m = Store.getAll().find(x => x.id === id);
  if (!m) return;
  el.editId.value = m.id;
  el.sport.value = m.sportId;
  refreshCat1();
  if (m.path[0]) { el.cat1.value = m.path[0]; refreshCat2(); }
  if (m.path[1]) { el.cat2.value = m.path[1]; }
  el.teamA.value = m.teamA;
  el.teamB.value = m.teamB;
  el.date.value = m.date || '';
  el.time.value = m.time || '';
  el.venue.value = m.venue || '';
  el.stage.value = m.stage || 'round-robin';
  el.status.value = m.status;
  el.scoreA.value = m.scoreA == null ? '' : m.scoreA;
  el.scoreB.value = m.scoreB == null ? '' : m.scoreB;
  fillSets(m.sets);
  refreshScoreVisibility();

  el.formTitle.textContent = 'Edit Game';
  el.submitBtn.textContent = 'Save changes';
  el.cancelEdit.style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---- Quick "record result" from the list ------------------ */
async function saveQuickScore(id) {
  const a = $('qa-' + id).value;
  const b = $('qb-' + id).value;
  if (a === '' || b === '') return toast('Enter both scores.');
  try {
    await Store.update(id, { status: 'final', scoreA: Number(a), scoreB: Number(b) });
    toast('Result recorded.');
    renderList();
  } catch (err) { handleWriteError(err); }
}

// Record a volleyball result from the inline per-set inputs.
async function saveQuickSets(id) {
  const sets = [];
  for (let i = 1; i <= 3; i++) {
    const a = $('qs-a-' + id + '-' + i).value;
    const b = $('qs-b-' + id + '-' + i).value;
    if (a !== '' && b !== '') sets.push([Number(a), Number(b)]);
  }
  if (!sets.length) return toast('Enter the set scores.');
  const wsets = setsWon(sets);
  if (Math.max(wsets.a, wsets.b) < 2) return toast('One team must win 2 sets (best of 3).');
  if (wsets.a === wsets.b) return toast('A best of 3 cannot end level on sets.');
  try {
    await Store.update(id, { status: 'final', scoreA: wsets.a, scoreB: wsets.b, sets });
    toast('Result recorded.');
    renderList();
  } catch (err) { handleWriteError(err); }
}

async function reopenGame(id) {
  try {
    await Store.update(id, { status: 'scheduled', scoreA: null, scoreB: null });
    toast('Moved back to scheduled.');
    renderList();
  } catch (err) { handleWriteError(err); }
}

async function deleteGame(id) {
  if (!confirm('Delete this game? This cannot be undone.')) return;
  try {
    await Store.remove(id);
    toast('Game deleted.');
    renderList();
  } catch (err) { handleWriteError(err); }
}

/* ---- Render the admin list -------------------------------- */
function teamDot(id) {
  const t = getTeam(id);
  return t ? `<span class="team-dot" style="background:${t.color};display:inline-block;vertical-align:middle"></span>` : '';
}

function renderList() {
  // Scheduled (no score) first, games with scores (Played) below; each by date/time.
  let list = Store.getAll().slice().sort((a, b) => {
    const sa = a.status === 'final' ? 1 : 0;
    const sb = b.status === 'final' ? 1 : 0;
    return sa - sb || byDateTime(a, b);
  });
  const fs = el.filterSport.value;
  const fst = el.filterStatus.value;
  if (fs) list = list.filter(m => m.sportId === fs);
  if (fst) list = list.filter(m => m.status === fst);

  if (!list.length) {
    el.list.innerHTML = `<div class="empty"><div class="big">🗓️</div>No games match this view yet.</div>`;
    return;
  }

  el.list.innerHTML = list.map(m => {
    const tA = getTeam(m.teamA), tB = getTeam(m.teamB);
    const w = winnerOf(m);
    const isFinal = m.status === 'final';
    const vb = isSetSport(m.sportId);
    const brk = vb ? setsBreakdown(m) : '';
    const scoreText = isFinal
      ? (vb ? `${esc(m.scoreA)} &ndash; ${esc(m.scoreB)} sets${brk ? ' (' + esc(brk) + ')' : ''}`
            : `${esc(m.scoreA)} &ndash; ${esc(m.scoreB)}`)
      : '';
    const score = isFinal ? ` &nbsp; <strong>${scoreText}</strong>` : '';
    const badge = isFinal
      ? `<span class="badge final">Played</span>`
      : `<span class="badge scheduled">Scheduled</span>`;
    const winTag = (isFinal && w) ? ` <span class="badge win-tag">${esc(getTeam(w).name)} won</span>`
      : (isFinal && !w) ? ` <span class="badge">Draw</span>` : '';
    const stageId = stageOf(m);
    const stageTag = stageId === 'round-robin'
      ? `<span class="badge stage-rr">Round Robin</span>`
      : `<span class="badge stage-final">${esc(getStage(stageId).name)}</span>`;

    // Volleyball records per-set points inline; other sports use a single score.
    const quick = !isFinal
      ? (vb
        ? `<div class="quick-sets">
             <div class="qs-head">
               <span></span>
               <span>${esc(tA ? tA.name : 'A')}</span>
               <span>${esc(tB ? tB.name : 'B')}</span>
             </div>
             ${[1, 2, 3].map(i => `
               <div class="qs-row">
                 <span class="set-lbl">Set ${i}</span>
                 <input type="number" min="0" id="qs-a-${m.id}-${i}" />
                 <input type="number" min="0" id="qs-b-${m.id}-${i}" />
               </div>`).join('')}
             <button class="btn btn-primary btn-sm" data-qsets="${m.id}">Record result</button>
           </div>`
        : `<div class="score-edit">
             <span class="lbl">${esc(tA ? tA.name : 'A')}</span>
             <input type="number" min="0" id="qa-${m.id}" />
             <span class="lbl">&ndash;</span>
             <input type="number" min="0" id="qb-${m.id}" />
             <span class="lbl">${esc(tB ? tB.name : 'B')}</span>
             <button class="btn btn-primary btn-sm" data-quick="${m.id}">Record result</button>
           </div>`)
      : '';

    return `
      <div class="adm-match">
        <div>
          <div class="cat">${esc(pathLabel(m.sportId, m.path))}</div>
          <div style="font-weight:700;margin-top:2px">
            ${teamDot(m.teamA)} ${esc(tA ? tA.name : '?')}
            <span class="vs">vs</span>
            ${teamDot(m.teamB)} ${esc(tB ? tB.name : '?')}${score}
          </div>
          <div class="meta">
            ${stageTag} ${badge}${winTag} &nbsp;
            ${m.date ? esc(m.date) : 'No date'}${m.time ? ' &bull; ' + esc(m.time) : ''}
            ${m.venue ? ' &bull; ' + esc(m.venue) : ''}
          </div>
          ${quick}
        </div>
        <div class="adm-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${m.id}">Edit</button>
          ${isFinal ? `<button class="btn btn-ghost btn-sm" data-reopen="${m.id}">Reopen</button>` : ''}
          <button class="btn btn-red btn-sm" data-del="${m.id}">Delete</button>
        </div>
      </div>`;
  }).join('');

  el.list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editGame(b.dataset.edit));
  el.list.querySelectorAll('[data-del]').forEach(b => b.onclick = () => deleteGame(b.dataset.del));
  el.list.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => saveQuickScore(b.dataset.quick));
  el.list.querySelectorAll('[data-qsets]').forEach(b => b.onclick = () => saveQuickSets(b.dataset.qsets));
  el.list.querySelectorAll('[data-reopen]').forEach(b => b.onclick = () => reopenGame(b.dataset.reopen));
}

el.filterSport.addEventListener('change', renderList);
el.filterStatus.addEventListener('change', renderList);

/* ---- Data backup / restore -------------------------------- */
$('export-btn').addEventListener('click', () => {
  const payload = { matches: Store.getAll(), events: EventStore.getAll() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'csc-scoreboard-backup.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded.');
});

$('import-btn').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let matches, events;
    try {
      const data = JSON.parse(reader.result);
      // Support the current {matches, events} format and the legacy array-only backup.
      matches = Array.isArray(data) ? data : (data.matches || []);
      events = Array.isArray(data) ? [] : (data.events || []);
      if (!Array.isArray(matches)) throw new Error('bad format');
    } catch (err) {
      return toast('Could not read that file.');
    }
    if (!confirm('Import ' + matches.length + ' games and ' + events.length + ' special events? This replaces ALL current data.')) return;
    try {
      await Store.replaceAll(matches);
      await EventStore.replaceAll(events);
      toast('Data imported.');
      renderList();
      renderEventList();
    } catch (err) { handleWriteError(err); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

$('clear-btn').addEventListener('click', async () => {
  if (!confirm('Delete ALL games and special events permanently?')) return;
  try {
    await Store.replaceAll([]);
    await EventStore.replaceAll([]);
    toast('All data cleared.');
    renderList();
    renderEventList();
  } catch (err) { handleWriteError(err); }
});

/* =============================================================
   Special events scoring (Muse & Banner Raising)
   ============================================================= */
const ev = {
  form: $('event-form'), editId: $('ev-edit-id'), title: $('ev-form-title'),
  event: $('ev-event'), date: $('ev-date'), note: $('ev-note'),
  gameTitle: $('ev-title'), wrapTitle: $('wrap-ev-title'), titleLabel: $('ev-title-label'),
  places: $('ev-places'), submit: $('ev-submit-btn'), cancel: $('ev-cancel-edit'),
  list: $('event-list')
};

// Show the title input only for events that need one, with a label/placeholder
// tailored to the event (Pinoy Games, Attendance, ...).
function refreshEventTitle() {
  const e = getEvent(ev.event.value);
  const need = !!(e && e.titled);
  ev.wrapTitle.style.display = need ? '' : 'none';
  if (need) {
    ev.titleLabel.textContent = e.titleLabel || 'Title';
    ev.gameTitle.placeholder = e.titlePlaceholder || '';
  }
}
ev.event.addEventListener('change', refreshEventTitle);

// Event dropdown.
ev.event.innerHTML = '<option value="">Select event</option>' +
  SPECIAL_EVENTS.map(e => opt(e.id, e.name)).join('');

// One placement select per team (None / 1st..4th, with points shown).
function placeOptions(selected) {
  let html = '<option value="0">No placement</option>';
  [1, 2, 3, 4].forEach(p => {
    const sel = String(selected) === String(p) ? ' selected' : '';
    html += `<option value="${p}"${sel}>${placeLabel(p)} (${pointsForPlace(p)} pts)</option>`;
  });
  return html;
}

function buildPlaceRows(current) {
  current = current || {};
  ev.places.innerHTML = TEAMS.map(t => `
    <div class="ev-place-row">
      <span class="team-dot" style="background:${t.color}"></span>
      <span class="ev-place-team">${esc(t.name)}</span>
      <select id="place-${t.id}">${placeOptions(current[t.id])}</select>
    </div>`).join('');
}

function readPlaces() {
  const places = {};
  const used = {};
  let dup = false;
  TEAMS.forEach(t => {
    const val = Number($('place-' + t.id).value);
    if (val >= 1 && val <= 4) {
      if (used[val]) dup = true;
      used[val] = true;
      places[t.id] = val;
    }
  });
  return { places, dup };
}

ev.form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!ev.event.value) return toast('Please choose an event.');
  const needsTitle = eventNeedsTitle(ev.event.value);
  const gameTitle = ev.gameTitle.value.trim();
  if (needsTitle && !gameTitle) {
    const lbl = (getEvent(ev.event.value).titleLabel || 'title').toLowerCase();
    return toast('Please enter the ' + lbl + '.');
  }
  const { places, dup } = readPlaces();
  if (Object.keys(places).length === 0) return toast('Set at least one placement.');
  if (dup) return toast('Each placement (1st to 4th) can be used only once.');

  const data = {
    eventId: ev.event.value,
    title: needsTitle ? gameTitle : '',
    date: ev.date.value,
    note: ev.note.value.trim(),
    places
  };

  try {
    if (ev.editId.value) {
      await EventStore.update(ev.editId.value, data);
      toast('Event result updated.');
    } else {
      await EventStore.add(data);
      toast('Event result saved.');
    }
    resetEventForm();
    renderEventList();
  } catch (err) { handleWriteError(err); }
});

function resetEventForm() {
  ev.form.reset();
  ev.editId.value = '';
  ev.title.textContent = 'Special Events Scoring';
  ev.submit.textContent = 'Save Event Result';
  ev.cancel.style.display = 'none';
  buildPlaceRows({});
  refreshEventTitle();
}
ev.cancel.addEventListener('click', resetEventForm);

function editEvent(id) {
  const rec = EventStore.getAll().find(x => x.id === id);
  if (!rec) return;
  ev.editId.value = rec.id;
  ev.event.value = rec.eventId;
  ev.gameTitle.value = rec.title || '';
  refreshEventTitle();
  ev.date.value = rec.date || '';
  ev.note.value = rec.note || '';
  buildPlaceRows(rec.places || {});
  ev.title.textContent = 'Edit Event Result';
  ev.submit.textContent = 'Save changes';
  ev.cancel.style.display = '';
  ev.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteEvent(id) {
  if (!confirm('Delete this event result?')) return;
  try {
    await EventStore.remove(id);
    toast('Event result deleted.');
    renderEventList();
  } catch (err) { handleWriteError(err); }
}

function renderEventList() {
  const records = EventStore.getAll().slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!records.length) {
    ev.list.innerHTML = `<div class="empty"><div class="big">👑</div>No special event results recorded yet.</div>`;
    return;
  }
  ev.list.innerHTML = records.map(rec => {
    const event = getEvent(rec.eventId);
    const ranked = TEAMS
      .map(t => ({ team: t, place: (rec.places || {})[t.id] }))
      .filter(x => x.place)
      .sort((a, b) => a.place - b.place);
    const line = ranked.map(x =>
      `${teamDot(x.team.id)} ${esc(x.team.name)} <strong>${placeLabel(x.place)}</strong> (+${pointsForPlace(x.place)})`
    ).join(' &nbsp; ');
    const evName = (event ? event.name : rec.eventId) + (rec.title ? ': ' + rec.title : '');
    return `
      <div class="adm-match">
        <div>
          <div class="cat">${event ? event.emoji : ''} ${esc(evName)}</div>
          <div style="margin-top:4px">${line || 'No placements'}</div>
          <div class="meta">${rec.date ? esc(rec.date) : 'No date'}${rec.note ? ' &bull; ' + esc(rec.note) : ''}</div>
        </div>
        <div class="adm-actions">
          <button class="btn btn-ghost btn-sm" data-ev-edit="${rec.id}">Edit</button>
          <button class="btn btn-red btn-sm" data-ev-del="${rec.id}">Delete</button>
        </div>
      </div>`;
  }).join('');

  ev.list.querySelectorAll('[data-ev-edit]').forEach(b => b.onclick = () => editEvent(b.dataset.evEdit));
  ev.list.querySelectorAll('[data-ev-del]').forEach(b => b.onclick = () => deleteEvent(b.dataset.evDel));
}

/* =============================================================
   Auth gate - the admin UI is hidden until login succeeds.
   ============================================================= */
function handleWriteError(err) {
  const msg = String(err && err.message || err);
  // Session lost / not authorized: send back to the login screen.
  if (/jwt|token|unauthor|401|permission|rls|row-level|policy/i.test(msg)) {
    toast('Please log in again.');
    showLogin();
  } else {
    toast('Save failed: ' + msg);
  }
}

function showLogin() {
  $('login-gate').style.display = '';
  $('admin-content').style.display = 'none';
  $('admin-user-box').style.display = 'none';
}

async function showAdmin() {
  $('login-gate').style.display = 'none';
  $('admin-content').style.display = '';
  $('admin-user-box').style.display = '';
  $('admin-user').textContent = Auth.email() || '';

  refreshCat1();
  refreshScoreVisibility();
  buildPlaceRows({});
  try {
    await DataSync.loadAll();
    renderList();
    renderEventList();
  } catch (err) {
    toast('Could not load data: ' + (err.message || err));
  }
}

$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const btn = $('login-btn');
  const errEl = $('login-error');
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    await Auth.signIn(email, password);
    $('login-form').reset();
    await showAdmin();
  } catch (err) {
    errEl.textContent = err.message || 'Login failed';
  } finally {
    btn.disabled = false; btn.textContent = 'Log in';
  }
});

$('logout-btn').addEventListener('click', async () => {
  await Auth.signOut();
  showLogin();
});

/* Sidebar navigation: show the chosen view, hide the others. */
function showView(view) {
  document.querySelectorAll('.side-link').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.admin-view').forEach(v =>
    v.hidden = (v.dataset.view !== view));
}
document.querySelectorAll('.side-link').forEach(b =>
  b.addEventListener('click', () => {
    showView(b.dataset.view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

/* Decide the initial screen: refresh a stored session if present. */
(async () => {
  if (Auth.load() && await Auth.refresh()) {
    await showAdmin();
  } else {
    showLogin();
  }
})();
