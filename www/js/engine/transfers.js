// ============ MARCHÉ DES TRANSFERTS + NÉGOCIATIONS ============
const TRANSFERS = {
  // fenêtres : été (jusqu'au 1er sept ≈ jour 31) et janvier (jours 153-183)
  windowOpen(day) { return day <= 31 || (day >= 153 && day <= 183); },
  windowName(day) { return day <= 31 ? 'mercato d\'été' : 'mercato d\'hiver'; },

  statusLabel(st) {
    return ({ normal: 'Normal', sell: 'À vendre', loan: 'À prêter', unavailable: 'Intransférable' })[st || 'normal'] || 'Normal';
  },

  statusBadge(pid) {
    const s = GAME.pstate(pid).transferStatus || (GAME.pstate(pid).listed ? 'sell' : 'normal');
    return ({ sell: '📋 À vendre', loan: '🔁 À prêter', unavailable: '🔒 Intransférable', normal: '' })[s] || '';
  },

  askingPrice(p) {
    let f = 1.15;
    const st = GAME.pstate(p.id);
    const status = st.transferStatus || (st.listed ? 'sell' : 'normal');
    if (p.contract <= GAME.G.season + 1) f *= 0.65;     // fin de contrat proche
    if (p.age <= 22 && p.pot - p.ovr >= 6) f *= 1.35;   // gros potentiel
    if (status === 'sell') f *= 0.78;
    if (status === 'loan') f *= 0.9;
    if (status === 'unavailable') f *= 2.35;
    return Math.max(50000, Math.round((p.value || 0) * f));
  },

  minAcceptable(p, seller, buyer, loan = false) {
    const st = GAME.pstate(p.id);
    const status = st.transferStatus || (st.listed ? 'sell' : 'normal');
    if (loan) return Math.max(0, Math.round((p.value || 0) * (status === 'loan' ? 0.015 : 0.035)));
    let f = 0.92;
    if (status === 'sell') f = 0.72;
    if (status === 'unavailable') f = 1.65;
    if (p.ovr >= seller.rep + 2 && status !== 'sell') f += 0.35;
    if (buyer.rep > seller.rep + 5) f += 0.08;
    return Math.round(this.askingPrice(p) * f);
  },

  setStatus(pid, status) {
    const p = DB.byId.get(pid);
    if (!p) return { ok: false, msg: 'Joueur introuvable.' };
    if (p.club !== GAME.G.myClub) return { ok: false, msg: 'Ce joueur n’appartient pas à votre club.' };

    // Coach : pas de pouvoir financier direct. Il propose, le Président valide selon crédibilité.
    if (GAME.G.role === 'coach' && status === 'sell') {
      const cred = GAME.G.coachCredibility || 45;
      if (cred < 72) return { ok: false, msg: `Vente forcée refusée : crédibilité coach ${cred}/100. Il faut au moins 72/100.` };
      const pressure = p.ovr >= (DB.clubById.get(GAME.G.myClub).rep || 70) + 2 ? -12 : 4;
      if (cred + pressure + U.ri(-8, 10) < 70) return { ok: false, msg: 'Le Président refuse : joueur trop important pour être listé maintenant.' };
      GAME.adjustCredibility(-2, 'pression pour vendre');
    }
    if (GAME.G.role === 'coach' && status === 'loan' && p.age > 23) {
      const cred = GAME.G.coachCredibility || 45;
      if (cred + U.ri(-8, 14) < 52) return { ok: false, msg: 'Le Président refuse le prêt : ce n’est pas un jeune prioritaire et votre influence est trop faible.' };
    }
    if (GAME.G.role === 'coach' && status === 'unavailable') {
      const cred = GAME.G.coachCredibility || 45;
      if (cred < 35) return { ok: false, msg: 'Le Président ignore votre protection du joueur : crédibilité trop basse.' };
    }

    const st = GAME.pstate(pid);
    st.transferStatus = status;
    st.listed = status === 'sell'; // compatibilité ancienne sauvegarde
    const txt = {
      normal: `${p.name} n'est plus listé.`,
      sell: GAME.G.role === 'coach' ? `${p.name} est listé après validation du Président.` : `${p.name} est placé sur la liste des transferts par le Président.`,
      loan: GAME.G.role === 'coach' ? `${p.name} est proposé en prêt après accord du Président.` : `${p.name} est disponible pour un prêt.`,
      unavailable: `${p.name} est marqué intransférable.`
    }[status] || `${p.name} : statut modifié.`;
    NEWS.add(`📌 ${txt}`, 'club');
    return { ok: true, msg: txt };
  },

  listPlayer(pid, listed) { this.setStatus(pid, listed ? 'sell' : 'normal'); },


  roleNeedScore(p, clubId = GAME.G.myClub) {
    const sq = DB.squadOf(clubId);
    const group = p.group || U.posGroup(p.pos);
    const same = sq.filter(x => x.group === group).sort((a, b) => b.ovr - a.ovr);
    const avg = same.slice(0, group === 'GK' ? 1 : 4).reduce((a, x) => a + x.ovr, 0) / Math.max(1, Math.min(same.length, group === 'GK' ? 1 : 4));
    const club = DB.clubById.get(clubId);
    let score = 0;
    if (!same.length) score += 22;
    if (avg < (club.rep || 65) - 5) score += 18;
    if (p.ovr > avg + 4) score += 16;
    if (p.age <= 23 && p.pot >= p.ovr + 6) score += 10;
    return score;
  },

  presidentRecruitmentScore(p, loan = false) {
    const my = DB.clubById.get(GAME.G.myClub);
    const cred = GAME.G.coachCredibility || 45;
    const need = this.roleNeedScore(p, my.id);
    const budget = GAME.budget(my.id);
    const price = p.club ? this.askingPrice(p) : Math.max(0, (p.wage || 1000) * 52);
    const finance = loan ? 16 : (price < budget * 0.35 ? 18 : price < budget * 0.7 ? 6 : -20);
    const age = p.age <= 24 ? 9 : p.age >= 31 ? -12 : 2;
    const quality = p.ovr >= my.rep - 2 ? 10 : p.ovr < my.rep - 10 ? -10 : 0;
    return Math.round(22 + cred * 0.42 + need + finance + age + quality + U.ri(-12, 12));
  },

  completeDirectTransfer(p, buyerId, sellerId, fee, type = 'buy', extra = {}) {
    const buyer = DB.clubById.get(buyerId);
    const seller = sellerId ? DB.clubById.get(sellerId) : null;
    const wage = extra.wage || Math.round((p.wage || 1000) * (type === 'loan' ? 1 : 1.12));
    if ((fee || 0) > GAME.budget(buyerId)) return { ok: false, msg: 'Budget insuffisant.' };
    GAME.addBudget(buyerId, -(fee || 0));
    if (sellerId) GAME.addBudget(sellerId, fee || 0);
    const oldClub = p.club || null;
    DB.movePlayer(p, buyerId);
    p.wage = wage;
    p.contract = GAME.G.season + (type === 'loan' ? 1 : U.ri(2, 4));
    const st = GAME.pstate(p.id);
    st.transferStatus = 'normal'; st.listed = false;
    if (type === 'loan') st.loan = { from: oldClub, to: buyerId, untilSeason: GAME.G.season + 1, fee: fee || 0, wageShare: extra.wageShare || 50, recall: extra.recall !== false };
    GAME.G.transferLog.unshift({ day: GAME.G.day, pid: p.id, from: oldClub, to: buyerId, fee: fee || 0, type });
    NEWS.add(type === 'loan'
      ? `🔁 OFFICIEL : ${p.name} rejoint ${buyer.name} en prêt${seller ? ` depuis ${seller.name}` : ''}.`
      : `💰 OFFICIEL : ${p.name} rejoint ${buyer.name}${seller ? ` depuis ${seller.name}` : ''} pour ${U.money(fee || 0)}.`, 'transfert');
    return { ok: true, msg: type === 'loan' ? `Prêt validé : ${p.name} arrive.` : `Transfert validé : ${p.name} arrive.` };
  },


  nextTransferWindowEnd(day) {
    if (day <= 31) return 31;
    if (day >= 153 && day <= 183) return 183;
    return day;
  },

  estimateDossierDays(p, loan = false, score = 60) {
    if (!p.club) return U.ri(3, 12);
    let min = loan ? 5 : 9;
    let max = loan ? 21 : 42;
    if ((p.value || 0) >= 30e6 || p.ovr >= 82) { min += 8; max += 24; }
    if ((p.value || 0) >= 70e6 || p.ovr >= 87) { min += 10; max += 28; }
    if (score >= 82) { min = Math.max(3, min - 3); max = Math.max(min + 5, max - 8); }
    if (score < 68) { min += 4; max += 12; }
    return U.ri(min, max);
  },

  startRecruitmentDossier(p, buyerId, opts = {}) {
    const buyer = DB.clubById.get(buyerId);
    const seller = p.club ? DB.clubById.get(p.club) : null;
    const score = opts.score ?? this.presidentRecruitmentScore(p, !!opts.loan);
    const loan = !!opts.loan || (!!seller && p.age <= 22 && this.askingPrice(p) > GAME.budget(buyerId) * 0.55);
    const type = !seller ? 'free' : loan ? 'loan' : 'buy';
    const fee = !seller
      ? Math.round((p.wage || 1000) * U.ri(8, 18))
      : loan
        ? Math.round(this.minAcceptable(p, seller, buyer, true) * (1.05 + U.rnd() * 0.25))
        : Math.round(this.minAcceptable(p, seller, buyer, false) * (0.98 + U.rnd() * 0.22));
    const wage = Math.round((p.wage || 1000) * (type === 'loan' ? 1 : !seller ? 1.12 : 1.18));
    const windowEnd = this.nextTransferWindowEnd(GAME.G.day);
    const etaDays = Math.max(2, this.estimateDossierDays(p, type === 'loan', score));
    const dueDay = Math.min(GAME.G.day + etaDays, windowEnd);
    const t = {
      id: `${GAME.G.day}_${Date.now()}_${p.id}`,
      pid: p.id, from: seller ? seller.id : null, to: buyerId,
      type, fee, wage, wageShare: type === 'loan' ? U.ri(40, 100) : 0, recall: true,
      requestedBy: opts.requestedBy || GAME.G.role || 'president', presidentScore: score,
      status: 'active', stage: !seller ? 'Contact agent libre' : 'Contact club vendeur', progress: 5,
      startDay: GAME.G.day, etaDays, dueDay, deadlineDay: windowEnd,
      nextUpdateDay: GAME.G.day + U.ri(2, 5), cancelRequested: false,
      history: [`${buyer.name} ouvre le dossier ${p.name}. Estimation : ${etaDays} jour(s).`]
    };
    GAME.G.pendingTransfers = GAME.G.pendingTransfers || [];
    GAME.G.pendingTransfers.unshift(t);
    return t;
  },

  pendingLabel(t) {
    if (!t) return 'Dossier inconnu';
    const p = DB.byId.get(t.pid);
    const from = t.from ? DB.clubById.get(t.from) : null;
    const kind = t.type === 'loan' ? 'prêt' : t.type === 'free' ? 'agent libre' : 'achat';
    return `${p ? p.name : '?'} · ${kind}${from ? ` depuis ${from.name}` : ''}`;
  },

  requestCancelPending(id) {
    const t = (GAME.G.pendingTransfers || []).find(x => x.id === id);
    if (!t) return { ok: false, msg: 'Dossier introuvable.' };
    const p = DB.byId.get(t.pid);
    if (GAME.G.role === 'president') {
      t.status = 'cancelled';
      t.history.push('Dossier annulé directement par le Président.');
      NEWS.add(`🛑 Dossier ${p ? p.name : 'joueur'} annulé par le Président.`, 'transfert');
      GAME.G.pendingTransfers = GAME.G.pendingTransfers.filter(x => x.id !== id);
      return { ok: true, msg: `Dossier ${p ? p.name : ''} annulé.` };
    }
    if (t.cancelRequested) return { ok: false, msg: 'Demande d’arrêt déjà envoyée au Président.' };
    t.cancelRequested = true;
    t.cancelDecisionDay = GAME.G.day + U.ri(1, 4);
    t.history.push(`Le Coach demande l'arrêt du dossier. Réponse Président prévue dans ${t.cancelDecisionDay - GAME.G.day} jour(s).`);
    NEWS.add(`📝 Coach : demande d'arrêt du dossier ${p ? p.name : 'joueur'} envoyée au Président.`, 'club');
    return { ok: true, msg: `Demande d'arrêt envoyée. Le Président répondra dans ${t.cancelDecisionDay - GAME.G.day} jour(s).` };
  },

  decidePendingCancellation(t) {
    const p = DB.byId.get(t.pid);
    const daysSpent = GAME.G.day - t.startDay;
    const cred = GAME.G.coachCredibility || 45;
    let acceptScore = 35 + Math.round(cred * 0.25);
    if (daysSpent >= 14) acceptScore += 12;
    if (t.progress >= 75) acceptScore -= 22;
    if (t.presidentScore >= 80) acceptScore -= 10;
    if (t.type === 'loan') acceptScore += 6;
    const accepted = U.ri(1, 100) <= U.clamp(acceptScore, 15, 82);
    if (accepted) {
      t.status = 'cancelled';
      t.history.push('Le Président accepte d’arrêter le dossier.');
      NEWS.add(`🛑 Le Président accepte : dossier ${p ? p.name : 'joueur'} arrêté.`, 'club');
      return true;
    }
    t.cancelRequested = false;
    t.cancelDecisionDay = null;
    t.history.push('Le Président refuse d’arrêter : dossier jugé encore utile au club.');
    NEWS.add(`🚫 Le Président refuse d’arrêter le dossier ${p ? p.name : 'joueur'}.`, 'club');
    return false;
  },

  processPendingTransfers() {
    if (!GAME.G) return;
    GAME.G.pendingTransfers = GAME.G.pendingTransfers || [];
    const keep = [];
    for (const t of GAME.G.pendingTransfers) {
      const p = DB.byId.get(t.pid);
      if (!p || t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') continue;
      if (t.cancelRequested && GAME.G.day >= t.cancelDecisionDay) {
        if (this.decidePendingCancellation(t)) continue;
      }
      if (p.club !== t.from && t.from !== null) {
        NEWS.add(`❌ Dossier ${p.name} abandonné : le joueur a changé de club.`, 'transfert');
        continue;
      }
      if (GAME.G.day > t.deadlineDay) {
        NEWS.add(`⌛ Dossier ${p.name} échoué : le mercato s'est fermé avant l'accord final.`, 'transfert');
        continue;
      }
      if (GAME.G.day >= t.nextUpdateDay) this.advancePendingDossier(t);
      if (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') continue;
      keep.push(t);
    }
    GAME.G.pendingTransfers = keep.slice(0, 20);
  },

  advancePendingDossier(t) {
    const p = DB.byId.get(t.pid);
    const buyer = DB.clubById.get(t.to);
    const seller = t.from ? DB.clubById.get(t.from) : null;
    if (!p || !buyer) { t.status = 'failed'; return; }

    const daysLeft = Math.max(0, t.deadlineDay - GAME.G.day);
    const base = t.type === 'free' ? U.ri(22, 38) : t.type === 'loan' ? U.ri(16, 30) : U.ri(12, 26);
    const starSlow = (p.ovr >= 84 || (p.value || 0) >= 50e6) ? U.ri(4, 12) : 0;
    const boost = t.presidentScore >= 82 ? 8 : t.presidentScore < 68 ? -5 : 0;
    t.progress = U.clamp(Math.round((t.progress || 0) + base + boost - starSlow), 0, 100);

    if (t.progress < 30) t.stage = seller ? 'Discussion avec le club vendeur' : 'Discussion avec l’agent';
    else if (t.progress < 55) t.stage = 'Prix, bonus et clauses';
    else if (t.progress < 78) t.stage = 'Accord proche, contrat joueur';
    else if (t.progress < 100) t.stage = 'Visite médicale et papiers';

    if (U.rnd() < 0.16 && t.type !== 'free') {
      const delays = [
        'Le club vendeur demande un bonus supplémentaire.',
        'L’agent réclame une prime plus haute.',
        'Un autre club se renseigne sur le joueur.',
        'Le joueur veut réfléchir au rôle sportif.'
      ];
      const msg = U.pick(delays);
      t.history.push(msg);
      t.nextUpdateDay = GAME.G.day + U.ri(4, 9);
      NEWS.add(`⏳ ${p.name} : ${msg}`, 'transfert');
      return;
    }

    t.history.push(`${t.stage} : progression ${t.progress}/100.`);
    const canFinish = t.progress >= 100 || GAME.G.day >= t.dueDay || daysLeft <= 1;
    if (canFinish) {
      const finishChance = t.progress >= 100 ? 86 : GAME.G.day >= t.dueDay ? 62 : 45;
      const finalScore = finishChance + Math.round((t.presidentScore - 70) * 0.4) - (p.ovr >= 87 ? 8 : 0);
      if (U.ri(1, 100) <= U.clamp(finalScore, 20, 94)) return this.completePendingTransfer(t);
      if (daysLeft <= 1) {
        t.status = 'failed';
        NEWS.add(`❌ ${p.name} ne viendra pas : accord impossible avant la fermeture du mercato.`, 'transfert');
        return;
      }
      t.history.push('Les parties n’ont pas encore trouvé l’accord final.');
      NEWS.add(`⌛ ${p.name} : le dossier continue, aucun accord final pour l'instant.`, 'transfert');
    }
    t.nextUpdateDay = GAME.G.day + U.ri(3, 8);
  },

  completePendingTransfer(t) {
    const p = DB.byId.get(t.pid);
    const buyer = DB.clubById.get(t.to);
    const seller = t.from ? DB.clubById.get(t.from) : null;
    if (!p || !buyer) { t.status = 'failed'; return { ok: false, msg: 'Dossier invalide.' }; }
    const totalCash = (t.fee || 0) + (t.type === 'free' ? Math.round((t.wage || 0) * 4) : 0);
    if (totalCash > GAME.budget(buyer.id)) {
      t.status = 'failed';
      NEWS.add(`❌ Dossier ${p.name} échoué : budget insuffisant au moment de signer.`, 'transfert');
      return { ok: false, msg: 'Budget insuffisant.' };
    }
    GAME.addBudget(buyer.id, -totalCash);
    if (seller) GAME.addBudget(seller.id, t.fee || 0);
    const oldClub = p.club || null;
    DB.movePlayer(p, buyer.id);
    p.wage = Math.round(t.wage || p.wage || 1000);
    p.contract = GAME.G.season + (t.type === 'loan' ? 1 : U.ri(2, 4));
    const st = GAME.pstate(p.id);
    st.transferStatus = 'normal'; st.listed = false;
    if (t.type === 'loan') st.loan = { from: oldClub, to: buyer.id, untilSeason: GAME.G.season + 1, fee: t.fee || 0, wageShare: t.wageShare || 50, recall: t.recall !== false };
    GAME.G.transferLog.unshift({ day: GAME.G.day, pid: p.id, from: oldClub, to: buyer.id, fee: t.fee || 0, type: t.type === 'loan' ? 'loan' : t.type === 'free' ? 'free' : 'buy' });
    t.status = 'completed';
    NEWS.add(t.type === 'loan'
      ? `🔁 OFFICIEL : ${p.name} rejoint ${buyer.name} en prêt après ${GAME.G.day - t.startDay} jour(s) de négociation.`
      : `💰 OFFICIEL : ${p.name} rejoint ${buyer.name}${seller ? ` depuis ${seller.name}` : ''} après ${GAME.G.day - t.startDay} jour(s).`, 'transfert');
    if (GAME.G.role === 'coach' && buyer.id === GAME.G.myClub) GAME.adjustCredibility(2, 'dossier recrutement conclu');
    return { ok: true, msg: `${p.name} arrive enfin. Les humains ont réussi à signer des papiers.` };
  },

  requestRecruitment(pid, loan = false) {
    const p = DB.byId.get(pid);
    if (!p) return { ok: false, msg: 'Joueur introuvable.' };
    if (!GAME.G.myClub) return { ok: false, msg: 'Vous devez avoir un club.' };
    if (!this.windowOpen(GAME.G.day)) return { ok: false, msg: 'Mercato fermé : le Coach peut préparer une shortlist, pas signer un joueur.' };
    if (p.club === GAME.G.myClub) return { ok: false, msg: 'Ce joueur est déjà dans votre club.' };
    if (GAME.G.role !== 'coach') return this.openNegotiation(pid);

    const score = this.presidentRecruitmentScore(p, loan);
    const my = DB.clubById.get(GAME.G.myClub);
    GAME.G.pendingTransfers = GAME.G.pendingTransfers || [];
    const already = GAME.G.pendingTransfers.find(t => t.pid === pid && t.to === my.id && !['completed', 'failed', 'cancelled'].includes(t.status));
    if (already) return { ok: false, requestOnly: true, msg: `Dossier déjà en cours pour ${p.name}. Étape : ${already.stage}. Patience, cette maladie humaine.` };

    const request = { day: GAME.G.day, pid, loan: !!loan, score, status: score >= 62 ? 'approved_pending' : 'rejected' };
    GAME.G.recruitmentRequests = GAME.G.recruitmentRequests || [];
    GAME.G.recruitmentRequests.unshift(request);
    if (GAME.G.recruitmentRequests.length > 30) GAME.G.recruitmentRequests.length = 30;

    if (score < 62) {
      NEWS.add(`📝 Demande Coach refusée : ${p.name}. Score Président ${score}/100.`, 'club');
      return { ok: false, requestOnly: true, msg: `Président refuse la demande pour ${p.name}. Score ${score}/100 : budget, besoin sportif ou crédibilité insuffisants.` };
    }

    const pending = this.startRecruitmentDossier(p, my.id, { loan: !!loan, score, requestedBy: 'coach' });
    request.pendingId = pending.id;
    GAME.adjustCredibility(1, 'demande de recrutement validée');
    NEWS.add(`📁 Demande Coach approuvée : dossier ${p.name} lancé. Rien n'est signé : club, agent et visite médicale peuvent faire traîner.`, 'transfert');
    return {
      ok: true, requestOnly: true, pending,
      msg: `Président approuve la demande pour ${p.name}, mais le transfert n'est PAS fait. Dossier lancé : délai estimé ${pending.etaDays} jour(s), échéance ${U.fmtDateShort(pending.deadlineDay, GAME.G.season)}.`
    };
  },

  forceSale(pid) {
    const p = DB.byId.get(pid);
    if (!p || p.club !== GAME.G.myClub) return { ok: false, msg: 'Joueur introuvable dans votre club.' };
    const c = DB.clubById.get(GAME.G.myClub);
    if (GAME.G.role === 'coach') {
      const cred = GAME.G.coachCredibility || 45;
      if (cred < 78) return { ok: false, msg: `Vente forcée impossible : crédibilité ${cred}/100. Il faut 78/100.` };
      if (p.ovr >= c.rep + 4 && cred < 90) return { ok: false, msg: 'Le Président refuse : joueur trop important pour une vente forcée.' };
    }
    const buyers = DB.clubs.filter(b => b.id !== c.id && b.rep >= p.ovr - 10 && GAME.budget(b.id) > Math.max(250000, (p.value || 0) * 0.35));
    if (!buyers.length) return { ok: false, msg: 'Aucun club capable de payer maintenant.' };
    const buyer = U.pick(buyers);
    const fee = Math.round((p.value || 100000) * (GAME.G.role === 'president' ? (0.85 + U.rnd() * 0.35) : (0.75 + U.rnd() * 0.28)));
    GAME.addBudget(c.id, fee);
    GAME.addBudget(buyer.id, -fee);
    DB.movePlayer(p, buyer.id);
    const st = GAME.pstate(p.id);
    st.transferStatus = 'normal'; st.listed = false;
    GAME.G.transferLog.unshift({ day: GAME.G.day, pid: p.id, from: c.id, to: buyer.id, fee, type: 'forced_sale' });
    NEWS.add(`🚨 Vente forcée : ${p.name} part à ${buyer.name} pour ${U.money(fee)}.`, 'transfert');
    if (GAME.G.role === 'coach') GAME.adjustCredibility(-3, 'vente forcée');
    return { ok: true, msg: `${p.name} vendu de force à ${buyer.name} pour ${U.money(fee)}.` };
  },

  recallLoan(pid) {
    const p = DB.byId.get(pid);
    const st = GAME.pstate(pid);
    if (!p || !st.loan || st.loan.from !== GAME.G.myClub) return { ok: false, msg: 'Ce joueur n’est pas prêté par votre club.' };
    if (GAME.G.role === 'coach') {
      const need = this.roleNeedScore(p, GAME.G.myClub);
      const cred = GAME.G.coachCredibility || 45;
      if (cred + need + U.ri(-10, 10) < 58) return { ok: false, msg: 'Le Président refuse le rappel : besoin sportif ou crédibilité insuffisants.' };
    }
    if (st.loan.recall === false) {
      const cost = Math.round((p.value || 0) * 0.015);
      if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: 'Clause de rappel absente et budget insuffisant pour casser le prêt.' };
      GAME.addBudget(GAME.G.myClub, -cost);
    }
    const old = p.club;
    DB.movePlayer(p, GAME.G.myClub);
    st.loan = null;
    NEWS.add(`🔙 ${p.name} est rappelé de son prêt${old ? ` depuis ${DB.clubById.get(old).name}` : ''}.`, 'club');
    return { ok: true, msg: `${p.name} revient de prêt.` };
  },

  toggleList(pid, kind = 'shortlist') {
    if (!GAME.G[kind]) GAME.G[kind] = [];
    const arr = GAME.G[kind];
    const i = arr.indexOf(pid);
    if (i >= 0) arr.splice(i, 1);
    else arr.unshift(pid);
    if (arr.length > 80) arr.length = 80;
    return { ok: true, active: i < 0, msg: i < 0 ? 'Ajouté à la liste.' : 'Retiré de la liste.' };
  },

  coachOfferAdvice(idx, decision = 'accept') {
    const o = GAME.G.offers[idx];
    if (!o) return { ok: false, msg: 'Offre introuvable.' };
    const p = DB.byId.get(o.pid);
    const cred = GAME.G.coachCredibility || 45;
    const c = DB.clubById.get(GAME.G.myClub);
    const sportRisk = p.ovr >= c.rep ? -18 : p.age <= 22 && p.pot >= p.ovr + 8 ? -14 : 8;
    const finance = o.type === 'loan' ? 12 : (o.fee >= (p.value || 0) * 1.1 ? 18 : -4);
    const score = Math.round(cred * 0.35 + sportRisk + finance + U.ri(25, 45));
    if (decision === 'reject') { GAME.G.offers.splice(idx, 1); return { ok: true, msg: `Vous conseillez de refuser. Le Président suit votre avis cette fois.` }; }
    if (score < 55) return { ok: false, msg: `Le Président bloque votre recommandation. Score ${score}/100 : il garde le dernier mot.` };
    this._presidentOverride = true;
    const r = this.acceptOffer(idx);
    this._presidentOverride = false;
    return { ok: !!(r && r.ok), msg: `Président valide votre recommandation. ${r && r.msg ? r.msg : ''}` };
  },

  generateCoachOffers() {
    if (GAME.G.role !== 'coach') return { ok: false, msg: 'Disponible seulement en mode Coach.' };
    const cred = GAME.G.coachCredibility || 45;
    if (cred < 52) return { ok: false, msg: `Aucune offre sérieuse. Crédibilité ${cred}/100.` };
    const current = DB.clubById.get(GAME.G.myClub);
    const clubs = DB.clubs.filter(c => c.id !== current.id && c.rep <= current.rep + 8 && c.rep >= Math.max(45, current.rep - 12 + cred / 20));
    const offers = [];
    for (let i = 0; i < Math.min(3, clubs.length); i++) {
      const c = U.pick(clubs.filter(x => !offers.some(o => o.club === x.id)));
      if (c) offers.push({ club: c.id, wage: Math.round((c.rep * 1800 + cred * 900) / 1000) * 1000, day: GAME.G.day });
    }
    GAME.G.coachOffers = offers;
    return { ok: true, msg: `${offers.length} offre(s) de clubs reçue(s).` };
  },

  acceptCoachOffer(i) {
    const o = (GAME.G.coachOffers || [])[i];
    if (!o) return { ok: false, msg: 'Offre introuvable.' };
    const old = DB.clubById.get(GAME.G.myClub);
    const next = DB.clubById.get(o.club);
    GAME.G.myClub = next.id;
    GAME.G.coachOffers = [];
    GAME.G.offers = [];
    GAME.G.negotiation = null;
    GAME.G.coachCredibility = U.clamp((GAME.G.coachCredibility || 50) - 8, 30, 100);
    NEWS.add(`🧢 Changement de banc : vous quittez ${old.name} pour entraîner ${next.name}.`, 'club');
    return { ok: true, msg: `Vous êtes maintenant Coach de ${next.name}.` };
  },

  // ---- IA mondiale : les clubs vivent seuls ----
  aiTick() {
    if (!this.windowOpen(GAME.G.day)) return;
    const n = U.ri(4, 10);
    for (let i = 0; i < n; i++) this.aiTransfer();
    // agents libres
    for (let i = 0; i < U.ri(1, 3); i++) {
      const fa = DB.freeAgents.filter(p => p.ovr >= 60 && p.age < 35);
      if (!fa.length) break;
      const p = U.pick(fa);
      const buyers = DB.clubs.filter(c => Math.abs(c.rep - p.ovr) < 8 && c.id !== GAME.G.myClub);
      if (!buyers.length) continue;
      const c = U.pick(buyers);
      DB.movePlayer(p, c.id);
      p.contract = GAME.G.season + U.ri(1, 3);
      NEWS.add(`✍️ ${p.name} (libre) s'engage avec ${c.name}.`, 'transfert');
    }
  },

  aiTransfer() {
    const buyer = U.pick(DB.clubs.filter(c => c.id !== GAME.G.myClub && (GAME.budget(c.id) > 500000)));
    if (!buyer) return;
    const budget = GAME.budget(buyer.id);
    const targets = DB.players.filter(p => {
      if (p.retired || !p.club || p.club === buyer.id || p.club === GAME.G.myClub) return false;
      const seller = DB.clubById.get(p.club);
      const st = GAME.pstate(p.id);
      const status = st.transferStatus || 'normal';
      if (status === 'unavailable' && U.rnd() < 0.92) return false;
      return p.ovr >= buyer.rep - 8 && p.ovr <= buyer.rep + 5 && p.value > 0 && this.askingPrice(p) < budget && p.age < 33 && seller;
    });
    if (!targets.length) return;
    const p = U.pick(targets);
    const seller = DB.clubById.get(p.club);
    const key = p.ovr >= seller.rep + 2 && (GAME.pstate(p.id).transferStatus || 'normal') !== 'sell';
    if (key && U.rnd() < 0.65) return;
    const fee = Math.round(this.askingPrice(p) * (0.9 + U.rnd() * 0.3));
    if (fee > budget) return;
    GAME.addBudget(buyer.id, -fee);
    GAME.addBudget(seller.id, fee);
    DB.movePlayer(p, buyer.id);
    p.contract = GAME.G.season + U.ri(2, 5);
    p.wage = Math.round((p.wage || 1000) * (1 + U.rnd() * 0.3));
    GAME.G.transferLog.unshift({ day: GAME.G.day, pid: p.id, from: seller.id, to: buyer.id, fee, type: 'buy' });
    if (fee > 15e6 || buyer.rep > 78 || seller.id === GAME.G.myClub)
      NEWS.add(`💰 OFFICIEL : ${p.name} rejoint ${buyer.name} en provenance de ${seller.name} pour ${U.money(fee)}.`, 'transfert');
  },

  // ---- Négociation achat joueur humain ----
  openNegotiation(pid) {
    const p = DB.byId.get(pid);
    const my = GAME.G.myClub;
    if (!p) return { ok: false, msg: 'Joueur introuvable.' };
    if (!my) return { ok: false, msg: 'Vous devez avoir un club.' };
    if (GAME.G.role === 'coach') return this.requestRecruitment(pid, false);
    if (!this.windowOpen(GAME.G.day)) return { ok: false, msg: 'Le mercato est fermé.' };
    if (p.club === my) return { ok: false, msg: 'Ce joueur est déjà dans votre club.' };

    if (!p.club) {
      const wanted = Math.round((p.wage || 1000) * 1.08);
      return { ok: true, freeAgent: true, p, wantedWage: wanted };
    }

    const seller = DB.clubById.get(p.club);
    const buyer = DB.clubById.get(my);
    const status = GAME.pstate(p.id).transferStatus || 'normal';
    const ask = this.askingPrice(p);
    const min = this.minAcceptable(p, seller, buyer, false);
    const n = {
      id: Date.now() + '_' + pid,
      pid, from: seller.id, to: my, round: 1, maxRounds: 4,
      ask, min, status, phase: 'club',
      wantedWage: Math.round((p.wage || 1000) * (buyer.rep >= seller.rep ? 1.15 : 1.45)),
      agentCommission: Math.round(ask * (0.025 + U.rnd() * 0.045)),
      sellOn: 0, loan: false,
      history: [`${seller.name} ouvre à ${U.money(ask)}. Statut : ${this.statusLabel(status)}.`]
    };
    GAME.G.negotiation = n;
    return { ok: true, negotiation: n };
  },

  clubOffer(fee, sellOn = 0, loan = false) {
    const n = GAME.G.negotiation;
    if (!n) return { ok: false, msg: 'Négociation introuvable.' };
    const p = DB.byId.get(n.pid), seller = DB.clubById.get(n.from), buyer = DB.clubById.get(n.to);
    if (!p || p.club !== seller.id) return { ok: false, msg: 'Ce dossier n’est plus valide.' };
    if (loan) {
      const st = GAME.pstate(p.id);
      const status = st.transferStatus || 'normal';
      const loanFeeMin = this.minAcceptable(p, seller, buyer, true);
      n.loan = true;
      n.sellOn = 0;
      if (status === 'unavailable' || p.ovr >= seller.rep + 4) {
        n.round++;
        n.history.push(`${seller.name} refuse le prêt : joueur trop important.`);
        return { ok: false, msg: `${seller.name} refuse le prêt : joueur trop important.`, done: n.round > n.maxRounds };
      }
      if (fee >= loanFeeMin) {
        n.acceptedFee = fee;
        n.phase = 'agent';
        n.history.push(`${seller.name} accepte le prêt avec indemnité ${U.money(fee)}.`);
        return { ok: true, msg: `${seller.name} accepte le prêt. Il reste l’accord du joueur.` };
      }
      n.round++;
      const counter = Math.round(loanFeeMin * (1.05 + U.rnd() * 0.15));
      n.ask = counter;
      n.history.push(`${seller.name} contre pour un prêt à ${U.money(counter)}.`);
      return { ok: false, msg: `${seller.name} demande ${U.money(counter)} pour le prêt.`, done: n.round > n.maxRounds };
    }

    if (fee > GAME.budget(n.to)) return { ok: false, msg: 'Budget insuffisant.' };
    if (n.status === 'unavailable' && fee < n.min) {
      n.round++;
      const counter = Math.round(n.min * (1.05 + U.rnd() * 0.15));
      n.ask = counter;
      n.history.push(`${seller.name} bloque : joueur intransférable. Contre-offre : ${U.money(counter)}.`);
      return { ok: false, msg: `${seller.name} refuse : joueur intransférable. Il faut au moins ${U.money(n.min)}.`, done: n.round > n.maxRounds };
    }

    const sellOnValue = U.clamp(Number(sellOn) || 0, 0, 35);
    const effective = fee * (1 + sellOnValue / 220); // un sell-on aide un peu, pas une baguette magique non plus
    if (effective >= n.min) {
      n.acceptedFee = fee;
      n.sellOn = sellOnValue;
      n.phase = 'agent';
      n.history.push(`${seller.name} accepte ${U.money(fee)}${sellOnValue ? ` + ${sellOnValue}% à la revente` : ''}.`);
      return { ok: true, msg: `${seller.name} accepte. Maintenant il faut convaincre le joueur et son agent.` };
    }

    n.round++;
    const gap = n.min - effective;
    const counter = Math.round(Math.min(n.ask, fee + gap * (0.75 + U.rnd() * 0.35)) / 50000) * 50000;
    n.ask = Math.max(counter, fee + 50000);
    n.history.push(`${buyer.name} propose ${U.money(fee)}. ${seller.name} contre à ${U.money(n.ask)}.`);
    if (n.round > n.maxRounds) {
      n.history.push(`${seller.name} quitte la table. Dossier terminé.`);
      return { ok: false, msg: `${seller.name} quitte la table. Vous avez trop tiré sur la corde, bravo la diplomatie.`, done: true };
    }
    return { ok: false, msg: `${seller.name} contre à ${U.money(n.ask)}.` };
  },

  agentOffer(wage, commission) {
    const n = GAME.G.negotiation;
    if (!n || n.phase !== 'agent') return { ok: false, msg: 'Aucun accord club actif.' };
    const p = DB.byId.get(n.pid);
    const myClub = DB.clubById.get(n.to);
    const wanted = n.wantedWage;
    const wantedCom = n.agentCommission;
    const chanceProject = myClub.rep + 8 >= p.ovr ? 0.94 : 0.68;
    if (wage < wanted * 0.88 || commission < wantedCom * 0.65) {
      n.history.push(`L'agent de ${p.name} refuse : salaire/commission trop bas.`);
      return { ok: false, msg: `L'agent refuse. Il vise environ ${U.money(wanted)}/sem et ${U.money(wantedCom)} de commission.` };
    }
    if (U.rnd() > chanceProject) {
      n.history.push(`${p.name} refuse le projet sportif.`);
      GAME.G.negotiation = null;
      return { ok: false, msg: `${p.name} refuse le projet sportif.` };
    }
    return this.finalizeNegotiation(wage, commission);
  },

  finalizeNegotiation(wage, commission = 0) {
    const n = GAME.G.negotiation;
    if (!n) return { ok: false, msg: 'Négociation introuvable.' };
    const p = DB.byId.get(n.pid), seller = DB.clubById.get(n.from), buyer = DB.clubById.get(n.to);
    const totalCash = (n.acceptedFee || 0) + (commission || 0);
    if (totalCash > GAME.budget(buyer.id)) return { ok: false, msg: 'Budget insuffisant pour finaliser.' };

    GAME.addBudget(buyer.id, -totalCash);
    if (seller) GAME.addBudget(seller.id, n.acceptedFee || 0);
    const oldClub = p.club;
    DB.movePlayer(p, buyer.id);
    p.wage = Math.round(wage || p.wage || 1000);
    p.contract = GAME.G.season + (n.loan ? 1 : 3);
    const st = GAME.pstate(p.id);
    st.transferStatus = 'normal'; st.listed = false;
    if (n.loan) st.loan = { from: oldClub, to: buyer.id, untilSeason: GAME.G.season + 1, fee: n.acceptedFee || 0 };
    GAME.G.transferLog.unshift({ day: GAME.G.day, pid: p.id, from: oldClub, to: buyer.id, fee: n.acceptedFee || 0, type: n.loan ? 'loan' : 'buy', sellOn: n.sellOn || 0 });
    NEWS.add(n.loan
      ? `🔁 OFFICIEL : ${p.name} rejoint votre club en prêt depuis ${seller.name}.`
      : `💰 OFFICIEL : ${p.name} rejoint votre club pour ${U.money(n.acceptedFee)} ! Salaire : ${U.money(p.wage)}/sem.`, 'transfert');
    GAME.G.negotiation = null;
    return { ok: true, msg: n.loan ? `Prêt conclu : ${p.name} arrive.` : `Transfert conclu : ${p.name} est à vous.` };
  },

  signFreeAgent(pid) {
    const p = DB.byId.get(pid);
    if (!p || p.club) return { ok: false, msg: 'Ce joueur n’est pas libre.' };
    if (!this.windowOpen(GAME.G.day)) return { ok: false, msg: 'Le mercato est fermé.' };
    const my = GAME.G.myClub;
    if (GAME.G.role === 'coach') return this.requestRecruitment(pid, false);
    const wage = Math.round((p.wage || 1000) * 1.08);
    DB.movePlayer(p, my);
    p.contract = GAME.G.season + 2; p.wage = wage;
    NEWS.add(`✍️ ${p.name} signe libre dans votre club !`, 'transfert');
    return { ok: true, msg: `${p.name} a signé libre (salaire ${U.money(wage)}/sem).` };
  },

  // Ancienne action conservée pour compatibilité avec les vieux boutons/saves.
  makeOffer(pid, fee) {
    const r = this.openNegotiation(pid);
    if (!r.ok) return r;
    if (r.freeAgent) return this.signFreeAgent(pid);
    const club = this.clubOffer(fee, 0, false);
    if (!club.ok) return club;
    const n = GAME.G.negotiation;
    return this.agentOffer(n.wantedWage, n.agentCommission);
  },

  // offres IA sur vos joueurs (appelé chaque semaine en période de mercato)
  incomingOffers() {
    if (!this.windowOpen(GAME.G.day) || !GAME.G.myClub) return;
    const sq = DB.squadOf(GAME.G.myClub);
    for (const p of sq) {
      const st = GAME.pstate(p.id);
      if (st.loan) continue;
      const status = st.transferStatus || (st.listed ? 'sell' : 'normal');
      if (status === 'unavailable' && U.rnd() < 0.96) continue;
      const prob = status === 'sell' ? 0.34 : status === 'loan' ? 0.28 : (p.ovr >= 80 ? 0.06 : 0.02);
      if (U.rnd() < prob) {
        const buyers = DB.clubs.filter(c => c.id !== GAME.G.myClub && c.rep >= p.ovr - 8 && GAME.budget(c.id) > Math.max(500000, p.value * 0.05));
        if (!buyers.length) continue;
        const buyer = U.pick(buyers);
        const isLoan = status === 'loan' || (p.age <= 22 && status !== 'sell' && U.rnd() < 0.35);
        const fee = isLoan
          ? Math.round((p.value || 0) * (0.01 + U.rnd() * 0.035))
          : Math.round((p.value || 0) * (status === 'sell' ? 0.95 + U.rnd() * 0.25 : status === 'unavailable' ? 1.7 + U.rnd() * 0.8 : 1.05 + U.rnd() * 0.5));
        const wageShare = isLoan ? U.ri(30, 100) : 0;
        GAME.G.offers.push({ pid: p.id, from: buyer.id, fee, wageShare, type: isLoan ? 'loan' : 'buy', day: GAME.G.day, rounds: 0 });
        NEWS.add(isLoan
          ? `📨 ${buyer.name} demande ${p.name} en prêt (${U.money(fee)}, ${wageShare}% salaire).`
          : `📨 ${buyer.name} propose ${U.money(fee)} pour ${p.name}.`, 'transfert');
      }
    }
    GAME.G.offers = GAME.G.offers.filter(o => GAME.G.day - o.day < 14).slice(0, 12);
  },

  acceptOffer(idx) {
    if (GAME.G.role === 'coach' && !this._presidentOverride) return this.coachOfferAdvice(idx, 'accept');
    const o = GAME.G.offers[idx];
    if (!o) return;
    const p = DB.byId.get(o.pid);
    const buyer = DB.clubById.get(o.from);
    if (o.type === 'loan') {
      GAME.addBudget(GAME.G.myClub, o.fee || 0);
      GAME.addBudget(o.from, -(o.fee || 0));
      const st = GAME.pstate(p.id);
      st.loan = { from: GAME.G.myClub, to: o.from, untilSeason: GAME.G.season + 1, fee: o.fee || 0, wageShare: o.wageShare || 0 };
      st.transferStatus = 'normal'; st.listed = false;
      DB.movePlayer(p, o.from);
      GAME.G.transferLog.unshift({ day: GAME.G.day, pid: p.id, from: GAME.G.myClub, to: o.from, fee: o.fee || 0, type: 'loan' });
      NEWS.add(`🔁 OFFICIEL : ${p.name} part en prêt à ${buyer.name}.`, 'transfert');
      var doneMsg = `${p.name} part en prêt à ${buyer.name}.`;
    } else {
      GAME.addBudget(GAME.G.myClub, o.fee);
      GAME.addBudget(o.from, -o.fee);
      const st = GAME.pstate(p.id);
      st.transferStatus = 'normal'; st.listed = false;
      DB.movePlayer(p, o.from);
      p.contract = GAME.G.season + U.ri(2, 4);
      GAME.G.transferLog.unshift({ day: GAME.G.day, pid: p.id, from: GAME.G.myClub, to: o.from, fee: o.fee, type: 'buy' });
      NEWS.add(`💰 OFFICIEL : ${p.name} quitte votre club pour ${buyer.name} (${U.money(o.fee)}).`, 'transfert');
      var doneMsg = `${p.name} vendu à ${buyer.name} pour ${U.money(o.fee)}.`;
    }
    GAME.G.offers.splice(idx, 1);
    return { ok: true, msg: doneMsg || 'Offre acceptée.' };
  },

  counterOffer(idx, newFee) {
    if (GAME.G.role === 'coach') {
      const cred = GAME.G.coachCredibility || 45;
      if (cred + U.ri(-10, 12) < 42) return { ok: false, msg: `Le Président refuse votre contre-offre : crédibilité ${cred}/100.` };
    }
    const o = GAME.G.offers[idx];
    if (!o) return { ok: false, msg: 'Offre introuvable.' };
    const p = DB.byId.get(o.pid), buyer = DB.clubById.get(o.from);
    o.rounds = (o.rounds || 0) + 1;
    const acceptChance = o.type === 'loan'
      ? (newFee <= o.fee * 1.8 ? 0.65 : 0.25)
      : (newFee <= o.fee * 1.25 ? 0.72 : newFee <= o.fee * 1.55 ? 0.38 : 0.12);
    if (U.rnd() < acceptChance && GAME.budget(o.from) >= newFee) {
      o.fee = Math.round(newFee);
      NEWS.add(`🤝 ${buyer.name} accepte votre contre-offre pour ${p.name} : ${U.money(o.fee)}.`, 'transfert');
      return { ok: true, msg: `${buyer.name} accepte votre contre-offre. Vous pouvez finaliser.` };
    }
    if (o.rounds >= 2 || U.rnd() < 0.35) {
      GAME.G.offers.splice(idx, 1);
      NEWS.add(`❌ ${buyer.name} abandonne le dossier ${p.name}.`, 'transfert');
      return { ok: false, msg: `${buyer.name} abandonne le dossier.` };
    }
    const counter = Math.round((o.fee + newFee * 0.55) / 50000) * 50000;
    o.fee = Math.max(o.fee, counter);
    NEWS.add(`↩️ ${buyer.name} revient avec ${U.money(o.fee)} pour ${p.name}.`, 'transfert');
    return { ok: false, msg: `${buyer.name} refuse mais monte à ${U.money(o.fee)}.` };
  },

  rejectOffer(idx) {
    if (GAME.G.role === 'coach') return this.coachOfferAdvice(idx, 'reject');
    GAME.G.offers.splice(idx, 1);
    return { ok: true, msg: 'Offre refusée.' };
  }
};
