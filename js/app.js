/* =============================================================
   CSC Scoreboard - Viewer logic (front end)
   Navigation: home -> sport -> category levels -> schedule
   ============================================================= */

const app = document.getElementById('app');

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/* Navigation state */
let state = {
  sportId: null,           // null = home
  path: [],                // category ids drilled into
  tab: 'upcoming',         // 'upcoming' | 'results'
  teamId: null,            // non-null = viewing a team's per-category breakdown
  scheduleDate: todayStr(),// day shown in the home "Games Schedule" section
  scheduleAuto: true       // true = auto-pick the nearest day with games
};

/* Pick the day to show: the nearest day that still has scheduled (unplayed)
   games, so once a day's games are all Played it advances to the next
   scheduled day. Falls back to the nearest day with any games. */
function nearestGameDate() {
  const today = todayStr();
  const pickNearest = (dates) => {
    if (!dates.length) return null;
    if (dates.indexOf(today) !== -1) return today;
    const upcoming = dates.filter(d => d > today);
    return upcoming.length ? upcoming[0] : dates[dates.length - 1];
  };

  // Prefer days that still have a scheduled game.
  const scheduled = [...new Set(
    Store.getAll().filter(m => m.status !== 'final' && m.date).map(m => m.date)
  )].sort();
  const bySchedule = pickNearest(scheduled);
  if (bySchedule) return bySchedule;

  // No scheduled games left anywhere: fall back to any day with games.
  const anyDates = [...new Set(Store.getAll().map(m => m.date).filter(Boolean))].sort();
  return pickNearest(anyDates) || today;
}

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
  if (state.teamId) return renderTeam();
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
        <button class="stand-card" data-team="${r.team.id}" style="background:${r.team.color};color:${r.team.text}">
          <span class="rank">#${i + 1}</span>
          <div class="name">${esc(r.team.name)}</div>
          <div class="wins">${r.points}</div>
          <div class="sub">points &bull; ${r.wins} win${r.wins === 1 ? '' : 's'}</div>
          <span class="stand-more">View breakdown &rsaquo;</span>
        </button>`).join('')}
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
    <h2 class="section-title"><span class="bar"></span> Sports</h2>
    <div class="grid">${tiles}</div>
    ${scheduleHtml()}
    ${scoreboardHtml}`;

  app.querySelectorAll('[data-sport]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.sportId = btn.dataset.sport;
      state.path = [];
      state.tab = 'upcoming';
      render();
    }));

  // A standings card opens that team's per-category breakdown.
  app.querySelectorAll('[data-team]').forEach(btn =>
    btn.addEventListener('click', () => {
      state.teamId = btn.dataset.team;
      state.sportId = null;
      state.path = [];
      render();
    }));

  // A scoreboard/schedule row jumps to that game's sport / category.
  app.querySelectorAll('[data-open-match]').forEach(card =>
    card.addEventListener('click', () => {
      const sportId = card.dataset.sport;
      const path = card.dataset.path ? card.dataset.path.split('|') : [];
      state.sportId = sportId;
      state.path = path;
      state.tab = card.dataset.tab || 'results';
      render();
    }));

  // Games Schedule date controls. Picking a date pins it (turns off auto).
  const sd = document.getElementById('sched-date');
  if (sd) sd.addEventListener('change', () => {
    state.scheduleDate = sd.value || todayStr();
    state.scheduleAuto = false;
    render();
  });
  const st = document.getElementById('sched-today');
  if (st) st.addEventListener('click', () => {
    state.scheduleDate = todayStr();
    state.scheduleAuto = false;
    render();
  });
}

/* Distinct leaf categories (sport + path) that have at least one game. */
function distinctLeaves() {
  const seen = {};
  const out = [];
  Store.getAll().forEach(m => {
    const key = m.sportId + '|' + (m.path || []).join('|');
    if (!seen[key]) { seen[key] = 1; out.push({ sportId: m.sportId, path: m.path || [] }); }
  });
  return out;
}

