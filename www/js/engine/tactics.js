// ============ TACTIQUES (formation + style + discours du coach) ============
const TACTICS = {

  FORMATIONS: {
    '4-3-3':   { arr: [4, 3, 3], coords: [[5,50],[15,14],[15,38],[15,62],[15,86],[29,28],[26,50],[29,72],[43,18],[45,50],[43,82]] },
    '4-4-2':   { arr: [4, 4, 2], coords: [[5,50],[15,14],[15,38],[15,62],[15,86],[30,15],[28,40],[28,60],[30,85],[44,38],[44,62]] },
    '4-2-3-1': { arr: [4, 5, 1], coords: [[5,50],[15,14],[15,38],[15,62],[15,86],[25,38],[25,62],[36,20],[37,50],[36,80],[45,50]] },
    '4-1-4-1': { arr: [4, 5, 1], coords: [[5,50],[15,14],[15,38],[15,62],[15,86],[23,50],[33,16],[32,40],[32,60],[33,84],[45,50]] },
    '3-5-2':   { arr: [3, 5, 2], coords: [[5,50],[15,25],[14,50],[15,75],[28,8],[28,35],[26,50],[28,65],[28,92],[44,38],[44,62]] },
    '3-4-3':   { arr: [3, 4, 3], coords: [[5,50],[15,25],[14,50],[15,75],[29,12],[27,40],[27,60],[29,88],[43,20],[45,50],[43,80]] },
    '5-3-2':   { arr: [5, 3, 2], coords: [[5,50],[16,8],[14,30],[13,50],[14,70],[16,92],[30,28],[28,50],[30,72],[44,38],[44,62]] },
    '5-4-1':   { arr: [5, 4, 1], coords: [[5,50],[16,8],[14,30],[13,50],[14,70],[16,92],[30,16],[28,40],[28,60],[30,84],[45,50]] }
  },

  STYLES: {
    equilibre:    { name: 'Équilibré',            desc: 'Bloc médian, adaptation à l’adversaire.', atk: 0,     def: 0,    fat: 0 },
    pressing_haut:{ name: 'Pressing haut',         desc: 'Gegenpressing : récupérer très haut, étouffer la relance. Épuisant.', atk: 0.20, def: -0.08, fat: 9 },
    bloc_mi:      { name: 'Bloc mi-haut',          desc: 'Pressing déclenché au milieu, structure compacte.', atk: 0.07, def: 0.06, fat: 3 },
    bloc_bas:     { name: 'Bloc bas · contres',    desc: 'Défendre bas, frapper en transition rapide.', atk: -0.08, def: 0.22, fat: -3 },
    tiki_taka:    { name: 'Tiki-taka + pressing',  desc: 'Possession courte, pressing immédiat à la perte. Exige de la technique.', atk: 0.15, def: 0.06, fat: 6, tech: true },
    possession:   { name: 'Possession patiente',   desc: 'Garder le ballon, user l’adversaire, limiter les risques.', atk: 0.04, def: 0.12, fat: -2 },
    direct:       { name: 'Jeu direct',            desc: 'Verticalité, longs ballons vers les attaquants.', atk: 0.12, def: -0.05, fat: 0 },
    ailes:        { name: 'Jeu sur les ailes',     desc: 'Débordements et centres, étirer le bloc adverse.', atk: 0.10, def: -0.02, fat: 2 }
  },

  // mots-clés français du discours du coach → effets
  KEYWORDS: [
    { re: /press(ing|e[rz]?|ez)?\s*(tr[eè]s\s*)?haut|gegenpress|[ée]touff/i, label: 'Pressing haut', atk: 0.10, def: -0.05, fat: 5 },
    { re: /bloc\s*bas|d[ée]fend(re|ez)?\s*bas|bus|recul/i,                  label: 'Bloc bas', atk: -0.05, def: 0.12, fat: -2 },
    { re: /bloc\s*(m[ié]|m[ée]dian|mi-?haut)/i,                             label: 'Bloc médian', atk: 0.03, def: 0.04, fat: 0 },
    { re: /tiki|passes?\s*courtes?|jeu\s*court/i,                           label: 'Jeu court', atk: 0.06, def: 0.02, fat: 2, tech: true },
    { re: /possession|gard(er|ez)\s*le\s*ballon|conserv/i,                  label: 'Possession', atk: 0.02, def: 0.06, fat: -1 },
    { re: /contre[- ]?attaqu|transition/i,                                  label: 'Contres', atk: 0.07, def: 0.03, fat: 0 },
    { re: /jeu\s*direct|longs?\s*ballons?|vertical/i,                       label: 'Jeu direct', atk: 0.07, def: -0.03, fat: 0 },
    { re: /ailes?|d[ée]bord|centres?/i,                                     label: 'Ailes & centres', atk: 0.06, def: 0, fat: 1 },
    { re: /tir(s|ez)?\s*de\s*loin|frapp(er|ez)\s*de\s*loin/i,               label: 'Tirs de loin', atk: 0.04, def: 0, fat: 0 },
    { re: /ligne\s*haute|d[ée]fense\s*haute/i,                              label: 'Ligne haute', atk: 0.05, def: -0.07, fat: 2 },
    { re: /agressi|intensit[ée]|duels?/i,                                   label: 'Agressivité', atk: 0.05, def: 0.02, fat: 4, cards: true },
    { re: /patien|calme|ma[îi]tris/i,                                       label: 'Patience', atk: -0.02, def: 0.05, fat: -2 },
    { re: /temporis|gagn(er|ez)\s*du\s*temps|ferm(er|ez)\s*le\s*jeu/i,      label: 'Fermer le jeu', atk: -0.06, def: 0.10, fat: -2 }
  ],

  ensure() {
    if (!GAME.G.tactics) GAME.G.tactics = { formation: '4-3-3', style: 'equilibre', speech: '' };
    if (!this.FORMATIONS[GAME.G.tactics.formation]) GAME.G.tactics.formation = '4-3-3';
    if (!this.STYLES[GAME.G.tactics.style]) GAME.G.tactics.style = 'equilibre';
    return GAME.G.tactics;
  },

  parseSpeech(text) {
    const out = [];
    if (!text) return out;
    for (const k of this.KEYWORDS) if (k.re.test(text)) out.push(k);
    return out.slice(0, 5); // au-delà de 5 consignes, le vestiaire décroche
  },

  // Confiance des joueurs envers le coach : crédibilité + moral du groupe.
  trust() {
    const cred = GAME.G.role === 'president' ? 72 : (GAME.G.coachCredibility ?? 45);
    const sq = DB.squadOf(GAME.G.myClub) || [];
    let morale = 60;
    if (sq.length) morale = sq.reduce((a, p) => a + (GAME.pstate(p.id).morale ?? 60), 0) / sq.length;
    return U.clamp(Math.round(cred * 0.7 + morale * 0.3), 5, 100);
  },

  // Modificateurs effectifs pour le match (échelle selon confiance).
  effectiveMods(clubId) {
    if (typeof GAME === 'undefined' || !GAME.G || clubId !== GAME.G.myClub) return null;
    const T = this.ensure();
    const style = this.STYLES[T.style];
    const kws = this.parseSpeech(T.speech);
    let atk = style.atk, def = style.def, fat = style.fat, needsTech = !!style.tech, cards = false;
    for (const k of kws) { atk += k.atk; def += k.def; fat += k.fat; needsTech = needsTech || !!k.tech; cards = cards || !!k.cards; }

    const trust = this.trust();
    // en dessous de 40 de confiance, les consignes sont mal exécutées et peuvent se retourner
    let scale = U.clamp((trust - 20) / 65, 0.15, 1);
    if (trust < 40 && U.rnd() < 0.35) { atk *= -0.4; def *= -0.4; }

    // tiki-taka sans techniciens = suicide tactique
    if (needsTech) {
      const xi = DB.bestXI(clubId, this.FORMATIONS[T.formation].arr);
      const tech = xi.reduce((a, p) => a + (p.pas + p.dri) / 2, 0) / Math.max(1, xi.length);
      if (tech < 68) { atk -= 0.10; def -= 0.06; }
    }

    return {
      atk: 1 + U.clamp(atk, -0.3, 0.35) * scale,
      def: 1 + U.clamp(def, -0.3, 0.35) * scale,
      fat: Math.round(fat * scale),
      cards,
      trust,
      formation: T.formation,
      styleName: style.name,
      kws: kws.map(k => k.label)
    };
  }
};
