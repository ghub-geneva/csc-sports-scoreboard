/* =============================================================
   CSC Scoreboard - Viewer logic (front end)
   Navigation: home -> sport -> category levels -> schedule
   ============================================================= */

const app = document.getElementById('app');

/* Navigation state */
let state = {
  sportId: null,   // null = home
  path: [],        // category ids drilled into
  tab: 'upcoming'  // 'upcoming' | 'results'
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmtDate(d) {
  if (!d) return 'TBA';
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return hh + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

function teamChip(id) {
  const t = getTeam(id);
  if (!t) return '<span class="team-chip">?</span>';
  return `<span class="team-chip">
      <span class="team-dot" style="background:${t.color}"></span>${esc(t.name)}
    </span>`;
}

/* ---- Renderers -------------------------------------------- */

function render() {
  if (!state.sportId) return renderHome();
  const sport = getSport(state.sportId);
  if (isLeaf(sport, state.path)) return renderSchedule(sport);
  return renderCategoryList(sport);
}

function renderHome() {
  const rows = standings();

  // Overall Standings: always shown (every team starts at 0).
  const standHtml = `
    <h2 class="section-title"><span class="bar"></span> Overall Standings</h2>
    <div class="standings">
      ${rows.map((r, i) => `
        <div class="stand-card" style="background:${r.team.color};color:${r.team.text}">
          <span class="rank">#${i + 1}</span>
          <div class="name">${esc(r.team.name)}</div>
          <div class="wins">${r.points}</div>
          <div class="sub">points &bull; ${r.wins} win${r.wins === 1 ? '' : 's'}</div>
        </div>`).join('')}
    </div>
    <div class="points-note">
      <strong>Scoring per event:</strong>
      <span class="pts-pill">1st = 10 pts</span>
      <span class="pts-pill">2nd = 7 pts</span>
      <span class="pts-pill">3rd = 5 pts</span>
      <span class="pts-pill">4th = 3 pts</span>
    </div>`;

  // Scoreboard: unified latest results - sport finals plus special events.
  const matchEntries = Store.getAll()
    .filter(m => m.status === 'final')
    .map(m => ({ type: 'match', data: m, date: m.date || '', time: m.time || '' }));
  const eventEntries = EventStore.getAll()
    .map(e => ({ type: 'event', data: e, date: e.date || '', time: '' }));

  const entries = matchEntries.concat(eventEntries)
    .sort((a, b) => {
      const ka = a.date + 'T' + (a.time || '00:00');
      const kb = b.date + 'T' + (b.time || '00:00');
      return ka < kb ? 1 : ka > kb ? -1 : 0; // newest first
    })
    .slice(0, 12);

  // Always shown; a placeholder appears until the first result is recorded.
  const scoreboardHtml = `
    <h2 class="section-title"><span class="bar"></span> Scoreboard - Latest Results</h2>
    ${entries.length ? `
    <div class="scoreboard">
      ${entries.map(e => e.type === 'match' ? scoreboardRow(e.data) : eventCard(e.data)).join('')}
    </div>` : `
    <div class="empty">
      <div class="big">🏆</div>
      <div>No results yet.</div>
      <div style="margin-top:6px;font-size:.85rem;">
        Sport scores and special event placements show up here as soon as they are recorded from the Admin page.
      </div>
    </div>`}`;

  const tiles = SPORTS.map(s => {
    const cats = s.children ? s.children.length + ' categories' : 'No categories';
    const count = countMatchesInSport(s.id);
    return `
      <button class="tile" data-sport="${s.id}">
        <span class="emoji">${s.emoji}</span>
        <span class="tile-name">${esc(s.name)}</span>
        <span class="tile-meta">${cats} &bull; ${count} game${count === 1 ? '' : 's'}</span>
        <span class="chev">View &rsaquo;</span>
      </button>`;
  }).join('');

  app.innerHTML = `
    ${standHtml}
    ${scoreboardHtml}
    <h2 class="section-title"><span class="bar"></span> Sports</h2>
    <div class="grid">${tiles}</div>`;

  app.querySelectorAll('[data-sport]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.sportId = btn.dataset.sport;
      state.path = [];
      state.tab = 'upcoming';
      render();
    }));

  // A scoreboard row jumps to that game's sport / category, Results tab.
  app.querySelectorAll('[data-open-match]').forEach(card =>
    card.addEventListener('click', () => {
      const sportId = card.dataset.sport;
      const path = card.dataset.path ? card.dataset.path.split('|') : [];
      state.sportId = sportId;
      state.path = path;
      state.tab = 'results';
      render();
    }));
}