// Per-category breakdown of a team's points (sport placements + special events).
function teamBreakdown(teamId) {
  const sports = [];
  distinctLeaves().forEach(({ sportId, path }) => {
    const plays = matchesFor(sportId, path).some(m => m.teamA === teamId || m.teamB === teamId);
    const pl = categoryPlacements(sportId, path);
    let place = null;
    [1, 2, 3, 4].forEach(p => { if (pl[p] === teamId) place = p; });
    if (!plays && place === null) return;

    // Round-robin record for this team in the category (context while unfinished).
    const row = roundRobinTable(sportId, path).find(r => r.team.id === teamId);
    sports.push({
      sportId, path,
      label: pathLabel(sportId, path),
      place,
      points: place ? pointsForPlace(place) : 0,
      record: row && row.played ? (row.w + 'W - ' + row.l + 'L') : ''
    });
  });
  // Finished categories first, then by points.
  sports.sort((a, b) => (b.place ? 1 : 0) - (a.place ? 1 : 0) || b.points - a.points);

  const events = [];
  EventStore.getAll().forEach(ev => {
    const place = (ev.places || {})[teamId];
    if (!place) return;
    const e = getEvent(ev.eventId);
    const name = (e ? e.name : ev.eventId) + (ev.title ? ': ' + ev.title : '');
    events.push({ name, emoji: e ? e.emoji : '', place, points: pointsForPlace(place), date: ev.date });
  });
  events.sort((a, b) => a.place - b.place);

  return { sports, events };
}

function placeBadge(place) {
  const medal = { 1: '🥇 1st', 2: '🥈 2nd', 3: '🥉 3rd', 4: '4th' };
  return place ? `<span class="tb-place">${medal[place]}</span>` : `<span class="tb-place tbd">In progress</span>`;
}

function renderTeam() {
  const team = getTeam(state.teamId);
  if (!team) { state.teamId = null; return render(); }

  const rows = standings();
  const rank = rows.findIndex(r => r.team.id === team.id) + 1;
  const me = rows.find(r => r.team.id === team.id) || { points: 0, wins: 0 };
  const bd = teamBreakdown(team.id);

  const sportRows = bd.sports.length ? bd.sports.map(s => `
    <button class="tb-row" data-open-cat data-sport="${s.sportId}" data-path="${s.path.join('|')}">
      <span class="tb-name">${esc(s.label)}${s.record ? ` <span class="tb-record">(${esc(s.record)})</span>` : ''}</span>
      <span class="tb-right">${placeBadge(s.place)} <span class="tb-pts">${s.points ? '+' + s.points : '0'} pts</span></span>
    </button>`).join('') : `<div class="empty">No sport games for this team yet.</div>`;

  const eventRows = bd.events.length ? bd.events.map(e => `
    <div class="tb-row static">
      <span class="tb-name">${e.emoji} ${esc(e.name)}</span>
      <span class="tb-right">${placeBadge(e.place)} <span class="tb-pts">+${e.points} pts</span></span>
    </div>`).join('') : `<div class="empty">No special event placements yet.</div>`;

  app.innerHTML = `
    <div class="breadcrumb">
      <button data-nav="home">Home</button>
      <span class="sep">&rsaquo;</span>
      <span class="current">${esc(team.name)}</span>
    </div>

    <div class="team-hero" style="background:${team.color};color:${team.text}">
      <div>
        <div class="team-hero-name">${esc(team.name)}</div>
        <div class="team-hero-sub">Rank #${rank} &bull; ${me.wins} win${me.wins === 1 ? '' : 's'}</div>
      </div>
      <div class="team-hero-pts">
        <div class="big">${me.points}</div>
        <div class="lbl">total points</div>
      </div>
    </div>

    <h3 class="sub-title">Sports</h3>
    <div class="tb-list">${sportRows}</div>

    <h3 class="sub-title">Special Events</h3>
    <div class="tb-list">${eventRows}</div>`;

  app.querySelector('[data-nav="home"]').addEventListener('click', () => {
    state.teamId = null; render();
  });
  app.querySelectorAll('[data-open-cat]').forEach(b =>
    b.addEventListener('click', () => {
      state.teamId = null;
      state.sportId = b.dataset.sport;
      state.path = b.dataset.path ? b.dataset.path.split('|') : [];
      state.tab = 'results';
      render();
    }));
}

