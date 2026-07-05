// ============ ÉCONOMIE : droits TV, salaires, billetterie ============
const FINANCE = {
  initBudgets() {
    const b = {};
    for (const c of DB.clubs) {
      const L = DB.leagueById.get(c.league);
      const tvBase = this.tvRights(L);
      b[c.id] = Math.round(c.sqval * 0.12 + tvBase * 0.5 + U.rnd() * c.sqval * 0.05);
    }
    return b;
  },

  // droits TV annuels selon ligue (les gros championnats reçoivent beaucoup plus)
  tvRights(L) {
    if (!L) return 1e6;
    const base = { 1: 1, 2: 0.25, 3: 0.08, 4: 0.04 }[L.level] || 1;
    // richesse du championnat ≈ moyenne overall
    const wealth = Math.pow(Math.max(L.avg - 55, 3), 2.6) * 42000;
    return Math.round(wealth * base);
  },

  // tick mensuel pour tous les clubs
  monthly() {
    for (const c of DB.clubs) {
      const L = DB.leagueById.get(c.league);
      const sq = DB.squadOf(c.id);
      const wages = sq.reduce((a, p) => a + (p.wage || 0), 0) * 4.33;
      const tv = this.tvRights(L) / 10;
      let tickets = Math.round(Math.pow(c.rep, 2.4) * 28);
      let sponsor = Math.round(Math.pow(c.rep, 2.6) * 14);
      if (typeof OWNER !== 'undefined' && GAME.G.myClub === c.id && GAME.G.ownerFinance) {
        const O = OWNER.ensure();
        tickets = Math.round(tickets * (1 + (O.levels.stadium - 1) * 0.10));
        sponsor = Math.round(sponsor * (1 + (O.levels.marketing - 1) * 0.08));
      }
      let delta = tv + tickets + sponsor - wages;
      GAME.addBudget(c.id, Math.round(delta));
      // clubs IA en difficulté → vente forcée
      if (c.id !== GAME.G.myClub && GAME.budget(c.id) < -2e6 && sq.length > 16) {
        const sell = sq.slice().sort((a, b) => b.value - a.value)[0];
        if (sell) {
          const buyers = DB.clubs.filter(x => x.id !== c.id && GAME.budget(x.id) > sell.value);
          if (buyers.length) {
            const buyer = U.pick(buyers);
            const fee = Math.round(sell.value * 0.85);
            GAME.addBudget(c.id, fee); GAME.addBudget(buyer.id, -fee);
            DB.movePlayer(sell, buyer.id);
            NEWS.add(`🚨 En crise financière, ${c.name} est contraint de vendre ${sell.name} à ${buyer.name} (${U.money(fee)}).`, 'finance');
          }
        }
      }
    }
    if (GAME.G.myClub) {
      const my = DB.clubById.get(GAME.G.myClub);
      const sq = DB.squadOf(my.id);
      const wages = Math.round(sq.reduce((a, p) => a + (p.wage || 0), 0) * 4.33);
      NEWS.add(`📊 Bilan mensuel : salaires ${U.money(wages)}, budget ${U.money(GAME.budget(my.id))}.`, 'finance');
    }
  },

  report(clubId) {
    const c = DB.clubById.get(clubId);
    const L = DB.leagueById.get(c.league);
    const sq = DB.squadOf(clubId);
    let ticketsMonthly = Math.round(Math.pow(c.rep, 2.4) * 28);
    let sponsorMonthly = Math.round(Math.pow(c.rep, 2.6) * 14);
    if (typeof OWNER !== 'undefined' && GAME.G && GAME.G.myClub === clubId && GAME.G.ownerFinance) {
      const O = OWNER.ensure();
      ticketsMonthly = Math.round(ticketsMonthly * (1 + (O.levels.stadium - 1) * 0.10));
      sponsorMonthly = Math.round(sponsorMonthly * (1 + (O.levels.marketing - 1) * 0.08));
    }
    return {
      budget: GAME.budget(clubId),
      wagesMonthly: Math.round(sq.reduce((a, p) => a + (p.wage || 0), 0) * 4.33),
      tvMonthly: Math.round(this.tvRights(L) / 10),
      ticketsMonthly,
      sponsorMonthly,
      squadValue: sq.reduce((a, p) => a + (p.value || 0), 0)
    };
  }
};