// One compact score line for the home-page scoreboard.
function scoreboardRow(m) {
  const w = winnerOf(m);
  const tA = getTeam(m.teamA), tB = getTeam(m.teamB);
  const cat = categoryLabel(m.sportId, m.path);
  const sport = getSport(m.sportId);
  const side = (id, t, score) => `
    <div class="sb-team ${w === id ? 'win' : ''}">
      <span class="team-dot" style="background:${t ? t.color : '#ccc'}"></span>
      <span class="sb-name">${esc(t ? t.name : '?')}</span>
      <span class="sb-score">${esc(score)}</span>
    </div>`;
  const stageId = stageOf(m);
  const stageTag = stageId !== 'round-robin'
    ? `<span class="sb-stage">${esc(getStage(stageId).name)}</span>` : '';
  return `
    <button class="scoreboard-card" data-open-match
        data-sport="${m.sportId}" data-path="${(m.path || []).join('|')}">
      <div class="sb-head">
        <span>${sport ? sport.emoji : ''} ${esc(sport ? sport.name : '')}${cat ? ' &bull; ' + esc(cat) : ''}</span>
        <span class="sb-date">${fmtDate(m.date)}</span>
      </div>
      ${stageTag}
      ${side(m.teamA, tA, m.scoreA)}
      ${side(m.teamB, tB, m.scoreB)}
      <div class="sb-foot">${w ? esc(getTeam(w).name) + ' won' : 'Draw'}</div>
    </button>`;
}

function countMatchesInSport(sportId) {
  return Store.getAll().filter(m => m.sportId === sportId).length;
}

// One card for a recorded special-event result, teams ordered by placement.
function eventCard(ev) {
  const event = getEvent(ev.eventId);
  const ranked = TEAMS
    .map(t => ({ team: t, place: (ev.places || {})[t.id] }))
    .filter(x => x.place)
    .sort((a, b) => a.place - b.place);

  const rows = ranked.length ? ranked.map(x => `
    <div class="ev-row">
      <span class="ev-place">${placeLabel(x.place)}</span>
      <span class="team-dot" style="background:${x.team.color}"></span>
      <span class="ev-name">${esc(x.team.name)}</span>
      <span class="ev-pts">+${pointsForPlace(x.place)}</span>
    </div>`).join('') : `<div class="ev-row"><span class="ev-name">No placements set</span></div>`;

  return `
    <div class="scoreboard-card" style="cursor:default;border-top-color:var(--gold)">
      <div class="sb-head">
        <span>${event ? event.emoji : ''} ${esc(event ? event.name : ev.eventId)}</span>
        <span class="sb-date">${ev.date ? fmtDate(ev.date) : ''}</span>
      </div>
      ${rows}
      ${ev.note ? `<div class="sb-foot">${esc(ev.note)}</div>` : ''}
    </div>`;
}

function breadcrumbHtml() {
  const sport = getSport(state.sportId);
  let html = `<div class="breadcrumb">
    <button data-nav="home">Home</button>`;
  html += `<span class="sep">&rsaquo;</span>`;

  const atSport = state.path.length === 0;
  if (atSport) {
    html += `<span class="current">${esc(sport.name)}</span>`;
  } else {
    html += `<button data-nav="sport">${esc(sport.name)}</button>`;
    state.path.forEach((id, i) => {
      const node = nodeByPath(sport, state.path.slice(0, i + 1));
      html += `<span class="sep">&rsaquo;</span>`;
      if (i === state.path.length - 1) {
        html += `<span class="current">${esc(node ? node.name : id)}</span>`;
      } else {
        html += `<button data-nav="path" data-depth="${i + 1}">${esc(node ? node.name : id)}</button>`;
      }
    });
  }
  html += `</div>`;
  return html;
}