// Home "Games Schedule" - all games on the selected day, across all sports.
// In auto mode the day is the nearest date that actually has games.
function scheduleHtml() {
  if (state.scheduleAuto) state.scheduleDate = nearestGameDate();
  const day = state.scheduleDate;
  const games = Store.getAll().filter(m => m.date === day).sort(byDateTime);
  const today = todayStr();

  let label = '';
  if (day === today) label = ' <span class="seed-hint">(today)</span>';
  else if (day > today) label = ' <span class="seed-hint">(next game day)</span>';
  else label = ' <span class="seed-hint">(latest game day)</span>';

  const body = games.length
    ? `<div class="sched-list">${games.map(scheduleRow).join('')}</div>`
    : `<div class="empty">
         <div class="big">📅</div>
         <div>No games scheduled for ${esc(fmtDate(day))}.</div>
       </div>`;

  return `
    <h2 class="section-title">
      <span class="bar"></span> Games Schedule${label}
    </h2>
    <div class="sched-controls">
      <input type="date" id="sched-date" value="${day}" />
      <button id="sched-today" class="btn btn-ghost btn-sm">Today</button>
      <span class="sched-count">${games.length} game${games.length === 1 ? '' : 's'} on ${esc(fmtDate(day))}</span>
    </div>
    ${body}`;
}

function schedDot(id) {
  const t = getTeam(id);
  return t
    ? `<span class="team-dot" style="background:${t.color}"></span> ${esc(t.name)}`
    : '?';
}

// One row in the home Games Schedule list.
function scheduleRow(m) {
  const sport = getSport(m.sportId);
  const cat = categoryLabel(m.sportId, m.path);
  const isFinal = m.status === 'final';
  const w = winnerOf(m);
  const vb = isSetSport(m.sportId);

  const right = isFinal
    ? `<span class="badge final">Played</span>
       <span class="sched-score">${esc(m.scoreA)} - ${esc(m.scoreB)}${vb ? ' sets' : ''}</span>`
    : `<span class="badge scheduled">Scheduled</span>`;

  return `
    <button class="sched-row" data-open-match
        data-sport="${m.sportId}" data-path="${(m.path || []).join('|')}"
        data-tab="${isFinal ? 'results' : 'upcoming'}">
      <span class="sched-time">${m.time ? fmtTime(m.time) : 'TBA'}</span>
      <span class="sched-main">
        <span class="sched-sport">${sport ? sport.emoji : ''} ${esc(sport ? sport.name : '')}${cat ? ' &bull; ' + esc(cat) : ''}</span>
        <span class="sched-teams">${schedDot(m.teamA)} <span class="vs">vs</span> ${schedDot(m.teamB)}${m.venue ? ' &bull; ' + esc(m.venue) : ''}</span>
      </span>
      <span class="sched-right">${right}</span>
    </button>`;
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
  const vb = isSetSport(m.sportId);
  const brk = vb ? setsBreakdown(m) : '';
  const foot = (w ? esc(getTeam(w).name) + ' won' : 'Draw')
    + (vb ? ` &bull; sets ${esc(m.scoreA)}-${esc(m.scoreB)}${brk ? ' (' + esc(brk) + ')' : ''}` : '');
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
      <div class="sb-foot">${foot}</div>
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

  const evName = (event ? event.name : ev.eventId) + (ev.title ? ': ' + ev.title : '');
  return `
    <div class="scoreboard-card" style="cursor:default;border-top-color:var(--gold)">
      <div class="sb-head">
        <span>${event ? event.emoji : ''} ${esc(evName)}</span>
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

  const vb = isSetSport(sport.id);
  const forHdr = vb ? 'SF' : 'PF';
  const agstHdr = vb ? 'SA' : 'PA';
  const forTitle = vb ? 'Sets For (total sets won)' : 'Points For (total scored)';
  const agstTitle = vb ? 'Sets Against (total sets lost)' : 'Points Against (total allowed)';

  return `
    <h3 class="sub-title">Round Robin Standings <span class="seed-hint">(seeding for the finals)</span></h3>
    <div class="table-wrap">
      <table class="rr-table">
        <thead>
          <tr>
            <th>Seed</th><th>Team</th><th>W</th><th>L</th>
            <th title="${forTitle}">${forHdr}</th>
            <th title="${agstTitle}">${agstHdr}</th>
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

  const vb = isSetSport(m.sportId);
  const brk = (isFinal && vb) ? setsBreakdown(m) : '';

  let winnerLine = '';
  if (isFinal) {
    const setNote = vb ? ` <span class="sets-note">(sets ${esc(m.scoreA)}-${esc(m.scoreB)}${brk ? ' &bull; ' + esc(brk) : ''})</span>` : '';
    winnerLine = w
      ? `<div class="winner-line">Winner: <strong>${esc(getTeam(w).name)}</strong>${setNote}</div>`
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
        <span class="badge ${isFinal ? 'final' : 'scheduled'}">${isFinal ? 'Played' : 'Scheduled'}</span>
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
