// ============ MATCH EN DIRECT SPATIAL 2D (radar, tactiques live, hooks 3D) ============
// Ce moteur garde l'API LIVE existante, mais remplace la logique "phase probabiliste"
// par un vrai état spatial : 22 joueurs + ballon avec positions X/Y à chaque tick.
const LIVE = {
  S: null,
  onEvent: null,
  onHook: null,
  onSubPrompt: null,
  onFinish: null,

  // ---------- construction ----------
  buildTeam(clubId, isHome) {
    const tac = (typeof TACTICS !== 'undefined') ? TACTICS.effectiveMods(clubId) : null;
    const formation = tac ? tac.formation : '4-3-3';
    const F = TACTICS.FORMATIONS[formation] || TACTICS.FORMATIONS['4-3-3'];
    const xiPlayers = DB.bestXI(clubId, F.arr);
    const xi = xiPlayers.map((p, i) => ({
      p, slot: i,
      fit: U.clamp(GAME.pstate(p.id).fit || 100, 35, 100),
      rating: 6 + U.gauss(0.2, 0.4),
      goals: 0, assists: 0,
      yellow: false, off: false, offReason: null,
      x: 50, y: 50, vx: 0, vy: 0, tx: 50, ty: 50,
      mark: null, action: 'shape', lastTouch: 0
    }));
    const bench = DB.squadOf(clubId)
      .filter(p => !xiPlayers.includes(p) && GAME.pstate(p.id).inj === 0 && (GAME.pstate(p.id).susp || 0) === 0)
      .sort((a, b) => b.ovr - a.ovr).slice(0, 9);
    const str = DB.clubStrength(clubId);
    const fallbackTac = { atk: 1, def: 1, fat: 0, cards: false, trust: 60, formation, styleName: 'Équilibré', kws: [] };
    const T = {
      id: clubId,
      name: DB.clubById.get(clubId).name,
      isHome,
      tac: tac || fallbackTac,
      coords: F.coords,
      formation,
      xi,
      bench,
      subsLeft: 5,
      goals: 0,
      shots: 0,
      onTarget: 0,
      passOk: 0,
      passTot: 0,
      str
    };
    T.instructions = this.instructionsFromTac(T.tac);
    return T;
  },

  start(entry, durMin) {
    const H = this.buildTeam(entry.m.h, true);
    const A = this.buildTeam(entry.m.a, false);
    this.S = {
      entry, H, A,
      min: 0, stoppage: U.ri(2, 5), phase: 0, tick: 0,
      possMin: { H: 0, A: 0 },
      events: [], hooks: [], paused: false, over: false, fastForward: false,
      durMs: Math.max(1, durMin) * 60000,
      mul: 1, timer: null, needSubPrompt: null,
      lastChanceTick: -99,
      ball: {
        team: 'H', idx: 0,
        x: 50, y: 50, vx: 0, vy: 0,
        state: 'owned', targetTeam: null, targetIdx: null,
        speed: 0, quality: 0, age: 0, cooldown: 2
      }
    };
    this.initSpatialTeam('H');
    this.initSpatialTeam('A');
    this.claimBall('H', this.kickoffIdx(H));
    this.log(`🏟️ Coup d'envoi ! ${H.name} (${H.formation}, ${H.tac.styleName}) contre ${A.name} (${A.formation}, ${A.tac.styleName}).`);
    return this.S;
  },

  initSpatialTeam(key) {
    const T = this.T(key);
    T.xi.forEach(x => {
      const [px, py] = this.basePos(T, x);
      x.x = px; x.y = py; x.tx = px; x.ty = py; x.vx = 0; x.vy = 0; x.action = 'shape';
    });
  },

  basePos(T, x) {
    const base = T.coords[x.slot] || [50, 50];
    let bx = base[0], by = base[1];
    if (!T.isHome) bx = 100 - bx;
    return [U.clamp(bx, 2, 98), U.clamp(by, 4, 96)];
  },

  instructionsFromTac(tac = {}) {
    const name = String(tac.styleName || 'Équilibré');
    const isPress = /Pressing|Tiki/i.test(name);
    const isLow = /bas/i.test(name);
    const isDirect = /direct/i.test(name);
    const isPoss = /Possession|Tiki/i.test(name);
    const isWide = /ailes/i.test(name);
    return {
      pressLine: isPress ? 72 : isLow ? 34 : 52,
      defensiveLine: isPress ? 63 : isLow ? 31 : 48,
      tempo: isDirect ? 1.25 : isPoss ? 0.82 : 1,
      passingRisk: isDirect ? 0.72 : isPoss ? 0.34 : 0.52,
      width: isWide ? 0.86 : 0.58,
      counter: isLow ? 1.35 : isDirect ? 1.18 : 1,
      aggression: tac.cards ? 1.25 : isPress ? 1.12 : 1,
      atk: tac.atk || 1,
      def: tac.def || 1,
      fat: tac.fat || 0,
      label: name
    };
  },

  applyLiveTactics(teamKey, patch = {}) {
    const T = this.T(teamKey);
    if (!T) return null;

    // Option simple : patch.styleKey = 'pressing_haut', 'bloc_bas', etc.
    if (patch.styleKey && TACTICS.STYLES[patch.styleKey]) {
      const st = TACTICS.STYLES[patch.styleKey];
      T.tac = Object.assign({}, T.tac, {
        atk: 1 + U.clamp(st.atk || 0, -0.3, 0.35),
        def: 1 + U.clamp(st.def || 0, -0.3, 0.35),
        fat: Math.round(st.fat || 0),
        cards: !!st.cards,
        styleName: st.name,
        liveStyleKey: patch.styleKey
      });
    }

    // Option avancée : modifier directement les curseurs tactiques sans arrêter le radar.
    T.instructions = Object.assign(this.instructionsFromTac(T.tac), T.instructions || {}, patch.instructions || {});
    if (typeof patch.atk === 'number') T.tac.atk = U.clamp(patch.atk, 0.65, 1.45);
    if (typeof patch.def === 'number') T.tac.def = U.clamp(patch.def, 0.65, 1.45);
    if (typeof patch.cards === 'boolean') T.tac.cards = patch.cards;
    T.instructions = Object.assign(this.instructionsFromTac(T.tac), patch.instructions || {});

    this.log(`📋 Consigne live : ${T.name} passe en ${T.tac.styleName}.`, 'tactic', { club: T.id, teamKey });
    return T.instructions;
  },

  // ---------- helpers ----------
  T(k) { return k === 'H' ? this.S.H : this.S.A; },
  opp(k) { return k === 'H' ? 'A' : 'H'; },
  alive(T) { return T.xi.filter(x => !x.off); },
  eff(x) { return 0.55 + 0.45 * (x.fit / 100); },
  attr(p, k, d = 70) { const v = Number(p && p[k]); return Number.isFinite(v) ? v : d; },
  numAlive(T) { return this.alive(T).length; },
  manDownMul(T) { const n = this.numAlive(T); return n >= 11 ? 1 : n === 10 ? 0.86 : n === 9 ? 0.72 : 0.58; },
  dist(a, b, c, d) { const dx = a - c, dy = b - d; return Math.sqrt(dx * dx + dy * dy); },
  goalX(teamKey) { return this.T(teamKey).isHome ? 100 : 0; },
  ownGoalX(teamKey) { return this.T(teamKey).isHome ? 0 : 100; },

  kickoffIdx(T) {
    const alive = T.xi.map((x, i) => i).filter(i => !T.xi[i].off);
    const mids = alive.filter(i => T.xi[i].p.group === 'MF');
    return mids.length ? U.pick(mids) : U.pick(alive.filter(i => T.xi[i].p.group !== 'GK')) ?? alive[0];
  },

  posOf(teamKey, x) { return [x.x, x.y]; },

  claimBall(teamKey, idx) {
    const S = this.S, T = this.T(teamKey);
    if (!T || !T.xi[idx] || T.xi[idx].off) idx = this.kickoffIdx(T);
    const h = T.xi[idx];
    S.ball.team = teamKey; S.ball.idx = idx;
    S.ball.state = 'owned'; S.ball.targetTeam = null; S.ball.targetIdx = null;
    S.ball.vx = 0; S.ball.vy = 0; S.ball.speed = 0; S.ball.age = 0;
    if (h) { S.ball.x = h.x; S.ball.y = h.y; h.lastTouch = S.tick; }
  },

  log(txt, type = 'info', extra = {}) {
    const e = Object.assign({ min: Math.max(1, this.S ? this.S.min : 1), type, txt }, extra);
    this.S.events.push(e);
    if (this.onEvent) this.onEvent(e);
    this.prepareHook(e);
    return e;
  },

  prepareHook(e) {
    if (!this.S) return;
    const hookTypes = new Set(['goal', 'penalty', 'chance']);
    if (!hookTypes.has(e.type)) return;
    const hook = {
      type: e.type,
      min: e.min,
      event: e,
      canJumpIn3D: true,
      snapshot: this.snapshot(),
      pause2D: () => { if (this.S && !this.S.over) this.S.paused = true; },
      resume2D: () => { if (this.S && !this.S.over) this.S.paused = false; }
    };
    this.S.hooks.push(hook);
    if (this.onHook) this.onHook(hook);
  },

  snapshot() {
    const S = this.S;
    return {
      min: S.min,
      score: { H: S.H.goals, A: S.A.goals },
      ball: Object.assign({}, S.ball),
      players: ['H', 'A'].flatMap(k => this.T(k).xi.filter(x => !x.off).map(x => ({
        team: k, id: x.p.id, name: x.p.name, pos: x.p.pos, x: x.x, y: x.y, fit: x.fit
      })))
    };
  },

  // ---------- boucle spatiale ----------
  step() {
    const S = this.S;
    if (!S || S.over || S.paused) return;
    S.tick++;
    S.phase++;
    if (S.phase % 3 === 0) this.minuteTick();
    if (S.over) return;

    this.updateTargets('H');
    this.updateTargets('A');
    this.movePlayers('H');
    this.movePlayers('A');
    this.resolveCollisions();
    this.updateBall();
    this.checkPressureOnHolder();
    this.decideWithBall();
  },

  updateTargets(key) {
    const S = this.S, T = this.T(key), hasBall = S.ball.team === key;
    const oppKey = this.opp(key);
    const dir = T.isHome ? 1 : -1;
    const ballX = S.ball.x, ballY = S.ball.y;
    const inst = T.instructions || this.instructionsFromTac(T.tac);
    const theirGoal = this.goalX(key);
    const ownGoal = this.ownGoalX(key);
    const active = this.alive(T);

    let closestToBall = null, best = 999;
    for (const x of active) {
      if (x.p.group === 'GK') continue;
      const d = this.dist(x.x, x.y, ballX, ballY);
      if (d < best) { best = d; closestToBall = x; }
    }

    for (const x of active) {
      const [bx, by] = this.basePos(T, x);
      const pace = this.attr(x.p, 'pace', 68);
      const stamina = this.attr(x.p, 'stamina', 70);
      x.action = 'shape';

      if (x.p.group === 'GK') {
        x.tx = U.clamp(ownGoal + dir * 5, 3, 97);
        x.ty = U.clamp(50 + (ballY - 50) * 0.22, 36, 64);
        continue;
      }

      if (hasBall) {
        const holder = this.T(key).xi[S.ball.idx];
        const isHolder = holder === x;
        const groupPush = x.p.group === 'AT' ? 18 : x.p.group === 'MF' ? 10 : 4;
        const callBonus = (pace + this.attr(x.p, 'dri', 68) + this.attr(x.p, 'vision', 68)) / 260;
        const vertical = groupPush * inst.atk * (0.75 + callBonus * 0.35);
        const ballMagnet = x.p.group === 'DF' ? 0.10 : x.p.group === 'MF' ? 0.22 : 0.30;

        if (isHolder) {
          x.action = 'carry';
          x.tx = U.clamp(x.x + dir * (4.2 + inst.tempo * 2.2), 3, 97);
          x.ty = U.clamp(x.y + (50 - x.y) * 0.03 + U.gauss(0, 2.2), 6, 94);
        } else {
          const lane = (by - 50) * inst.width;
          x.action = x.p.group === 'AT' ? 'run' : 'support';
          x.tx = U.clamp(bx + dir * vertical + (ballX - bx) * ballMagnet, 3, 97);
          x.ty = U.clamp(50 + lane + (ballY - by) * 0.22 + U.gauss(0, 0.45), 5, 95);
        }
      } else {
        const pressZone = T.isHome ? ballX < inst.pressLine : ballX > 100 - inst.pressLine;
        const shouldPress = closestToBall === x && pressZone;
        const compactY = by + (ballY - by) * 0.48;
        const lineAnchor = ownGoal + dir * inst.defensiveLine;
        const blockX = bx + (ballX - bx) * 0.42;

        if (shouldPress) {
          x.action = 'press';
          x.tx = U.clamp(ballX - dir * 1.2, 3, 97);
          x.ty = U.clamp(ballY, 5, 95);
        } else {
          x.action = 'repli';
          x.tx = U.clamp((blockX * 0.68 + lineAnchor * 0.32), 3, 97);
          x.ty = U.clamp(compactY, 5, 95);
        }
      }
      x._speedMul = U.clamp(0.72 + pace / 115 + stamina / 260, 0.8, 1.85);
    }
  },

  movePlayers(key) {
    const T = this.T(key), inst = T.instructions || this.instructionsFromTac(T.tac);
    for (const x of this.alive(T)) {
      const fatigue = 0.58 + 0.42 * (x.fit / 100);
      const actionBoost = x.action === 'press' ? 1.16 : x.action === 'run' ? 1.10 : x.action === 'carry' ? 0.95 : 1;
      const maxStep = (0.95 + (x._speedMul || 1)) * fatigue * actionBoost * (x.p.group === 'GK' ? 0.42 : 1);
      const dx = x.tx - x.x, dy = x.ty - x.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const step = Math.min(maxStep, d);
      x.vx = dx / d * step;
      x.vy = dy / d * step;
      x.x = U.clamp(x.x + x.vx, 1.5, 98.5);
      x.y = U.clamp(x.y + x.vy, 3.5, 96.5);

      const drain = (x.action === 'press' ? 0.024 : x.action === 'run' ? 0.018 : 0.010) + Math.max(0, inst.fat || 0) / 2500;
      if (x.p.group !== 'GK') x.fit = Math.max(7, x.fit - drain);
    }
  },

  resolveCollisions() {
    const all = ['H', 'A'].flatMap(k => this.alive(this.T(k)).map(x => ({ k, x })));
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i].x, b = all[j].x;
        const minD = all[i].k === all[j].k ? 1.85 : 1.55;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0 && d < minD) {
          const push = (minD - d) / 2;
          dx /= d; dy /= d;
          a.x = U.clamp(a.x - dx * push, 1.5, 98.5);
          a.y = U.clamp(a.y - dy * push, 3.5, 96.5);
          b.x = U.clamp(b.x + dx * push, 1.5, 98.5);
          b.y = U.clamp(b.y + dy * push, 3.5, 96.5);
        }
      }
    }
  },

  updateBall() {
    const S = this.S, B = S.ball;
    if (B.state === 'owned') {
      const T = this.T(B.team), h = T && T.xi[B.idx];
      if (!h || h.off) return this.claimBall(B.team, this.kickoffIdx(T));
      B.x = h.x; B.y = h.y; B.cooldown = Math.max(0, (B.cooldown || 0) - 1);
      S.possMin[B.team] += 1 / 3;
      return;
    }

    if (B.state === 'pass') {
      B.age++;
      B.x = U.clamp(B.x + B.vx, 1, 99);
      B.y = U.clamp(B.y + B.vy, 3, 97);
      if (this.tryInterception()) return;
      const T = this.T(B.targetTeam), receiver = T && T.xi[B.targetIdx];
      if (!receiver || receiver.off) return this.looseBall();
      if (this.dist(B.x, B.y, receiver.x, receiver.y) < Math.max(2.3, B.speed * 0.55) || B.age > 9) {
        T.passOk++;
        receiver.rating += 0.015;
        this.claimBall(B.targetTeam, B.targetIdx);
        S.ball.cooldown = U.ri(1, 3);
      }
      return;
    }

    if (B.state === 'loose') {
      B.x = U.clamp(B.x + B.vx, 1, 99);
      B.y = U.clamp(B.y + B.vy, 3, 97);
      B.vx *= 0.72; B.vy *= 0.72;
      const nearest = this.nearestPlayer(B.x, B.y);
      if (nearest && nearest.d < 2.8) this.claimBall(nearest.key, nearest.idx);
      return;
    }
  },

  nearestPlayer(x, y, filter = () => true) {
    let best = null;
    for (const key of ['H', 'A']) {
      const T = this.T(key);
      T.xi.forEach((p, idx) => {
        if (p.off || !filter(key, p, idx)) return;
        const d = this.dist(x, y, p.x, p.y);
        if (!best || d < best.d) best = { key, p, idx, d };
      });
    }
    return best;
  },

  tryInterception() {
    const S = this.S, B = S.ball;
    const defKey = this.opp(B.team);
    const DT = this.T(defKey);
    const nearest = this.nearestPlayer(B.x, B.y, (key, p) => key === defKey && p.p.group !== 'GK');
    if (!nearest) return false;
    const tack = this.attr(nearest.p.p, 'tackling', 68);
    const pace = this.attr(nearest.p.p, 'pace', 68);
    const radius = 1.65 + tack / 120 + pace / 210;
    if (nearest.d > radius) return false;

    const passQuality = B.quality || 70;
    const pInt = U.clamp(0.40 + (tack - passQuality) / 130 + (DT.instructions.def - 1) * 0.2, 0.12, 0.82);
    if (U.rnd() > pInt) return false;

    nearest.p.rating += 0.05;
    this.claimBall(defKey, nearest.idx);
    S.ball.cooldown = U.ri(1, 3);
    if (U.rnd() < 0.14) this.log(`🧱 Interception de ${nearest.p.p.name}.`, 'info', { club: DT.id, pid: nearest.p.p.id });
    return true;
  },

  looseBall() {
    const B = this.S.ball;
    B.state = 'loose'; B.team = null; B.idx = null; B.targetTeam = null; B.targetIdx = null;
    B.vx *= 0.45; B.vy *= 0.45;
  },

  checkPressureOnHolder() {
    const S = this.S, B = S.ball;
    if (B.state !== 'owned' || B.cooldown > 0) return;
    const atkKey = B.team, defKey = this.opp(atkKey);
    const AT = this.T(atkKey), DT = this.T(defKey);
    const holder = AT.xi[B.idx];
    if (!holder || holder.off || holder.p.group === 'GK') return;
    const nearest = this.nearestPlayer(holder.x, holder.y, (key, p) => key === defKey && p.p.group !== 'GK');
    if (!nearest || nearest.d > 2.25) return;

    const tackle = this.attr(nearest.p.p, 'tackling', 66) * (DT.instructions.aggression || 1);
    const dribble = (this.attr(holder.p, 'dri', 68) + this.attr(holder.p, 'composure', 68)) / 2;
    const pWin = U.clamp(0.32 + (tackle - dribble) / 150, 0.12, 0.70);
    if (U.rnd() < pWin) {
      if (U.rnd() < 0.10 + this.attr(nearest.p.p, 'aggression', 70) / 900) {
        this.foul(defKey, nearest.p, holder);
        B.cooldown = 2;
      } else {
        nearest.p.rating += 0.04;
        holder.rating -= 0.03;
        this.claimBall(defKey, nearest.idx);
        S.ball.cooldown = U.ri(1, 2);
      }
    }
  },

  decideWithBall() {
    const S = this.S, B = S.ball;
    if (B.state !== 'owned' || B.cooldown > 0) return;
    const atkKey = B.team, AT = this.T(atkKey);
    const holder = AT.xi[B.idx];
    if (!holder || holder.off) return;

    const dir = AT.isHome ? 1 : -1;
    const goalX = this.goalX(atkKey);
    const distGoal = Math.abs(goalX - holder.x);
    const central = Math.abs(holder.y - 50) < 20;
    const inBox = distGoal < 18 && central;
    const finalThird = AT.isHome ? holder.x > 68 : holder.x < 32;

    if (finalThird && S.tick - S.lastChanceTick > 10 && U.rnd() < 0.06 + AT.tac.atk * 0.035) {
      S.lastChanceTick = S.tick;
      this.log(`🔥 Occasion dangereuse pour ${AT.name}.`, 'chance', { club: AT.id, teamKey: atkKey, pid: holder.p.id });
    }

    if (inBox && U.rnd() < 0.44 + (holder.p.group === 'AT' ? 0.18 : 0)) return this.shoot(atkKey, holder, false);
    if (distGoal < 30 && U.rnd() < 0.09 + this.attr(holder.p, 'longshots', 62) / 850) return this.shoot(atkKey, holder, true);

    const nearestForward = this.findPassTarget(atkKey, holder, true);
    const pressure = this.nearestPlayer(holder.x, holder.y, (key, p) => key === this.opp(atkKey) && p.p.group !== 'GK');
    const underPressure = pressure && pressure.d < 5.2;
    const inst = AT.instructions;
    const passBias = underPressure ? 0.72 : 0.48 + (this.attr(holder.p, 'pas', 68) - this.attr(holder.p, 'dri', 68)) / 240;
    const riskPush = inst.passingRisk || 0.5;

    if (nearestForward && U.rnd() < passBias + riskPush * 0.18) return this.passTo(atkKey, holder, nearestForward);

    // Conduite de balle : le joueur avance vraiment dans l'espace, pas juste un nombre qui grimpe.
    holder.tx = U.clamp(holder.x + dir * (6 + inst.tempo * 2.8), 3, 97);
    holder.ty = U.clamp(holder.y + U.gauss(0, 4), 6, 94);
    B.cooldown = U.ri(1, 2);
  },

  findPassTarget(atkKey, holder, preferForward = false) {
    const T = this.T(atkKey), dir = T.isHome ? 1 : -1;
    const inst = T.instructions || this.instructionsFromTac(T.tac);
    const cands = T.xi.map((x, i) => ({ x, i })).filter(o => !o.x.off && o.x !== holder && o.x.p.group !== 'GK');
    if (!cands.length) return null;
    let best = null, bestScore = -999;
    for (const o of cands) {
      const dx = (o.x.x - holder.x) * dir;
      const dy = Math.abs(o.x.y - holder.y);
      const forward = dx > 0 ? dx : dx * 0.35;
      const role = o.x.p.group === 'AT' ? 14 : o.x.p.group === 'MF' ? 7 : -2;
      const space = this.spaceAround(this.opp(atkKey), o.x.x, o.x.y);
      const risk = preferForward ? inst.passingRisk * 20 : 0;
      const score = forward * (0.9 + inst.tempo * 0.25) - dy * 0.25 + role + space + risk + U.gauss(0, 5);
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return best;
  },

  spaceAround(defKey, x, y) {
    let nearest = 18;
    const DT = this.T(defKey);
    for (const d of this.alive(DT)) {
      if (d.p.group === 'GK') continue;
      nearest = Math.min(nearest, this.dist(x, y, d.x, d.y));
    }
    return U.clamp(nearest, 0, 18);
  },

  passTo(atkKey, holder, target) {
    const S = this.S, AT = this.T(atkKey), B = S.ball;
    const pas = this.attr(holder.p, 'pas', 68);
    const vision = this.attr(holder.p, 'vision', 68);
    const quality = (pas * 0.68 + vision * 0.32) * this.eff(holder);
    AT.passTot++;

    const lead = AT.isHome ? 1 : -1;
    const tx = U.clamp(target.x.x + lead * U.clamp((AT.instructions.passingRisk || 0.5) * 4, 1, 5), 2, 98);
    const ty = U.clamp(target.x.y + target.x.vy * 0.8, 4, 96);
    const dx = tx - holder.x, dy = ty - holder.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = U.clamp(6.2 + quality / 13 + (AT.instructions.tempo || 1) * 1.4, 7.5, 14.5);

    B.state = 'pass'; B.team = atkKey; B.idx = AT.xi.indexOf(holder);
    B.targetTeam = atkKey; B.targetIdx = target.i;
    B.x = holder.x; B.y = holder.y;
    B.vx = dx / d * speed; B.vy = dy / d * speed;
    B.speed = speed; B.quality = quality; B.age = 0; B.cooldown = 0;
    holder.rating += 0.006;
  },

  shoot(atkKey, holder, longShot = false) {
    const S = this.S, AT = this.T(atkKey), DT = this.T(this.opp(atkKey));
    AT.shots++;
    const gk = this.alive(DT).find(x => x.p.group === 'GK');
    const distGoal = Math.abs(this.goalX(atkKey) - holder.x);
    const anglePenalty = Math.abs(holder.y - 50) / 95;
    const gkQ = gk ? (this.attr(gk.p, 'gkRef', 65) + this.attr(gk.p, 'gkPos', 65)) / 2 * this.eff(gk) : 50;
    const finish = longShot ? this.attr(holder.p, 'longshots', 62) : this.attr(holder.p, 'finishing', 68);
    const base = longShot ? 0.055 : 0.22;
    const pGoal = U.clamp(base + (finish - 70) / 260 + (24 - distGoal) / 150 - anglePenalty - (gkQ - 72) / 430 + (AT.tac.atk - 1) * 0.25, 0.025, 0.58) * (0.72 + 0.28 * this.eff(holder));

    if (U.rnd() < pGoal) {
      AT.goals++; AT.onTarget++;
      holder.goals++; holder.rating += 1.0;
      const mates = this.alive(AT).filter(x => x !== holder && x.p.group !== 'GK').sort((a, b) => b.lastTouch - a.lastTouch);
      const assist = U.rnd() < 0.72 && mates.length ? mates[0] : null;
      if (assist) { assist.assists++; assist.rating += 0.55; }
      this.log(`⚽ BUUUT ! ${holder.p.name} (${AT.name})${longShot ? ', frappe de loin' : ''}${assist ? ', servi par ' + assist.p.name : ''} ! ${S.H.goals} - ${S.A.goals}`, 'goal', { club: AT.id, pid: holder.p.id, aid: assist ? assist.p.id : null, teamKey: atkKey });
      this.afterGoal(atkKey);
    } else {
      const saved = U.rnd() < 0.58 + (gkQ - 70) / 280;
      if (saved) {
        AT.onTarget++;
        if (gk) gk.rating += 0.08;
        if (U.rnd() < 0.45) this.log(`🧤 ${gk ? gk.p.name : 'Le gardien'} détourne la tentative de ${holder.p.name}.`, 'save', { club: DT.id });
      } else if (U.rnd() < 0.35) {
        this.log(`💨 ${holder.p.name} manque le cadre.`, 'miss', { club: AT.id, pid: holder.p.id });
      }
      holder.rating += saved ? 0.025 : -0.02;
      this.claimBall(this.opp(atkKey), this.gkIndex(this.T(this.opp(atkKey))));
      this.S.ball.cooldown = U.ri(2, 4);
    }
  },

  afterGoal(scoringKey) {
    const S = this.S, concedeKey = this.opp(scoringKey), T = this.T(concedeKey);
    this.initSpatialTeam('H');
    this.initSpatialTeam('A');
    this.claimBall(concedeKey, this.kickoffIdx(T));
    S.ball.x = 50; S.ball.y = 50; S.ball.cooldown = 3;
    const h = T.xi[S.ball.idx]; if (h) { h.x = 50; h.y = 50; }
  },

  gkIndex(T) {
    const i = T.xi.findIndex(x => !x.off && x.p.group === 'GK');
    return i >= 0 ? i : this.kickoffIdx(T);
  },

  foul(byKey, tackler, victim) {
    const T2 = this.T(byKey), atkKey = this.opp(byKey);
    const inBox = Math.abs(this.goalX(atkKey) - victim.x) < 17 && Math.abs(victim.y - 50) < 22;
    if (inBox && U.rnd() < 0.28) {
      this.log(`🎯 Penalty pour ${this.T(atkKey).name} après une faute sur ${victim.p.name} !`, 'penalty', { club: this.T(atkKey).id, pid: victim.p.id, teamKey: atkKey });
      return this.takePenalty(atkKey);
    }

    if (U.rnd() > 0.30 + (T2.tac.cards ? 0.08 : 0)) {
      if (U.rnd() < 0.22) this.log(`⚠️ Faute de ${tackler.p.name} sur ${victim.p.name}. Coup franc.`, 'info');
      return;
    }
    const red = U.rnd() < 0.05;
    if (red) {
      tackler.off = true; tackler.offReason = 'red'; tackler.rating -= 1.4;
      const st = GAME.pstate(tackler.p.id); st.susp = (st.susp || 0) + U.ri(1, 3);
      this.log(`🟥 ROUGE ! ${tackler.p.name} (${T2.name}) est expulsé.`, 'red', { club: T2.id, pid: tackler.p.id });
      if (T2.id === GAME.G.myClub && !this.S.fastForward) this.requestSubPrompt(byKey, null, 'red');
    } else if (tackler.yellow) {
      tackler.off = true; tackler.offReason = 'red'; tackler.rating -= 1.2;
      const st = GAME.pstate(tackler.p.id); st.susp = (st.susp || 0) + 1;
      this.log(`🟥 Deuxième jaune pour ${tackler.p.name} (${T2.name}).`, 'red', { club: T2.id, pid: tackler.p.id });
      if (T2.id === GAME.G.myClub && !this.S.fastForward) this.requestSubPrompt(byKey, null, 'red');
    } else {
      tackler.yellow = true; tackler.rating -= 0.2;
      this.log(`🟨 ${tackler.p.name} (${T2.name}) averti.`, 'yellow', { club: T2.id, pid: tackler.p.id });
    }
  },

  takePenalty(atkKey) {
    const AT = this.T(atkKey), DT = this.T(this.opp(atkKey));
    const takers = this.alive(AT).filter(x => x.p.group !== 'GK').sort((a, b) => this.attr(b.p, 'penalties', 65) - this.attr(a.p, 'penalties', 65));
    const holder = takers[0] || this.alive(AT)[0];
    const gk = this.alive(DT).find(x => x.p.group === 'GK');
    const pGoal = U.clamp(0.70 + (this.attr(holder.p, 'penalties', 70) - 70) / 200 - ((gk ? this.attr(gk.p, 'gkRef', 65) : 65) - 70) / 380, 0.52, 0.88);
    if (U.rnd() < pGoal) {
      AT.goals++; AT.onTarget++; AT.shots++;
      holder.goals++; holder.rating += 0.8;
      this.log(`⚽ ${holder.p.name} transforme le penalty ! ${this.S.H.goals} - ${this.S.A.goals}`, 'goal', { club: AT.id, pid: holder.p.id, teamKey: atkKey });
      this.afterGoal(atkKey);
    } else {
      AT.shots++; AT.onTarget++;
      this.log(`🧤 Penalty arrêté ! ${gk ? gk.p.name : 'Le gardien'} garde son équipe en vie.`, 'save', { club: DT.id });
      this.claimBall(this.opp(atkKey), this.gkIndex(DT));
    }
  },

  // ---------- tick de minute : fatigue, blessures, IA ----------
  minuteTick() {
    const S = this.S;
    S.min++;
    for (const key of ['H', 'A']) {
      const T = this.T(key);
      for (const x of this.alive(T)) {
        const drain = (0.22 + (100 - this.attr(x.p, 'stamina', 70)) / 260 + Math.max(0, T.tac.fat || 0) / 90) * (x.p.group === 'GK' ? 0.22 : 1);
        x.fit = Math.max(8, x.fit - drain);
        if (U.rnd() < 0.00016 + (x.fit < 35 ? 0.0012 : 0)) {
          x.off = true; x.offReason = 'injury';
          const dur = U.rnd() < 0.7 ? U.ri(3, 15) : U.ri(16, 60);
          GAME.pstate(x.p.id).inj = dur;
          this.log(`🚑 ${x.p.name} (${T.name}) se blesse et doit sortir (${dur} j).`, 'injury', { pid: x.p.id });
          if (T.id === GAME.G.myClub && !S.fastForward) this.requestSubPrompt(key, T.xi.indexOf(x), 'injury');
          else this.aiSub(key, T.xi.indexOf(x));
        }
      }
      if (T.id !== GAME.G.myClub) this.aiCoach(key);
    }
    if (S.min >= 90 + S.stoppage) { this.finish(); return; }
    if (S.min === 45) this.log(`⏸️ Mi-temps : ${S.H.name} ${S.H.goals} - ${S.A.goals} ${S.A.name}.`, 'info');
  },

  aiCoach(key) {
    const S = this.S, T = this.T(key), me = this.T(this.opp(key));
    if (S.min >= 55 && T.subsLeft > 0 && S.min % 5 === 0) {
      const tired = this.alive(T).filter(x => x.fit < 52 && x.p.group !== 'GK');
      if (tired.length) this.aiSub(key, T.xi.indexOf(tired[0]));
    }
    if (S.min === 70 || S.min === 80) {
      if (T.goals < me.goals) this.applyLiveTactics(key, { instructions: { pressLine: 76, defensiveLine: 62, tempo: 1.22, passingRisk: 0.70 }, atk: Math.min(1.35, T.tac.atk + 0.08), def: Math.max(0.85, T.tac.def - 0.05) });
      else if (T.goals > me.goals) this.applyLiveTactics(key, { instructions: { pressLine: 38, defensiveLine: 30, tempo: 0.82, passingRisk: 0.28 }, def: Math.min(1.3, T.tac.def + 0.07), atk: Math.max(0.85, T.tac.atk - 0.05) });
    }
  },

  aiSub(key, outIdx) {
    const T = this.T(key);
    if (T.subsLeft <= 0) return;
    const out = T.xi[outIdx];
    if (!out || out.offReason === 'red') return;
    const cand = T.bench.filter(p => p.group === out.p.group).sort((a, b) => b.ovr - a.ovr)[0] || T.bench[0];
    if (!cand) return;
    this.doSub(key, outIdx, cand.id, true);
  },

  requestSubPrompt(key, idx, reason) {
    this.S.paused = true;
    this.S.needSubPrompt = { teamKey: key, idx, reason };
    if (this.onSubPrompt) this.onSubPrompt(this.S.needSubPrompt);
  },

  doSub(key, outIdx, inPid, silent = false) {
    const T = this.T(key);
    if (T.subsLeft <= 0) return { ok: false, msg: 'Plus de changements disponibles (5 max).' };
    const out = T.xi[outIdx];
    if (!out) return { ok: false, msg: 'Joueur introuvable.' };
    if (out.off && out.offReason === 'red') return { ok: false, msg: 'Un expulsé ne peut pas être remplacé : vous jouez à ' + this.numAlive(T) + '.' };
    const bi = T.bench.findIndex(p => p.id === inPid);
    if (bi < 0) return { ok: false, msg: 'Ce joueur n\'est pas sur le banc.' };
    const inP = T.bench.splice(bi, 1)[0];
    const wasOff = out.off;
    out.off = true; out.offReason = out.offReason || 'sub';
    const entrant = {
      p: inP, slot: out.slot,
      fit: U.clamp(GAME.pstate(inP.id).fit || 100, 40, 100),
      rating: 6 + U.gauss(0.1, 0.3),
      goals: 0, assists: 0, yellow: false, off: false, offReason: null,
      x: out.x, y: out.y, vx: 0, vy: 0, tx: out.tx, ty: out.ty, action: 'sub', lastTouch: 0
    };
    T.xi.push(entrant);
    T.subsLeft--;
    if (this.S.ball.team === key && this.S.ball.idx === outIdx) this.claimBall(key, T.xi.indexOf(entrant));
    if (!silent) this.log(`🔁 Changement ${T.name} : ${inP.name} remplace ${out.p.name}${wasOff ? '' : ' (' + Math.round(out.fit) + '% d\'énergie)'}.`, 'sub');
    return { ok: true, msg: `${inP.name} entre en jeu.` };
  },

  // ---------- fin ----------
  finish() {
    const S = this.S;
    if (!S || S.over) return;
    S.over = true; S.paused = true;
    this.log(`🏁 Coup de sifflet final : ${S.H.name} ${S.H.goals} - ${S.A.goals} ${S.A.name}.`, 'info');

    const stats = new Map();
    const collect = (T) => {
      const list = [];
      for (const x of T.xi) {
        stats.set(x.p.id, { rating: U.clamp(x.rating, 3, 10), goals: x.goals, assists: x.assists });
        list.push(x.p);
        const st = GAME.pstate(x.p.id);
        st.apps++; st.goals += x.goals; st.assists += x.assists;
        st.sumRating += U.clamp(x.rating, 3, 10);
        st.form = U.clamp(st.form * 0.7 + (U.clamp(x.rating, 3, 10) - 5.5) * 1.1, 0, 10);
        if (st.inj === 0) st.fit = U.clamp(x.fit - 4, 20, 100);
      }
      return list;
    };
    const winner = S.H.goals > S.A.goals ? S.H.id : S.A.goals > S.H.goals ? S.A.id : null;
    const xiH = collect(S.H), xiA = collect(S.A);
    for (const T of [S.H, S.A]) for (const x of T.xi) {
      const st = GAME.pstate(x.p.id);
      st.morale = U.clamp(st.morale + (winner === T.id ? 4 : winner ? -4 : 0), 0, 100);
    }
    let gh = S.H.goals, ga = S.A.goals;
    if ((S.entry.ko || S.entry.natCup) && gh === ga) {
      if (U.rnd() < 0.5) gh++; else ga++;
      this.log(`⚔️ Prolongation & tirs au but : ${gh} - ${ga} !`, 'goal');
      if (gh > ga) S.H.goals = gh; else S.A.goals = ga;
    }
    const res = { gh, ga, events: S.events, xiH, xiA, stats };
    GAME.recordMyMatch(S.entry, res);
    this._finalRes = res;
    if (this.onFinish) this.onFinish(res);
  },

  possession() {
    if (!this.S) return 50;
    const t = this.S.possMin.H + this.S.possMin.A || 1;
    return Math.round(this.S.possMin.H / t * 100);
  }
};
