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

el.sport.addEventListener('change', () => { refreshCat1(); refreshCat2(); });
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
  el.wrapScores.style.display = el.status.value === 'final' ? '' : 'none';
  el.lblScoreA.textContent = getTeam(el.teamA.value) ? getTeam(el.teamA.value).name : 'A';
  el.lblScoreB.textContent = getTeam(el.teamB.value) ? getTeam(el.teamB.value).name : 'B';
}
el.status.addEventListener('change', refreshScoreVisibility);
el.teamA.addEventListener('change', refreshScoreVisibility);
el.teamB.addEventListener('change', refreshScoreVisibility);

/* ---- Submit (add or edit) --------------------------------- */
el.form.addEventListener('submit', e => {
  e.preventDefault();

  if (!el.sport.value) return toast('Please choose a sport.');
  const cat = readPath();
  if (!cat.ok) return toast(cat.msg);
  if (!el.teamA.value || !el.teamB.value) return toast('Please choose both teams.');
  if (el.teamA.value === el.teamB.value) return toast('Teams must be different.');
  if (!el.date.value) return toast('Please set a date.');

  const status = el.status.value;
  let scoreA = null, scoreB = null;
  if (status === 'final') {
    if (el.scoreA.value === '' || el.scoreB.value === '')
      return toast('Enter both scores for a final game.');
    scoreA = Number(el.scoreA.value);
    scoreB = Number(el.scoreB.value);
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

  if (el.editId.value) {
    Store.update(el.editId.value, data);
    toast('Game updated.');
  } else {
    Store.add(data);
    toast('Game added.');
  }
  resetForm();
  renderList();
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
  refreshScoreVisibility();

  el.formTitle.textContent = 'Edit Game';
  el.submitBtn.textContent = 'Save changes';
  el.cancelEdit.style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---- Quick "record result" from the list ------------------ */
function saveQuickScore(id) {
  const a = $('qa-' + id).value;
  const b = $('qb-' + id).value;
  if (a === '' || b === '') return toast('Enter both scores.');
  Store.update(id, { status: 'final', scoreA: Number(a), scoreB: Number(b) });
  toast('Result recorded.');
  renderList();
}

function reopenGame(id) {
  Store.update(id, { status: 'scheduled', scoreA: null, scoreB: null });
  toast('Moved back to scheduled.');
  renderList();
}

function deleteGame(id) {
  if (!confirm('Delete this game? This cannot be undone.')) return;
  Store.remove(id);
  toast('Game deleted.');
  renderList();
}

/* ---- Render the admin list -------------------------------- */
function teamDot(id) {
  const t = getTeam(id);
  return t ? `<span class="team-dot" style="background:${t.color};display:inline-block;vertical-align:middle"></span>` : '';
}

function renderList() {
  let list = Store.getAll().slice().sort(byDateTime);
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
    const score = isFinal ? ` &nbsp; <strong>${esc(m.scoreA)} &ndash; ${esc(m.scoreB)}</strong>` : '';
    const badge = isFinal
      ? `<span class="badge final">Final</span>`
      : `<span class="badge scheduled">Scheduled</span>`;
    const winTag = (isFinal && w) ? ` <span class="badge win-tag">${esc(getTeam(w).name)} won</span>`
      : (isFinal && !w) ? ` <span class="badge">Draw</span>` : '';
    const stageId = stageOf(m);
    const stageTag = stageId === 'round-robin'
      ? `<span class="badge stage-rr">Round Robin</span>`
      : `<span class="badge stage-final">${esc(getStage(stageId).name)}</span>`;

    const quick = !isFinal ? `
      <div class="score-edit">
        <span class="lbl">${esc(tA ? tA.name : 'A')}</span>
        <input type="number" min="0" id="qa-${m.id}" />
        <span class="lbl">&ndash;</span>
        <input type="number" min="0" id="qb-${m.id}" />
        <span class="lbl">${esc(tB ? tB.name : 'B')}</span>
        <button class="btn btn-primary btn-sm" data-quick="${m.id}">Record result</button>
      </div>` : '';

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
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      // Support the current {matches, events} format and the legacy array-only backup.
      const matches = Array.isArray(data) ? data : (data.matches || []);
      const events = Array.isArray(data) ? [] : (data.events || []);
      if (!Array.isArray(matches)) throw new Error('bad format');
      if (!confirm('Import ' + matches.length + ' games and ' + events.length + ' special events? This replaces current data.')) return;
      Store.saveAll(matches);
      EventStore.saveAll(events);
      toast('Data imported.');
      renderList();
      renderEventList();
    } catch (err) {
      toast('Could not read that file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

$('clear-btn').addEventListener('click', () => {
  if (!confirm('Delete ALL games and special events permanently?')) return;
  Store.saveAll([]);
  EventStore.saveAll([]);
  toast('All data cleared.');
  renderList();
  renderEventList();
});

/* =============================================================
   Special events scoring (Muse & Banner Raising)
   ============================================================= */
const ev = {
  form: $('event-form'), editId: $('ev-edit-id'), title: $('ev-form-title'),
  event: $('ev-event'), date: $('ev-date'), note: $('ev-note'),
  places: $('ev-places'), submit: $('ev-submit-btn'), cancel: $('ev-cancel-edit'),
  list: $('event-list')
};

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

ev.form.addEventListener('submit', e => {
  e.preventDefault();
  if (!ev.event.value) return toast('Please choose an event.');
  const { places, dup } = readPlaces();
  if (Object.keys(places).length === 0) return toast('Set at least one placement.');
  if (dup) return toast('Each placement (1st to 4th) can be used only once.');

  const data = {
    eventId: ev.event.value,
    date: ev.date.value,
    note: ev.note.value.trim(),
    places
  };

  if (ev.editId.value) {
    EventStore.update(ev.editId.value, data);
    toast('Event result updated.');
  } else {
    EventStore.add(data);
    toast('Event result saved.');
  }
  resetEventForm();
  renderEventList();
});

function resetEventForm() {
  ev.form.reset();
  ev.editId.value = '';
  ev.title.textContent = 'Special Events Scoring';
  ev.submit.textContent = 'Save Event Result';
  ev.cancel.style.display = 'none';
  buildPlaceRows({});
}
ev.cancel.addEventListener('click', resetEventForm);

function editEvent(id) {
  const rec = EventStore.getAll().find(x => x.id === id);
  if (!rec) return;
  ev.editId.value = rec.id;
  ev.event.value = rec.eventId;
  ev.date.value = rec.date || '';
  ev.note.value = rec.note || '';
  buildPlaceRows(rec.places || {});
  ev.title.textContent = 'Edit Event Result';
  ev.submit.textContent = 'Save changes';
  ev.cancel.style.display = '';
  ev.form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function deleteEvent(id) {
  if (!confirm('Delete this event result?')) return;
  EventStore.remove(id);
  toast('Event result deleted.');
  renderEventList();
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
    return `
      <div class="adm-match">
        <div>
          <div class="cat">${event ? event.emoji : ''} ${esc(event ? event.name : rec.eventId)}</div>
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

/* ---- Init ------------------------------------------------- */
refreshCat1();
refreshScoreVisibility();
renderList();
buildPlaceRows({});
renderEventList();
