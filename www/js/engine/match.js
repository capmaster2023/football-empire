// ============ MOTEUR DE MATCH (100 % simulation) ============
const MATCH = {

  expectedGoals(sh, sa, neutral = false) {
    const homeAdv = neutral ? 0 : 0.22;
    const dAtt = (sh.att + sh.mid * 0.5) - (sa.def + sa.gk * 0.6 + sa.mid * 0.2);
    const dAtt2 = (sa.att + sa.mid * 0.5) - (sh.def + sh.gk * 0.6 + sh.mid * 0.2);
    const xh = U.clamp(1.32 + homeAdv + dAtt * 0.055, 0.15, 4.6);
    const xa = U.clamp(1.10 - homeAdv * 0.4 + dAtt2 * 0.055, 0.12, 4.2);
    return [xh, xa];
  },

  pickScorer(xi) {
    const weights = xi.map(p => {
      let w = 1;
      if (p.group === 'AT') w = 6 + p.finishing / 12;
      else if (p.group === 'MF') w = 2 + p.longshots / 25;
      else if (p.group === 'DF') w = 0.6 + p.heading / 60;
      else w = 0.02;
      return w;
    });
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = U.rnd() * tot;
    for (let i = 0; i < xi.length; i++) { r -= weights[i]; if (r <= 0) return xi[i]; }
    return xi[xi.length - 1];
  },

  pickAssist(xi, scorer) {
    if (U.rnd() < 0.22) return null; // but sans passe décisive
    const cands = xi.filter(p => p !== scorer && p.group !== 'GK');
    const weights = cands.map(p => 1 + p.vision / 20 + (p.group === 'MF' ? 2 : p.group === 'AT' ? 1.5 : 0.3));
    const tot = weights.reduce((a, b) => a + b, 0);
    let r = U.rnd() * tot;
    for (let i = 0; i < cands.length; i++) { r -= weights[i]; if (r <= 0) return cands[i]; }
    return cands[0] || null;
  },

  GOAL_TXT: ['BUUUT !', 'Quel but !', 'Frappe imparable !', 'But splendide !', 'Le stade explose !', 'Finition clinique !'],
  TYPES: ['frappe du droit', 'frappe du gauche', 'tête décroisée', 'tir en lucarne', 'plat du pied', 'reprise de volée', 'ballon piqué', 'penalty transformé', 'coup franc direct', 'après un contre éclair'],

  // Simule un match complet, met à jour les états des joueurs.
  play(homeId, awayId, opts = {}) {
    const sh = DB.clubStrength(homeId), sa = DB.clubStrength(awayId);
    const tacH = (typeof TACTICS !== 'undefined') ? TACTICS.effectiveMods(homeId) : null;
    const tacA = (typeof TACTICS !== 'undefined') ? TACTICS.effectiveMods(awayId) : null;
    const xiH = DB.bestXI(homeId, tacH ? TACTICS.FORMATIONS[tacH.formation].arr : undefined);
    const xiA = DB.bestXI(awayId, tacA ? TACTICS.FORMATIONS[tacA.formation].arr : undefined);
    let [xh, xa] = this.expectedGoals(sh, sa, opts.neutral);
    if (tacH) { xh *= tacH.atk; xa /= tacH.def; }
    if (tacA) { xa *= tacA.atk; xh /= tacA.def; }
    xh = U.clamp(xh, 0.1, 5); xa = U.clamp(xa, 0.1, 5);
    let gh = Math.min(U.poisson(xh), 7), ga = Math.min(U.poisson(xa), 7);
    if (opts.noDraws && gh === ga) { if (U.rnd() < xh / (xh + xa)) gh++; else ga++; } // prolongation/TAB simplifié

    const events = [];
    const mins = () => U.ri(2, 93);
    const stats = new Map(); // pid -> {rating, goals, assists}
    const stat = p => { if (!stats.has(p.id)) stats.set(p.id, { rating: 6 + U.gauss(0.3, 0.55), goals: 0, assists: 0 }); return stats.get(p.id); };
    [...xiH, ...xiA].forEach(p => stat(p));

    const addGoals = (n, xi, clubId) => {
      for (let i = 0; i < n; i++) {
        const s = this.pickScorer(xi), a = this.pickAssist(xi, s);
        const m = mins();
        events.push({ min: m, type: 'goal', club: clubId, pid: s.id, aid: a ? a.id : null,
          txt: `${m}' ⚽ ${U.pick(this.GOAL_TXT)} ${s.name} (${DB.clubById.get(clubId).name}), ${U.pick(this.TYPES)}${a ? ', servi par ' + a.name : ''}.` });
        stat(s).goals++; stat(s).rating += 1.0;
        if (a) { stat(a).assists++; stat(a).rating += 0.55; }
      }
    };
    addGoals(gh, xiH, homeId);
    addGoals(ga, xiA, awayId);

    // Cartons
    for (const [xi, clubId] of [[xiH, homeId], [xiA, awayId]]) {
      const tac = clubId === homeId ? tacH : tacA;
      for (const p of xi) {
        if (U.rnd() < 0.028 + p.aggression / 3400 + (tac && tac.cards ? 0.012 : 0)) {
          const m = mins();
          if (U.rnd() < 0.055) {
            events.push({ min: m, type: 'red', club: clubId, pid: p.id, txt: `${m}' 🟥 Carton rouge pour ${p.name} !` });
            const st = GAME.pstate(p.id); st.susp = (st.susp || 0) + U.ri(1, 3);
            stat(p).rating -= 1.4;
          } else {
            events.push({ min: m, type: 'yellow', club: clubId, pid: p.id, txt: `${m}' 🟨 ${p.name} averti.` });
            stat(p).rating -= 0.2;
          }
        }
      }
    }

    // Blessures
    for (const [xi] of [[xiH], [xiA]]) {
      if (U.rnd() < 0.16) {
        const p = U.pick(xi);
        const dur = U.rnd() < 0.7 ? U.ri(3, 15) : U.ri(16, 90);
        const m = mins();
        events.push({ min: m, type: 'injury', pid: p.id, txt: `${m}' 🚑 ${p.name} sort sur blessure (${dur} jours).` });
        GAME.pstate(p.id).inj = dur;
      }
    }

    // VAR (rare, purement narratif)
    if (U.rnd() < 0.09 && events.some(e => e.type === 'goal')) {
      const g = U.pick(events.filter(e => e.type === 'goal'));
      events.push({ min: g.min, type: 'var', txt: `${g.min}' 📺 VAR : vérification en cours… but ACCORDÉ après examen.` });
    }

    events.sort((a, b) => a.min - b.min);

    // Notes finales, forme, fatigue, stats saison
    const winner = gh > ga ? homeId : ga > gh ? awayId : null;
    for (const [xi, clubId] of [[xiH, homeId], [xiA, awayId]]) {
      const tac = clubId === homeId ? tacH : tacA;
      for (const p of xi) {
        const st = GAME.pstate(p.id), s = stat(p);
        if (winner === clubId) s.rating += 0.35; else if (winner && winner !== clubId) s.rating -= 0.3;
        s.rating = U.clamp(s.rating, 3, 10);
        st.apps++; st.goals += s.goals; st.assists += s.assists;
        st.sumRating += s.rating;
        st.form = U.clamp(st.form * 0.7 + (s.rating - 5.5) * 1.1, 0, 10);
        st.fit = U.clamp(st.fit - U.ri(8, 16) * (100 - p.stamina) / 60 - 6 - (tac ? tac.fat : 0), 20, 100);
        st.morale = U.clamp(st.morale + (winner === clubId ? 4 : winner ? -4 : 0), 0, 100);
      }
    }
    return { gh, ga, events, xiH, xiA, stats };
  }
};
