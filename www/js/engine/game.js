// ============ CŒUR DU JEU : le monde vit tout seul ============
const GAME = {
  G: null,

  pstate(pid) {
    let s = this.G.pstate[pid];
    if (!s) s = this.G.pstate[pid] = { form: 5, fit: 100, inj: 0, susp: 0, morale: 70, apps: 0, goals: 0, assists: 0, sumRating: 0, listed: false, transferStatus: 'normal', loan: null };
    return s;
  },
  budget(clubId) { return this.G.budgets[clubId] || 0; },
  addBudget(clubId, delta) { this.G.budgets[clubId] = (this.G.budgets[clubId] || 0) + delta; },
  credibility() { return this.G ? (this.G.coachCredibility ?? 50) : 50; },
  adjustCredibility(delta, reason = '') {
    if (!this.G || this.G.role !== 'coach') return;
    const before = this.G.coachCredibility ?? 45;
    const after = U.clamp(Math.round(before + delta), 0, 100);
    this.G.coachCredibility = after;
    if (Math.abs(after - before) >= 2) NEWS.add(`📈 Crédibilité coach : ${after}/100${reason ? ` (${reason})` : ''}.`, 'club');
  },

  newGame(myClubId, role = 'coach', ownerSetup = null) {
    this.G = {
      season: 2026, day: 0, myClub: myClubId, role,
      tables: {}, fixtures: {}, pstate: {}, budgets: FINANCE.initBudgets(),
      news: [], offers: [], transferLog: [], history: [], negotiation: null, recruitmentRequests: [], pendingTransfers: [],
      shortlist: [], watchlist: [], coachOffers: [], coachCredibility: role === 'coach' ? 45 : 100, boardTrust: role === 'coach' ? 50 : 100,
      cup: CAL.buildChampionsCup(),
      natCup: null,
      lastResults: []
    };
    for (const L of DB.leagues) {
      const ids = DB.clubsOfLeague.get(L.id).map(c => c.id);
      this.G.tables[L.id] = LEAGUE.initTable(ids);
      this.G.fixtures[L.id] = CAL.buildLeagueFixtures(L.id);
    }
    for (const g of this.G.cup.groups) Object.assign(this.G.cup.groupTable, LEAGUE.initTable(g));
    if (myClubId) {
      const country = DB.leagueById.get(DB.clubById.get(myClubId).league).country;
      this.G.natCup = CAL.buildNationalCup(country);
    }
    NEWS.add(`🏟️ Saison ${this.G.season}/${this.G.season + 1} : le monde du football s'éveille. 51 championnats, 662 clubs, 18 405 joueurs.`, 'monde');
    if (myClubId && typeof OWNER !== 'undefined') OWNER.initCareer(myClubId, ownerSetup || { type: 'normal' });
    if (myClubId) NEWS.add(role === 'president' ? `👔 Vous devenez président de ${DB.clubById.get(myClubId).name}. Budget, mercato, centre de formation : tout est sur votre bureau.` : `🤝 Vous êtes officiellement nommé entraîneur de ${DB.clubById.get(myClubId).name}. Bonne chance, coach !`, 'club');
    if (typeof ACADEMY !== 'undefined') ACADEMY.initWorld();
  },

  // Prochain jour avec un événement (match de mon club, ou tout événement mondial)
  nextEventDay() {
    let min = CAL.END_OF_SEASON_DAY;
    const scan = (day) => { if (day > this.G.day && day < min) min = day; };
    for (const L of DB.leagues) for (const r of this.G.fixtures[L.id]) if (r.matches.some(m => m.gh === null)) scan(r.day);
    for (const r of this.G.cup.fixtures) if (r.matches.some(m => m.gh === null)) scan(r.day);
    for (const r of this.G.cup.koRounds) for (const m of r.matches) if (m.gh === null) scan(r.day);
    if (this.G.natCup && this.G.natCup.roundIdx < this.G.natCup.days.length) scan(this.G.natCup.days[this.G.natCup.roundIdx]);
    return min;
  },

  myNextMatch() {
    if (!this.G.myClub) return null;
    let best = null;
    const check = (day, m, comp) => {
      if (m.gh !== null || day < this.G.day) return;
      if (m.h !== this.G.myClub && m.a !== this.G.myClub) return;
      if (!best || day < best.day) best = { day, m, comp };
    };
    const myLeague = DB.clubById.get(this.G.myClub).league;
    for (const r of this.G.fixtures[myLeague]) for (const m of r.matches) check(r.day, m, DB.leagueById.get(myLeague).name);
    for (const r of this.G.cup.fixtures) for (const m of r.matches) check(r.day, m, this.G.cup.name);
    for (const r of this.G.cup.koRounds) for (const m of r.matches) check(r.day, m, this.G.cup.name + ' — ' + r.label);
    return best;
  },

  // Avance d'un jour, simule tout ce qui doit l'être. Retourne les résultats du jour.
  advanceDay() {
    this.G.day++;
    const d = this.G.day;
    const results = [];
    if (typeof TRANSFERS !== 'undefined') TRANSFERS.processPendingTransfers();
    if (typeof ACADEMY !== 'undefined') ACADEMY.dailyTick();

    if (d >= CAL.END_OF_SEASON_DAY) { this.endSeason(); return { endOfSeason: true, results: [] }; }

    // Ligues
    for (const L of DB.leagues) {
      for (const r of this.G.fixtures[L.id]) {
        if (r.day !== d) continue;
        for (const m of r.matches) {
          if (m.gh !== null) continue;
          if (m.h === this.G.myClub || m.a === this.G.myClub) { results.push({ pending: true, m, comp: L.name, league: L.id }); continue; }
          const res = MATCH.play(m.h, m.a);
          m.gh = res.gh; m.ga = res.ga;
          LEAGUE.record(this.G.tables[L.id], m.h, m.a, m.gh, m.ga);
          results.push({ m, comp: L.name, league: L.id });
        }
      }
    }
    // Coupe des Champions — phase de groupes
    for (const r of this.G.cup.fixtures) {
      if (r.day !== d) continue;
      for (const m of r.matches) {
        if (m.gh !== null) continue;
        if (m.h === this.G.myClub || m.a === this.G.myClub) { results.push({ pending: true, m, comp: this.G.cup.name, cupGroup: r.group }); continue; }
        const res = MATCH.play(m.h, m.a);
        m.gh = res.gh; m.ga = res.ga;
        LEAGUE.record(this.G.cup.groupTable, m.h, m.a, m.gh, m.ga);
        results.push({ m, comp: this.G.cup.name });
      }
    }
    this.checkCupProgress(d);
    // Coupe des Champions — phases finales
    for (const r of this.G.cup.koRounds) {
      if (r.day !== d) continue;
      for (const m of r.matches) {
        if (m.gh !== null) continue;
        if (m.h === this.G.myClub || m.a === this.G.myClub) { results.push({ pending: true, m, comp: this.G.cup.name + ' — ' + r.label, ko: r }); continue; }
        const res = MATCH.play(m.h, m.a, { noDraws: true, neutral: r.label === 'Finale' });
        m.gh = res.gh; m.ga = res.ga;
        results.push({ m, comp: this.G.cup.name + ' — ' + r.label });
      }
      this.advanceKO(r);
    }
    // Coupe nationale
    this.playNationalCup(d, results);

    // rythme hebdomadaire
    if (d % 7 === 0) { PROGRESSION.weekly(); TRANSFERS.aiTick(); TRANSFERS.incomingOffers(); this.worldNews(); }
    if (d % 30 === 0) FINANCE.monthly();

    this.G.lastResults = results.filter(r => !r.pending);
    return { results };
  },

  // Joue le match du club du joueur (appelé par l'UI après advanceDay si pending)
  playMyMatch(entry) {
    const res = MATCH.play(entry.m.h, entry.m.a, entry.ko || entry.natCup ? { noDraws: true } : {});
    return this.recordMyMatch(entry, res);
  },

  // Enregistre un résultat déjà simulé (instantané OU live interactif)
  recordMyMatch(entry, res) {
    const m = entry.m;
    m.gh = res.gh; m.ga = res.ga;
    if (entry.league) LEAGUE.record(this.G.tables[entry.league], m.h, m.a, m.gh, m.ga);
    if (entry.cupGroup !== undefined) LEAGUE.record(this.G.cup.groupTable, m.h, m.a, m.gh, m.ga);
    if (entry.ko) this.advanceKO(entry.ko);
    if (entry.natCup) this.resolveNatCupMatch(entry);
    if (this.G.role === 'coach' && this.G.myClub && (m.h === this.G.myClub || m.a === this.G.myClub)) {
      const won = (m.h === this.G.myClub && res.gh > res.ga) || (m.a === this.G.myClub && res.ga > res.gh);
      const lost = (m.h === this.G.myClub && res.gh < res.ga) || (m.a === this.G.myClub && res.ga < res.gh);
      this.adjustCredibility(won ? 2 : lost ? -2 : 0, won ? 'résultat positif' : lost ? 'défaite' : 'match nul');
    }
    return res;
  },

  checkCupProgress(d) {
    const cup = this.G.cup;
    if (cup.stage !== 'groups') return;
    const allDone = cup.fixtures.every(r => r.matches.every(m => m.gh !== null));
    if (!allDone || d < 140) return;
    // qualifiés : 2 premiers de chaque groupe
    const qual = [];
    for (const g of cup.groups) {
      const t = {}; g.forEach(id => t[id] = cup.groupTable[id]);
      const st = LEAGUE.standings(t);
      qual.push(st[0].id, st[1].id);
    }
    // tirage R16
    for (let i = qual.length - 1; i > 0; i--) { const j = Math.floor(U.rnd() * (i + 1)); [qual[i], qual[j]] = [qual[j], qual[i]]; }
    const mk = (ids, day, label) => ({ day, label, matches: [], pool: ids });
    const r16 = mk(qual, cup.koDays.R16, '8es de finale');
    for (let i = 0; i < qual.length; i += 2) r16.matches.push({ h: qual[i], a: qual[i + 1], gh: null, ga: null });
    cup.koRounds = [r16];
    cup.stage = 'ko';
    NEWS.add(`🏆 ${cup.name} : le tirage des 8es de finale est connu !`, 'monde');
  },

  advanceKO(round) {
    const cup = this.G.cup;
    if (round.matches.some(m => m.gh === null)) return;
    const winners = round.matches.map(m => m.gh > m.ga ? m.h : m.a);
    const nextLabel = { '8es de finale': ['Quarts de finale', cup.koDays.QF], 'Quarts de finale': ['Demi-finales', cup.koDays.SF], 'Demi-finales': ['Finale', cup.koDays.F] }[round.label];
    if (!nextLabel) {
      if (!cup.winner) {
        cup.winner = winners[0];
        NEWS.add(`🏆🏆🏆 ${DB.clubById.get(winners[0]).name} remporte la ${cup.name} ${this.G.season}/${this.G.season + 1} !`, 'monde');
        this.addBudget(winners[0], 60e6);
      }
      return;
    }
    if (cup.koRounds.some(r => r.label === nextLabel[0])) return;
    const nr = { day: nextLabel[1], label: nextLabel[0], matches: [] };
    for (let i = 0; i < winners.length; i += 2) nr.matches.push({ h: winners[i], a: winners[i + 1], gh: null, ga: null });
    cup.koRounds.push(nr);
  },

  playNationalCup(d, results) {
    const nc = this.G.natCup;
    if (!nc || nc.winner || nc.roundIdx >= nc.days.length) return;
    if (nc.days[nc.roundIdx] !== d) return;
    const alive = nc.alive, next = [];
    const roundResults = [];
    for (let i = 0; i < alive.length; i += 2) {
      const h = alive[i], a = alive[i + 1];
      if (h === this.G.myClub || a === this.G.myClub) {
        results.push({ pending: true, m: { h, a, gh: null, ga: null }, comp: nc.name, natCup: { nc, next, i } });
        continue;
      }
      const res = MATCH.play(h, a, { noDraws: true });
      next.push(res.gh > res.ga ? h : a);
      roundResults.push({ m: { h, a, gh: res.gh, ga: res.ga }, comp: nc.name });
    }
    results.push(...roundResults);
    nc._next = next;
    if (!results.some(r => r.pending && r.natCup)) this.finishNatCupRound();
  },

  resolveNatCupMatch(entry) {
    const { nc } = entry.natCup;
    const m = entry.m;
    nc._next.push(m.gh > m.ga ? m.h : m.a);
    this.finishNatCupRound();
  },

  finishNatCupRound() {
    const nc = this.G.natCup;
    if (!nc || !nc._next) return;
    nc.alive = nc._next; delete nc._next;
    nc.roundIdx++;
    if (nc.alive.length === 1) {
      nc.winner = nc.alive[0];
      NEWS.add(`🏆 ${DB.clubById.get(nc.winner).name} remporte la Coupe Nationale !`, 'monde');
      this.addBudget(nc.winner, 4e6);
      if (nc.winner === this.G.myClub) NEWS.add(`🎉 VICTOIRE ! Votre club soulève la Coupe Nationale !`, 'club');
    }
  },

  worldNews() {
    // le monde vit : brèves aléatoires réalistes
    const bits = [
      () => { const c = U.pick(DB.clubs.filter(x => x.rep > 76)); return `📰 ${c.name} annonce un projet d'agrandissement de son stade.`; },
      () => { const p = U.pick(DB.players.filter(x => !x.retired && x.ovr >= 86)); return `📰 Rumeur : plusieurs géants européens suivent ${p.name}.`; },
      () => { const L = U.pick(DB.leagues); return `📰 Les droits TV de ${L.name} (${L.country}) sont en cours de renégociation.`; },
      () => { const c = U.pick(DB.clubs); return `📰 Les supporters de ${c.name} organisent un tifo géant pour le prochain match.`; },
      () => { const p = U.pick(DB.players.filter(x => !x.retired && x.age <= 19 && x.pot >= 85)); return p ? `📰 ${p.name} (${p.age} ans) est présenté comme le futur crack de sa génération.` : null; }
    ];
    for (let i = 0; i < U.ri(1, 2); i++) {
      const t = U.pick(bits)();
      if (t) NEWS.add(t, 'monde');
    }
  },

  endSeason() {
    const G = this.G;
    // retours de prêt avant de remettre les compteurs à zéro
    for (const [pid, st] of Object.entries(G.pstate)) {
      if (st.loan && st.loan.untilSeason <= G.season + 1) {
        const p = DB.byId.get(Number(pid)) || DB.byId.get(pid);
        if (p && st.loan.from) {
          DB.movePlayer(p, st.loan.from);
          NEWS.add(`🔁 Fin de prêt : ${p.name} retourne à ${DB.clubById.get(st.loan.from).name}.`, st.loan.from === G.myClub ? 'club' : 'transfert');
        }
        st.loan = null;
      }
    }
    // champions
    const champs = [];
    for (const L of DB.leagues) {
      const st = LEAGUE.standings(G.tables[L.id]);
      if (st.length) {
        champs.push({ league: L.id, club: st[0].id });
        if (L.level === 1) NEWS.add(`🏆 ${DB.clubById.get(st[0].id).name} est champion : ${L.name} (${L.country}) !`, 'monde');
        this.addBudget(st[0].id, FINANCE.tvRights(L) * 0.3);
      }
    }
    // meilleur buteur mondial (ligues niv.1)
    let topP = null, topG = 0;
    for (const p of DB.players) {
      if (p.retired) continue;
      const st = G.pstate[p.id];
      if (st && st.goals > topG) { topG = st.goals; topP = p; }
    }
    if (topP) NEWS.add(`👟 Soulier d'Or mondial : ${topP.name} (${topG} buts).`, 'monde');

    const moves = LEAGUE.applyPromotionRelegation();
    for (const mv of moves.filter(m => m.dir === 'up').slice(0, 6))
      NEWS.add(`⬆️ ${DB.clubById.get(mv.club).name} est promu en ${DB.leagueById.get(mv.to).name} !`, 'monde');

    const prog = PROGRESSION.endOfSeason();
    if (typeof OWNER !== 'undefined' && G.myClub) OWNER.runSeasonControl();
    const academyProg = (typeof ACADEMY !== 'undefined') ? ACADEMY.seasonTick() : { generated: 0, discovered: 0, promoted: 0 };
    G.history.push({ season: G.season, champions: champs, cupWinner: G.cup.winner, natCupWinner: G.natCup ? G.natCup.winner : null });

    // nouvelle saison
    G.season++;
    G.day = 0;
    G.tables = {}; G.fixtures = {};
    for (const L of DB.leagues) {
      const ids = DB.clubsOfLeague.get(L.id).map(c => c.id);
      G.tables[L.id] = LEAGUE.initTable(ids);
      G.fixtures[L.id] = CAL.buildLeagueFixtures(L.id);
    }
    G.cup = CAL.buildChampionsCup();
    for (const g of G.cup.groups) Object.assign(G.cup.groupTable, LEAGUE.initTable(g));
    if (G.myClub) {
      const country = DB.leagueById.get(DB.clubById.get(G.myClub).league).country;
      G.natCup = CAL.buildNationalCup(country);
    }
    G.offers = [];
    NEWS.add(`🌍 Nouvelle saison ${G.season}/${G.season + 1} ! ${prog.retired} retraites, ${prog.regens + (academyProg.promoted || 0)} jeunes issus des académies, ${academyProg.generated || 0} nouveaux profils U6-U15 créés. Le mercato d'été est ouvert.`, 'monde');
  }
};
