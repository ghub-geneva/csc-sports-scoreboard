/* =============================================================
   CSC Scoreboard - Shared data layer
   Sports configuration, teams, and localStorage persistence.
   Loaded by both index.html (viewer) and admin.html (admin).
   ============================================================= */

/* ---- Teams (fixed) ---------------------------------------- */
const TEAMS = [
  { id: 'royal-blue', name: 'Royal Blue', color: '#1d4ed8', text: '#ffffff' },
  { id: 'red',        name: 'Red',        color: '#dc2626', text: '#ffffff' },
  { id: 'yellow',     name: 'Yellow',     color: '#f5b301', text: '#1a1a1a' },
  { id: 'green',      name: 'Green',      color: '#15a34a', text: '#ffffff' }
];

/* ---- Sports tree ------------------------------------------
   A sport may have no children (matches attach at sport level),
   one level of children, or two levels (Pickleball).
   Matches always attach to a "leaf" node.
   ---------------------------------------------------------- */
const PICKLE_DIVISIONS = () => ([
  { id: 'doubles-men',   name: 'Doubles Men' },
  { id: 'doubles-women', name: 'Doubles Women' },
  { id: 'mixed-doubles', name: 'Mixed Doubles' }
]);

const SPORTS = [
  { id: 'basketball', name: 'Basketball', emoji: '🏀' },
  { id: 'volleyball', name: 'Volleyball', emoji: '🏐' },
  {
    id: 'badminton', name: 'Badminton', emoji: '🏸',
    children: [
      { id: 'singles-men',   name: 'Singles (Men)' },
      { id: 'mixed-doubles', name: 'Mixed Doubles' }
    ]
  },
  {
    id: 'table-tennis', name: 'Table Tennis', emoji: '🏓',
    children: [
      { id: 'singles-men',   name: 'Singles (Men)' },
      { id: 'singles-women', name: 'Singles (Women)' }
    ]
  },
  {
    id: 'pickleball', name: 'Pickleball', emoji: '🎾',
    children: [
      { id: 'beginner',     name: 'Beginner',     children: PICKLE_DIVISIONS() },
      { id: 'novice',       name: 'Novice',       children: PICKLE_DIVISIONS() },
      { id: 'intermediate', name: 'Intermediate', children: PICKLE_DIVISIONS() }
    ]
  }
];

/* ---- Lookups ---------------------------------------------- */
function getSport(id) { return SPORTS.find(s => s.id === id) || null; }
function getTeam(id)  { return TEAMS.find(t => t.id === id) || null; }

/* Children available at a given path (array of category ids). */
function childrenByPath(sport, path) {
  let nodes = sport.children || [];
  for (const id of (path || [])) {
    const node = nodes.find(n => n.id === id);
    if (!node) return [];
    nodes = node.children || [];
  }
  return nodes;
}

/* The category node addressed by a path, or null for the sport root. */
function nodeByPath(sport, path) {
  let nodes = sport.children || [];
  let node = null;
  for (const id of (path || [])) {
    node = nodes.find(n => n.id === id);
    if (!node) return null;
    nodes = node.children || [];
  }
  return node;
}

/* A leaf is where matches live: no further children below it. */
function isLeaf(sport, path) {
  if (!sport.children || sport.children.length === 0) return true;
  return childrenByPath(sport, path).length === 0;
}

/* Human-readable label for a sport + path, e.g. "Pickleball  Beginner  Doubles Men". */
function pathLabel(sportId, path) {
  const sport = getSport(sportId);
  if (!sport) return '';
  const parts = [sport.name];
  let nodes = sport.children || [];
  for (const id of (path || [])) {
    const node = nodes.find(n => n.id === id);
    if (!node) break;
    parts.push(node.name);
    nodes = node.children || [];
  }
  return parts.join('  ›  ');
}

/* Short label, just the category portion (no sport name). */
function categoryLabel(sportId, path) {
  const sport = getSport(sportId);
  if (!sport || !path || path.length === 0) return '';
  const parts = [];
  let nodes = sport.children || [];
  for (const id of path) {
    const node = nodes.find(n => n.id === id);
    if (!node) break;
    parts.push(node.name);
    nodes = node.children || [];
  }
  return parts.join('  ›  ');
}

/* =============================================================
   Storage - matches persisted in localStorage.
   A match:
   {
     id, sportId, path:[catId...], teamA, teamB,
     date:'YYYY-MM-DD', time:'HH:MM', venue,
     status:'scheduled'|'final', scoreA, scoreB
   }
   ============================================================= */
