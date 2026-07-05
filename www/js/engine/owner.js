// ============ PROPRIÉTAIRE, INVESTISSEMENTS ET FAIR-PLAY FINANCIER ============
const OWNER = {
  AMOUNTS: [50e6, 100e6, 250e6, 500e6, 1000e6],
  CATS: {
    stadium: { label: '🏟️ Stade', desc: 'Billetterie, hospitalités, abonnements et réputation.', max: 5 },
    academy: { label: '🌱 Centre de formation', desc: 'Qualité des jeunes générés et progression des catégories.', max: 5 },
    training: { label: '💪 Entraînement', desc: 'Progression des pros et des jeunes.', max: 5 },
    medical: { label: '🏥 Centre médical', desc: 'Moins de blessures, retours plus rapides.', max: 5 },
    staff: { label: '👔 Staff', desc: 'Salaires, stabilité, préparation et progression.', max: 5 },
    scouting: { label: '🛰️ Scouting mondial', desc: 'Rapports plus fiables et découverte de talents.', max: 5 },
    marketing: { label: '📣 Marketing', desc: 'Sponsors, visibilité, marque mondiale.', max: 5 },
    data: { label: '📊 Données & performance', desc: 'Analystes, technologie sportive, cellule performance.', max: 5 },
    debt: { label: '📉 Dettes', desc: 'Santé financière et marge de manœuvre futures.', max: 5 },
    reserve: { label: '🧱 Réserve financière', desc: 'Sécurité en cas de crise.', max: 5 },
    transfer: { label: '💰 Mercato autorisé', desc: 'Argent mis côté mercato, toujours bloqué par le fair-play financier.', max: 5 }
  },

  defaultState(clubId, setup = {}) {
    const baseBudget = Math.max(0, Math.round(GAME.budget(clubId) || 0));
    const type = setup.type === 'rich' ? 'rich' : 'normal';
    const injection = type === 'rich' ? Math.round(Number(setup.injection || 0)) : 0;
    const transferBase = Math.max(0, Math.round(baseBudget * (type === 'rich' ? 0.55 : 0.65)));
    const allocations = {};
    for (const k of Object.keys(this.CATS)) allocations[k] = 0;
    allocations.transfer = transferBase;
    allocations.reserve = injection;
    return {
      clubId,
      type,
      injection,
      createdSeason: GAME.G.season,
      trust: type === 'rich' ? 62 : 54,
      pressure: type === 'rich' ? Math.min(95, 45 + Math.round(injection / 18e6)) : 35,
      strategy: type === 'rich' ? 'Projet ambitieux encadré par le fair-play financier' : 'Construction réaliste avec les moyens du club',
      allocations,
      invested: { stadium: 0, academy: 0, training: 0, medical: 0, staff: 0, scouting: 0, marketing: 0, data: 0, debt: 0, reserve: 0, transfer: 0 },
      levels: { stadium: 1, academy: 1, training: 1, medical: 1, staff: 1, scouting: 1, marketing: 1, data: 1, debt: 1, reserve: 1, transfer: 1 },
      history: [],
      warnings: [],
      sanctions: []
    };
  },

  initCareer(clubId, setup = {}) {
    if (!clubId || !GAME.G) return null;
    const state = this.defaultState(clubId, setup);
    if (state.injection > 0) {
      GAME.addBudget(clubId, state.injection);
      state.history.unshift({ season: GAME.G.season, day: GAME.G.day, type: 'injection', amount: state.injection, txt: `Injection propriétaire : ${U.money(state.injection)}.` });
      NEWS.add(`💼 Propriétaire riche : “Je donne ${U.money(state.injection)}, mais le club doit rester conforme au fair-play financier.”`, 'finance');
    } else {
      NEWS.add('💼 Propriétaire normal : aucun chèque magique. Le club part avec son budget réaliste.', 'finance');
    }
    GAME.G.ownerFinance = state;
    return state;
  },

  ensure() {
    if (!GAME.G || !GAME.G.myClub) return null;
    if (!GAME.G.ownerFinance) GAME.G.ownerFinance = this.defaultState(GAME.G.myClub, { type: 'normal' });
    const O = GAME.G.ownerFinance;
    if (!O.allocations) O.allocations = {};
    if (!O.invested) O.invested = {};
    if (!O.levels) O.levels = {};
    if (!O.history) O.history = [];
    if (!O.warnings) O.warnings = [];
    if (!O.sanctions) O.sanctions = [];
    for (const k of Object.keys(this.CATS)) {
      if (O.allocations[k] == null) O.allocations[k] = 0;
      if (O.invested[k] == null) O.invested[k] = 0;
      if (O.levels[k] == null) O.levels[k] = 1;
    }
    return O;
  },

  annualRevenue(clubId = GAME.G.myClub) {
    const r = FINANCE.report(clubId);
    const O = this.ensure();
    const marketing = O && O.clubId === clubId ? (O.levels.marketing - 1) * 0.08 : 0;
    const stadium = O && O.clubId === clubId ? (O.levels.stadium - 1) * 0.10 : 0;
    const base = (r.tvMonthly + r.ticketsMonthly * (1 + stadium) + r.sponsorMonthly * (1 + marketing)) * 12;
    return Math.max(0, Math.round(base));
  },

  wageAnnual(clubId = GAME.G.myClub) {
    return Math.round(DB.squadOf(clubId).reduce((a, p) => a + (p.wage || 0), 0) * 52);
  },

  transferSeason(clubId = GAME.G.myClub) {
    const out = { spent: 0, received: 0 };
    for (const t of (GAME.G.transferLog || [])) {
      if (t.season != null && t.season !== GAME.G.season) continue;
      if (t.season == null && GAME.G.season !== 2026) continue;
      const fee = Math.max(0, t.fee || 0);
      if (t.to === clubId) out.spent += fee;
      if (t.from === clubId) out.received += fee;
    }
    return out;
  },

  ffp(clubId = GAME.G.myClub) {
    const O = this.ensure();
    const revenue = this.annualRevenue(clubId);
    const wages = this.wageAnnual(clubId);
    const market = this.transferSeason(clubId);
    const injected = O && O.clubId === clubId ? O.injection || 0 : 0;
    const sustainableOwnerPart = Math.min(injected * 0.08, revenue * 0.55);
    const wagePressure = Math.max(0, wages - revenue * 0.62) * 0.55;
    const debtBonus = O && O.clubId === clubId ? (O.levels.debt - 1) * revenue * 0.025 : 0;
    const reserveBonus = O && O.clubId === clubId ? Math.min((O.allocations.reserve || 0) * 0.035, revenue * 0.16) : 0;
    const limit = Math.max(250000, Math.round(revenue * 0.48 + market.received * 0.78 + sustainableOwnerPart + debtBonus + reserveBonus - wagePressure));
    const remaining = Math.max(0, limit - market.spent);
    const transferAllocation = O && O.clubId === clubId ? Math.max(0, O.allocations.transfer || 0) : GAME.budget(clubId);
    const authorized = Math.max(0, Math.min(GAME.budget(clubId), transferAllocation, remaining));
    const ratio = limit <= 0 ? 1 : market.spent / limit;
    const status = ratio >= 1.03 ? 'sanction' : ratio >= 0.9 ? 'danger' : ratio >= 0.75 ? 'attention' : 'conforme';
    return { revenue, wages, spent: market.spent, received: market.received, limit, remaining, authorized, transferAllocation, status };
  },

  canSpendTransfer(clubId, amount, wage = 0) {
    if (!GAME.G || clubId !== GAME.G.myClub) return { ok: amount <= GAME.budget(clubId), msg: 'Budget insuffisant.' };
    const f = this.ffp(clubId);
    const cash = amount + Math.max(0, wage || 0) * 4;
    if (cash > GAME.budget(clubId)) return { ok: false, msg: 'Le club n’a pas assez d’argent total.' };
    if (cash > f.authorized) return { ok: false, msg: `Le club a l’argent total, mais pas le budget mercato autorisé. Limite actuelle : ${U.money(f.authorized)}.` };
    return { ok: true, msg: 'Dépense autorisée.' };
  },

  recordTransferSpend(clubId, amount) {
    if (!GAME.G || clubId !== GAME.G.myClub) return;
    const O = this.ensure();
    O.allocations.transfer = Math.max(0, (O.allocations.transfer || 0) - Math.max(0, amount || 0));
    O.history.unshift({ season: GAME.G.season, day: GAME.G.day, type: 'mercato', amount, txt: `Dépense mercato autorisée : ${U.money(amount)}.` });
    if (O.history.length > 80) O.history.length = 80;
  },

  investCost(cat) {
    const O = this.ensure();
    const lvl = O.levels[cat] || 1;
    const base = cat === 'transfer' ? 5e6 : cat === 'reserve' ? 2e6 : cat === 'debt' ? 4e6 : 2.5e6;
    return Math.round(base * lvl * lvl / 1e5) * 1e5;
  },

  invest(cat) {
    const O = this.ensure();
    if (!O || !this.CATS[cat]) return { ok: false, msg: 'Investissement inconnu.' };
    const cost = this.investCost(cat);
    if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: `Budget total insuffisant : il faut ${U.money(cost)}.` };
    if (cat !== 'transfer' && cat !== 'reserve' && (O.levels[cat] || 1) >= this.CATS[cat].max) return { ok: false, msg: 'Niveau maximum atteint.' };
    if (cat === 'transfer') {
      const f = this.ffp(GAME.G.myClub);
      const maxAdd = Math.max(0, f.remaining - (O.allocations.transfer || 0));
      if (maxAdd <= 0) return { ok: false, msg: 'Impossible : le fair-play financier bloque déjà le mercato.' };
      const add = Math.min(cost, maxAdd, GAME.budget(GAME.G.myClub));
      O.allocations.transfer = Math.max(0, (O.allocations.transfer || 0) + add);
      O.invested.transfer += add;
      O.history.unshift({ season: GAME.G.season, day: GAME.G.day, type: cat, amount: add, txt: `Réserve déplacée vers budget mercato autorisé : ${U.money(add)}.` });
      return { ok: true, msg: `Budget mercato autorisé augmenté de ${U.money(add)}.` };
    }
    if (cat === 'reserve') {
      const add = Math.min(cost, GAME.budget(GAME.G.myClub));
      O.allocations.reserve += add;
      O.invested.reserve += add;
      O.trust = U.clamp((O.trust || 55) + 2, 0, 100);
      O.history.unshift({ season: GAME.G.season, day: GAME.G.day, type: cat, amount: add, txt: `Réserve financière renforcée : ${U.money(add)} mis de côté.` });
      return { ok: true, msg: `Réserve financière renforcée de ${U.money(add)}.` };
    }
    GAME.addBudget(GAME.G.myClub, -cost);
    O.invested[cat] += cost;
    O.levels[cat] = Math.min(this.CATS[cat].max, (O.levels[cat] || 1) + 1);
    if (cat === 'academy' && typeof ACADEMY !== 'undefined') {
      const key = 'academy_' + GAME.G.myClub;
      GAME.G[key] = U.clamp((GAME.G[key] || 55) + U.ri(3, 7), 35, 99);
      if (GAME.G.acadInfra) {
        GAME.G.acadInfra.install = Math.min(5, (GAME.G.acadInfra.install || 1) + 1);
        GAME.G.acadInfra.staff = Math.min(5, (GAME.G.acadInfra.staff || 1) + (U.rnd() < 0.55 ? 1 : 0));
      }
    }
    if (cat === 'scouting' && typeof ACADEMY !== 'undefined') ACADEMY.ensure().scouting = U.clamp((ACADEMY.ensure().scouting || 45) + U.ri(3, 8), 35, 99);
    if (cat === 'training') for (const p of DB.squadOf(GAME.G.myClub).filter(x => x.age <= 23 && x.ovr < x.pot).slice(0, 8)) p.ovr = Math.min(p.pot, p.ovr + (U.rnd() < 0.35 ? 1 : 0));
    if (cat === 'medical') for (const p of DB.squadOf(GAME.G.myClub)) GAME.pstate(p.id).inj = Math.max(0, (GAME.pstate(p.id).inj || 0) - 7);
    O.trust = U.clamp((O.trust || 55) + (cat === 'reserve' || cat === 'debt' ? 2 : 1), 0, 100);
    O.history.unshift({ season: GAME.G.season, day: GAME.G.day, type: cat, amount: cost, txt: `${this.CATS[cat].label} amélioré pour ${U.money(cost)}.` });
    if (O.history.length > 80) O.history.length = 80;
    NEWS.add(`${this.CATS[cat].label} : investissement de ${U.money(cost)} validé.`, 'finance');
    return { ok: true, msg: `${this.CATS[cat].label} amélioré (${U.money(cost)}). Effet visible sur plusieurs saisons.` };
  },

  runSeasonControl() {
    const O = this.ensure();
    if (!O) return;
    const f = this.ffp(GAME.G.myClub);
    let txt = '';
    if (f.status === 'conforme') { O.trust = U.clamp((O.trust || 55) + 4, 0, 100); txt = 'Contrôle financier : conforme. Le propriétaire gagne confiance.'; }
    else if (f.status === 'attention') { O.trust = U.clamp((O.trust || 55) - 3, 0, 100); txt = 'Contrôle financier : attention. Le propriétaire surveille les dépenses.'; }
    else if (f.status === 'danger') { O.trust = U.clamp((O.trust || 55) - 8, 0, 100); txt = 'Contrôle financier : danger. Budget mercato réduit.'; O.allocations.transfer = Math.round((O.allocations.transfer || 0) * 0.72); }
    else { O.trust = U.clamp((O.trust || 55) - 15, 0, 100); const sanction = U.pick(['Amende', 'Budget mercato réduit', 'Interdiction de recruter', 'Retrait de points', 'Exclusion européenne']); O.sanctions.unshift({ season: GAME.G.season, sanction }); txt = `Contrôle financier : sanction — ${sanction}.` ; O.allocations.transfer = Math.round((O.allocations.transfer || 0) * 0.35); }
    O.history.unshift({ season: GAME.G.season, day: GAME.G.day, type: 'ffp', amount: 0, txt });
    NEWS.add(`⚖️ ${txt}`, 'finance');
  },

  priceInflation(buyerId, loan = false) {
    const O = this.ensure();
    if (!O || buyerId !== GAME.G.myClub || O.type !== 'rich') return 1;
    if (loan) return 1.04;
    if ((O.injection || 0) >= 1000e6) return 1.28;
    if ((O.injection || 0) >= 500e6) return 1.22;
    if ((O.injection || 0) >= 250e6) return 1.16;
    if ((O.injection || 0) >= 100e6) return 1.10;
    return 1.06;
  }
};

