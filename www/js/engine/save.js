// ============ SAUVEGARDES ROBUSTES ============
const SAVE = {
  KEY: 'football_empire_save_v1',
  META: 'football_empire_meta_v1',

  // Champs joueur mutables à persister
  PFIELDS: ['ovr', 'pot', 'age', 'value', 'wage', 'club', 'contract', 'pace', 'retired'],

  snapshot() {
    // diffs joueurs (uniquement si changé par rapport à la base) + regens complets
    const diffs = {}, regens = [];
    for (const p of DB.players) {
      if (p.regen) { const { _base, ...clean } = p; regens.push(clean); continue; }
      const cur = this.PFIELDS.map(f => p[f] === undefined ? null : p[f]);
      const changed = p._base && cur.some((v, i) => v !== (p._base[i] === undefined ? null : p._base[i]));
      if (changed || !p._base) diffs[p.id] = cur;
    }
    const clubLeagues = {};
    for (const c of DB.clubs) clubLeagues[c.id] = c.league;
    // pstate élagué : on ignore les états par défaut, on arrondit les flottants
    const ps = {};
    for (const [pid, s] of Object.entries(GAME.G.pstate)) {
      const status = s.transferStatus || (s.listed ? 'sell' : 'normal');
      if (!s.apps && !s.inj && !s.susp && !s.listed && status === 'normal' && !s.loan && s.morale === 70 && s.fit >= 99 && Math.abs(s.form - 5) < 0.3) continue;
      ps[pid] = { form: Math.round(s.form * 10) / 10, fit: Math.round(s.fit), inj: s.inj, susp: s.susp || 0,
        morale: s.morale, apps: s.apps, goals: s.goals, assists: s.assists,
        sumRating: Math.round(s.sumRating * 10) / 10, listed: !!s.listed, transferStatus: status, loan: s.loan || null };
    }
    const G = { ...GAME.G, pstate: ps };
    return { v: 1, ts: Date.now(), G, diffs, regens, clubLeagues, seed: U.seed };
  },

  save() {
    try {
      const data = JSON.stringify(this.snapshot());
      localStorage.setItem(this.KEY, data);
      localStorage.setItem(this.META, JSON.stringify({
        ts: Date.now(), season: GAME.G.season, day: GAME.G.day,
        club: GAME.G.myClub ? DB.clubById.get(GAME.G.myClub).name : 'Spectateur',
        size: data.length
      }));
      return { ok: true, size: data.length };
    } catch (e) {
      return { ok: false, msg: 'Échec sauvegarde : ' + e.message };
    }
  },

  hasSave() { return !!localStorage.getItem(this.META); },
  meta() { try { return JSON.parse(localStorage.getItem(this.META)); } catch { return null; } },

  load(raw) {
    try {
      const data = JSON.parse(raw || localStorage.getItem(this.KEY));
      if (!data || !data.G) return { ok: false, msg: 'Sauvegarde introuvable ou corrompue.' };
      U.seed = data.seed || U.seed;
      // restaurer les ligues des clubs (promotions passées)
      for (const c of DB.clubs) if (data.clubLeagues[c.id] != null) c.league = data.clubLeagues[c.id];
      // restaurer joueurs de base
      DB.players = DB.players.filter(p => !p.regen);
      for (const p of DB.players) {
        const d = data.diffs[p.id] || p._base;
        if (d) this.PFIELDS.forEach((f, i) => { if (d[i] !== null && d[i] !== undefined) p[f] = d[i]; else if (f === 'retired') p.retired = false; else if (f === 'club') p.club = d[i]; });
      }
      // regens
      for (const yp of data.regens) {
        DB.players.push(yp);
        if (yp.id >= DB.nextRegenId) DB.nextRegenId = yp.id + 1;
      }
      DB.reindex();
      GAME.G = data.G;
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: 'Échec chargement : ' + e.message };
    }
  },

  exportSave() {
    const data = JSON.stringify(this.snapshot());
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `football-empire-s${GAME.G.season}-j${GAME.G.day}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },

  importSave(file, cb) {
    const r = new FileReader();
    r.onload = () => cb(this.load(r.result));
    r.readAsText(file);
  },

  erase() { localStorage.removeItem(this.KEY); localStorage.removeItem(this.META); }
};
