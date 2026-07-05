// ============ LIGUES : classements, montées/descentes ============
const LEAGUE = {
  initTable(clubIds) {
    const t = {};
    for (const id of clubIds) t[id] = { pts: 0, j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 };
    return t;
  },

  record(table, h, a, gh, ga) {
    const H = table[h], A = table[a];
    if (!H || !A) return;
    H.j++; A.j++; H.bp += gh; H.bc += ga; A.bp += ga; A.bc += gh;
    if (gh > ga) { H.pts += 3; H.g++; A.p++; }
    else if (gh < ga) { A.pts += 3; A.g++; H.p++; }
    else { H.pts++; A.pts++; H.n++; A.n++; }
  },

  standings(table) {
    return Object.entries(table)
      .map(([id, s]) => ({ id: +id, ...s, diff: s.bp - s.bc }))
      .sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.bp - x.bp);
  },

  topScorers(leagueId, limit = 15) {
    const clubIds = new Set(DB.clubsOfLeague.get(leagueId).map(c => c.id));
    return DB.players
      .filter(p => !p.retired && clubIds.has(p.club) && GAME.pstate(p.id).goals > 0)
      .map(p => ({ p, st: GAME.pstate(p.id) }))
      .sort((a, b) => b.st.goals - a.st.goals || b.st.assists - a.st.assists)
      .slice(0, limit);
  },

  // Fin de saison : promotions / relégations entre divisions liées du même pays
  applyPromotionRelegation() {
    const moves = [];
    for (const L of DB.leagues) {
      if (!L.below) continue;
      const lower = DB.leagueById.get(L.below);
      const topTable = GAME.G.tables[L.id], lowTable = GAME.G.tables[L.below];
      if (!topTable || !lowTable) continue;
      const n = Math.min(3, Math.floor(Math.min(L.nClubs, lower.nClubs) / 6) || 2);
      const down = LEAGUE.standings(topTable).slice(-n).map(s => s.id);
      const up = LEAGUE.standings(lowTable).slice(0, n).map(s => s.id);
      for (const id of down) { DB.clubById.get(id).league = L.below; moves.push({ club: id, to: L.below, dir: 'down' }); }
      for (const id of up) { DB.clubById.get(id).league = L.id; moves.push({ club: id, to: L.id, dir: 'up' }); }
    }
    if (moves.length) DB.reindex();
    return moves;
  }
};