const Store = (function () {
  const KEY = 'csc_scoreboard_matches_v1';

  function getAll() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveAll(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function add(match) {
    const list = getAll();
    match.id = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    list.push(match);
    saveAll(list);
    return match;
  }

  function update(id, patch) {
    const list = getAll();
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    saveAll(list);
    return list[idx];
  }

  function remove(id) {
    saveAll(getAll().filter(m => m.id !== id));
  }

  return { getAll, saveAll, add, update, remove };
})();

/* =============================================================
   Special (non-sport) events - Muse & Banner Raising.
   These are scored by placement, not head-to-head. Each team is
   given a place (1st..4th) that awards points on this scale.
   ============================================================= */
const PLACEMENT_POINTS = { 1: 10, 2: 7, 3: 5, 4: 3 };

const SPECIAL_EVENTS = [
  { id: 'muse',           name: 'Muse',           emoji: '👑' },
  { id: 'banner-raising', name: 'Banner Raising', emoji: '🚩' }
];

function getEvent(id) { return SPECIAL_EVENTS.find(e => e.id === id) || null; }
function pointsForPlace(place) { return PLACEMENT_POINTS[place] || 0; }
function placeLabel(place) {
  return place == 1 ? '1st' : place == 2 ? '2nd' : place == 3 ? '3rd' : place == 4 ? '4th' : '';
}

/* Storage for special-event results.
   A record: { id, eventId, date, note, places: { teamId: place } } */
const EventStore = (function () {
  const KEY = 'csc_scoreboard_events_v1';

  function getAll() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveAll(list) { localStorage.setItem(KEY, JSON.stringify(list)); }
  function add(ev) {
    const list = getAll();
    ev.id = 'e_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    list.push(ev);
    saveAll(list);
    return ev;
  }
  function update(id, patch) {
    const list = getAll();
    const idx = list.findIndex(e => e.id === id);
    if (idx === -1) return null;
    list[idx] = Object.assign({}, list[idx], patch);
    saveAll(list);
    return list[idx];
  }
  function remove(id) { saveAll(getAll().filter(e => e.id !== id)); }

  return { getAll, saveAll, add, update, remove };
})();

/* Same sport + identical path. */
function samePath(a, b) {
  a = a || []; b = b || [];
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/* Matches for a specific leaf (sport + path). */
function matchesFor(sportId, path) {
  return Store.getAll().filter(m => m.sportId === sportId && samePath(m.path, path));
}

/* Winner id of a final match, or null for a draw / not final. */
function winnerOf(m) {
  if (m.status !== 'final' || m.scoreA == null || m.scoreB == null) return null;
  if (Number(m.scoreA) > Number(m.scoreB)) return m.teamA;
  if (Number(m.scoreB) > Number(m.scoreA)) return m.teamB;
  return null; // draw
}
function loserOf(m) {
  const w = winnerOf(m);
  if (!w) return null;
  return w === m.teamA ? m.teamB : m.teamA;
}

/* =============================================================
   Tournament stages within a sport category.
   Single round robin decides seeding, then two placement games:
   Championship (1st vs 2nd) and Battle for 3rd (3rd vs 4th).
   Placement points: 1st = 10, 2nd = 7, 3rd = 5, 4th = 3.
   ============================================================= */
const STAGES = [
  { id: 'round-robin',  name: 'Round Robin',    short: 'RR' },
  { id: 'championship', name: 'Championship',   short: 'Championship' },
  { id: 'battle-3rd',   name: 'Battle for 3rd', short: 'Battle for 3rd' }
];
function getStage(id) { return STAGES.find(s => s.id === id) || STAGES[0]; }
function stageOf(m) { return m.stage || 'round-robin'; }

/* Round-robin standings table for one category (final RR games only).
   Sorted by wins, then point difference, then points scored. */
function roundRobinTable(sportId, path) {
  const rows = {};
  TEAMS.forEach(t => { rows[t.id] = { team: t, w: 0, l: 0, played: 0, pf: 0, pa: 0 }; });

  matchesFor(sportId, path)
    .filter(m => m.status === 'final' && stageOf(m) === 'round-robin')
    .forEach(m => {
      const a = rows[m.teamA], b = rows[m.teamB];
      if (!a || !b) return;
      a.played++; b.played++;
      a.pf += Number(m.scoreA); a.pa += Number(m.scoreB);
      b.pf += Number(m.scoreB); b.pa += Number(m.scoreA);
      const w = winnerOf(m);
      if (w === m.teamA) { a.w++; b.l++; }
      else if (w === m.teamB) { b.w++; a.l++; }
    });

  return Object.values(rows)
    .map(r => Object.assign(r, { diff: r.pf - r.pa }))
    .sort((p, q) => q.w - p.w || q.diff - p.diff || q.pf - p.pf);
}

/* Final 1st..4th placement for a category from its placement games.
   Returns { 1: teamId, 2: teamId, 3: teamId, 4: teamId } (partial if
   the placement games are not all final). */
function categoryPlacements(sportId, path) {
  const out = {};
  matchesFor(sportId, path).forEach(m => {
    if (m.status !== 'final') return;
    const w = winnerOf(m), l = loserOf(m);
    if (!w) return;
    if (stageOf(m) === 'championship') { out[1] = w; out[2] = l; }
    else if (stageOf(m) === 'battle-3rd') { out[3] = w; out[4] = l; }
  });
  return out;
}

/* Overall standings per team: placement points from sport finals plus
   special events, with a wins tally as a secondary stat. */
function standings() {
  const tally = {};
  TEAMS.forEach(t => { tally[t.id] = { team: t, wins: 0, played: 0, points: 0 }; });

  // Sports: count wins / games played, and award points from placement games.
  Store.getAll().forEach(m => {
    if (m.status !== 'final') return;
    if (tally[m.teamA]) tally[m.teamA].played++;
    if (tally[m.teamB]) tally[m.teamB].played++;
    const w = winnerOf(m), l = loserOf(m);
    if (w && tally[w]) tally[w].wins++;
    if (!w) return;
    const stage = stageOf(m);
    if (stage === 'championship') { tally[w].points += 10; if (tally[l]) tally[l].points += 7; }
    else if (stage === 'battle-3rd') { tally[w].points += 5; if (tally[l]) tally[l].points += 3; }
  });

  // Special events: add placement points (1st=10, 2nd=7, 3rd=5, 4th=3).
  EventStore.getAll().forEach(ev => {
    Object.entries(ev.places || {}).forEach(([teamId, place]) => {
      if (tally[teamId]) tally[teamId].points += pointsForPlace(place);
    });
  });

  return Object.values(tally)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.played - a.played);
}

/* Sort helper: by date then time ascending. */
function byDateTime(a, b) {
  const da = (a.date || '') + 'T' + (a.time || '00:00');
  const db = (b.date || '') + 'T' + (b.time || '00:00');
  return da < db ? -1 : da > db ? 1 : 0;
}
