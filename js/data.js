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
/* ---- Supabase auth session (admin login) ------------------ */
const Auth = {
  _session: null,
  load() {
    try { this._session = JSON.parse(localStorage.getItem('csc_sb_session') || 'null'); }
    catch (e) { this._session = null; }
    return this._session;
  },
  save(s) { this._session = s; localStorage.setItem('csc_sb_session', JSON.stringify(s)); },
  clear() { this._session = null; localStorage.removeItem('csc_sb_session'); },
  token() { return this._session && this._session.access_token; },
  email() { return this._session && this._session.user && this._session.user.email; },

  async signIn(email, password) {
    const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || data.message || 'Login failed');
    this.save(data);
    return data;
  },
  async refresh() {
    if (!this._session || !this._session.refresh_token) return false;
    const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: this._session.refresh_token })
    });
    if (!res.ok) { this.clear(); return false; }
    this.save(await res.json());
    return true;
  },
  async signOut() {
    try {
      await fetch(SUPABASE_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + this.token() }
      });
    } catch (e) { /* best effort */ }
    this.clear();
  }
};
Auth.load();

/* ---- Low-level REST helper (PostgREST) -------------------- */
async function sbErr(res) {
  try { const j = await res.json(); return j.message || j.error || JSON.stringify(j); }
  catch (e) { return res.status + ' ' + res.statusText; }
}
const SB = {
  async rest(path, opts, retry) {
    opts = opts || {};
    if (retry === undefined) retry = true;
    const headers = Object.assign({
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json'
    }, opts.headers || {});
    const token = Auth.token();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, { headers }));
    // Token expired mid-session: refresh once and retry.
    if (res.status === 401 && retry && Auth._session && Auth._session.refresh_token) {
      if (await Auth.refresh()) return SB.rest(path, opts, false);
    }
    return res;
  }
};

/* ---- Matches store (Supabase-backed, in-memory cache) ------
   Each row is { id, data } where data is the full match object.
   getAll() reads the cache synchronously; writes hit Supabase. */
const Store = {
  _cache: [],
  getAll() { return this._cache; },

  async load() {
    const res = await SB.rest('matches?select=data');
    if (!res.ok) throw new Error(await sbErr(res));
    this._cache = (await res.json()).map(r => r.data);
    return this._cache;
  },

  async add(match) {
    match.id = 'm_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const res = await SB.rest('matches', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: match.id, data: match })
    });
    if (!res.ok) throw new Error(await sbErr(res));
    this._cache.push(match);
    return match;
  },

  async update(id, patch) {
    const idx = this._cache.findIndex(m => m.id === id);
    if (idx === -1) return null;
    const updated = Object.assign({}, this._cache[idx], patch, { id });
    const res = await SB.rest('matches?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: updated })
    });
    if (!res.ok) throw new Error(await sbErr(res));
    this._cache[idx] = updated;
    return updated;
  },

  async remove(id) {
    const res = await SB.rest('matches?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE', headers: { Prefer: 'return=minimal' }
    });
    if (!res.ok) throw new Error(await sbErr(res));
    this._cache = this._cache.filter(m => m.id !== id);
  },

  async replaceAll(list) {
    let res = await SB.rest('matches?id=not.is.null', {
      method: 'DELETE', headers: { Prefer: 'return=minimal' }
    });
    if (!res.ok) throw new Error(await sbErr(res));
    if (list.length) {
      const rows = list.map(m => {
        m.id = m.id || ('m_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
        return { id: m.id, data: m };
      });
      res = await SB.rest('matches', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      });
      if (!res.ok) throw new Error(await sbErr(res));
    }
    this._cache = list.slice();
  }
};

/* =============================================================
   Special (non-sport) events - Muse & Banner Raising.
   These are scored by placement, not head-to-head. Each team is
   given a place (1st..4th) that awards points on this scale.
   ============================================================= */
const PLACEMENT_POINTS = { 1: 10, 2: 7, 3: 5, 4: 3 };

const SPECIAL_EVENTS = [
  { id: 'muse',           name: 'Muse',           emoji: '👑' },
  { id: 'banner-raising', name: 'Banner Raising', emoji: '🚩' },
  { id: 'pinoy-games',    name: 'Pinoy Games',    emoji: '🎪', titled: true }
];

/* Events flagged `titled` need a custom name typed per entry (e.g. Tug of War). */
function eventNeedsTitle(id) {
  const e = getEvent(id);
  return !!(e && e.titled);
}

function getEvent(id) { return SPECIAL_EVENTS.find(e => e.id === id) || null; }
function pointsForPlace(place) { return PLACEMENT_POINTS[place] || 0; }
function placeLabel(place) {
  return place == 1 ? '1st' : place == 2 ? '2nd' : place == 3 ? '3rd' : place == 4 ? '4th' : '';
}

/* Storage for special-event results.
   A record: { id, eventId, date, note, places: { teamId: place } } */
const EventStore = {
  _cache: [],
  getAll() { return this._cache; },

  async load() {
    const res = await SB.rest('events?select=data');
    if (!res.ok) throw new Error(await sbErr(res));
    this._cache = (await res.json()).map(r => r.data);
    return this._cache;
  },

  async add(ev) {
    ev.id = 'e_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const res = await SB.rest('events', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: ev.id, data: ev })
    });
    if (!res.ok) throw new Error(await sbErr(res));
    this._cache.push(ev);
    return ev;
  },

  async update(id, patch) {
    const idx = this._cache.findIndex(e => e.id === id);
    if (idx === -1) return null;
    const updated = Object.assign({}, this._cache[idx], patch, { id });
    const res = await SB.rest('events?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: updated })
    });
    if (!res.ok) throw new Error(await sbErr(res));
    this._cache[idx] = updated;
    return updated;
  },

  async remove(id) {
    const res = await SB.rest('events?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE', headers: { Prefer: 'return=minimal' }
    });
    if (!res.ok) throw new Error(await sbErr(res));
    this._cache = this._cache.filter(e => e.id !== id);
  },

  async replaceAll(list) {
    let res = await SB.rest('events?id=not.is.null', {
      method: 'DELETE', headers: { Prefer: 'return=minimal' }
    });
    if (!res.ok) throw new Error(await sbErr(res));
    if (list.length) {
      const rows = list.map(e => {
        e.id = e.id || ('e_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
        return { id: e.id, data: e };
      });
      res = await SB.rest('events', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      });
      if (!res.ok) throw new Error(await sbErr(res));
    }
    this._cache = list.slice();
  }
};

/* Load both stores from Supabase into their caches. */
const DataSync = {
  loadAll() { return Promise.all([Store.load(), EventStore.load()]); }
};

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

/* ---- Set-based sports (Volleyball & Badminton, best of 3) -- */
function isSetSport(sportId) {
  return sportId === 'volleyball' || sportId === 'badminton';
}

/* Count sets won per side from a sets array [[aPts,bPts], ...]. */
function setsWon(sets) {
  let a = 0, b = 0;
  (sets || []).forEach(s => {
    if (!s) return;
    const x = s[0], y = s[1];
    if (x === '' || y === '' || x == null || y == null) return;
    if (Number(x) > Number(y)) a++;
    else if (Number(y) > Number(x)) b++;
  });
  return { a, b };
}

/* Readable set breakdown, e.g. "25-20, 23-25, 15-12". */
function setsBreakdown(m) {
  if (!m.sets || !m.sets.length) return '';
  return m.sets
    .filter(s => s && s[0] !== '' && s[1] !== '' && s[0] != null && s[1] != null)
    .map(s => s[0] + '-' + s[1])
    .join(', ');
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
