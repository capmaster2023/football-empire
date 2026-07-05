// ============ CALENDRIER : toutes les ligues vivent ============
const CAL = {
  SEASON_START: 7,      // premier match : 2e samedi d'août
  SEASON_END: 300,      // fin mai
  END_OF_SEASON_DAY: 320, // intersaison : progression, vieillissement, promotions

  // round-robin (méthode du cercle)
  roundRobin(ids) {
    const n = ids.length % 2 === 0 ? ids.length : ids.length + 1;
    const arr = ids.slice();
    if (arr.length < n) arr.push(null); // exempt
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const round = [];
      for (let i = 0; i < n / 2; i++) {
        const h = arr[i], a = arr[n - 1 - i];
        if (h != null && a != null) round.push(r % 2 === 0 ? [h, a] : [a, h]);
      }
      rounds.push(round);
      arr.splice(1, 0, arr.pop());
    }
    return rounds;
  },

  buildLeagueFixtures(leagueId) {
    const clubs = DB.clubsOfLeague.get(leagueId).map(c => c.id);
    let rounds = this.roundRobin(clubs);
    // aller-retour si le calendrier le permet (<= 44 journées)
    if (rounds.length * 2 <= 46) {
      rounds = rounds.concat(rounds.map(r => r.map(([h, a]) => [a, h])));
    }
    const R = rounds.length;
    const span = this.SEASON_END - this.SEASON_START;
    const fixtures = rounds.map((matches, i) => {
      let day = this.SEASON_START + Math.round(i * span / Math.max(R - 1, 1));
      if (R <= 42) day = Math.round(day / 7) * 7;            // samedis
      else if (day % 7 !== 0) day = day - (day % 7) + (i % 2 === 0 ? 0 : 4); // sam + mer
      day = U.clamp(day, this.SEASON_START, this.SEASON_END);
      return { day, matches: matches.map(([h, a]) => ({ h, a, gh: null, ga: null })) };
    });
    // éviter deux journées le même jour
    for (let i = 1; i < fixtures.length; i++) {
      if (fixtures[i].day <= fixtures[i - 1].day) fixtures[i].day = fixtures[i - 1].day + (R > 42 ? 3 : 7);
    }
    return fixtures;
  },

  // Coupe continentale (32 meilleurs clubs UEFA) — les mardis/mercredis
  buildChampionsCup() {
    const uefaClubs = DB.clubs
      .filter(c => (DB.leagueById.get(c.league) || {}).conf === 'UEFA' && DB.leagueById.get(c.league).level === 1)
      .sort((a, b) => b.rep - a.rep)
      .slice(0, 32);
    // 8 groupes de 4
    const groups = [];
    for (let g = 0; g < 8; g++) groups.push([]);
    uefaClubs.forEach((c, i) => groups[i % 8].push(c.id));
    const groupDays = [45, 59, 80, 101, 122, 136].map(d => d - (d % 7) + 3); // mardis
    const groupFixtures = groups.map((ids, gi) => {
      const rr = this.roundRobin(ids);
      const full = rr.concat(rr.map(r => r.map(([h, a]) => [a, h])));
      return full.map((ms, ri) => ({
        day: groupDays[ri], group: gi,
        matches: ms.map(([h, a]) => ({ h, a, gh: null, ga: null }))
      }));
    }).flat().sort((x, y) => x.day - y.day);
    return {
      name: 'Coupe des Champions',
      stage: 'groups',
      groups,                       // ids par groupe
      groupTable: {},               // clubId -> stats (init par LEAGUE.initTable)
      fixtures: groupFixtures,
      koRounds: [],                 // rempli après les groupes
      koDays: { R16: 192, QF: 220, SF: 248, F: 285 },
      winner: null
    };
  },

  // Coupe nationale du pays du joueur (élimination directe)
  buildNationalCup(country) {
    const clubIds = DB.clubs.filter(c => (DB.leagueById.get(c.league) || {}).country === country).map(c => c.id);
    if (clubIds.length < 4) return null;
    let n = 2; while (n * 2 <= clubIds.length) n *= 2;
    const entrants = clubIds
      .map(id => DB.clubById.get(id)).sort((a, b) => b.rep - a.rep)
      .slice(0, n).map(c => c.id);
    // mélanger
    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(U.rnd() * (i + 1));
      [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
    }
    const nRounds = Math.log2(n);
    const days = [];
    for (let r = 0; r < nRounds; r++) days.push(60 + Math.round(r * 200 / nRounds) - ((60 + Math.round(r * 200 / nRounds)) % 7) + 4); // mercredis
    return { name: 'Coupe Nationale', country, roundIdx: 0, days, alive: entrants, results: [], winner: null };
  }
};