function wireBreadcrumb() {
  app.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => {
    const nav = el.dataset.nav;
    if (nav === 'home') { state.sportId = null; state.path = []; }
    else if (nav === 'sport') { state.path = []; }
    else if (nav === 'path') { state.path = state.path.slice(0, Number(el.dataset.depth)); }
    render();
  }));
}

function renderCategoryList(sport) {
  const kids = childrenByPath(sport, state.path);
  const tiles = kids.map(node => {
    const childPath = state.path.concat(node.id);
    const leaf = isLeaf(sport, childPath);
    const count = leaf
      ? matchesFor(sport.id, childPath).length
      : childrenByPath(sport, childPath).length;
    const meta = leaf
      ? count + ' game' + (count === 1 ? '' : 's')
      : count + ' categories';
    return `
      <button class="tile" data-cat="${node.id}">
        <span class="emoji">${sport.emoji}</span>
        <span class="tile-name">${esc(node.name)}</span>
        <span class="tile-meta">${meta}</span>
        <span class="chev">${leaf ? 'Schedule' : 'Open'} &rsaquo;</span>
      </button>`;
  }).join('');

  app.innerHTML = `
    ${breadcrumbHtml()}
    <h2 class="section-title"><span class="bar"></span> ${esc(sport.name)} - Choose a category</h2>
    <div class="grid">${tiles}</div>`;

  wireBreadcrumb();
  app.querySelectorAll('[data-cat]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.path = state.path.concat(btn.dataset.cat);
      state.tab = 'upcoming';
      render();
    }));
}

function renderSchedule(sport) {
  const all = matchesFor(sport.id, state.path);
  const upcoming = all.filter(m => m.status !== 'final').sort(byDateTime);
  const results = all.filter(m => m.status === 'final').sort(byDateTime).reverse();
  const list = state.tab === 'upcoming' ? upcoming : results;
  const catLabel = categoryLabel(sport.id, state.path);

  const rows = list.length
    ? `<div class="match-list">${list.map(matchRow).join('')}</div>`
    : emptyState(state.tab);

  app.innerHTML = `
    ${breadcrumbHtml()}
    <h2 class="section-title">
      <span class="bar"></span> ${sport.emoji} ${esc(sport.name)}${catLabel ? ' - ' + esc(catLabel) : ''}
    </h2>
    ${placementsHtml(sport)}
    ${roundRobinHtml(sport)}
    <h3 class="sub-title">Games</h3>
    <div class="tabs">
      <button data-tab="upcoming" class="${state.tab === 'upcoming' ? 'active' : ''}">
        Upcoming (${upcoming.length})
      </button>
      <button data-tab="results" class="${state.tab === 'results' ? 'active' : ''}">
        Results (${results.length})
      </button>
    </div>
    ${rows}`;

  wireBreadcrumb();
  app.querySelectorAll('[data-tab]').forEach(btn =>
    btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); }));
}