// ============ PROGRESSION, VIEILLISSEMENT, RETRAITES, JEUNES ============
const PROGRESSION = {
  weekly() {
    // récupération + blessures qui guérissent
    for (const p of DB.players) {
      if (p.retired) continue;
      const st = GAME.pstate(p.id);
      if (st.inj > 0) st.inj = Math.max(0, st.inj - 7);
      st.fit = U.clamp(st.fit + 18, 0, 100);
      if (st.susp > 0) st.susp--;
    }
  },

  endOfSeason() {
    const retired = [], regens = [];
    for (const p of DB.players) {
      if (p.retired) continue;
      const st = GAME.pstate(p.id);
      p.age++;
      const mins = st.apps;
      // progression des jeunes
      if (p.age <= 23 && p.ovr < p.pot) {
        const gap = p.pot - p.ovr;
        const aq = p.club ? (GAME.G['academy_' + p.club] || 60) : 50;
        const academyBonus = (aq - 60) / 35;
        const growth = U.clamp(Math.round(gap * 0.22 + academyBonus + (mins > 15 ? 1.4 : mins > 5 ? 0.6 : 0) + U.gauss(0, 0.8)), 0, 6);
        p.ovr = Math.min(p.pot, p.ovr + growth);
        p.value = Math.round(p.value * (1 + growth * 0.14));
      } else if (p.age >= 30) {
        const decline = U.clamp(Math.round((p.age - 29) * 0.5 + U.gauss(0.4, 0.7)), 0, 4);
        p.ovr = Math.max(40, p.ovr - decline);
        p.pace = Math.max(20, p.pace - decline - 1);
        p.value = Math.round(p.value * Math.max(0.3, 1 - decline * 0.16 - 0.08));
      }
      // contrats
      if (p.contract <= GAME.G.season) {
        if (p.club && U.rnd() < 0.55) { p.contract = GAME.G.season + U.ri(1, 3); } // prolongation auto IA
        else if (p.club !== GAME.G.myClub) { DB.movePlayer(p, null); }
        else { DB.movePlayer(p, null); NEWS.add(`📄 Fin de contrat : ${p.name} quitte le club libre.`, 'club'); }
      }
      // retraites
      if (p.age >= 34 && (p.ovr < 68 || U.rnd() < (p.age - 33) * 0.22)) {
        retired.push(p);
      }
      // reset stats saison
      st.apps = 0; st.goals = 0; st.assists = 0; st.sumRating = 0; st.form = 5; st.fit = 100;
    }
    for (const p of retired) {
      if (p.ovr >= 82) NEWS.add(`👋 LÉGENDE : ${p.name} (${p.age} ans) prend sa retraite après une immense carrière.`, 'monde');
      DB.movePlayer(p, null);
      p.retired = true;
      const i = DB.freeAgents.indexOf(p); if (i >= 0) DB.freeAgents.splice(i, 1);
    }
    // regens : chaque club produit 1-2 jeunes de son académie
    for (const c of DB.clubs) {
      const L = DB.leagueById.get(c.league);
      const n = U.ri(1, 2);
      for (let i = 0; i < n; i++) {
        const nat = U.rnd() < 0.8 ? (L ? L.country : 'default') : U.pick(['Brazil', 'France', 'Argentina', 'England', 'Spain', 'Burundi', 'Portugal', 'Germany']);
        const name = U.genName(nat);
        const aq = GAME.G['academy_' + c.id] || U.clamp(Math.round((c.rep || 60) * 0.85 + U.ri(-6, 8)), 35, 95);
        GAME.G['academy_' + c.id] = aq;
        const pot = U.clamp(Math.round(c.rep + (aq - 60) * 0.22 + U.gauss(4, 8)), 55, 96);
        const ovr = U.clamp(Math.round(pot - U.ri(14, 26)), 42, 68);
        const pos = U.pick(['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST']);
        const yp = {
          id: DB.nextRegenId++, name: name.split(' ')[0][0] + '. ' + name.split(' ').slice(1).join(' '), fullName: name,
          pos, mainPos: pos, group: U.posGroup(pos),
          ovr, pot, age: U.ri(16, 18), value: Math.round(Math.pow(ovr, 3.1) * 2.2), wage: U.ri(500, 4000),
          club: c.id, nat, nat2: null, contract: GAME.G.season + U.ri(2, 4),
          height: U.ri(168, 195), weight: U.ri(62, 88), foot: U.ri(0, 1), wf: U.ri(2, 4), sm: U.ri(1, 4), rep: 1,
          pace: U.ri(ovr - 10, ovr + 12), sho: U.ri(ovr - 15, ovr + 5), pas: U.ri(ovr - 12, ovr + 6),
          dri: U.ri(ovr - 10, ovr + 8), def: pos === 'CB' || pos === 'CDM' ? U.ri(ovr - 5, ovr + 8) : U.ri(30, ovr - 5),
          phy: U.ri(ovr - 12, ovr + 8),
          gkDiv: pos === 'GK' ? ovr : 0, gkHan: pos === 'GK' ? ovr - 2 : 0, gkKic: pos === 'GK' ? ovr - 6 : 0,
          gkPos: pos === 'GK' ? ovr : 0, gkRef: pos === 'GK' ? ovr + 2 : 0,
          jersey: U.ri(30, 49), stamina: U.ri(55, 85), finishing: U.ri(ovr - 15, ovr + 8),
          longshots: U.ri(35, ovr), penalties: U.ri(35, ovr), fk: U.ri(25, ovr), vision: U.ri(ovr - 15, ovr + 5),
          crossing: U.ri(30, ovr), tackling: U.ri(30, ovr), heading: U.ri(35, ovr), composure: U.ri(ovr - 15, ovr + 5),
          aggression: U.ri(35, 75), regen: true
        };
        DB.players.push(yp);
        DB.byId.set(yp.id, yp);
        if (!DB.squad.has(c.id)) DB.squad.set(c.id, []);
        DB.squad.get(c.id).push(yp);
        regens.push(yp);
        if (c.id === GAME.G.myClub)
          NEWS.add(`🌱 Académie : ${yp.name} (${yp.age} ans, ${pos}, potentiel estimé élevé) intègre l'équipe première !`, 'club');
      }
    }
    return { retired: retired.length, regens: regens.length };
  }
};

// ============ NEWS ============
const NEWS = {
  add(txt, cat = 'monde') {
    GAME.G.news.unshift({ day: GAME.G.day, season: GAME.G.season, txt, cat });
    if (GAME.G.news.length > 250) GAME.G.news.length = 250;
  }
};
