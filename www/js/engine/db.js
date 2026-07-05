// ============ BASE DE DONNÉES (données réelles FC26) ============
const DB = {
  players: [],        // objets joueurs (mutables)
  byId: new Map(),
  clubs: [],
  clubById: new Map(),
  leagues: [],
  leagueById: new Map(),
  clubsOfLeague: new Map(),
  squad: new Map(),   // clubId -> [players]
  freeAgents: [],
  academyPool: [],
  nextRegenId: 90000000,
  loaded: false,

  async load() {
    if (this.loaded) return;
    const [pj, cj, lj, aj] = await Promise.all([
      fetch('data/players.json').then(r => r.json()),
      fetch('data/clubs.json').then(r => r.json()),
      fetch('data/leagues.json').then(r => r.json()),
      fetch('data/academy_pool.json').then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
    const F = pj.fields;
    this.players = pj.players.map(row => {
      const o = {};
      F.forEach((f, i) => o[f] = row[i]);
      o.mainPos = String(o.pos).split(',')[0].trim();
      o.group = U.posGroup(o.pos);
      o._base = [o.ovr, o.pot, o.age, o.value, o.wage, o.club, o.contract, o.pace, o.retired];
      return o;
    });
    this.clubs = cj;
    this.leagues = lj;
    this.academyPool = Array.isArray(aj) ? aj : [];
    this.reindex();
    this.loaded = true;
  },

  reindex() {
    this.byId = new Map(this.players.map(p => [p.id, p]));
    this.clubById = new Map(this.clubs.map(c => [c.id, c]));
    this.leagueById = new Map(this.leagues.map(l => [l.id, l]));
    this.clubsOfLeague = new Map();
    for (const c of this.clubs) {
      if (!this.clubsOfLeague.has(c.league)) this.clubsOfLeague.set(c.league, []);
      this.clubsOfLeague.get(c.league).push(c);
    }
    this.rebuildSquads();
  },

  rebuildSquads() {
    this.squad = new Map();
    this.freeAgents = [];
    for (const p of this.players) {
      if (p.retired) continue;
      if (!p.club) { this.freeAgents.push(p); continue; }
      if (!this.squad.has(p.club)) this.squad.set(p.club, []);
      this.squad.get(p.club).push(p);
    }
  },

  squadOf(clubId) { return this.squad.get(clubId) || []; },

  movePlayer(p, newClubId) {
    if (p.club && this.squad.has(p.club)) {
      const arr = this.squad.get(p.club);
      const i = arr.indexOf(p);
      if (i >= 0) arr.splice(i, 1);
    } else if (!p.club) {
      const i = this.freeAgents.indexOf(p);
      if (i >= 0) this.freeAgents.splice(i, 1);
    }
    p.club = newClubId || null;
    if (newClubId) {
      if (!this.squad.has(newClubId)) this.squad.set(newClubId, []);
      this.squad.get(newClubId).push(p);
    } else {
      this.freeAgents.push(p);
    }
  },

  // Force d'un club (basée sur le meilleur XI réel)
  clubStrength(clubId) {
    const sq = this.squadOf(clubId);
    if (sq.length === 0) return { att: 50, mid: 50, def: 50, gk: 50, ovr: 50 };
    const eff = p => {
      const st = GAME.pstate(p.id);
      let e = p.ovr * (0.85 + 0.15 * (st.fit / 100)) * (0.92 + 0.16 * (st.form / 10));
      if (st.inj > 0) e = 0;
      return e;
    };
    const gks = sq.filter(p => p.group === 'GK').sort((a, b) => eff(b) - eff(a));
    const dfs = sq.filter(p => p.group === 'DF').sort((a, b) => eff(b) - eff(a));
    const mfs = sq.filter(p => p.group === 'MF').sort((a, b) => eff(b) - eff(a));
    const ats = sq.filter(p => p.group === 'AT').sort((a, b) => eff(b) - eff(a));
    const avg = (arr, n) => {
      const s = arr.slice(0, n);
      if (!s.length) return 45;
      return s.reduce((a, p) => a + eff(p), 0) / s.length;
    };
    const gk = avg(gks, 1), def = avg(dfs, 4), mid = avg(mfs, 3), att = avg(ats, 3);
    return { gk, def, mid, att, ovr: (gk + def * 4 + mid * 3 + att * 3) / 11 };
  },

  bestXI(clubId, formation = [4, 3, 3]) {
    const sq = this.squadOf(clubId).filter(p => GAME.pstate(p.id).inj === 0);
    const sortE = arr => arr.sort((a, b) => b.ovr - a.ovr);
    const gks = sortE(sq.filter(p => p.group === 'GK'));
    const dfs = sortE(sq.filter(p => p.group === 'DF'));
    const mfs = sortE(sq.filter(p => p.group === 'MF'));
    const ats = sortE(sq.filter(p => p.group === 'AT'));
    const xi = [];
    if (gks[0]) xi.push(gks[0]);
    xi.push(...dfs.slice(0, formation[0]));
    xi.push(...mfs.slice(0, formation[1]));
    xi.push(...ats.slice(0, formation[2]));
    // compléter si effectif incomplet
    const rest = sq.filter(p => !xi.includes(p)).sort((a, b) => b.ovr - a.ovr);
    while (xi.length < 11 && rest.length) xi.push(rest.shift());
    return xi;
  }
};
