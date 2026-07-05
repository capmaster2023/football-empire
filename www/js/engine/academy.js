// ============ CENTRE DE FORMATION + JEUNES CACHÉS ============
// Les jeunes existent avant d'être connus. Certains sont en académie, d'autres sont encore "dans la rue".
const ACADEMY = {
  ensure() {
    if (!GAME.G.academy) {
      GAME.G.academy = {
        seeded: false,
        youth: [],
        reports: [],
        scouting: GAME.G.role === 'president' ? 55 : 45,
        created: 0,
        promoted: 0,
        discovered: 0,
        lastIntakeSeason: GAME.G.season
      };
    }
    if (!GAME.G.academy.youth) GAME.G.academy.youth = [];
    if (!GAME.G.academy.reports) GAME.G.academy.reports = [];
    if (!GAME.G.academy.signingQueue) GAME.G.academy.signingQueue = [];
    return GAME.G.academy;
  },

  initWorld() {
    const A = this.ensure();
    if (A.seeded) return;
    const raw = DB.academyPool || [];
    const total = Math.min(raw.length, 900);
    const used = new Set();
    for (let i = 0; i < total; i++) {
      let idx = U.ri(0, Math.max(0, raw.length - 1));
      let guard = 0;
      while (used.has(idx) && guard++ < 20) idx = U.ri(0, Math.max(0, raw.length - 1));
      used.add(idx);
      const club = U.rnd() < 0.58 ? U.pick(DB.clubs) : null;
      const status = club ? 'academy' : 'street';
      A.youth.push(this.fromRaw(raw[idx], club ? club.id : null, status));
    }
    A.seeded = true;
    A.created = A.youth.length;
    NEWS.add(`🌱 Réseau jeunes initialisé : ${A.youth.length} profils U6-U19 existent déjà, entre académies et talents non découverts.`, 'monde');
  },

  fromRaw(r, clubId = null, status = 'street') {
    const first = String(r.prenom || '').trim();
    const last = String(r.nom || '').trim();
    const fullName = `${first} ${last}`.trim() || U.genName('default');
    const age = U.clamp(Number(r.age) || U.ri(6, 19), 6, 19);
    const pot = U.clamp(Number(r.potentiel) || U.ri(58, 88), 45, 99);
    const ovr = U.clamp(Number(r.general_actuel) || Math.max(35, pot - U.ri(16, 35)), 30, Math.max(35, pot));
    const pos = String(r.position || U.pick(['GK','CB','LB','RB','CDM','CM','CAM','LW','RW','ST'])).trim();
    return {
      aid: 'ay_' + GAME.G.season + '_' + (GAME.G.academy ? GAME.G.academy.created + GAME.G.academy.youth.length : Date.now()) + '_' + U.ri(1000, 9999),
      fullName,
      name: first ? `${first[0]}. ${last || first}` : fullName,
      age,
      height: Number(r.taille_cm) || U.ri(118, 190),
      pos,
      group: U.posGroup(pos),
      nat: r.nationalite || 'Inconnu',
      footText: r.pied_favori || 'Droit',
      wf: U.clamp(Number(r.niveau_mauvais_pied) || U.ri(1, 4), 1, 5),
      sm: U.clamp(Number(r.niveau_geste_technique) || U.ri(1, 4), 1, 5),
      ovr,
      pot,
      club: clubId,
      status,
      discovered: status !== 'street',
      promoted: false,
      source: 'pool',
      appearSeason: GAME.G.season + Math.max(0, 16 - age)
    };
  },

  generateRaw(clubId = null, status = 'street') {
    const nat = clubId ? (DB.leagueById.get(DB.clubById.get(clubId).league) || {}).country : U.pick(['Brazil','France','Argentina','England','Spain','Nigeria','Ghana','Sénégal','Colombie','Mexique','Japon','Allemagne']);
    const fullName = U.genName(nat);
    const age = U.ri(6, 14);
    const base = clubId ? (DB.clubById.get(clubId).rep || 60) : U.ri(48, 74);
    const pot = U.clamp(Math.round(base + U.gauss(5, 11)), 50, 97);
    const ovr = U.clamp(Math.round(pot - U.ri(20, 42)), 30, 62);
    const pos = U.pick(['GK','CB','CB','LB','RB','CDM','CM','CM','CAM','LW','RW','ST','ST']);
    return {
      aid: 'gen_youth_' + GAME.G.season + '_' + (++this.ensure().created),
      fullName,
      name: fullName.split(' ')[0][0] + '. ' + fullName.split(' ').slice(1).join(' '),
      age,
      height: U.ri(118, 178),
      pos,
      group: U.posGroup(pos),
      nat,
      footText: U.rnd() < 0.22 ? 'Gauche' : 'Droit',
      wf: U.ri(1, 5),
      sm: U.ri(1, 5),
      ovr,
      pot,
      club: clubId,
      status,
      discovered: status !== 'street',
      promoted: false,
      source: 'generated',
      appearSeason: GAME.G.season + Math.max(0, 16 - age)
    };
  },

  seasonTick() {
    const A = this.ensure();
    let generated = 0, discovered = 0, promoted = 0;
    for (const y of A.youth) {
      if (y.promoted) continue;
      y.age++;
      y.height = Math.min(205, Math.round((y.height || 150) + U.rnd() * 4));
      if (y.ovr < y.pot && U.rnd() < 0.72) y.ovr = Math.min(y.pot, y.ovr + U.ri(0, 3));

      const revealChance = y.status === 'street' ? (0.012 + (A.scouting || 45) / 6000) : 0.04;
      if (!y.discovered && U.rnd() < revealChance) {
        const c = U.pick(DB.clubs);
        y.club = c.id;
        y.status = 'scouted';
        y.discovered = true;
        discovered++;
        if (c.id === GAME.G.myClub) this.addReport(`👀 Nouveau talent repéré : ${y.fullName}, ${y.age} ans, ${y.pos}, potentiel estimé ${y.pot}. Il attend une décision : recruter au centre ou laisser passer.`, y.aid);
        else if (y.pot >= 88) NEWS.add(`👀 Rumeur : ${(DB.clubById.get(c.id)||{}).name || 'Un club'} aurait repéré un très grand talent (${y.pos}, ${y.age} ans).`, 'monde');
      }
      if (y.discovered && y.club && y.status === 'academy' && y.age >= 16 && !y.promoted) {
        const aq = GAME.G['academy_' + y.club] || 55;
        const chance = U.clamp(0.18 + (aq - 50) / 180 + (y.pot - 70) / 260, 0.08, 0.72);
        if (U.rnd() < chance) {
          const p = this.promote(y, y.club);
          promoted++;
          if (y.club === GAME.G.myClub) NEWS.add(`🌱 ${p.name} (${p.age} ans, ${p.mainPos}, potentiel ${p.pot}) monte de l'académie vers le groupe pro.`, 'club');
        }
      }
    }

    const newCount = Math.min(180, Math.max(70, Math.round(DB.clubs.length * 0.18)));
    for (let i = 0; i < newCount; i++) {
      const club = U.rnd() < 0.38 ? U.pick(DB.clubs) : null;
      A.youth.push(this.generateRaw(club ? club.id : null, club ? 'academy' : 'street'));
      generated++;
    }
    A.generated = (A.generated || 0) + generated;
    A.discovered = (A.discovered || 0) + discovered;
    A.promoted = (A.promoted || 0) + promoted;
    A.lastIntakeSeason = GAME.G.season;
    if (GAME.G.myClub) this.makeClubReport(GAME.G.myClub);
    return { generated, discovered, promoted };
  },

  promote(y, clubId) {
    const pos = y.pos || 'CM';
    const ovr = U.clamp(Math.round(y.ovr), 35, 78);
    const pot = U.clamp(Math.max(ovr, Math.round(y.pot)), ovr, 99);
    const p = {
      id: DB.nextRegenId++,
      name: y.name,
      fullName: y.fullName,
      pos,
      mainPos: pos,
      group: U.posGroup(pos),
      ovr,
      pot,
      age: U.clamp(y.age, 16, 20),
      value: Math.round(Math.pow(Math.max(45, ovr), 3.08) * (pot >= 85 ? 3.2 : 2.1)),
      wage: U.ri(300, 5000),
      club: clubId,
      nat: y.nat,
      nat2: null,
      contract: GAME.G.season + U.ri(2, 4),
      height: y.height || U.ri(165, 195),
      weight: U.ri(58, 86),
      foot: y.footText === 'Gauche' ? 0 : 1,
      wf: y.wf || U.ri(1, 4),
      sm: y.sm || U.ri(1, 4),
      rep: 1,
      pace: U.clamp(U.ri(ovr - 10, ovr + 12), 25, 95),
      sho: U.clamp(U.ri(ovr - 18, ovr + 6), 20, 92),
      pas: U.clamp(U.ri(ovr - 14, ovr + 8), 20, 92),
      dri: U.clamp(U.ri(ovr - 12, ovr + 10), 20, 94),
      def: U.posGroup(pos) === 'DF' || pos === 'CDM' ? U.clamp(U.ri(ovr - 6, ovr + 9), 25, 92) : U.clamp(U.ri(25, ovr - 4), 20, 78),
      phy: U.clamp(U.ri(ovr - 12, ovr + 10), 25, 92),
      gkDiv: pos === 'GK' ? ovr : 0,
      gkHan: pos === 'GK' ? Math.max(30, ovr - 2) : 0,
      gkKic: pos === 'GK' ? Math.max(25, ovr - 5) : 0,
      gkPos: pos === 'GK' ? ovr : 0,
      gkRef: pos === 'GK' ? Math.min(99, ovr + 2) : 0,
      jersey: U.ri(30, 59),
      stamina: U.ri(50, 85),
      finishing: U.clamp(U.ri(ovr - 16, ovr + 8), 20, 92),
      longshots: U.clamp(U.ri(30, ovr), 20, 90),
      penalties: U.clamp(U.ri(30, ovr), 20, 90),
      fk: U.clamp(U.ri(25, ovr), 20, 90),
      vision: U.clamp(U.ri(ovr - 15, ovr + 8), 20, 92),
      crossing: U.clamp(U.ri(25, ovr), 20, 90),
      tackling: U.clamp(U.ri(25, ovr), 20, 90),
      heading: U.clamp(U.ri(30, ovr), 20, 90),
      composure: U.clamp(U.ri(ovr - 12, ovr + 8), 20, 92),
      aggression: U.ri(30, 78),
      regen: true,
      academyOrigin: y.aid
    };
    y.promoted = true;
    DB.players.push(p);
    DB.byId.set(p.id, p);
    if (!DB.squad.has(clubId)) DB.squad.set(clubId, []);
    DB.squad.get(clubId).push(p);
    return p;
  },

  clubYouth(clubId) {
    return this.ensure().youth.filter(y => !y.promoted && y.club === clubId && y.discovered)
      .sort((a, b) => (b.pot - a.pot) || (b.ovr - a.ovr));
  },

  streetYouth() {
    return this.ensure().youth.filter(y => !y.promoted && !y.discovered).sort((a, b) => b.pot - a.pot);
  },

  addReport(txt, aid = null) {
    const A = this.ensure();
    A.reports.unshift({ day: GAME.G.day, season: GAME.G.season, txt, aid });
    if (A.reports.length > 60) A.reports.length = 60;
  },

  makeClubReport(clubId) {
    const top = this.clubYouth(clubId).slice(0, 3);
    if (!top.length) return;
    this.addReport(`📋 Rapport académie : ${top.map(y => `${y.name} ${y.pos} pot.${y.pot}`).join(' · ')}`);
  },

  scoutingCost() {
    const A = this.ensure();
    return Math.round(((A.scouting || 45) * 42000 + 650000) / 50000) * 50000;
  },

  investScouting() {
    if (GAME.G.role !== 'president') return { ok: false, msg: 'Seul le Président peut financer directement le scouting.' };
    const cost = this.scoutingCost();
    if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: 'Budget insuffisant pour le réseau de scouting.' };
    GAME.addBudget(GAME.G.myClub, -cost);
    const A = this.ensure();
    A.scouting = U.clamp((A.scouting || 45) + U.ri(5, 9), 35, 99);
    this.revealForClub(GAME.G.myClub, 4 + Math.floor(A.scouting / 25));
    NEWS.add(`🛰️ Réseau scouting jeunes amélioré : niveau ${A.scouting}/100.`, 'club');
    return { ok: true, msg: `Scouting amélioré à ${A.scouting}/100.` };
  },

  requestScouting(pos = '') {
    if (GAME.G.role === 'president') return this.investScouting();
    const cred = GAME.G.coachCredibility || 45;
    const ok = cred + U.ri(-10, 18) >= 45;
    if (!ok) return { ok: false, msg: `Le Président refuse le rapport spécial. Crédibilité coach trop basse (${cred}/100).` };
    const found = this.revealForClub(GAME.G.myClub, 3, pos);
    GAME.adjustCredibility(1, 'rapport jeunes convaincant');
    return { ok: true, msg: `Rapport accepté : ${found} jeune(s) ajouté(s) aux radars du club.` };
  },

  revealForClub(clubId, count = 3, pos = '') {
    const wanted = U.normalize(pos);
    const pool = this.streetYouth().filter(y => !wanted || U.normalize(y.pos).includes(wanted) || U.normalize(y.group).includes(wanted)).slice(0, 80);
    let n = 0;
    while (n < count && pool.length) {
      const y = pool.splice(U.ri(0, pool.length - 1), 1)[0];
      y.club = clubId;
      y.status = 'scouted';
      y.discovered = true;
      n++;
      this.ensureYouthV2(y);
      this.addReport(`👀 Repéré : ${y.fullName}, ${y.age} ans, ${y.pos}, potentiel estimé ${this.potRange(y)}. Il n'est pas encore au centre : il faut le recruter.`, y.aid);
    }
    return n;
  },



  // ================================================================
  //  ACADÉMIE PRO v2 : profils détaillés, développement mensuel,
  //  U19, personnalités, potentiel incertain, scouting régional,
  //  infrastructures.
  // ================================================================

  PERSONALITIES: [
    { key: 'pro',     label: 'Professionnel',       dev: 1.15, seduce: 0,  desc: 'Hygiène de vie irréprochable. Progresse vite.' },
    { key: 'ambit',   label: 'Ambitieux',           dev: 1.10, seduce: -6, desc: 'Vise le sommet. Exigeant en négociation.' },
    { key: 'travail', label: 'Travailleur',         dev: 1.08, seduce: 2,  desc: 'Premier arrivé, dernier parti.' },
    { key: 'leader',  label: 'Leader né',           dev: 1.05, seduce: 0,  desc: 'Tire le groupe vers le haut.' },
    { key: 'normal',  label: 'Équilibré',           dev: 1.00, seduce: 0,  desc: 'Rien à signaler. C\'est déjà bien.' },
    { key: 'noncha',  label: 'Nonchalant',          dev: 0.85, seduce: 4,  desc: 'Le talent sans l\'envie, parfois.' },
    { key: 'fragile', label: 'Fragile mentalement', dev: 0.88, seduce: 0,  desc: 'A besoin d\'un encadrement solide.' },
    { key: 'instable',label: 'Instable',            dev: 0.80, seduce: -4, desc: 'Un mois brillant, un mois invisible.' }
  ],

  REGIONS: {
    europe:  { label: '🇪🇺 Europe',           cost: 1.2, nats: ['France','Spain','England','Allemagne','Germany','Italie','Italy','Portugal','Belgique','Belgium','Pays-Bas','Netherlands','Croatie','Serbie','Pologne','Turquie'] },
    samerica:{ label: '🌎 Amérique du Sud',   cost: 1.4, nats: ['Brazil','Brésil','Argentina','Argentine','Colombie','Colombia','Uruguay','Chili','Chile','Pérou','Peru','Équateur','Ecuador','Paraguay','Venezuela'] },
    africa:  { label: '🌍 Afrique',           cost: 1.0, nats: ['Nigeria','Ghana','Sénégal','Senegal','Cameroun','Cameroon','Côte d\'Ivoire','Maroc','Morocco','Algérie','Algeria','Égypte','Egypt','Mali','Burkina Faso','RD Congo','Guinée','Tunisie','Afrique du Sud','Burundi','Rwanda','Kenya','Tanzanie'] },
    asia:    { label: '🌏 Asie',              cost: 1.1, nats: ['Japon','Japan','Corée du Sud','South Korea','Chine','China','Iran','Arabie Saoudite','Qatar','Ouzbékistan','Inde','Thaïlande','Vietnam','Indonésie'] },
    namerica:{ label: '🌎 Amérique du Nord',  cost: 1.1, nats: ['Mexique','Mexico','USA','États-Unis','United States','Canada','Costa Rica','Honduras','Panama','Jamaïque'] },
    oceania: { label: '🌏 Océanie',           cost: 0.9, nats: ['Australie','Australia','Nouvelle-Zélande','New Zealand','Fidji','Papouasie'] }
  },

  ageCategory(age) {
    if (age <= 6) return 'U6';
    if (age <= 9) return 'U9';
    if (age <= 12) return 'U12';
    if (age <= 15) return 'U15';
    if (age <= 17) return 'U17';
    return 'U19';
  },

  categoryStats(clubId) {
    const out = { U6: [], U9: [], U12: [], U15: [], U17: [], U19: [], reserve: [] };
    for (const y of this.clubYouth(clubId).filter(x => x.status === 'academy')) {
      this.ensureYouthV2(y);
      if (y.age >= 18 && y.ovr >= 58) out.reserve.push(y);
      else out[y.category || this.ageCategory(y.age)].push(y);
    }
    return out;
  },

  // migration : donne à chaque jeune les champs v2 (compatible vieilles sauvegardes)
  ensureYouthV2(y) {
    if (y.v2) return y;
    const spread = () => U.clamp(Math.round(y.ovr + U.gauss(0, 7)), 20, 99);
    y.tech = y.tech ?? spread();
    y.phys = y.phys ?? spread();
    y.ment = y.ment ?? spread();
    y.perso = y.perso ?? (U.rnd() < 0.5 ? 'normal' : U.pick(this.PERSONALITIES).key);
    y.potFuzz = y.potFuzz ?? U.ri(5, 11);            // incertitude sur le potentiel
    y.focus = y.focus ?? 'polyvalent';               // plan de formation
    y.devLog = y.devLog ?? [];                       // historique mensuel
    y.u19 = y.u19 ?? { apps: 0, goals: 0, assists: 0, avg: 0, points: 0 };
    y.category = this.ageCategory(y.age);
    y.secondaryPos = y.secondaryPos ?? this.secondaryPosition(y.pos);
    y.morale = y.morale ?? U.ri(52, 88);
    y.school = y.school ?? U.ri(45, 92);
    y.familyPressure = y.familyPressure ?? U.ri(5, 70);
    y.fatigue = y.fatigue ?? U.ri(8, 38);
    y.injuryDays = y.injuryDays ?? 0;
    y.minutesSeason = y.minutesSeason ?? 0;
    y.contractType = y.contractType ?? (y.age < 15 ? 'jeune' : y.age < 18 ? 'aspirant' : 'premier contrat pro possible');
    y.promise = y.promise ?? null;
    y.loanReport = y.loanReport ?? null;
    y.v2 = true;
    return y;
  },

  secondaryPosition(pos) {
    const map = { LW: 'RW', RW: 'LW', ST: 'LW', CAM: 'CM', CM: 'CDM', CDM: 'CB', CB: 'CDM', LB: 'LW', RB: 'RW', GK: 'GK' };
    return map[pos] || 'CM';
  },

  persoOf(y) { return this.PERSONALITIES.find(p => p.key === y.perso) || this.PERSONALITIES[4]; },

  // fourchette de potentiel affichée (le vrai pot reste caché)
  potRange(y) {
    this.ensureYouthV2(y);
    const f = Math.max(0, y.potFuzz);
    if (f <= 1) return `${y.pot}`;
    const lo = U.clamp(y.pot - f, 40, 99), hi = U.clamp(y.pot + Math.ceil(f / 2), 40, 99);
    return `${lo}–${hi}`;
  },

  // ---------- infrastructures ----------
  infra() {
    if (!GAME.G.acadInfra) GAME.G.acadInfra = { install: 1, staff: 1, internat: 1 };
    return GAME.G.acadInfra;
  },
  INFRA_DEFS: {
    install:  { label: '🏟️ Installations',    desc: 'Terrains, salles, analyse vidéo. Accélère la progression.' },
    staff:    { label: '👔 Staff formateur',   desc: 'Éducateurs diplômés. Moins de jeunes gâchés, meilleures évaluations.' },
    internat: { label: '🏠 Internat & vie',    desc: 'Hébergement, école, suivi. Séduit les familles, attire les talents.' }
  },
  infraCost(axis) {
    const lvl = this.infra()[axis] || 1;
    return Math.round(lvl * lvl * 2.4e6 / 1e5) * 1e5;
  },
  upgradeInfra(axis) {
    const I = this.infra();
    if (!this.INFRA_DEFS[axis]) return { ok: false, msg: 'Axe inconnu.' };
    if ((I[axis] || 1) >= 5) return { ok: false, msg: 'Déjà au niveau maximum (5).' };
    const cost = this.infraCost(axis);
    if (GAME.G.role === 'coach') {
      const cred = GAME.G.coachCredibility || 45;
      if (cred + U.ri(-10, 15) < 52) return { ok: false, msg: `Le Président refuse d'investir ${U.money(cost)}. Crédibilité insuffisante (${cred}/100).` };
    }
    if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: `Budget insuffisant : ${U.money(cost)} requis.` };
    GAME.addBudget(GAME.G.myClub, -cost);
    I[axis] = (I[axis] || 1) + 1;
    NEWS.add(`🏗️ Académie : ${this.INFRA_DEFS[axis].label} passe au niveau ${I[axis]}/5.`, 'club');
    this.addReport(`🏗️ ${this.INFRA_DEFS[axis].label} amélioré au niveau ${I[axis]}/5 (${U.money(cost)}).`);
    if (GAME.G.role === 'coach') GAME.adjustCredibility(1, 'projet formation validé');
    return { ok: true, msg: `${this.INFRA_DEFS[axis].label} → niveau ${I[axis]}/5.` };
  },

  // ---------- missions de scouting régionales ----------
  missions() { if (!GAME.G.acadMissions) GAME.G.acadMissions = []; return GAME.G.acadMissions; },
  missionCost(regionKey) {
    const R = this.REGIONS[regionKey];
    return Math.round(R.cost * (1.1e6 + (this.ensure().scouting || 45) * 8000) / 5e4) * 5e4;
  },
  startMission(regionKey) {
    const R = this.REGIONS[regionKey];
    if (!R) return { ok: false, msg: 'Région inconnue.' };
    const M = this.missions();
    if (M.some(m => !m.done && m.region === regionKey)) return { ok: false, msg: 'Un scout est déjà sur place.' };
    if (M.filter(m => !m.done).length >= 3) return { ok: false, msg: 'Vos 3 scouts sont déjà en mission.' };
    const cost = this.missionCost(regionKey);
    if (GAME.G.role === 'coach') {
      const cred = GAME.G.coachCredibility || 45;
      if (cred + U.ri(-8, 12) < 46) return { ok: false, msg: 'Le Président refuse de financer cette mission.' };
    }
    if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: `Il faut ${U.money(cost)} pour cette mission.` };
    GAME.addBudget(GAME.G.myClub, -cost);
    const dur = U.ri(21, 40);
    M.push({ region: regionKey, startDay: GAME.G.day, endDay: GAME.G.day + dur, done: false });
    this.addReport(`🧳 Scout envoyé : ${R.label}. Retour prévu vers ${U.fmtDateShort(GAME.G.day + dur, GAME.G.season)}.`);
    return { ok: true, msg: `Mission ${R.label} lancée (${dur} jours, ${U.money(cost)}).` };
  },
  nationOfRegion(nat, regionKey) {
    const R = this.REGIONS[regionKey];
    const n = U.normalize(nat || '');
    return R.nats.some(x => n.includes(U.normalize(x)));
  },
  resolveMissions() {
    const M = this.missions();
    for (const m of M) {
      if (m.done || GAME.G.day < m.endDay) continue;
      m.done = true;
      const R = this.REGIONS[m.region];
      const scLvl = (this.ensure().scouting || 45) + this.infra().staff * 6;
      const found = U.ri(2, 3) + (scLvl > 70 ? 1 : 0);
      let n = 0;
      const pool = this.streetYouth().filter(y => this.nationOfRegion(y.nat, m.region));
      while (n < found) {
        let y = pool.length ? pool.splice(U.ri(0, pool.length - 1), 1)[0] : null;
        if (!y) { // rien dans le vivier : le scout déniche un profil local inédit
          y = this.generateRaw(null, 'street');
          y.nat = U.pick(R.nats);
          this.ensure().youth.push(y);
        }
        this.ensureYouthV2(y);
        y.club = GAME.G.myClub; y.status = 'scouted'; y.discovered = true;
        y.potFuzz = Math.max(3, y.potFuzz - Math.floor(scLvl / 30)); // meilleur scouting = évaluation plus fine
        this.addReport(`👀 ${R.label} — repéré : ${y.fullName}, ${y.age} ans, ${y.pos}, potentiel estimé ${this.potRange(y)}. À convaincre.`, y.aid);
        n++;
      }
      NEWS.add(`🧳 Mission scouting ${R.label} terminée : ${n} talents identifiés.`, 'club');
    }
    while (M.length > 12) M.shift();
  },

  // ---------- développement mensuel + U19 ----------
  runDevMonth() {
    const A = this.ensure();
    const I = this.infra();
    const centre = this.clubYouth(GAME.G.myClub).filter(y => y.status === 'academy');
    if (!centre.length) return;

    // match U19 du mois (narratif + minutes)
    const eligible = centre.filter(y => y.age >= 14);
    let u19Line = '';
    if (eligible.length >= 3) {
      const gf = U.ri(0, 4), ga = U.ri(0, 3);
      const star = U.pick(eligible);
      this.ensureYouthV2(star);
      const starGoals = star.pos === 'GK' ? 0 : U.ri(0, Math.min(2, gf));
      for (const y of eligible) {
        this.ensureYouthV2(y);
        y.u19.apps++;
        const mins = U.ri(25, 90);
        y.minutesSeason += mins;
        y.fatigue = U.clamp((y.fatigue || 0) + Math.round(mins / 18), 0, 100);
        y.morale = U.clamp((y.morale || 60) + (mins >= 55 ? 2 : -1), 0, 100);
      }
      star.u19.goals += starGoals;
      star.u19.points = (star.u19.points || 0) + 3;
      star.morale = U.clamp((star.morale || 60) + 5, 0, 100);
      u19Line = `⚽ U19 : ${gf}-${ga}${starGoals ? ` — ${star.name} plante ${starGoals} but(s) et régale` : ` — ${star.name} s'est montré`}.`;
      if (starGoals >= 2) star._u19boost = true;
    }

    // progression individuelle
    const lines = [];
    for (const y of centre) {
      this.ensureYouthV2(y);
      if (y.injuryDays > 0) y.injuryDays = Math.max(0, y.injuryDays - 28);
      if ((y.fatigue || 0) > 76 && U.rnd() < 0.12) {
        y.injuryDays = U.ri(14, 60);
        y.morale = U.clamp((y.morale || 60) - 6, 0, 100);
      }
      y.school = U.clamp((y.school || 60) + (y.morale >= 65 ? 1 : -1) + U.ri(-2, 2), 0, 100);
      y.fatigue = U.clamp((y.fatigue || 0) - 18, 0, 100);
      const perso = this.persoOf(y);
      const headroom = Math.max(0, y.pot - y.ovr);
      if (headroom <= 0) { y.potFuzz = Math.max(0, y.potFuzz - 1); continue; }
      const ageCurve = y.age <= 12 ? 0.8 : y.age <= 16 ? 1.25 : y.age <= 18 ? 1.05 : 0.7;
      const infraMul = 0.75 + I.install * 0.11 + I.staff * 0.07;
      let gain = (0.55 + U.rnd() * 0.9) * ageCurve * infraMul * perso.dev * Math.min(1, headroom / 12 + 0.35);
      gain *= 0.82 + (y.morale || 60) / 300;
      gain *= 0.88 + (y.school || 60) / 500;
      if ((y.fatigue || 0) > 70) gain *= 0.65;
      if ((y.injuryDays || 0) > 0) gain *= 0.25;
      if (y._u19boost) { gain += 0.7; y._u19boost = false; }
      if (perso.key === 'instable' && U.rnd() < 0.3) gain = -0.4;
      const applied = Math.round(gain * 10) / 10;
      y._acc = (y._acc || 0) + applied;
      let delta = 0;
      while (y._acc >= 1) { y._acc -= 1; delta++; }
      while (y._acc <= -1) { y._acc += 1; delta--; }
      if (delta !== 0) {
        y.ovr = U.clamp(y.ovr + delta, 25, y.pot);
        // le focus oriente les sous-notes
        const bump = (k, w) => { y[k] = U.clamp(y[k] + Math.round(delta * w), 20, 99); };
        if (y.focus === 'technique') { bump('tech', 1.4); bump('phys', 0.5); bump('ment', 0.6); }
        else if (y.focus === 'physique') { bump('phys', 1.4); bump('tech', 0.5); bump('ment', 0.6); }
        else if (y.focus === 'mental') { bump('ment', 1.4); bump('tech', 0.6); bump('phys', 0.5); }
        else if (['finition','passes','gardien'].includes(y.focus)) { bump('tech', 1.25); bump('ment', 0.75); bump('phys', 0.55); }
        else if (['vitesse','endurance'].includes(y.focus)) { bump('phys', 1.25); bump('tech', 0.65); bump('ment', 0.65); }
        else if (y.focus === 'defense') { bump('ment', 1.0); bump('phys', 0.95); bump('tech', 0.6); }
        else { bump('tech', 0.85); bump('phys', 0.85); bump('ment', 0.85); }
      }
      y.potFuzz = Math.max(0, y.potFuzz - (0.5 + I.staff * 0.15));
      y.devLog.unshift({ s: GAME.G.season, d: GAME.G.day, delta });
      if (y.devLog.length > 6) y.devLog.length = 6;
      if (delta >= 2) lines.push(`📈 ${y.name} explose ce mois-ci (+${delta}).`);
      else if (delta < 0) lines.push(`📉 ${y.name} traverse un passage à vide (${delta}).`);
    }
    const head = `📋 Bilan mensuel du centre — ${centre.length} pensionnaires.`;
    this.addReport([head, u19Line, ...lines.slice(0, 4)].filter(Boolean).join(' '));
    A.lastDevDay = GAME.G.day;
  },

  setFocus(aid, focus) {
    const y = this.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y) return { ok: false, msg: 'Jeune introuvable.' };
    if (y.status !== 'academy') return { ok: false, msg: 'Le plan de formation ne concerne que les jeunes du centre.' };
    if (!['technique', 'physique', 'mental', 'polyvalent', 'finition', 'defense', 'passes', 'vitesse', 'endurance', 'gardien'].includes(focus)) return { ok: false, msg: 'Plan inconnu.' };
    this.ensureYouthV2(y);
    y.focus = focus;
    return { ok: true, msg: `${y.name} suit désormais un plan ${focus}.` };
  },

  // ============ NÉGOCIATION : convaincre le jeune de rejoindre le centre ============
  pursuit(y) { if (!y.pursuit) y.pursuit = null; return y.pursuit; },

  reflectionDelay(pot) {
    if (pot >= 90) return U.ri(5, 10);   // les cracks font durer le suspense
    if (pot >= 82) return U.ri(3, 6);
    return U.ri(1, 3);
  },

  startPursuit(aid) {
    const y = this.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y) return { ok: false, msg: 'Jeune introuvable.' };
    if (y.status !== 'scouted') return { ok: false, msg: 'Ce jeune n\'est pas en phase de recrutement.' };
    if (y.pursuit && !y.pursuit.failed) return { ok: true, msg: 'Approche déjà en cours.' };
    if (y.pursuit && y.pursuit.failed && GAME.G.day < (y.pursuit.retryDay || 0)) {
      return { ok: false, msg: `Il a déjà dit non. Laisse retomber la pression (retour possible J${y.pursuit.retryDay}).` };
    }
    const c = DB.clubById.get(GAME.G.myClub);
    this.ensureYouthV2(y);
    const perso = this.persoOf(y);
    const internat = this.infra().internat;
    y.pursuit = { appeal: Math.round(U.clamp((c.rep || 60) / 2.2 + perso.seduce + internat * 2, 8, 52)), acts: {}, offerMade: false, decisionDay: null, failed: false };
    this.addReport(`🤝 Premier contact établi avec l'entourage de ${y.name}. À toi de le séduire : agent, parents, projet sportif.`, y.aid);
    return { ok: true, msg: `Approche lancée pour ${y.name}.` };
  },

  ACTS: {
    agent:   { label: '💼 Rencontrer son agent',       hint: 'Coûte de l\'argent, mais l\'agent devient un allié.' },
    parents: { label: '👨‍👩‍👦 Rencontrer les parents',      hint: 'Rassurer sur l\'encadrement, les études, la vie au centre.' },
    projet:  { label: '📈 Présenter le projet sportif', hint: 'Temps de jeu, plan de progression, vision du club.' }
  },

  agentFee(y) { return Math.round(Math.max(10000, this.academyRecruitCost(y) * 0.06) / 5000) * 5000; },

  pursuitAct(aid, act) {
    const y = this.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y || !y.pursuit || y.pursuit.failed) return { ok: false, msg: 'Aucune approche en cours.' };
    const P = y.pursuit;
    if (P.offerMade) return { ok: false, msg: 'L\'offre est déjà partie : il réfléchit.' };
    if (P.acts[act]) return { ok: false, msg: 'Déjà fait. Insister deviendrait louche.' };
    const c = DB.clubById.get(GAME.G.myClub);
    let gain = 0, msg = '';
    if (act === 'agent') {
      const fee = this.agentFee(y);
      if (GAME.budget(GAME.G.myClub) < fee) return { ok: false, msg: `Il faut ${U.money(fee)} pour mettre l'agent dans la boucle.` };
      GAME.addBudget(GAME.G.myClub, -fee);
      gain = U.ri(8, 15) + Math.round((c.rep || 60) / 25);
      msg = `Agent rencontré (${U.money(fee)}). Il glisse un mot en votre faveur.`;
    } else if (act === 'parents') {
      const aq = GAME.G['academy_' + GAME.G.myClub] || 55;
      gain = U.ri(6, 12) + Math.round(aq / 14) + this.infra().internat * 2;
      msg = 'Les parents sont rassurés par l\'encadrement du centre.';
    } else if (act === 'projet') {
      const cred = GAME.G.role === 'president' ? 70 : (GAME.G.coachCredibility || 45);
      gain = U.ri(6, 13) + Math.round(cred / 12);
      msg = 'Le projet sportif fait briller ses yeux.';
    } else return { ok: false, msg: 'Action inconnue.' };
    P.acts[act] = true;
    P.appeal = U.clamp(P.appeal + gain, 0, 96);
    return { ok: true, msg: `${msg} (+${gain} séduction)` };
  },

  makeYouthOffer(aid) {
    const y = this.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y || !y.pursuit || y.pursuit.failed) return { ok: false, msg: 'Lance d\'abord l\'approche.' };
    const P = y.pursuit;
    if (P.offerMade) return { ok: false, msg: 'Il réfléchit déjà. La patience fait partie du recrutement.' };
    const cost = this.academyRecruitCost(y);
    if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: `Il faut ${U.money(cost)} disponibles pour formuler l'offre.` };
    P.offerMade = true;
    const delay = this.reflectionDelay(y.pot);
    P.decisionDay = GAME.G.day + delay;
    this.addReport(`📨 Offre officielle transmise à ${y.name}. Réponse attendue vers le ${U.fmtDateShort(P.decisionDay, GAME.G.season)}.`, y.aid);
    return { ok: true, msg: `Offre envoyée. ${y.pot >= 88 ? 'Gros talent : il prend son temps. ' : ''}Réponse dans ~${delay} jour(s).` };
  },

  queueSigning(y) {
    const A = this.ensure();
    if (!A.signingQueue.some(q => q.aid === y.aid)) A.signingQueue.push({ aid: y.aid, day: GAME.G.day, season: GAME.G.season });
  },

  signingYouthByAid(aid) {
    return this.ensure().youth.find(y => y.aid === aid && y.club === GAME.G.myClub && y.status === 'scouted' && y.pursuit && y.pursuit.signingPending);
  },

  pendingSigningAlerts() {
    const A = this.ensure();
    A.signingQueue = (A.signingQueue || []).filter(q => !!this.signingYouthByAid(q.aid));
    return A.signingQueue.map(q => this.signingYouthByAid(q.aid)).filter(Boolean);
  },

  nextSigningAlert() {
    return this.pendingSigningAlerts()[0] || null;
  },

  removeSigningAlert(aid) {
    const A = this.ensure();
    A.signingQueue = (A.signingQueue || []).filter(q => q.aid !== aid);
  },

  resolveYouthSigning(aid, accept) {
    const y = this.signingYouthByAid(aid);
    if (!y) { this.removeSigningAlert(aid); return { ok: false, msg: 'Aucune signature en attente pour ce jeune.' }; }
    const cost = this.academyRecruitCost(y);
    if (!accept) {
      y.pursuit.failed = true;
      y.pursuit.accepted = false;
      y.pursuit.signingPending = false;
      y.pursuit.retryDay = GAME.G.day + U.ri(18, 36);
      this.removeSigningAlert(aid);
      this.addReport(`🚫 Signature refusée : ${y.name} ne rejoint pas le centre pour l'instant. Nouvelle approche possible vers J${y.pursuit.retryDay}.`, y.aid);
      return { ok: true, msg: `Signature refusée pour ${y.name}.` };
    }
    if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: `Budget insuffisant : il faut ${U.money(cost)} pour signer ${y.name}.` };
    GAME.addBudget(GAME.G.myClub, -cost);
    y.status = 'academy';
    y.joinedAcademySeason = GAME.G.season;
    y.joinedAcademyDay = GAME.G.day;
    const legal = y.age < 16 ? 'parents/tuteur légal + agent si présent' : 'agent';
    y.contractType = y.age < 16 ? 'accord formation parents/tuteur légal' : 'accord formation avec agent';
    y.pursuit = null;
    this.removeSigningAlert(aid);
    this.addReport(`✅ ${y.name} signe officiellement au centre avec ${legal} pour ${U.money(cost)}.`, y.aid);
    NEWS.add(`🌱 Académie : ${y.name} rejoint officiellement le centre de formation.`, 'club');
    if (GAME.G.role === 'coach') GAME.adjustCredibility(1, 'jeune convaincu de signer');
    return { ok: true, msg: `${y.name} signe au centre (${legal}).` };
  },

  dailyTick() {
    if (!GAME.G.myClub || !GAME.G.academy) return;
    this.resolveMissions();
    const A = this.ensure();
    if (GAME.G.day - (A.lastDevDay || 0) >= 28) this.runDevMonth();
    for (const y of GAME.G.academy.youth) {
      const P = y.pursuit;
      if (!P || P.failed || !P.offerMade || y.promoted || y.status !== 'scouted') continue;
      if (GAME.G.day < P.decisionDay) continue;
      const cost = this.academyRecruitCost(y);
      const chance = U.clamp((P.appeal - 22) / 62, 0.06, 0.94);
      if (U.rnd() < chance) {
        if (GAME.budget(GAME.G.myClub) < cost) {
          P.offerMade = false; P.decisionDay = null;
          this.addReport(`⚠️ ${y.name} avait dit oui… mais le budget ne couvre plus ${U.money(cost)}. Offre annulée, séduction intacte.`, y.aid);
          continue;
        }
        P.offerMade = false;
        P.decisionDay = null;
        P.accepted = true;
        P.signingPending = true;
        P.acceptedDay = GAME.G.day;
        P.costAtAcceptance = cost;
        this.queueSigning(y);
        this.addReport(`✅ ${y.name} a dit OUI ! Signature finale à valider pour ${U.money(cost)}.`, y.aid);
        NEWS.add(`🌱 Académie : ${y.name} (${y.pos}, pot. ${y.pot}) accepte de rejoindre le centre. Signature en attente.`, 'club');
      } else {
        P.failed = true; P.offerMade = false;
        P.retryDay = GAME.G.day + U.ri(20, 45);
        if (y.pot >= 86 && U.rnd() < 0.35) {
          const rival = U.pick(DB.clubs.filter(cc => cc.id !== GAME.G.myClub));
          y.club = rival.id; y.pursuit = null;
          this.addReport(`❌ ${y.name} refuse… et signe chez ${rival.name}. Ça pique.`, null);
        } else {
          this.addReport(`❌ ${y.name} décline l'offre pour l'instant. Nouvelle approche possible vers J${P.retryDay}.`, y.aid);
        }
      }
    }
  },

  academyRecruitCost(y) {
    const base = Math.max(15000, Math.pow(Math.max(32, y.ovr || 40), 2.55) * (y.pot >= 88 ? 38 : y.pot >= 80 ? 24 : 14));
    return Math.round(base / 5000) * 5000;
  },

  recruitToAcademy(aid) {
    const y = this.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y) return { ok: false, msg: 'Jeune introuvable dans les rapports du club.' };
    if (y.status === 'academy') return { ok: true, msg: `${y.name} est déjà dans votre centre de formation.` };
    if (y.status !== 'scouted') return { ok: false, msg: 'Ce jeune doit d’abord être repéré par le scouting.' };
    return { ok: false, msg: 'On ne signe plus un jeune d\'un claquement de doigts : lance l\'approche et séduis-le.' };

    const cost = this.academyRecruitCost(y);
    if (GAME.G.role === 'president') {
      if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: `Budget insuffisant : il faut ${U.money(cost)} pour l'intégrer au centre.` };
      GAME.addBudget(GAME.G.myClub, -cost);
      y.status = 'academy';
      y.joinedAcademySeason = GAME.G.season;
      y.joinedAcademyDay = GAME.G.day;
      this.addReport(`✅ ${y.name} rejoint officiellement le centre de formation pour ${U.money(cost)}.`);
      NEWS.add(`🌱 Académie : ${y.name} est recruté au centre de formation.`, 'club');
      return { ok: true, msg: `${y.name} rejoint le centre de formation.` };
    }

    const cred = GAME.G.coachCredibility || 45;
    const acceptScore = cred + (y.pot >= 85 ? 12 : 0) + (y.age >= 15 ? 5 : 0) + U.ri(-15, 15);
    if (acceptScore < 48) return { ok: false, msg: `Le Président refuse de financer l'arrivée au centre. Crédibilité coach trop basse (${cred}/100).` };
    if (GAME.budget(GAME.G.myClub) < cost) return { ok: false, msg: `Le Président aime l'idée, mais le budget ne suit pas. Comme souvent, l'argent a décidé à la place du football.` };
    GAME.addBudget(GAME.G.myClub, -cost);
    y.status = 'academy';
    y.joinedAcademySeason = GAME.G.season;
    y.joinedAcademyDay = GAME.G.day;
    GAME.adjustCredibility(1, 'jeune recruté au centre');
    this.addReport(`✅ Demande acceptée : ${y.name} rejoint le centre de formation pour ${U.money(cost)}.`);
    return { ok: true, msg: `Président d'accord : ${y.name} rejoint le centre.` };
  },

  promoteToFirstTeam(aid) {
    const y = this.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y) return { ok: false, msg: 'Jeune introuvable dans votre académie.' };
    if (y.status !== 'academy') return { ok: false, msg: 'Il faut d’abord le recruter au centre de formation.' };
    if (y.age < 16) return { ok: false, msg: 'Trop jeune pour signer pro. Même les simulateurs ont une assurance juridique imaginaire.' };

    if (GAME.G.role === 'coach') {
      const cred = GAME.G.coachCredibility || 45;
      const acceptScore = cred + (y.ovr >= 62 ? 12 : 0) + (y.pot >= 82 ? 8 : 0) + U.ri(-12, 14);
      if (acceptScore < 52) return { ok: false, msg: `Le Président refuse la promotion pro. Crédibilité coach insuffisante (${cred}/100) ou dossier pas assez convaincant.` };
      GAME.adjustCredibility(1, 'promotion d’un jeune');
    }

    const p = this.promote(y, GAME.G.myClub);
    this.addReport(`⬆️ ${p.name} est monté en équipe première (${p.age} ans, ${p.mainPos}, ${p.ovr}/${p.pot}).`);
    NEWS.add(`⬆️ Académie : ${p.name} rejoint l'équipe première.`, 'club');
    return { ok: true, msg: `${p.name} est maintenant dans l'équipe première.` , player: p };
  },

  requestYouthLoan(aid) {
    const y = this.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y) return { ok: false, msg: 'Jeune introuvable dans votre académie.' };
    if (y.status !== 'academy') return { ok: false, msg: 'Il faut d’abord le recruter au centre avant de préparer un prêt.' };
    if (y.age < 16) return { ok: false, msg: 'Trop jeune pour un prêt. Même le football moderne a gardé deux limites.' };
    if (GAME.G.role === 'coach' && (GAME.G.coachCredibility || 45) < 38) return { ok: false, msg: 'Le Président refuse : votre crédibilité est trop basse pour imposer ce plan de prêt.' };
    y.loanPlan = true;
    this.addReport(`🔁 Plan de prêt préparé pour ${y.name}. Il sera prioritaire dès sa promotion pro.`);
    return { ok: true, msg: `${y.name} est marqué comme jeune à prêter après promotion.` };
  },

  sellYouth(aid) {
    const y = this.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y) return { ok: false, msg: 'Jeune introuvable.' };
    if (y.status !== 'academy') return { ok: false, msg: 'Impossible de vendre : ce jeune n’est pas encore officiellement dans votre centre.' };
    if (GAME.G.role !== 'president') return { ok: false, msg: 'Le Coach peut recommander, mais seul le Président vend un jeune de l’académie.' };
    const fee = Math.round(Math.max(50000, Math.pow(Math.max(35, y.ovr), 2.8) * (y.pot >= 85 ? 90 : 45)));
    y.promoted = true;
    GAME.addBudget(GAME.G.myClub, fee);
    NEWS.add(`💼 Académie : ${y.name} est vendu avant contrat pro pour ${U.money(fee)}. Rentabilité froide, football moderne heureux.`, 'club');
    return { ok: true, msg: `${y.name} vendu pour ${U.money(fee)}.` };
  }
};