// Round-robin standings table for the current category.
function roundRobinHtml(sport) {
  const rrGames = matchesFor(sport.id, state.path)
    .filter(m => stageOf(m) === 'round-robin' && m.status === 'final');
  if (!rrGames.length) return '';

  const table = roundRobinTable(sport.id, state.path);
  const anyPlayed = table.some(r => r.played > 0);
  if (!anyPlayed) return '';

  return `
    <h3 class="sub-title">Round Robin Standings <span class="seed-hint">(seeding for the finals)</span></h3>
    <div class="table-wrap">
      <table class="rr-table">
        <thead>
          <tr>
            <th>Seed</th><th>Team</th><th>W</th><th>L</th>
            <th title="Points For (total scored)">PF</th>
            <th title="Points Against (total allowed)">PA</th>
            <th>Diff</th>
          </tr>
        </thead>
        <tbody>
          ${table.map((r, i) => `
            <tr>
              <td class="seed">${i + 1}</td>
              <td><span class="team-dot" style="background:${r.team.color}"></span> ${esc(r.team.name)}</td>
              <td>${r.w}</td>
              <td>${r.l}</td>
              <td>${r.pf}</td>
              <td>${r.pa}</td>
              <td>${r.diff > 0 ? '+' : ''}${r.diff}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// Final placements (1st..4th with points) once the placement games are final.
function placementsHtml(sport) {
  const p = categoryPlacements(sport.id, state.path);
  if (!Object.keys(p).length) return '';
  const medal = { 1: '🥇', 2: '🥈', 3: '🥉', 4: '4th' };
  const cells = [1, 2, 3, 4].map(place => {
    const teamId = p[place];
    const t = teamId ? getTeam(teamId) : null;
    return `
      <div class="place-cell ${t ? '' : 'tbd'}">
        <div class="place-rank">${medal[place]}</div>
        ${t ? `<span class="team-dot" style="background:${t.color}"></span>
               <span class="place-team">${esc(t.name)}</span>` : `<span class="place-team">TBD</span>`}
        <div class="place-pts">${pointsForPlace(place)} pts</div>
      </div>`;
  }).join('');
  return `
    <h3 class="sub-title">Final Placements</h3>
    <div class="placements">${cells}</div>`;
}

function matchRow(m) {
  const w = winnerOf(m);
  const isFinal = m.status === 'final';
  const scoreA = isFinal ? `<span class="score ${w === m.teamA ? 'win' : ''}">${esc(m.scoreA)}</span>` : '';
  const scoreB = isFinal ? `<span class="score ${w === m.teamB ? 'win' : ''}">${esc(m.scoreB)}</span>` : '';

  const stageId = stageOf(m);
  const stageBadge = stageId === 'round-robin'
    ? `<span class="badge stage-rr">Round Robin</span>`
    : `<span class="badge stage-final">${esc(getStage(stageId).name)}</span>`;

  let winnerLine = '';
  if (isFinal) {
    winnerLine = w
      ? `<div class="winner-line">Winner: <strong>${esc(getTeam(w).name)}</strong></div>`
      : `<div class="winner-line">Result: <strong>Draw</strong></div>`;
  }

  return `
    <div class="match">
      <div class="when">
        <div class="date">${fmtDate(m.date)}</div>
        <div>${fmtTime(m.time)}</div>
        <div class="venue">${m.venue ? esc(m.venue) : ''}</div>
      </div>
      <div class="teams-row">
        ${teamChip(m.teamA)} ${scoreA}
        <span class="vs">VS</span>
        ${scoreB} ${teamChip(m.teamB)}
      </div>
      <div class="match-badges">
        ${stageBadge}
        <span class="badge ${isFinal ? 'final' : 'scheduled'}">${isFinal ? 'Final' : 'Scheduled'}</span>
      </div>
      ${winnerLine}
    </div>`;
}

function emptyState(tab) {
  return `
    <div class="empty">
      <div class="big">${tab === 'upcoming' ? '📅' : '🏆'}</div>
      <div>No ${tab === 'upcoming' ? 'upcoming games' : 'recorded results'} yet.</div>
      <div style="margin-top:6px;font-size:.85rem;">
        Games appear here once added from the Admin page.
      </div>
    </div>`;
}

/* ---- Bootstrap: load from Supabase, then live-refresh ----- */
let lastHash = '';
function dataHash() {
  return JSON.stringify(Store.getAll()) + '|' + JSON.stringify(EventStore.getAll());
}

function loadingState() {
  app.innerHTML = `
    <div class="empty">
      <div class="big">⏳</div>
      <div>Loading scoreboard...</div>
    </div>`;
}

async function boot() {
  loadingState();
  try {
    await DataSync.loadAll();
    lastHash = dataHash();
    render();
  } catch (e) {
    app.innerHTML = `
      <div class="empty">
        <div class="big">⚠️</div>
        <div>Could not load the scoreboard.</div>
        <div style="margin-top:6px;font-size:.85rem;">${esc(String(e && e.message || e))}</div>
      </div>`;
  }
}

// Poll every 8s so phones stay in sync; only re-render when data changes.
setInterval(async () => {
  try {
    await DataSync.loadAll();
    const h = dataHash();
    if (h !== lastHash) { lastHash = h; render(); }
  } catch (e) { /* keep showing last good data */ }
}, 8000);

// Refresh immediately when the tab regains focus.
window.addEventListener('focus', async () => {
  try {
    await DataSync.loadAll();
    const h = dataHash();
    if (h !== lastHash) { lastHash = h; render(); }
  } catch (e) { /* ignore */ }
});

boot();