(function patchOwnerSystems(){
  if (typeof GAME !== 'undefined') {
    const oldBudget = GAME.budget.bind(GAME);
    GAME.transferBudget = function(clubId) { return OWNER.ffp(clubId || this.G.myClub).authorized; };
    GAME.canSpendTransfer = function(clubId, amount, wage) { return OWNER.canSpendTransfer(clubId, amount, wage); };
    GAME.ownerFinance = function() { return OWNER.ensure(); };
  }
  if (typeof TRANSFERS !== 'undefined') {
    const oldMin = TRANSFERS.minAcceptable.bind(TRANSFERS);
    TRANSFERS.minAcceptable = function(p, seller, buyer, loan = false) {
      return Math.round(oldMin(p, seller, buyer, loan) * OWNER.priceInflation(buyer && buyer.id, loan));
    };
    const oldClubOffer = TRANSFERS.clubOffer.bind(TRANSFERS);
    TRANSFERS.clubOffer = function(fee, sellOn = 0, loan = false) {
      const n = GAME.G.negotiation;
      if (n && n.to === GAME.G.myClub) {
        const chk = OWNER.canSpendTransfer(n.to, Math.max(0, fee || 0));
        if (!chk.ok) return { ok: false, msg: chk.msg || 'Ce transfert dépasse la limite autorisée par le fair-play financier.' };
      }
      return oldClubOffer(fee, sellOn, loan);
    };
    const oldFinal = TRANSFERS.finalizeNegotiation.bind(TRANSFERS);
    TRANSFERS.finalizeNegotiation = function(wage, commission = 0) {
      const n = GAME.G.negotiation;
      if (n && n.to === GAME.G.myClub) {
        const totalCash = (n.acceptedFee || 0) + (commission || 0);
        const chk = OWNER.canSpendTransfer(n.to, totalCash, wage);
        if (!chk.ok) return { ok: false, msg: chk.msg || 'Cette dépense risque une sanction financière.' };
        const r = oldFinal(wage, commission);
        if (r && r.ok) { if (GAME.G.transferLog[0]) GAME.G.transferLog[0].season = GAME.G.season; OWNER.recordTransferSpend(n.to, totalCash); }
        return r;
      }
      return oldFinal(wage, commission);
    };
    const oldCompletePending = TRANSFERS.completePendingTransfer.bind(TRANSFERS);
    TRANSFERS.completePendingTransfer = function(t) {
      if (t && t.to === GAME.G.myClub) {
        const totalCash = (t.fee || 0) + (t.type === 'free' ? Math.round((t.wage || 0) * 4) : 0);
        const chk = OWNER.canSpendTransfer(t.to, totalCash, t.wage);
        if (!chk.ok) { t.status = 'failed'; NEWS.add(`❌ Dossier ${DB.byId.get(t.pid)?.name || 'joueur'} bloqué : ${chk.msg}`, 'finance'); return { ok: false, msg: chk.msg }; }
        const r = oldCompletePending(t);
        if (r && r.ok) { if (GAME.G.transferLog[0]) GAME.G.transferLog[0].season = GAME.G.season; OWNER.recordTransferSpend(t.to, totalCash); }
        return r;
      }
      return oldCompletePending(t);
    };
    const oldDirect = TRANSFERS.completeDirectTransfer.bind(TRANSFERS);
    TRANSFERS.completeDirectTransfer = function(p, buyerId, sellerId, fee, type = 'buy', extra = {}) {
      if (buyerId === GAME.G.myClub) {
        const chk = OWNER.canSpendTransfer(buyerId, fee || 0, extra.wage || p.wage || 0);
        if (!chk.ok) return { ok: false, msg: chk.msg };
        const r = oldDirect(p, buyerId, sellerId, fee, type, extra);
        if (r && r.ok) { if (GAME.G.transferLog[0]) GAME.G.transferLog[0].season = GAME.G.season; OWNER.recordTransferSpend(buyerId, fee || 0); }
        return r;
      }
      return oldDirect(p, buyerId, sellerId, fee, type, extra);
    };

    const oldAcceptOffer = TRANSFERS.acceptOffer.bind(TRANSFERS);
    TRANSFERS.acceptOffer = function(idx) {
      const r = oldAcceptOffer(idx);
      if (r && r.ok && GAME.G.transferLog && GAME.G.transferLog[0]) {
        GAME.G.transferLog[0].season = GAME.G.season;
        const log = GAME.G.transferLog[0];
        if (log.from === GAME.G.myClub) {
          const O = OWNER.ensure();
          const add = Math.round((log.fee || 0) * 0.55);
          O.allocations.transfer = Math.max(0, (O.allocations.transfer || 0) + add);
          O.history.unshift({ season: GAME.G.season, day: GAME.G.day, type: 'vente', amount: add, txt: `Vente joueur : ${U.money(add)} ajoutés au budget mercato autorisé.` });
        }
      }
      return r;
    };
    const oldForceSale = TRANSFERS.forceSale.bind(TRANSFERS);
    TRANSFERS.forceSale = function(pid) {
      const r = oldForceSale(pid);
      if (r && r.ok && GAME.G.transferLog && GAME.G.transferLog[0]) GAME.G.transferLog[0].season = GAME.G.season;
      return r;
    };
  }
})();
