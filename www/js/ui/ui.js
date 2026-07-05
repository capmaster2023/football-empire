// ============ INTERFACE (mobile, tactile, manette) ============
const UI = {
  screen: 'loading',
  el: id => document.getElementById(id),
  app: null,

  async init() {
    this.app = this.el('app');
    if (!this._clickGuardInstalled) {
      document.addEventListener('click', e => this.markScrollableClick(e), true);
      this._clickGuardInstalled = true;
    }
    this.render(`<div class="center-screen"><div class="logo">⚽</div><h1>FOOTBALL EMPIRE</h1><p class="sub">World Simulation</p><p class="muted">Chargement de la base mondiale…<br>18 405 joueurs réels · 662 clubs · 51 ligues</p><div class="spinner"></div></div>`);
    await DB.load();
    this.mainMenu();
    GAMEPAD.init();
  },

  render(html, opts = {}) {
    // Compat : les anciens écrans terminent par le nav — on recompose en shell console.
    // Détecte <nav class="console-nav" placé en FIN de html (ancien pattern mobile) et le remonte en tête,
    // enveloppe le contenu dans zone-main et ajoute la hint bar.
    // Ne recompose QUE l'ancien pattern mobile : nav en FIN de html ET pas déjà de shell (zone-main absent)
    const findScroller = () => this.app && (this.app.querySelector('.content, .list, .panel-content, .panel, .central-left, .ccard .cbody, .zone-main') || this.app);
    const previousScroller = findScroller();
    const previousScroll = previousScroller ? previousScroller.scrollTop : 0;
    const previousAppScroll = this.app ? this.app.scrollTop : 0;
    const previousScreen = this._lastRenderedScreen || this.screen || '';
    const currentScreen = this.screen || previousScreen;
    const sameScreen = !!previousScreen && previousScreen === currentScreen;
    const askedKeep = !!(opts.preserveScroll || this._preserveScrollNext || this._clickedInsideScrollable);
    const keepScroll = opts.resetScroll ? false : (askedKeep && sameScreen);
    this._preserveScrollNext = false;
    this._clickedInsideScrollable = false;
    const navIdx = html.lastIndexOf('<nav class="console-nav"');
    const alreadyShell = html.includes('class="zone-main"');
    if (navIdx > 0 && !alreadyShell) {
      const navHtml = html.slice(navIdx);
      const body = html.slice(0, navIdx);
      html = `${this.rotateGuard()}${navHtml}<div class="zone-main">${body}</div>${this.hintBar({ back: 'UI.home()' })}`;
    }
    this.app.classList.remove('page-in');
    this.app.innerHTML = html;
    this.app.querySelectorAll('button:not([type])').forEach(b => { b.type = 'button'; });
    void this.app.offsetWidth;
    this.app.classList.add('page-in');
    const nextScroller = findScroller();
    const restore = () => {
      if (keepScroll) {
        if (nextScroller) nextScroller.scrollTop = previousScroll;
        if (this.app) this.app.scrollTop = previousAppScroll;
      } else {
        if (nextScroller) nextScroller.scrollTop = 0;
        if (this.app) this.app.scrollTop = 0;
      }
    };
    restore();
    requestAnimationFrame(() => { restore(); requestAnimationFrame(restore); });
    setTimeout(restore, 80);
    this._lastRenderedScreen = currentScreen;
    this.showYouthSigningAlert();
  },

  preserveScrollOnce() {
    this._preserveScrollNext = true;
  },

  markScrollableClick(e) {
    const t = e && e.target;
    if (!t || !t.closest) return;
    if (t.closest('.console-nav, .hint-bar, .btn-back, .topbar, .center-screen, .youth-signing-overlay')) return;
    if (t.closest('button, .row, .chip, label.btn')) this._clickedInsideScrollable = true;
  },

  refreshAfterAdvance() {
    this.preserveScrollOnce();
    const s = this.screen;
    if (s === 'central') return this.central();
    if (s === 'club') return this.club();
    if (s === 'academy') return this._activeAcademyAid ? this.academyPlayer(this._activeAcademyAid) : this.academyScreen(this._acadTab || 'apercu');
    if (s === 'squad') return this.squad(this._squadClubId);
    if (s === 'transfers') return this.transfers();
    if (s === 'table') return this.table(this._tableLeagueId);
    if (s === 'world') return this.world();
    if (s === 'search') return this.searchPlayers(this._q || '');
    return this.home();
  },

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 20);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2600);
  },

  // ---------- MENU PRINCIPAL ----------
  mainMenu() {
    this.screen = 'menu';
    const meta = SAVE.meta();
    this.render(`
      <div class="center-screen">
        <div class="logo">⚽</div>
        <h1>FOOTBALL EMPIRE</h1>
        <p class="sub">World Simulation — Saison 2026/27</p>
        <div class="menu-buttons">
          ${meta ? `<button class="btn btn-primary" onclick="UI.continueGame()">▶ Continuer<br><small>${U.esc(meta.club)} — Saison ${meta.season}</small></button>` : ''}
          <button class="btn" onclick="UI.startCareer('coach')">🧢 Nouvelle carrière Coach</button>
          <button class="btn" onclick="UI.startCareer('president')">👔 Nouvelle carrière Président</button>
          <button class="btn" onclick="UI.startSpectator()">🌍 Mode Spectateur (le monde vit seul)</button>
          <button class="btn btn-ghost" onclick="UI.saveScreen()">💾 Sauvegardes</button>
        </div>
        <p class="muted small">Données réelles FC26 · 100 % simulation · Hors ligne</p>
      </div>`);
  },

  continueGame() {
    const r = SAVE.load();
    if (r.ok) { this.toast('Partie chargée !'); this.home(); }
    else this.toast(r.msg);
  },

  startCareer(role) {
    this._role = role || 'coach';
    this.pickLeague();
  },

  startSpectator() {
    GAME.newGame(null, 'spectator');
    this.home();
  },

  // ---------- CHOIX DU CLUB ----------
  pickLeague() {
    this.screen = 'pickLeague';
    const byConf = {};
    for (const L of DB.leagues) { (byConf[L.conf] = byConf[L.conf] || []).push(L); }
    const confNames = { UEFA: '🇪🇺 Europe (UEFA)', CONMEBOL: '🌎 Amérique du Sud', CONCACAF: '🌎 Amérique du Nord', AFC: '🌏 Asie', CAF: '🌍 Afrique', OFC: '🌏 Océanie' };
    let html = `<div class="topbar"><button class="btn-back" onclick="UI.mainMenu()">‹</button><h2>Choisissez une ligue</h2></div><div class="list">`;
    for (const conf of ['UEFA', 'CONMEBOL', 'CONCACAF', 'AFC', 'CAF', 'OFC']) {
      if (!byConf[conf]) continue;
      html += `<div class="section-title">${confNames[conf]}</div>`;
      for (const L of byConf[conf].sort((a, b) => b.avg - a.avg)) {
        html += `<div class="row" onclick="UI.pickClub(${L.id})">
          <div><b>${U.esc(L.name)}</b><br><span class="muted small">${U.esc(L.country)} · Division ${L.level} · ${L.nClubs} clubs</span></div>
          <span class="badge" style="color:${U.ovrColor(L.avg)}">${L.avg}</span></div>`;
      }
    }
    this.render(html + '</div>');
  },

  pickClub(leagueId) {
    const L = DB.leagueById.get(leagueId);
    const clubs = DB.clubsOfLeague.get(leagueId).slice().sort((a, b) => b.rep - a.rep);
    let html = `<div class="topbar"><button class="btn-back" onclick="UI.pickLeague()">‹</button><h2>${U.esc(L.name)}</h2></div><div class="list">`;
    for (const c of clubs) {
      const sq = DB.squadOf(c.id);
      html += `<div class="row" onclick="UI.confirmClub(${c.id})">
        <div><b>${U.esc(c.name)}</b><br><span class="muted small">${sq.length} joueurs · valeur ${U.money(c.sqval)}</span></div>
        <span class="badge" style="color:${U.ovrColor(c.rep)}">${Math.round(c.rep)}</span></div>`;
    }
    this.render(html + '</div>');
  },

  confirmClub(clubId) {
    this._clubId = clubId;
    this.pickOwner();
  },

  pickOwner() {
    const c = DB.clubById.get(this._clubId);
    const base = FINANCE.initBudgets()[c.id] || 0;
    this.render(`<div class="topbar"><button class="btn-back" onclick="UI.pickClub(${c.league})">‹</button><h2>Choix du propriétaire</h2></div>
      <div class="content">
        <div class="card"><h3>${U.esc(c.name)}</h3><p class="muted small">Choisis le départ financier du club. Un propriétaire riche donne des moyens, mais ajoute pression, inflation, contrôles financiers et limites de fair-play financier. L’argent ne devient pas automatiquement du budget mercato, parce que même le chaos a besoin d’un comptable.</p></div>
        <div class="card">
          <h3>Propriétaire normal</h3>
          <p class="muted small">Budget réaliste du club. Aucune injection spéciale. Progression plus lente, plus propre, plus dure.</p>
          <div class="stat-row"><span>Budget estimé</span><b class="money">${U.money(base)}</b></div>
          <button class="btn btn-primary" onclick="UI.startWithOwner('normal',0)">Commencer avec propriétaire normal</button>
        </div>
        <div class="card alert">
          <h3>Propriétaire riche</h3>
          <p class="muted small">Injection dès le début dans les finances globales. Tu peux investir partout : stade, formation, staff, médical, scouting, dettes, marketing, réserve. Le mercato reste limité par le fair-play financier.</p>
          <div class="chips wrap">${OWNER.AMOUNTS.map((m,i)=>`<button class="chip ${(UI._ownerAmount || 100000000)===m?'active':''}" onclick="UI._ownerAmount=${m};UI.pickOwnerAmount()">${U.money(m)}</button>`).join('')}</div>
          <button class="btn btn-primary" onclick="UI.startWithOwner('rich', UI._ownerAmount || 100000000)">Commencer avec propriétaire riche</button>
        </div>
      </div>`);
  },

  pickOwnerAmount() {
    this.pickOwner();
  },

  startWithOwner(type, amount) {
    GAME.newGame(this._clubId, this._role || 'coach', { type, injection: amount || 0 });
    SAVE.save();
    this.home();
  },

  // ---------- SHELL CONSOLE FC26 ----------
  // Top nav horizontale (Home | Central | ... ) + badge club + barre de forme
  nav(active) {
    const G = GAME.G;
    const my = G.myClub ? DB.clubById.get(G.myClub) : null;
    const tabs = [
      ['home', 'Home', true], ['central', 'Central'], ['squad', 'Effectif'],
      ['transfers', 'Mercato'], ['academy', 'Formation'], ['club', 'Bureau'],
      ['table', 'Compét.'], ['world', 'Monde']
    ];
    // barre de forme du club (décorative, style FC26)
    const formHtml = '<i class="on"></i><i class="on"></i><i></i><i class="on"></i>';
    const initials = my ? U.esc(my.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase()) : 'FE';
    return `<nav class="console-nav">
      <div class="cn-logo">FE</div>
      <span class="cn-bumper">LB</span>
      <div class="cn-tabs">
        ${tabs.map(([id, lb, isHome]) =>
          `<button class="cn-tab ${isHome ? 'home-tab' : ''} ${active === id ? 'active' : ''}" onclick="UI.${id}()">${lb}</button>`).join('')}
      </div>
      <span class="cn-bumper">RB</span>
      ${my ? `<div class="cn-club">
        <div class="cn-crest">${initials}</div>
        <div class="cn-clubmeta">
          <div class="cn-clubname">${U.esc(my.name)}</div>
          <div class="cn-form">${formHtml}</div>
        </div>
      </div>` : `<div class="cn-club"><div class="cn-clubmeta"><div class="cn-clubname">Spectateur</div></div></div>`}
    </nav>`;
  },

  // Barre de hints console en bas : Ⓐ Sélectionner Ⓑ Retour + méta
  hintBar(opts = {}) {
    const G = GAME.G;
    const back = opts.back || 'UI.home()';
    const extra = opts.extra || '';
    const meta = `${U.fmtDateShort(G.day, G.season)} · S${G.season}`;
    return `<div class="hint-bar">
      <span class="hint"><span class="abtn">A</span> Sélectionner</span>
      <button class="hint" onclick="${back}"><span class="abtn dark">B</span> Retour</button>
      ${extra}
      <span class="spacer"></span>
      <span class="sysmeta">${G.myClub ? `<span class="money">${U.money(GAME.budget(G.myClub))}</span>` : ''}<span>FE HUB</span><span>${meta}</span></span>
    </div>`;
  },

  rotateGuard() {
    return `<div class="rotate-guard"><div class="phone"></div><h2>Tourne ton téléphone</h2><p class="muted">Football Empire se joue en paysage, comme sur console.</p></div>`;
  },

  // Enveloppe standard d'un écran console : nav + zone + hints
  shell(active, inner, hintOpts) {
    return `${this.rotateGuard()}${this.nav(active)}<div class="zone-main">${inner}</div>${this.hintBar(hintOpts)}`;
  },

  // Focus carrousel : met à jour la carte active + le bouton pill
  focusCard(idx) {
    this._cardIdx = idx;
    const cards = document.querySelectorAll('.card-rail .ccard');
    cards.forEach((c, i) => c.classList.toggle('focus', i === idx));
    const pill = document.getElementById('pill-action');
    const focused = cards[idx];
    if (pill && focused) {
      pill.style.display = 'inline-flex';
      pill.querySelector('.pill-lbl').textContent = focused.dataset.action || 'Entrer';
      pill.onclick = () => { const fn = focused.dataset.enter; if (fn) eval(fn); };
      if (typeof focused.scrollIntoView === 'function') {
        try { focused.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }
        catch (e) { focused.scrollIntoView(); }
      }
    }
  },

  bindRail() {
    const rail = document.querySelector('.card-rail');
    if (!rail) return;
    const cards = rail.querySelectorAll('.ccard');
    cards.forEach((c, i) => {
      c.addEventListener('click', () => {
        if (this._cardIdx === i && c.dataset.enter) eval(c.dataset.enter);
        else this.focusCard(i);
      });
    });
    // suit le scroll tactile : focus sur la carte la plus centrée
    let t;
    rail.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const mid = rail.scrollLeft + rail.clientWidth / 2;
        let best = 0, bd = 1e9;
        cards.forEach((c, i) => {
          const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
          if (d < bd) { bd = d; best = i; }
        });
        if (best !== this._cardIdx) this.focusCard(best);
      }, 90);
    }, { passive: true });
    this.focusCard(this._cardIdx || 0);
  },

  // header hérité pour les écrans secondaires (choix de club, etc.)
  header(title) {
    const G = GAME.G;
    const my = G.myClub ? DB.clubById.get(G.myClub) : null;
    return `<div class="topbar">
      <div><h2>${U.esc(title)}</h2><span class="muted small">${U.fmtDate(G.day, G.season)} · S${G.season}/${(G.season + 1) % 100}</span></div>
      <div class="hdr-right">${my ? `<b>${U.esc(my.name)}</b><br><span class="small">${G.role === 'president' ? 'Président' : 'Coach'}${G.role === 'coach' ? ' · Créd. ' + G.coachCredibility + '/100' : ''} · <span class="money">${U.money(GAME.budget(my.id))}</span></span>` : '<b>Spectateur</b>'}</div>
    </div>`;
  },

  // ---------- ACCUEIL : carrousel console FC26 ----------
  crest(name, size) {
    const ini = U.esc((name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase());
    return `<div class="${size === 'big' ? 'crest-big' : 'cn-crest'}">${ini}</div>`;
  },

  home() {
    this.screen = 'home';
    const G = GAME.G;
    const next = GAME.myNextMatch();
    const my = G.myClub ? DB.clubById.get(G.myClub) : null;
    const cards = [];

    // Carte 1 — Prochain match (style Youth Tournament VS)
    if (next) {
      const h = DB.clubById.get(next.m.h), a = DB.clubById.get(next.m.a);
      cards.push({
        title: 'Prochain match', sub: `${U.esc(next.comp)} · ${U.fmtDate(next.day, G.season)}`,
        action: 'Aller au match', enter: 'UI.simToNext()',
        body: `<div class="vs-duo">${this.crest(h.name, 'big')}<span class="vsword">VS</span>${this.crest(a.name, 'big')}</div>
          <div class="vs-names"><span>${U.esc(h.name)}</span><span>${U.esc(a.name)}</span></div>`
      });
    } else {
      cards.push({
        title: 'Calendrier', sub: my ? 'Saison en cours' : 'Mode spectateur',
        action: 'Continuer', enter: 'UI.continueDay()',
        body: `<div class="na-circle">N/A</div><p class="muted" style="text-align:center">Aucun match programmé prochainement.</p>`
      });
    }

    // Carte 2 — Classement (style Standings)
    if (my) {
      const L = DB.leagueById.get(my.league);
      const tblData = G.tables && G.tables[my.league];
      const st = tblData ? LEAGUE.standings(tblData) : [];
      // fenêtre de 4 autour de mon club
      let start = st.findIndex(s => s.id === my.id) - 1;
      start = Math.max(0, Math.min(start, Math.max(0, st.length - 4)));
      const tbl = st.slice(start, start + 4);
      cards.push({
        title: 'Classement', sub: U.esc(L ? L.name : 'Ligue'),
        action: 'Voir le classement', enter: `UI.table(${my.league})`,
        body: `<div class="crow head-row" style="cursor:default"><span class="pos-n">Pos</span><span class="grow">Club</span><span>Pts</span></div>` +
          (tbl.map((r, i) => {
            const c = DB.clubById.get(r.id);
            const mine = c.id === my.id ? 'style="color:var(--cyan)"' : '';
            return `<div class="crow" ${mine}><span class="pos-n">${start + i + 1}</span>${this.crest(c.name)}<b class="grow">${U.esc(c.name)}</b><span class="val">${r.pts}</span></div>`;
          }).join('') || '<p class="muted" style="text-align:center;margin-top:30px">Saison pas encore lancée.</p>')
      });
    }

    // Carte 3 — Notifications (style Inbox)
    const unreadNews = G.news.slice(0, 3);
    const nOffers = G.offers.length, nPend = (G.pendingTransfers || []).length;
    cards.push({
      title: 'Notifications', sub: `${nOffers + nPend + unreadNews.length} élément(s)`,
      action: 'Ouvrir les news', enter: 'UI.newsScreen()',
      body:
        (nOffers ? `<div class="crow" onclick="event.stopPropagation();UI.transfers()"><span class="dot-unread"></span><div class="grow"><b>Mercato</b><small>${nOffers} offre(s) reçue(s) pour vos joueurs</small></div></div>` : '') +
        (nPend ? `<div class="crow" onclick="event.stopPropagation();UI.transfers()"><span class="dot-unread"></span><div class="grow"><b>Transferts</b><small>${nPend} dossier(s) en cours</small></div></div>` : '') +
        (unreadNews.map(n => `<div class="crow"><span class="dot-unread"></span><div class="grow"><b>${U.fmtDateShort(n.day, n.season)}</b><small>${U.esc(n.txt)}</small></div></div>`).join('') ||
          (!nOffers && !nPend ? '<p class="muted" style="text-align:center;margin-top:30px">Aucune notification.</p>' : ''))
    });

    // Carte 4 — Bureau (Objectifs / Finances, style Office)
    if (my) {
      cards.push({
        title: 'Bureau', sub: U.esc(my.name),
        action: 'Entrer au bureau', enter: 'UI.club()',
        body: `<div class="stat-row"><span>Budget</span><b class="money">${U.money(GAME.budget(my.id))}</b></div>
          <div class="stat-row"><span>Rôle</span><b>${G.role === 'president' ? 'Président' : 'Coach'}</b></div>
          ${G.role === 'coach' ? `<div class="stat-row"><span>Crédibilité</span><div class="bar"><div style="width:${G.coachCredibility}%;background:var(--cyan)"></div></div><b>${G.coachCredibility}</b></div>` : ''}
          <div class="section-title">Actions</div>
          <button class="btn btn-ghost" onclick="event.stopPropagation();UI.financeScreen()">Finances</button>
          <button class="btn btn-ghost" onclick="event.stopPropagation();UI.saveScreen()">Sauvegarder / Options</button>`
      });
    } else {
      cards.push({
        title: 'Monde', sub: 'Spectateur',
        action: 'Explorer le monde', enter: 'UI.world()',
        body: `<div class="na-circle">🌍</div><button class="btn btn-ghost" onclick="event.stopPropagation();UI.saveScreen()">Sauvegarder / Options</button>`
      });
    }

    const rail = cards.map((c, i) =>
      `<div class="ccard ${i === 0 ? 'focus' : ''}" data-action="${c.action}" data-enter="${c.enter.replace(/"/g, '&quot;')}">
        <h2>${c.title}</h2><div class="csub">${c.sub}</div>
        <div class="cbody">${c.body}</div>
      </div>`).join('');

    this.render(this.shell('home',
      `<div class="card-rail">${rail}</div>
       <div class="pill-zone"><button class="btn-pill" id="pill-action"><span class="abtn">A</span><span class="pill-lbl">Entrer</span></button></div>`,
      { back: 'UI.central()', extra: `<button class="hint" onclick="UI.continueDay()"><span class="abtn dark">Y</span> Avancer d'un jour</button>` }));
    this._cardIdx = 0;
    this.bindRail();
  },

  // ---------- CENTRAL : date géante + tâches + news (style FC26) ----------
  central() {
    this.screen = 'central';
    const G = GAME.G;
    const next = GAME.myNextMatch();
    const my = G.myClub ? DB.clubById.get(G.myClub) : null;
    const nOffers = G.offers.length, nPend = (G.pendingTransfers || []).length;
    const latest = G.news[0];

    let fixture = '';
    if (next) {
      const h = DB.clubById.get(next.m.h), a = DB.clubById.get(next.m.a);
      const inDays = next.day - G.day;
      fixture = `<div class="next-fixture-lbl">Prochain match dans ${inDays} jour${inDays > 1 ? 's' : ''}</div>
        <div class="fixture-line"><span class="comp">${U.esc(next.comp)} · ${U.fmtDate(next.day, G.season)}</span></div>
        <div class="fixture-line">${this.crest(h.name)}${this.crest(a.name)}
          <div class="fixture-teams">${U.esc(h.name)}<br>${U.esc(a.name)}</div></div>`;
    } else {
      fixture = `<div class="next-fixture-lbl">Aucun match programmé</div>`;
    }

    const tasks = [
      nOffers ? `<div class="task" onclick="UI.transfers()"><span class="ticon">📨</span>${nOffers} offre(s) reçue(s) pour vos joueurs</div>` : '',
      nPend ? `<div class="task" onclick="UI.transfers()"><span class="ticon">⏳</span>${nPend} dossier(s) transfert en cours</div>` : '',
      `<div class="task" onclick="UI.newsScreen()"><span class="ticon">📰</span>${G.news.length} actualité(s) dans le monde</div>`,
      my ? `<div class="task" onclick="UI.squad()"><span class="ticon">👥</span>Gérer l'effectif</div>` : ''
    ].filter(Boolean);

    const newsCard = latest ? `<div class="news-card">
        <span class="nc-tag">Nouveau</span>
        <div class="nc-head"><span class="glyph">⚽</span><div>ACTU<small>${U.fmtDateShort(latest.day, latest.season)}</small></div></div>
        <div class="nc-visual">FE</div>
        <div class="nc-txt">${U.esc(latest.txt)}</div>
        <div class="nc-meta"><span>♥ ${(Math.random() * 90 + 5).toFixed(1)} K</span><span>💬 0.2 K</span></div>
      </div>` : '';

    this.render(this.shell('central',
      `<div class="central-wrap">
        <div class="central-left">
          <div class="big-date">${U.fmtDate(G.day, G.season)}</div>
          ${fixture}
          <button class="btn-advance primary" onclick="UI.continueDay()">Avancer</button>
          <button class="btn-advance" onclick="UI.simToNext()">Aller au prochain match</button>
          <div class="task-list">${tasks.join('')}</div>
          <div class="task-count">${tasks.length} tâche(s)</div>
        </div>
        <div class="central-right">${newsCard}</div>
      </div>`,
      { back: 'UI.home()' }));
  },

  continueDay() {
    const out = GAME.advanceDay();
    this.afterAdvance(out);
  },

  simToNext() {
    // avance jusqu'au prochain match de mon club (ou prochain événement en spectateur)
    let guard = 0;
    while (guard++ < 400) {
      const out = GAME.advanceDay();
      if (out.endOfSeason) { SAVE.save(); this.toast('Fin de saison ! Nouvelle saison lancée.'); return this.home(); }
      const pend = out.results.find(r => r.pending);
      if (pend) return this.preMatch(pend, out.results);
      if (!GAME.G.myClub && out.results.length) { SAVE.save(); return this.resultsScreen(out.results); }
    }
    this.home();
  },

  afterAdvance(out) {
    if (out.endOfSeason) { SAVE.save(); this.toast('🌍 Nouvelle saison !'); return this.home(); }
    const pend = out.results.find(r => r.pending);
    if (pend) return this.preMatch(pend, out.results);
    if (out.results.length) return this.resultsScreen(out.results);
    SAVE.save();
    this.refreshAfterAdvance();
  },

  // ---------- AVANT-MATCH ----------
  preMatch(entry, dayResults) {
    this._pending = entry; this._dayResults = dayResults;
    if (!this._simDur) this._simDur = 3;
    const h = DB.clubById.get(entry.m.h), a = DB.clubById.get(entry.m.a);
    const sh = DB.clubStrength(h.id), sa = DB.clubStrength(a.id);
    const T = (typeof TACTICS !== 'undefined') ? TACTICS.ensure() : null;
    const durBtn = d => `<button class="chip ${this._simDur === d ? 'active' : ''}" onclick="UI._simDur=${d};UI.preMatch(UI._pending, UI._dayResults)">${d} min</button>`;
    this.render(`${this.header('Jour de match')}
      <div class="content">
        <div class="scorebug">
          <div class="sb-comp">${U.esc(entry.comp)}</div>
          <div class="sb-line">
            <span class="sb-team">${U.esc(h.name)}<small>Force ${Math.round(sh.ovr)}</small></span>
            <b class="sb-score">VS</b>
            <span class="sb-team tr">${U.esc(a.name)}<small>Force ${Math.round(sa.ovr)}</small></span>
          </div>
        </div>
        ${T ? `<div class="card"><div class="section-title">Ma tactique</div>
          <div class="stat-row"><span>Formation</span><b>${T.formation}</b></div>
          <div class="stat-row"><span>Style</span><b>${TACTICS.STYLES[T.style].name}</b></div>
          <button class="btn" onclick="UI.tactics('prematch')">📋 Changer la tactique</button></div>` : ''}
        <div class="section-title">Durée de la simulation</div>
        <div class="chips">${[1, 3, 7, 20, 45].map(durBtn).join('')}</div>
        <div class="actions">
          <button class="btn btn-primary btn-big" onclick="UI.liveMatch()">📺 Suivre la simulation en direct</button>
          <button class="btn btn-big" onclick="UI.instantMatch()">⚡ Résultat instantané</button>
          <button class="btn btn-ghost" onclick="UI.squad()">👥 Voir l'effectif</button>
        </div>
      </div>`);
  },

  instantMatch() {
    const res = GAME.playMyMatch(this._pending);
    this.postMatch(res);
  },

  liveMatch() {
    const entry = this._pending;
    clearInterval(this._liveInt);
    if (this._liveRaf) cancelAnimationFrame(this._liveRaf);
    const S = LIVE.start(entry, this._simDur || 3);
    const h = DB.clubById.get(entry.m.h), a = DB.clubById.get(entry.m.a);
    this.screen = 'live';

    const myKey = entry.m.h === GAME.G.myClub ? 'H' : 'A';
    const myTeam = LIVE.T(myKey);
    const presetBtn = (key, label, icon) => `<button class="chip live-tac-chip" data-style="${key}" onclick="UI.applyLivePreset('${key}')">${icon} ${label}</button>`;

    this.render(`${this.header('Match en direct')}
      <div class="content live-content">
        <div class="scorebug live-scorebug">
          <div class="sb-comp">${U.esc(entry.comp)} · moteur spatial 2D</div>
          <div class="sb-line">
            <span class="sb-team">${U.esc(h.name)}</span>
            <b class="sb-score" id="liveScore">0 : 0</b>
            <span class="sb-team tr">${U.esc(a.name)}</span>
          </div>
          <div class="sb-clock" id="liveMin">0' · possession <span id="livePoss">50</span>% · <span id="liveTacLabel">${U.esc(myTeam.tac.styleName)}</span></div>
        </div>

        <div class="live-stage" id="liveStage">
          <canvas id="liveRadar" class="live-radar" aria-label="Radar tactique du match"></canvas>
          <div class="live-hook" id="jumpHook">Hook 3D prêt quand une grosse action arrive</div>
          <div class="live-legend"><span><i class="home-dot"></i>${U.esc(h.name)}</span><span><i class="away-dot"></i>${U.esc(a.name)}</span></div>
        </div>

        <div class="live-thumbbar speed">
          <button class="btn-mini live-speed ok" onclick="UI.setLiveSpeed(1,this)">x1</button>
          <button class="btn-mini live-speed" onclick="UI.setLiveSpeed(2,this)">x2</button>
          <button class="btn-mini live-speed" onclick="UI.setLiveSpeed(5,this)">x5</button>
          <button class="btn-mini" id="pauseBtn" onclick="UI.togglePause()">⏸️</button>
          <button class="btn-mini live-primary" onclick="UI.toggleLiveTactics()">📋 Tactique live</button>
          <span class="grow"></span>
          <button class="btn-mini" onclick="UI.openSubs()">🔁 Changements (<span id="subsLeft">5</span>)</button>
          <button class="btn-mini" onclick="UI.skipLive()">⏭ Fin</button>
        </div>

        <div class="live-drawer" id="liveTacticsPanel">
          <div class="live-drawer-head">
            <b>Consignes à la volée</b>
            <button class="btn-mini" onclick="UI.toggleLiveTactics(false)">✕</button>
          </div>
          <p class="muted small">Le radar continue pendant que tu changes les consignes. Incroyable, une interface qui ne panique pas dès qu’on touche un bouton.</p>
          <div class="chips wrap live-tac-grid">
            ${presetBtn('equilibre','Équilibré','⚖️')}
            ${presetBtn('pressing_haut','Pressing haut','🔥')}
            ${presetBtn('bloc_bas','Bloc bas','🧱')}
            ${presetBtn('possession','Possession','🔄')}
            ${presetBtn('direct','Jeu direct','⚡')}
            ${presetBtn('ailes','Ailes','↔️')}
          </div>
          <div class="live-sliders">
            <button class="btn-mini" onclick="UI.applyLiveInstruction('morePress')">Monter le pressing</button>
            <button class="btn-mini" onclick="UI.applyLiveInstruction('lessPress')">Baisser le bloc</button>
            <button class="btn-mini" onclick="UI.applyLiveInstruction('safer')">Jouer simple</button>
            <button class="btn-mini" onclick="UI.applyLiveInstruction('risk')">Prendre des risques</button>
          </div>
        </div>

        <div class="commentary" id="commentary"></div>
        <div class="subpanel" id="subPanel"></div>
      </div>`);

    const canvas = this.el('liveRadar');
    const ctx = canvas.getContext('2d', { alpha: false });
    const drawPlayer = (x, teamKey, w, h, pad) => {
      const px = pad + (x.x / 100) * (w - pad * 2);
      const py = pad + (x.y / 100) * (h - pad * 2);
      const isHolder = S.ball.state === 'owned' && S.ball.team === teamKey && LIVE.T(teamKey).xi[S.ball.idx] === x;
      const r = Math.max(4.2, Math.min(w, h) * 0.014);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = teamKey === 'H' ? '#F2F4F8' : '#F0524A';
      ctx.fill();
      ctx.lineWidth = isHolder ? 3 : 1;
      ctx.strokeStyle = isHolder ? '#7FE9F2' : 'rgba(0,0,0,.55)';
      ctx.stroke();
      if (x.fit < 38) {
        ctx.beginPath(); ctx.arc(px, py, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(242,199,75,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    };

    const drawRadar = () => {
      if (this.screen !== 'live') return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const cw = Math.max(320, Math.floor(rect.width));
      const ch = Math.max(180, Math.floor(rect.height));
      if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
        canvas.width = Math.floor(cw * dpr);
        canvas.height = Math.floor(ch * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = cw, hgt = ch, pad = Math.max(14, Math.min(w, hgt) * 0.045);

      ctx.fillStyle = '#111A15';
      ctx.fillRect(0, 0, w, hgt);
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.022)' : 'rgba(255,255,255,.007)';
        ctx.fillRect(pad + i * (w - pad * 2) / 10, pad, (w - pad * 2) / 10, hgt - pad * 2);
      }
      ctx.strokeStyle = 'rgba(255,255,255,.20)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(pad, pad, w - pad * 2, hgt - pad * 2);
      ctx.beginPath(); ctx.moveTo(w / 2, pad); ctx.lineTo(w / 2, hgt - pad); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, hgt / 2, Math.min(w, hgt) * 0.115, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeRect(pad, hgt * .31, (w - pad * 2) * .14, hgt * .38);
      ctx.strokeRect(w - pad - (w - pad * 2) * .14, hgt * .31, (w - pad * 2) * .14, hgt * .38);

      for (const key of ['H', 'A']) {
        const T = LIVE.T(key);
        T.xi.forEach(x => { if (!x.off) drawPlayer(x, key, w, hgt, pad); });
      }

      const bx = pad + (S.ball.x / 100) * (w - pad * 2);
      const by = pad + (S.ball.y / 100) * (hgt - pad * 2);
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(3.2, Math.min(w, hgt) * 0.010), 0, Math.PI * 2);
      ctx.fillStyle = '#7FE9F2';
      ctx.fill();
      ctx.shadowColor = '#7FE9F2'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;

      this._liveRaf = requestAnimationFrame(drawRadar);
    };

    const box = this.el('commentary');
    LIVE.onEvent = e => {
      if (!box) return;
      const d = document.createElement('div');
      d.className = 'news-item' + (e.type === 'goal' ? ' goal' : e.type === 'red' || e.type === 'penalty' ? ' bad' : e.type === 'chance' ? ' goal' : '');
      d.textContent = `${e.min}' ${e.txt}`;
      box.prepend(d);
      if (box.children.length > 40) box.lastChild.remove();
      if (this.el('liveScore')) this.el('liveScore').textContent = `${S.H.goals} : ${S.A.goals}`;
      if (e.type === 'goal') {
        const stage = this.el('liveStage');
        if (stage) { stage.classList.remove('goal-flash'); void stage.offsetWidth; stage.classList.add('goal-flash'); }
      }
    };

    LIVE.onHook = hook => {
      const badge = this.el('jumpHook');
      if (!badge) return;
      badge.textContent = hook.type === 'goal' ? 'Hook 3D : but prêt à rejouer' : hook.type === 'penalty' ? 'Hook 3D : penalty prêt' : 'Hook 3D : occasion dangereuse prête';
      badge.classList.add('show');
      setTimeout(() => badge.classList.remove('show'), 2200);
    };

    LIVE.onSubPrompt = info => {
      this.togglePause(true);
      this.toast(info.reason === 'red' ? '🟥 Expulsion ! Réorganise ton équipe.' : '🚑 Blessure ! Fais entrer un remplaçant.');
      this.openSubs(info.idx);
    };

    LIVE.onFinish = res => {
      clearInterval(this._liveInt);
      if (this._liveRaf) cancelAnimationFrame(this._liveRaf);
      SAVE.save();
      setTimeout(() => { if (this.screen === 'live') this.postMatch(res); }, 1000);
    };

    const phaseMs = () => (S.durMs / 94) / 3 / (S.mul || 1);
    let acc = 0, last = performance.now();
    const loop = () => {
      if (this.screen !== 'live') return clearInterval(this._liveInt);
      const now = performance.now();
      if (!S.paused && !S.over) {
        acc += now - last;
        let guard = 0;
        while (acc >= phaseMs() && !S.over && !S.paused && guard++ < 12) { LIVE.step(); acc -= phaseMs(); }
        if (this.el('liveMin')) this.el('liveMin').firstChild.textContent = S.min + "' · possession ";
        if (this.el('livePoss')) this.el('livePoss').textContent = LIVE.possession();
      }
      last = now;
    };
    this._liveInt = setInterval(loop, 60);
    drawRadar();
  },

  setLiveSpeed(m, btn) {
    if (LIVE.S) LIVE.S.mul = m;
    document.querySelectorAll('.live-speed').forEach(b => b.classList.remove('ok'));
    if (btn) btn.classList.add('ok');
  },

  toggleLiveTactics(force) {
    const panel = this.el('liveTacticsPanel');
    if (!panel) return;
    const open = force === undefined ? !panel.classList.contains('open') : !!force;
    panel.classList.toggle('open', open);
  },

  applyLivePreset(styleKey) {
    const S = LIVE.S; if (!S || S.over) return;
    const myKey = S.entry.m.h === GAME.G.myClub ? 'H' : 'A';
    LIVE.applyLiveTactics(myKey, { styleKey });
    const T = LIVE.T(myKey);
    const label = this.el('liveTacLabel');
    if (label) label.textContent = T.tac.styleName;
    document.querySelectorAll('.live-tac-chip').forEach(b => b.classList.toggle('active', b.dataset.style === styleKey));
    this.toast('Consigne appliquée : ' + T.tac.styleName);
  },

  applyLiveInstruction(kind) {
    const S = LIVE.S; if (!S || S.over) return;
    const myKey = S.entry.m.h === GAME.G.myClub ? 'H' : 'A';
    const T = LIVE.T(myKey);
    const i = T.instructions || {};
    const patch = { instructions: {} };
    if (kind === 'morePress') patch.instructions = { pressLine: U.clamp((i.pressLine || 52) + 10, 20, 86), defensiveLine: U.clamp((i.defensiveLine || 48) + 8, 20, 78), aggression: 1.18 };
    if (kind === 'lessPress') patch.instructions = { pressLine: U.clamp((i.pressLine || 52) - 12, 18, 86), defensiveLine: U.clamp((i.defensiveLine || 48) - 10, 18, 78), counter: 1.22 };
    if (kind === 'safer') patch.instructions = { passingRisk: U.clamp((i.passingRisk || 0.5) - 0.20, 0.12, 0.88), tempo: U.clamp((i.tempo || 1) - 0.16, 0.65, 1.35) };
    if (kind === 'risk') patch.instructions = { passingRisk: U.clamp((i.passingRisk || 0.5) + 0.22, 0.12, 0.92), tempo: U.clamp((i.tempo || 1) + 0.18, 0.65, 1.45) };
    LIVE.applyLiveTactics(myKey, patch);
    this.toast('Micro-consigne injectée en temps réel.');
  },

  togglePause(force) {
    const S = LIVE.S; if (!S || S.over) return;
    S.paused = force === true ? true : !S.paused;
    const b = this.el('pauseBtn');
    if (b) b.textContent = S.paused ? '▶️' : '⏸️';
  },

  // ---------- panneau de changements ----------
  openSubs(forcedOutIdx = null) {
    const S = LIVE.S; if (!S) return;
    this.togglePause(true);
    const myKey = S.entry.m.h === GAME.G.myClub ? 'H' : 'A';
    const T = LIVE.T(myKey);
    this._subOut = forcedOutIdx;
    const panel = this.el('subPanel');
    if (!panel) return;

    const xiRows = T.xi.map((x, i) => {
      if (x.off && x.offReason !== null && i !== forcedOutIdx) {
        if (x.offReason === 'red') return `<div class="row small-row" style="opacity:.5"><span>🟥 ${U.esc(x.p.name)}</span><span class="muted small">expulsé</span></div>`;
        if (x.offReason === 'sub') return '';
        if (x.offReason === 'injury' && i !== forcedOutIdx) return `<div class="row small-row" style="opacity:.5"><span>🚑 ${U.esc(x.p.name)}</span><span class="muted small">blessé</span></div>`;
      }
      if (x.off && x.offReason === 'sub') return '';
      const fitColor = x.fit >= 60 ? 'var(--acc)' : x.fit >= 40 ? 'var(--gold)' : 'var(--red)';
      const sel = this._subOut === i ? ' mine' : '';
      return `<div class="row small-row${sel}" onclick="UI.pickSubOut(${i})">
        <div><b>${U.esc(x.p.name)}</b> <span class="muted small">${x.p.pos}${x.yellow ? ' 🟨' : ''}</span>
        <div class="bar" style="margin-top:4px"><div style="width:${Math.round(x.fit)}%;background:${fitColor}"></div></div></div>
        <b style="color:${x.rating >= 7 ? 'var(--acc)' : x.rating < 5.5 ? 'var(--red)' : 'var(--fg)'}">${x.rating.toFixed(1)}</b>
      </div>`;
    }).join('');

    const benchRows = T.bench.map(p => {
      const fit = Math.round(U.clamp(GAME.pstate(p.id).fit || 100, 40, 100));
      return `<div class="row small-row" onclick="UI.pickSubIn(${p.id})">
        <div><b>${U.esc(p.name)}</b> <span class="muted small">${p.pos} · ${fit}% énergie</span></div>
        <span class="badge" style="color:${U.ovrColor(p.ovr)}">${p.ovr}</span>
      </div>`;
    }).join('');

    panel.innerHTML = `<div class="card" style="border-color:var(--acc)">
      <div class="section-title">🔁 Changements — reste ${T.subsLeft}</div>
      <p class="muted small" style="margin-bottom:8px">${this._subOut !== null && T.xi[this._subOut] ? `Sortant : <b>${U.esc(T.xi[this._subOut].p.name)}</b>. Choisis l'entrant sur le banc.` : '1. Touche le joueur qui sort. 2. Touche le remplaçant.'}</p>
      <div class="section-title">Sur le terrain</div>${xiRows}
      <div class="section-title">Banc</div>${benchRows || '<div class="muted small">Banc vide.</div>'}
      <button class="btn btn-ghost" onclick="UI.closeSubs()">Fermer et reprendre ▶️</button>
    </div>`;
    panel.scrollIntoView({ behavior: 'smooth' });
  },

  pickSubOut(i) { this._subOut = i; this.openSubs(i); },

  pickSubIn(pid) {
    if (this._subOut === null || this._subOut === undefined) return this.toast('Choisis d\'abord le joueur qui sort.');
    const S = LIVE.S;
    const myKey = S.entry.m.h === GAME.G.myClub ? 'H' : 'A';
    const r = LIVE.doSub(myKey, this._subOut, pid);
    this.toast(r.msg);
    if (r.ok) {
      this._subOut = null;
      const sl = this.el('subsLeft'); if (sl) sl.textContent = LIVE.T(myKey).subsLeft;
      this.openSubs();
    }
  },

  closeSubs() {
    const panel = this.el('subPanel');
    if (panel) panel.innerHTML = '';
    this._subOut = null;
    if (LIVE.S && LIVE.S.needSubPrompt) LIVE.S.needSubPrompt = null;
    this.togglePause();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  skipLive() {
    if (!LIVE.S) return;
    clearInterval(this._liveInt);
    if (this._liveRaf) cancelAnimationFrame(this._liveRaf);
    LIVE.S.fastForward = true;
    LIVE.S.paused = false;
    let guard = 0;
    while (!LIVE.S.over && guard++ < 1500) {
      LIVE.S.paused = false;
      LIVE.step();
    }
    if (!LIVE.S.over) LIVE.finish();
  },

  postMatch(res) {
    clearTimeout(this._liveTimer); clearTimeout(this._jiggleTimer); clearInterval(this._liveInt);
    if (this._liveRaf) cancelAnimationFrame(this._liveRaf);
    this.screen = 'postmatch';
    const entry = this._pending;
    const h = DB.clubById.get(entry.m.h), a = DB.clubById.get(entry.m.a);
    const goals = res.events.filter(e => e.type === 'goal').map(e => `<div class="news-item goal">${U.esc(e.txt)}</div>`).join('');
    const other = res.events.filter(e => e.type !== 'goal').map(e => `<div class="news-item">${U.esc(e.txt)}</div>`).join('');
    // notes
    const ratingsRow = xi => xi.map(p => {
      const s = res.stats.get(p.id);
      return `<div class="rating-row"><span>${U.esc(p.name)}</span><b style="color:${s.rating >= 7.5 ? '#3fb950' : s.rating < 5.5 ? '#f85149' : '#c9d1d9'}">${s.rating.toFixed(1)}</b></div>`;
    }).join('');
    const won = (entry.m.h === GAME.G.myClub && res.gh > res.ga) || (entry.m.a === GAME.G.myClub && res.ga > res.gh);
    const draw = res.gh === res.ga;
    SAVE.save();
    this.render(`${this.header('Résultat')}
      <div class="content">
        <div class="card match-card big ${won ? 'win' : draw ? '' : 'loss'}">
          <div class="muted small">${U.esc(entry.comp)} — Terminé</div>
          <div class="vs big"><span>${U.esc(h.name)}</span><b>${res.gh} - ${res.ga}</b><span>${U.esc(a.name)}</span></div>
          <div class="verdict">${won ? '✅ Victoire !' : draw ? '➖ Match nul' : '❌ Défaite'}</div>
        </div>
        ${goals}${other}
        <div class="section-title">Notes — ${U.esc(h.name)}</div>${ratingsRow(res.xiH)}
        <div class="section-title">Notes — ${U.esc(a.name)}</div>${ratingsRow(res.xiA)}
        <button class="btn btn-primary btn-big" onclick="UI.finishDay()">Continuer</button>
      </div>`);
  },

  finishDay() {
    // reste-t-il d'autres matchs de mon club aujourd'hui (rare) ?
    const pend = (this._dayResults || []).find(r => r.pending && r.m.gh === null);
    if (pend) return this.preMatch(pend, this._dayResults);
    if (GAME.G.lastResults && GAME.G.lastResults.length) return this.resultsScreen(GAME.G.lastResults);
    this.home();
  },

  // ---------- RÉSULTATS DU JOUR ----------
  resultsScreen(results) {
    const byComp = {};
    for (const r of results.filter(x => !x.pending)) (byComp[r.comp] = byComp[r.comp] || []).push(r);
    let html = '';
    for (const [comp, rs] of Object.entries(byComp)) {
      html += `<div class="section-title">${U.esc(comp)}</div>`;
      for (const r of rs.slice(0, 12)) {
        const h = DB.clubById.get(r.m.h), a = DB.clubById.get(r.m.a);
        html += `<div class="row small-row"><span>${U.esc(h.name)}</span><b>${r.m.gh} - ${r.m.ga}</b><span class="tr">${U.esc(a.name)}</span></div>`;
      }
      if (rs.length > 12) html += `<div class="muted small" style="padding:4px 12px">… et ${rs.length - 12} autres matchs</div>`;
    }
    this.render(`${this.header('Résultats du jour')}
      <div class="content">${html || '<div class="muted">Journée calme dans le monde du football.</div>'}
      <button class="btn btn-primary btn-big" onclick="UI.home()">Continuer</button></div>${this.nav('home')}`);
  },

  // ---------- EFFECTIF ----------
  squad(clubId) {
    this.screen = 'squad';
    this._squadClubId = clubId;
    const cid = clubId || GAME.G.myClub;
    if (!cid) return this.world();
    const c = DB.clubById.get(cid);
    const sq = DB.squadOf(cid).slice().sort((a, b) => {
      const ord = { GK: 0, DF: 1, MF: 2, AT: 3 };
      return ord[a.group] - ord[b.group] || b.ovr - a.ovr;
    });
    const rows = sq.map(p => {
      const st = GAME.pstate(p.id);
      const tBadge = TRANSFERS.statusBadge(p.id);
      const flags = (st.inj > 0 ? ' 🚑' : '') + (st.susp > 0 ? ' 🟥' : '') + (tBadge ? ' ' + tBadge : '');
      return `<div class="row" onclick="UI.playerProfile(${p.id})">
        <div><b>${U.esc(p.name)}</b>${flags}<br><span class="muted small">${U.esc(p.mainPos)} · ${p.age} ans · ${U.esc(p.nat)} · forme ${st.form.toFixed(0)}/10</span></div>
        <div class="tr"><span class="badge" style="color:${U.ovrColor(p.ovr)}">${p.ovr}</span><br><span class="muted small">${U.money(p.value)}</span></div>
      </div>`;
    }).join('');
    this.render(`${this.header(c.name)}<div class="content"><div class="muted small" style="padding:0 4px 8px">${sq.length} joueurs · valeur ${U.money(sq.reduce((a, p) => a + p.value, 0))}</div>${rows}</div>${this.nav('squad')}`);
  },

  playerProfile(pid) {
    const p = DB.byId.get(pid);
    const st = GAME.pstate(pid);
    const c = p.club ? DB.clubById.get(p.club) : null;
    const isMine = p.club === GAME.G.myClub;
    const isGK = p.group === 'GK';
    const stats = isGK
      ? [['Plongeon', p.gkDiv], ['Jeu main', p.gkHan], ['Dégagement', p.gkKic], ['Placement', p.gkPos], ['Réflexes', p.gkRef], ['Vitesse', p.pace]]
      : [['Vitesse', p.pace], ['Tir', p.sho], ['Passe', p.pas], ['Dribble', p.dri], ['Défense', p.def], ['Physique', p.phy]];
    const bar = (lb, v) => `<div class="stat-row"><span>${lb}</span><div class="bar"><div style="width:${v}%;background:${U.ovrColor(v)}"></div></div><b>${v}</b></div>`;
    this.render(`${this.header('Profil joueur')}
      <div class="content">
        <div class="card">
          <div class="profile-head">
            <div class="big-ovr" style="color:${U.ovrColor(p.ovr)}">${p.ovr}</div>
            <div><h3>${U.esc(p.fullName || p.name)}</h3>
              <span class="muted small">${U.esc(p.pos)} · ${p.age} ans · ${p.height} cm · ${U.esc(p.nat)}</span><br>
              <span class="muted small">${c ? U.esc(c.name) : 'Agent libre'} · contrat ${p.contract} · ${U.money(p.wage)}/sem</span><br>
              <span class="small">Valeur : <b class="money">${U.money(p.value)}</b> · Potentiel estimé : <b>${p.pot >= p.ovr + 8 ? '⭐ très élevé' : p.pot >= p.ovr + 3 ? 'élevé' : 'atteint'}</b></span>
            </div>
          </div>
        </div>
        <div class="card">${stats.map(([l, v]) => bar(l, v)).join('')}</div>
        <div class="card">
          <div class="stat-row"><span>Forme</span><b>${st.form.toFixed(1)}/10</b></div>
          <div class="stat-row"><span>Condition</span><b>${Math.round(st.fit)}%</b></div>
          <div class="stat-row"><span>Moral</span><b>${st.morale}%</b></div>
          ${st.inj > 0 ? `<div class="stat-row"><span>🚑 Blessé</span><b>${st.inj} jours</b></div>` : ''}
          <div class="stat-row"><span>Saison</span><b>${st.apps} m. · ${st.goals} buts · ${st.assists} p.d.</b></div>
          ${st.apps ? `<div class="stat-row"><span>Note moyenne</span><b>${(st.sumRating / st.apps).toFixed(2)}</b></div>` : ''}
        </div>
        ${isMine ? `<div class="card"><div class="section-title">Statut mercato</div>
          <div class="chips wrap">
            <button class="chip ${(st.transferStatus || 'normal') === 'normal' ? 'active' : ''}" onclick="UI.setTransferStatus(${pid},'normal')">Normal</button>
            <button class="chip ${(st.transferStatus || '') === 'sell' ? 'active' : ''}" onclick="UI.setTransferStatus(${pid},'sell')">À vendre</button>
            <button class="chip ${(st.transferStatus || '') === 'loan' ? 'active' : ''}" onclick="UI.setTransferStatus(${pid},'loan')">À prêter</button>
            <button class="chip ${(st.transferStatus || '') === 'unavailable' ? 'active' : ''}" onclick="UI.setTransferStatus(${pid},'unavailable')">Intransférable</button>
          </div>
          <p class="muted small">${GAME.G.role === 'coach' ? 'Coach : vous demandez ou forcez seulement avec assez de crédibilité. Le Président peut refuser, parce que visiblement les hiérarchies existent.' : 'Président : vous avez le dernier mot sur ventes, prêts et statut financier.'}</p>
          <button class="btn btn-danger" onclick="UI.forceSale(${pid})">🚨 Forcer la vente</button></div>` : ''}
        ${st.loan && st.loan.from === GAME.G.myClub ? `<button class="btn" onclick="UI.recallLoan(${pid})">🔙 Rappeler de prêt</button>` : ''}
        ${!isMine && GAME.G.myClub ? `<button class="btn btn-primary" onclick="UI.offerFor(${pid})">${GAME.G.role === 'coach' ? '📝 Demander au Président' : '💰 Négocier'} avec ${c ? U.esc(c.name) : 'agent libre'} (~${U.money(TRANSFERS.askingPrice(p))})</button><button class="btn" onclick="UI.toggleWatch(${pid},'shortlist')">⭐ Shortlist</button><button class="btn" onclick="UI.toggleWatch(${pid},'watchlist')">👀 Watchlist</button>` : ''}
        <button class="btn btn-ghost" onclick="UI.squad(${p.club || GAME.G.myClub || DB.clubs[0].id})">‹ Retour</button>
      </div>`);
  },

  offerFor(pid, loan = false) {
    const r = GAME.G.role === 'coach' ? TRANSFERS.requestRecruitment(pid, loan) : TRANSFERS.openNegotiation(pid);
    if (!r.ok) { this.toast(r.msg); SAVE.save(); return this.playerProfile(pid); }
    if (r.requestOnly) { this.toast(r.msg); SAVE.save(); return this.transfers(); }
    if (r.freeAgent) {
      const s = TRANSFERS.signFreeAgent(pid);
      this.toast(s.msg);
      if (s.ok) { SAVE.save(); this.squad(); }
      return;
    }
    this.negotiationScreen();
  },

  cancelPendingTransfer(id) {
    const r = TRANSFERS.requestCancelPending(id);
    this.toast(r && r.msg ? r.msg : 'Demande traitée.');
    SAVE.save();
    this.transfers();
  },

  setTransferStatus(pid, status) {
    const r = TRANSFERS.setStatus(pid, status);
    this.toast(r && r.msg ? r.msg : 'Statut modifié.');
    SAVE.save();
    this.playerProfile(pid);
  },

  forceSale(pid) {
    const r = TRANSFERS.forceSale(pid);
    this.toast(r.msg);
    SAVE.save();
    return r.ok ? this.squad() : this.playerProfile(pid);
  },

  recallLoan(pid) {
    const r = TRANSFERS.recallLoan(pid);
    this.toast(r.msg);
    SAVE.save();
    this.playerProfile(pid);
  },

  toggleWatch(pid, kind) {
    const r = TRANSFERS.toggleList(pid, kind);
    this.toast((kind === 'watchlist' ? 'Watchlist : ' : 'Shortlist : ') + r.msg);
    SAVE.save();
    this.playerProfile(pid);
  },

  negotiationScreen() {
    const n = GAME.G.negotiation;
    if (!n) return this.transfers();
    const p = DB.byId.get(n.pid), seller = DB.clubById.get(n.from);
    const history = n.history.map(x => `<div class="news-item">${U.esc(x)}</div>`).join('');
    const isAgent = n.phase === 'agent';
    this.render(`${this.header('Négociation')}
      <div class="content">
        <div class="card"><h3>${U.esc(p.name)}</h3>
          <div class="muted small">${U.esc(seller.name)} · ${p.age} ans · ${p.mainPos} · valeur ${U.money(p.value)} · statut ${TRANSFERS.statusLabel(n.status)}</div>
          <div class="stat-row"><span>Argent total</span><b class="money">${U.money(GAME.budget(GAME.G.myClub))}</b></div>
          <div class="stat-row"><span>Mercato autorisé</span><b class="money">${U.money(GAME.transferBudget ? GAME.transferBudget(GAME.G.myClub) : GAME.budget(GAME.G.myClub))}</b></div>
          <div class="stat-row"><span>Tour</span><b>${n.round}/${n.maxRounds}</b></div>
        </div>
        ${isAgent ? `
          <div class="card win"><b>Accord club trouvé.</b><br><span class="muted small">Il reste le joueur et son agent. Oui, encore des humains autour d'une table.</span></div>
          <label class="field-label">Salaire hebdomadaire</label>
          <input id="negoWage" class="input" value="${Math.round(n.wantedWage)}" inputmode="decimal">
          <label class="field-label">Commission agent</label>
          <input id="negoCom" class="input" value="${Math.round(n.agentCommission)}" inputmode="decimal">
          <button class="btn btn-primary" onclick="UI.sendAgentOffer()">🤝 Finaliser avec l'agent</button>` : `
          <label class="field-label">Offre de transfert ou indemnité de prêt</label>
          <input id="negoFee" class="input" value="${(n.ask / 1e6).toFixed(1)}M" inputmode="decimal">
          <label class="field-label">Pourcentage à la revente</label>
          <input id="negoSellOn" class="input" value="${n.sellOn || 0}" inputmode="numeric">
          <div class="chips wrap"><button class="chip active" onclick="UI.sendClubOffer(false)">Achat</button><button class="chip" onclick="UI.sendClubOffer(true)">Prêt</button></div>`}
        <div class="section-title">Historique de discussion</div>${history}
        <button class="btn btn-ghost" onclick="GAME.G.negotiation=null;UI.playerProfile(${p.id})">Quitter la table</button>
      </div>${this.nav('transfers')}`);
  },

  sendClubOffer(loan) {
    const fee = U.parseMoney(this.el('negoFee').value, false);
    const sellOn = Number(this.el('negoSellOn')?.value || 0);
    if (!Number.isFinite(fee) || fee < 0) return this.toast('Montant invalide. Écris par exemple 10M, 10.5M ou 10000000. La civilisation survivra peut-être.');
    const r = TRANSFERS.clubOffer(fee, sellOn, loan);
    this.toast(r.msg);
    if (r.done) { GAME.G.negotiation = null; SAVE.save(); return this.transfers(); }
    SAVE.save(); this.negotiationScreen();
  },

  sendAgentOffer() {
    const wage = U.parseMoney(this.el('negoWage').value, false);
    const com = U.parseMoney(this.el('negoCom').value, false);
    if (!Number.isFinite(wage) || !Number.isFinite(com)) return this.toast('Montant invalide.');
    const r = TRANSFERS.agentOffer(wage, com);
    this.toast(r.msg);
    SAVE.save();
    if (r.ok) return this.squad();
    this.negotiationScreen();
  },

  // ---------- CLASSEMENT ----------
  table(leagueId) {
    this.screen = 'table';
    this._tableLeagueId = leagueId;
    const lid = leagueId || (GAME.G.myClub ? DB.clubById.get(GAME.G.myClub).league : DB.leagues[0].id);
    const L = DB.leagueById.get(lid);
    const st = LEAGUE.standings(GAME.G.tables[lid]);
    const rows = st.map((s, i) => {
      const c = DB.clubById.get(s.id);
      const mine = s.id === GAME.G.myClub;
      return `<div class="row small-row ${mine ? 'mine' : ''}" onclick="UI.squad(${s.id})">
        <span class="pos-n">${i + 1}</span><span class="grow">${U.esc(c.name)}</span>
        <span class="muted">${s.j}</span><span class="muted">${s.diff > 0 ? '+' : ''}${s.diff}</span><b>${s.pts}</b></div>`;
    }).join('');
    const scorers = LEAGUE.topScorers(lid, 5).map((x, i) =>
      `<div class="row small-row"><span class="pos-n">${i + 1}</span><span class="grow">${U.esc(x.p.name)} <span class="muted small">(${U.esc((DB.clubById.get(x.p.club) || {}).name || '')})</span></span><b>${x.st.goals} ⚽</b></div>`).join('');
    this.render(`${this.header(L.name)}
      <div class="content">
        <button class="btn btn-ghost" onclick="UI.leagueList()">🌍 Changer de championnat</button>
        <div class="row head-row"><span class="pos-n">#</span><span class="grow">Club</span><span>J</span><span>+/-</span><b>Pts</b></div>
        ${rows}
        <div class="section-title">Meilleurs buteurs</div>${scorers || '<div class="muted small">Pas encore de buteur.</div>'}
      </div>${this.nav('table')}`);
  },

  leagueList() {
    let html = `<div class="topbar"><button class="btn-back" onclick="UI.table()">‹</button><h2>Championnats du monde</h2></div><div class="list">`;
    for (const L of DB.leagues) html += `<div class="row" onclick="UI.table(${L.id})"><div><b>${U.esc(L.name)}</b><br><span class="muted small">${U.esc(L.country)} · Div. ${L.level}</span></div><span class="badge">${L.avg}</span></div>`;
    this.render(html + '</div>');
  },

  // ---------- MERCATO ----------
  transfers() {
    this.screen = 'transfers';
    const G = GAME.G;
    const open = TRANSFERS.windowOpen(G.day);
    const activeNego = G.negotiation ? `<div class="card alert" onclick="UI.negotiationScreen()">🤝 Négociation en cours : reprendre le dossier</div>` : '';
    const pending = (G.pendingTransfers || []).map(t => {
      const p = DB.byId.get(t.pid), from = t.from ? DB.clubById.get(t.from) : null;
      if (!p) return '';
      const cancelTxt = G.role === 'coach' ? (t.cancelRequested ? '⏳ Arrêt demandé' : '🛑 Demander arrêt') : '🛑 Annuler dossier';
      const cancelDisabled = t.cancelRequested ? 'disabled' : '';
      const kind = t.type === 'loan' ? 'Prêt' : t.type === 'free' ? 'Agent libre' : 'Achat';
      const details = `${kind}${from ? ` · ${U.esc(from.name)}` : ''} · ${U.money(t.fee || 0)} · échéance ${U.fmtDateShort(t.deadlineDay, G.season)}`;
      return `<div class="card alert">
        <b>⏳ ${U.esc(p.name)}</b><br>
        <span class="muted small">${details}</span>
        <div class="stat-row"><span>${U.esc(t.stage || 'Dossier en cours')}</span><b>${Math.round(t.progress || 0)}/100</b></div>
        <div class="bar"><div style="width:${Math.min(100, Math.max(0, t.progress || 0))}%"></div></div>
        <div class="muted small">Début ${U.fmtDateShort(t.startDay, G.season)} · estimation ${t.etaDays || '?'} jour(s)${t.cancelRequested ? ' · demande d’arrêt envoyée au Président' : ''}</div>
        <button class="btn-mini" ${cancelDisabled} onclick="UI.cancelPendingTransfer('${String(t.id).replace(/'/g, '')}')">${cancelTxt}</button>
      </div>`;
    }).join('');
    const offers = G.offers.map((o, i) => {
      const p = DB.byId.get(o.pid), b = DB.clubById.get(o.from);
      if (!p || !b) return '';
      const loanTxt = o.type === 'loan' ? `demande un <b>prêt</b> de` : 'propose';
      const details = o.type === 'loan' ? ` · prise salaire ${o.wageShare || 0}%` : ` · valeur ${U.money(p.value)}`;
      return `<div class="card">
        <b>${U.esc(b.name)}</b> ${loanTxt} <b>${U.esc(p.name)}</b><br>
        <span class="money">${U.money(o.fee)}</span><span class="muted small">${details}</span>
        <div class="actions-inline">
          <button class="btn-mini ok" onclick="UI.acceptIncomingOffer(${i})">${GAME.G.role === 'coach' ? '📝 Recommander' : '✅ Accepter'}</button>
          <button class="btn-mini" onclick="UI.counterIncomingOffer(${i})">↩️ Contre-offre</button>
          <button class="btn-mini" onclick="UI.rejectIncomingOffer(${i})">${GAME.G.role === 'coach' ? '📝 Conseiller refus' : '❌ Refuser'}</button>
        </div></div>`;
    }).join('');
    const log = G.transferLog.slice(0, 12).map(t => {
      const p = DB.byId.get(t.pid);
      const kind = t.type === 'loan' ? ' prêt ' : t.type === 'forced_sale' ? ' vente forcée ' : ' ';
      return `<div class="news-item">${U.esc(p ? p.name : '?')} : ${U.esc((DB.clubById.get(t.from) || {}).name || 'libre')} → ${U.esc((DB.clubById.get(t.to) || {}).name || '?')} (${kind}${U.money(t.fee)})</div>`;
    }).join('');
    const reqs = (G.recruitmentRequests || []).slice(0, 5).map(r => {
      const p = DB.byId.get(r.pid);
      const icon = r.status === 'approved_pending' ? '⏳' : r.status === 'accepted' ? '✅' : '❌';
      const label = r.status === 'approved_pending' ? 'approuvé, négociation en cours' : r.status === 'accepted' ? 'accepté' : 'refusé';
      return `<div class="news-item">${icon} ${p ? U.esc(p.name) : '?'} · ${r.loan ? 'prêt' : 'achat'} · ${label} · score Président ${r.score}/100</div>`;
    }).join('');
    const deadline = open && (G.day >= 28 && G.day <= 31 || G.day >= 180 && G.day <= 183) ? `<div class="card alert">⏰ Deadline Day proche : les offres deviennent plus rapides, plus risquées, et les gens prétendent appeler ça une stratégie.</div>` : '';
    const transferFinance = GAME.G.myClub && typeof OWNER !== 'undefined' ? OWNER.ffp(GAME.G.myClub) : null;
    const budgetCard = transferFinance ? `<div class="card ${transferFinance.status === 'conforme' ? 'win' : transferFinance.status === 'attention' ? 'alert' : 'loss'}"><div class="section-title">Budget mercato autorisé</div><div class="stat-row"><span>Argent total</span><b class="money">${U.money(GAME.budget(GAME.G.myClub))}</b></div><div class="stat-row"><span>Mercato utilisable</span><b class="money">${U.money(transferFinance.authorized)}</b></div><div class="stat-row"><span>Statut FPF</span><b>${transferFinance.status.toUpperCase()}</b></div><button class="btn" onclick="UI.fairPlayScreen()">⚖️ Détails fair-play financier</button></div>` : '';
    const roleCard = GAME.G.myClub ? `<div class="card"><div class="section-title">Pouvoirs du rôle</div>${G.role === 'coach' ? `<div class="stat-row"><span>Crédibilité Coach</span><b>${G.coachCredibility}/100</b></div><p class="muted small">Vous ne négociez pas directement. Vous envoyez des demandes au Président. Vente forcée seulement si crédibilité très haute.</p>` : `<p class="muted small">Président : vous avez le dernier mot sur transferts, ventes forcées, budget et rentabilité.</p>`}</div>` : '';
    this.render(`${this.header('Mercato')}
      <div class="content">
        <div class="card ${open ? 'win' : ''}">${open ? '🟢 ' + TRANSFERS.windowName(G.day).toUpperCase() + ' OUVERT' : '🔴 Mercato fermé — prochaine fenêtre en janvier / été'}</div>
        ${deadline}${budgetCard}${roleCard}${activeNego}
        ${pending ? `<div class="section-title">Dossiers transfert en cours</div>${pending}` : ''}
        ${GAME.G.myClub ? `<button class="btn btn-primary" onclick="UI.searchPlayers()">🔎 Rechercher des joueurs</button>` : ''}
        ${reqs ? `<div class="section-title">Demandes Coach → Président</div>${reqs}` : ''}
        ${offers ? `<div class="section-title">Offres reçues</div>${offers}` : ''}
        <div class="section-title">Derniers transferts dans le monde</div>
        ${log || '<div class="muted small">Aucun transfert récent.</div>'}
      </div>${this.nav('transfers')}`);
  },

  acceptIncomingOffer(idx) {
    const r = TRANSFERS.acceptOffer(idx);
    this.toast(r && r.msg ? r.msg : 'Offre traitée.');
    SAVE.save(); this.transfers();
  },

  rejectIncomingOffer(idx) {
    const r = TRANSFERS.rejectOffer(idx);
    this.toast(r && r.msg ? r.msg : 'Offre refusée.');
    SAVE.save(); this.transfers();
  },

  counterIncomingOffer(idx) {
    const o = GAME.G.offers[idx];
    if (!o) return this.toast('Offre introuvable.');
    const p = DB.byId.get(o.pid);
    const val = prompt(`Contre-offre pour ${p.name}. Tu peux écrire 10M, 10.5M ou 10000000.`, U.money(Math.round(o.fee * 1.18)));
    if (val === null) return;
    const fee = U.parseMoney(val, true);
    if (!Number.isFinite(fee) || fee <= 0) return this.toast('Montant invalide. Exemple : 10M ou 10000000.');
    const r = TRANSFERS.counterOffer(idx, fee);
    this.toast(r.msg);
    SAVE.save(); this.transfers();
  },

  searchResults(query) {
    const q = U.normalize(query || '');
    const my = DB.clubById.get(GAME.G.myClub);
    const budget = (GAME.transferBudget ? GAME.transferBudget(my.id) : GAME.budget(my.id));
    const mode = this._searchMode || (GAME.G.role === 'president' ? 'value' : 'need');
    let results = [];
    const base = DB.players.filter(p => !p.retired && p.club !== GAME.G.myClub);
    if (q.length >= 2) {
      results = base.filter(p => {
        const hay = U.normalize(`${p.name} ${p.fullName || ''} ${p.nat || ''} ${p.mainPos || ''} ${(DB.clubById.get(p.club) || {}).name || 'Libre'}`);
        return hay.includes(q);
      });
    } else {
      results = base.filter(p => p.age < 34 && (p.club ? true : p.ovr >= my.rep - 10));
    }
    if (mode === 'free') results = results.filter(p => !p.club);
    if (mode === 'loan') results = results.filter(p => p.age <= 23 || (GAME.pstate(p.id).transferStatus || '') === 'loan');
    if (mode === 'young') results = results.filter(p => p.age <= 23 && p.pot >= p.ovr + 5);
    if (mode === 'budget') results = results.filter(p => !p.club || (p.value || 0) < budget);
    if (mode === 'need') results = results.filter(p => TRANSFERS.roleNeedScore(p, my.id) >= 10 || p.ovr >= my.rep - 3);
    if (mode === 'value') results = results.filter(p => p.age <= 26 && (p.pot >= p.ovr + 4 || !p.club || (p.value || 0) < budget * 0.45));
    return results.sort((a, b) => {
      const sa = (mode === 'need' ? TRANSFERS.roleNeedScore(a, my.id) * 2 : 0) + a.ovr + (a.pot - a.ovr) * 0.35 - (a.value || 0) / Math.max(1, budget) * 8;
      const sb = (mode === 'need' ? TRANSFERS.roleNeedScore(b, my.id) * 2 : 0) + b.ovr + (b.pot - b.ovr) * 0.35 - (b.value || 0) / Math.max(1, budget) * 8;
      return sb - sa;
    }).slice(0, q.length >= 2 ? 60 : 40);
  },

  playerSearchRow(p) {
    const club = DB.clubById.get(p.club);
    const st = GAME.pstate(p.id);
    const status = st.transferStatus && st.transferStatus !== 'normal' ? ` · ${TRANSFERS.statusLabel(st.transferStatus)}` : '';
    return `<div class="row" onclick="UI.playerProfile(${p.id})">
      <div><b>${U.esc(p.name)}</b><br><span class="muted small">${U.esc(p.mainPos)} · ${p.age} ans · ${U.esc(club ? club.name : 'Libre')}${status}</span></div>
      <div class="tr"><span class="badge" style="color:${U.ovrColor(p.ovr)}">${p.ovr}</span><br><span class="muted small">${U.money(p.value)}</span></div></div>`;
  },

  searchPlayers(q) {
    this.screen = 'search';
    const query = q !== undefined ? q : (this._q || '');
    this._q = query;
    const rows = this.searchResults(query).map(p => this.playerSearchRow(p)).join('');
    const modes = GAME.G.role === 'coach'
      ? [['need','Besoins Coach'],['loan','Prêts jeunes'],['free','Libres'],['young','Potentiel']]
      : [['value','Rentables'],['budget','Dans budget'],['free','Libres'],['young','Revente']];
    this.render(`<div class="topbar"><button class="btn-back" onclick="UI.transfers()">‹</button><h2>Recherche</h2></div>
      <div class="content">
        <input id="playerSearchInput" class="input" placeholder="Nom, club, pays, poste…" value="${U.esc(query)}" oninput="UI.searchPlayersLive(this.value)" autocomplete="off" autocapitalize="none" spellcheck="false" autofocus>
        <div class="chips wrap">${modes.map(([k,l]) => `<button class="chip ${(this._searchMode || modes[0][0]) === k ? 'active' : ''}" onclick="UI._searchMode='${k}';UI.searchPlayers(UI._q||'')">${l}</button>`).join('')}</div>
        <div id="searchHint" class="muted small" style="padding:8px 4px">${query.length < 2 ? 'Suggestions selon votre rôle :' : 'Résultats :'}</div>
        <div id="playerSearchResults">${rows || '<div class="muted">Aucun résultat.</div>'}</div>
      </div>`);
    setTimeout(() => { const i = this.el('playerSearchInput'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 40);
  },

  searchPlayersLive(q) {
    this._q = q;
    const box = this.el('playerSearchResults');
    const hint = this.el('searchHint');
    if (!box) return this.searchPlayers(q);
    const rows = this.searchResults(q).map(p => this.playerSearchRow(p)).join('');
    if (hint) hint.textContent = q.length < 2 ? 'Suggestions selon votre rôle :' : 'Résultats :';
    box.innerHTML = rows || '<div class="muted">Aucun résultat.</div>';
  },

  // ---------- MONDE ----------
  world() {
    this.screen = 'world';
    const cup = GAME.G.cup;
    let cupHtml = '';
    if (cup.stage === 'groups') {
      cupHtml = cup.groups.map((g, gi) => {
        const t = {}; g.forEach(id => t[id] = cup.groupTable[id]);
        const st = LEAGUE.standings(t);
        return `<div class="section-title">Groupe ${String.fromCharCode(65 + gi)}</div>` + st.map((s, i) => {
          const c = DB.clubById.get(s.id);
          return `<div class="row small-row ${s.id === GAME.G.myClub ? 'mine' : ''}"><span class="pos-n">${i + 1}</span><span class="grow">${U.esc(c.name)}</span><span class="muted">${s.j}</span><b>${s.pts}</b></div>`;
        }).join('');
      }).join('');
    } else {
      cupHtml = cup.koRounds.map(r => `<div class="section-title">${r.label}</div>` + r.matches.map(m => {
        const h = DB.clubById.get(m.h), a = DB.clubById.get(m.a);
        return `<div class="row small-row"><span>${U.esc(h.name)}</span><b>${m.gh === null ? 'vs' : m.gh + ' - ' + m.ga}</b><span class="tr">${U.esc(a.name)}</span></div>`;
      }).join('')).join('');
      if (cup.winner) cupHtml = `<div class="card win">🏆 Vainqueur : <b>${U.esc(DB.clubById.get(cup.winner).name)}</b></div>` + cupHtml;
    }
    const nc = GAME.G.natCup;
    const ncHtml = nc ? `<div class="section-title">🏆 Coupe Nationale (${U.esc(nc.country)})</div>
      <div class="card">${nc.winner ? 'Vainqueur : <b>' + U.esc(DB.clubById.get(nc.winner).name) + '</b>' : nc.alive.includes(GAME.G.myClub) ? '✅ Votre club est toujours en course ! ' + nc.alive.length + ' clubs restants.' : nc.alive.length + ' clubs encore en course.'}</div>` : '';
    this.render(`${this.header('Le Monde')}
      <div class="content">
        <button class="btn" onclick="UI.leagueList()">🌍 Tous les championnats (51)</button>
        <button class="btn" onclick="UI.financeScreen()">💶 Finances du club</button>
        <button class="btn" onclick="UI.newsScreen()">📰 Toutes les actualités</button>
        <button class="btn" onclick="UI.historyScreen()">📜 Palmarès & Histoire</button>
        ${ncHtml}
        <div class="section-title">🏆 ${U.esc(cup.name)}</div>
        ${cupHtml}
      </div>${this.nav('world')}`);
  },

  financeScreen() {
    const cid = GAME.G.myClub || DB.clubs[0].id;
    const r = FINANCE.report(cid);
    const owner = (typeof OWNER !== 'undefined' && GAME.G.myClub) ? OWNER.ensure() : null;
    const ffp = owner ? OWNER.ffp(cid) : null;
    const row = (l, v, neg) => `<div class="stat-row"><span>${l}</span><b class="${neg ? 'neg' : 'money'}">${neg ? '-' : '+'}${U.money(Math.abs(v))}</b></div>`;
    const ffpColor = !ffp ? 'var(--muted)' : ffp.status === 'conforme' ? 'var(--acc)' : ffp.status === 'attention' ? 'var(--gold)' : 'var(--red)';
    const investRows = owner ? Object.entries(OWNER.CATS).map(([k, d]) => {
      const lvl = owner.levels[k] || 1;
      const amount = owner.invested[k] || owner.allocations[k] || 0;
      return `<div class="row small-row" onclick="UI.ownerInvestments()"><span>${d.label}</span><span class="muted small">niv. ${lvl}/5 · ${U.money(amount)}</span></div>`;
    }).join('') : '';
    this.render(`${this.header('Finances')}
      <div class="content">
        <div class="card"><h3>Argent total du club : <span class="money">${U.money(r.budget)}</span></h3>
          <span class="muted small">Ce chiffre est la caisse globale. Ce n’est pas ton budget mercato. Détail important, apparemment nécessaire pour éviter de transformer le football en GTA avec crampons.</span></div>
        ${owner ? `<div class="card ${ffp.status === 'danger' || ffp.status === 'sanction' ? 'loss' : ffp.status === 'attention' ? 'alert' : 'win'}">
          <div class="section-title">Fair-play financier</div>
          <div class="stat-row"><span>Statut</span><b style="color:${ffpColor}">${ffp.status.toUpperCase()}</b></div>
          <div class="stat-row"><span>Budget mercato autorisé</span><b class="money">${U.money(ffp.authorized)}</b></div>
          <div class="stat-row"><span>Limite FPF saison</span><b>${U.money(ffp.limit)}</b></div>
          <div class="stat-row"><span>Dépensé mercato</span><b class="neg">${U.money(ffp.spent)}</b></div>
          <div class="stat-row"><span>Revenus annuels</span><b>${U.money(ffp.revenue)}</b></div>
          <div class="stat-row"><span>Salaires annuels</span><b>${U.money(ffp.wages)}</b></div>
          <p class="muted small" style="margin-top:8px">Le club peut avoir ${U.money(r.budget)} en caisse et seulement ${U.money(ffp.authorized)} utilisables au mercato. Oui, c’est cruel. C’est aussi le principe.</p>
          <button class="btn" onclick="UI.fairPlayScreen()">⚖️ Voir l'écran fair-play financier</button>
        </div>
        <div class="card"><div class="section-title">Propriétaire</div>
          <div class="stat-row"><span>Type</span><b>${owner.type === 'rich' ? 'Riche' : 'Normal'}</b></div>
          <div class="stat-row"><span>Injection initiale</span><b class="money">${U.money(owner.injection || 0)}</b></div>
          <div class="stat-row"><span>Confiance</span><b>${owner.trust}/100</b></div>
          <div class="stat-row"><span>Pression</span><b>${owner.pressure}/100</b></div>
          <button class="btn btn-primary" onclick="UI.ownerInvestments()">💼 Répartir / investir l'argent du propriétaire</button>
        </div>
        <div class="section-title">Budgets séparés</div>${investRows}` : ''}
        <div class="card">
          <div class="section-title">Flux mensuels estimés</div>
          ${row('Droits TV', r.tvMonthly)}
          ${row('Billetterie', r.ticketsMonthly)}
          ${row('Sponsors', r.sponsorMonthly)}
          ${row('Masse salariale', r.wagesMonthly, true)}
          <div class="stat-row total"><span>Solde mensuel</span><b class="${r.tvMonthly + r.ticketsMonthly + r.sponsorMonthly - r.wagesMonthly >= 0 ? 'money' : 'neg'}">${U.money(r.tvMonthly + r.ticketsMonthly + r.sponsorMonthly - r.wagesMonthly)}</b></div>
        </div>
        <button class="btn btn-ghost" onclick="UI.world()">‹ Retour</button>
      </div>${this.nav('world')}`);
  },

  fairPlayScreen() {
    if (!GAME.G.myClub || typeof OWNER === 'undefined') return this.financeScreen();
    const f = OWNER.ffp(GAME.G.myClub);
    const statusColor = f.status === 'conforme' ? 'var(--acc)' : f.status === 'attention' ? 'var(--gold)' : 'var(--red)';
    const sanctions = OWNER.ensure().sanctions.map(s => `<div class="news-item bad">S${s.season} · ${U.esc(s.sanction)}</div>`).join('');
    this.render(`${this.header('Fair-play financier')}
      <div class="content">
        <div class="card"><h3 style="color:${statusColor}">${f.status.toUpperCase()}</h3><p class="muted small">Le contrôle financier compare revenus, salaires, transferts, dettes, réserves et injection propriétaire. Le milliard aide le club, mais il ne lave pas les règles dans une machine magique.</p></div>
        <div class="card">
          <div class="stat-row"><span>Revenus</span><b>${U.money(f.revenue)}</b></div>
          <div class="stat-row"><span>Dépenses salaires</span><b>${U.money(f.wages)}</b></div>
          <div class="stat-row"><span>Achats joueurs</span><b>${U.money(f.spent)}</b></div>
          <div class="stat-row"><span>Ventes joueurs</span><b>${U.money(f.received)}</b></div>
          <div class="stat-row"><span>Limite autorisée</span><b>${U.money(f.limit)}</b></div>
          <div class="stat-row"><span>Reste FPF</span><b class="money">${U.money(f.remaining)}</b></div>
          <div class="stat-row total"><span>Mercato utilisable</span><b class="money">${U.money(f.authorized)}</b></div>
        </div>
        <div class="card alert"><b>Alertes possibles</b><p class="muted small">Conforme : libre. Attention : surveillé. Danger : budget réduit. Sanction : amende, interdiction de recruter, retrait de points ou exclusion européenne selon gravité.</p></div>
        ${sanctions ? `<div class="section-title">Historique sanctions</div>${sanctions}` : ''}
        <button class="btn btn-ghost" onclick="UI.financeScreen()">‹ Retour finances</button>
      </div>${this.nav('world')}`);
  },

  ownerInvestments() {
    if (!GAME.G.myClub || typeof OWNER === 'undefined') return this.financeScreen();
    const O = OWNER.ensure();
    const f = OWNER.ffp(GAME.G.myClub);
    const rows = Object.entries(OWNER.CATS).map(([k,d]) => {
      const lvl = O.levels[k] || 1;
      const maxed = k !== 'transfer' && k !== 'reserve' && lvl >= d.max;
      const cost = OWNER.investCost(k);
      const extra = k === 'transfer' ? `Actuel : ${U.money(O.allocations.transfer || 0)} · FPF dispo : ${U.money(f.remaining)}` : k === 'reserve' ? `Réserve : ${U.money(O.allocations.reserve || 0)}` : `Niveau ${lvl}/${d.max}`;
      return `<div class="card">
        <div class="stat-row"><span style="width:auto;flex:1;color:var(--fg)">${d.label}</span><b>${maxed ? 'MAX' : U.money(cost)}</b></div>
        <p class="muted small" style="margin:4px 0 8px">${d.desc}<br>${extra}</p>
        ${maxed ? '<span class="small" style="color:var(--acc)">Niveau maximum atteint.</span>' : `<button class="btn ${k==='transfer'?'btn-primary':''}" onclick="UI.ownerInvest('${k}')">Investir ici</button>`}
      </div>`;
    }).join('');
    const hist = (O.history || []).slice(0,8).map(h => `<div class="news-item"><span class="muted small">S${h.season} · ${U.fmtDateShort(h.day, h.season)}</span> ${U.esc(h.txt)}</div>`).join('');
    this.render(`${this.header('Investissements')}
      <div class="content">
        <div class="card"><h3>${O.type === 'rich' ? 'Propriétaire riche' : 'Propriétaire normal'}</h3><p class="muted small">Argent total : ${U.money(GAME.budget(GAME.G.myClub))}. Budget mercato autorisé : ${U.money(f.authorized)}. Ce sont deux portes différentes. Essaie de ne pas les confondre, c’est comme ça que les clubs finissent avec des communiqués embarrassants.</p></div>
        ${rows}
        <div class="section-title">Historique</div>${hist || '<div class="muted small">Aucun investissement enregistré.</div>'}
        <button class="btn btn-ghost" onclick="UI.financeScreen()">‹ Retour finances</button>
      </div>${this.nav('world')}`);
  },

  ownerInvest(cat) {
    this.preserveScrollOnce();
    const r = OWNER.invest(cat);
    this.toast(r.msg); SAVE.save(); this.ownerInvestments();
  },

  newsScreen() {
    const cats = { all: 'Tout', transfert: '💰', club: '🏟️', monde: '🌍', finance: '📊' };
    const cat = this._newsCat || 'all';
    const items = GAME.G.news.filter(n => cat === 'all' || n.cat === cat).slice(0, 80);
    this.render(`${this.header('Actualités')}
      <div class="content">
        <div class="chips">${Object.entries(cats).map(([k, v]) =>
          `<button class="chip ${cat === k ? 'active' : ''}" onclick="UI._newsCat='${k}';UI.newsScreen()">${v}</button>`).join('')}</div>
        ${items.map(n => `<div class="news-item"><span class="muted small">S${n.season} · ${U.fmtDateShort(n.day, n.season)}</span><br>${U.esc(n.txt)}</div>`).join('') || '<div class="muted">Rien à signaler.</div>'}
      </div>${this.nav('home')}`);
  },

  historyScreen() {
    const h = GAME.G.history;
    const html = h.length ? h.slice().reverse().map(s => {
      const cw = s.cupWinner ? DB.clubById.get(s.cupWinner) : null;
      const top = s.champions.filter(c => (DB.leagueById.get(c.league) || {}).level === 1).slice(0, 8)
        .map(c => `<div class="small">• ${U.esc((DB.leagueById.get(c.league) || {}).name)} : <b>${U.esc(DB.clubById.get(c.club).name)}</b></div>`).join('');
      return `<div class="card"><h3>Saison ${s.season}/${(s.season + 1) % 100}</h3>
        ${cw ? `<div>🏆 Coupe des Champions : <b>${U.esc(cw.name)}</b></div>` : ''}${top}</div>`;
    }).join('') : '<div class="muted">L\'histoire s\'écrira saison après saison…</div>';
    this.render(`${this.header('Histoire du monde')}<div class="content">${html}<button class="btn btn-ghost" onclick="UI.world()">‹ Retour</button></div>${this.nav('world')}`);
  },

  // ---------- CLUB / CENTRE DE FORMATION ----------
  club() {
    this.screen = 'club';
    if (!GAME.G.myClub) return this.world();
    const c = DB.clubById.get(GAME.G.myClub);
    const sq = DB.squadOf(c.id);
    const academy = sq.filter(p => p.age <= 21).sort((a, b) => b.pot - a.pot).slice(0, 6);
    const academyYouth = (typeof ACADEMY !== 'undefined') ? ACADEMY.clubYouth(c.id).slice(0, 6) : [];
    const unavailable = sq.filter(p => (GAME.pstate(p.id).transferStatus || 'normal') === 'unavailable').length;
    const sell = sq.filter(p => (GAME.pstate(p.id).transferStatus || 'normal') === 'sell').length;
    const loan = sq.filter(p => (GAME.pstate(p.id).transferStatus || 'normal') === 'loan').length;
    const quality = this.academyQuality(c.id);
    const roleText = GAME.G.role === 'president'
      ? 'Président : vous contrôlez budget, politique mercato et centre de formation.'
      : 'Coach : vous gérez le sportif, les statuts mercato et les jeunes disponibles.';
    this.render(`${this.header('Club')}
      <div class="content">
        <div class="card"><h3>${U.esc(c.name)}</h3><span class="muted small">${roleText}</span>
          <div class="stat-row"><span>Réputation</span><b>${Math.round(c.rep)}</b></div>
          <div class="stat-row"><span>Budget</span><b class="money">${U.money(GAME.budget(c.id))}</b></div>
          <div class="stat-row"><span>Effectif</span><b>${sq.length} joueurs</b></div>
        </div>
        <div class="card"><div class="section-title">Politique mercato</div>
          <div class="stat-row"><span>Intransférables</span><b>${unavailable}</b></div>
          <div class="stat-row"><span>À vendre</span><b>${sell}</b></div>
          <div class="stat-row"><span>À prêter</span><b>${loan}</b></div>
          <button class="btn" onclick="UI.squad()">Gérer joueur par joueur</button>
          <button class="btn" onclick="UI.financeScreen()">💶 Finances / fair-play financier</button>
          <button class="btn btn-primary" onclick="UI.tactics()">📋 Tactiques & style de jeu</button>
        </div>
        <div class="card"><div class="section-title">Centre de formation</div>
          <div class="stat-row"><span>Niveau</span><b>${quality}/100</b></div>
          <div class="bar"><div style="width:${quality}%;background:${U.ovrColor(quality)}"></div></div>
          <p class="muted small" style="margin-top:8px">Plus le niveau est haut, plus les jeunes progressent vite et plus l'intake annuel sort des cracks. Oui, les enfants de 14 ans ont maintenant une ligne budgétaire. Sport moderne.</p>
          ${GAME.G.role === 'president' ? (() => { const sc = ACADEMY.ensure().scouting || 45; const scCost = ACADEMY.scoutingCost(); return `<button class="btn btn-primary" onclick="UI.academyUpgrade()">🏗️ Investir ${U.money(this.academyUpgradeCost(c.id))}</button><button class="btn" onclick="UI.investScouting('club')">🛰️ Investir scouting jeunes — ${U.money(scCost)}<br><small>Niveau actuel : ${sc}/100</small></button>`; })() : `<button class="btn" onclick="UI.requestYouthScouting()">📝 Demander rapport jeunes au Président</button>`}
          <button class="btn btn-primary" onclick="UI.academyScreen()">🌱 Section centre de formation</button>
        </div>
        ${GAME.G.role === 'coach' ? `<div class="card"><div class="section-title">Carrière Coach</div><div class="stat-row"><span>Crédibilité</span><b>${GAME.G.coachCredibility}/100</b></div><button class="btn" onclick="UI.requestCoachJobs()">📨 Voir offres d'autres clubs</button></div>` : ''}
        <div class="section-title">Meilleurs jeunes académie cachée</div>
        ${academyYouth.map(y => `<div class="row" onclick="UI.academyPlayer('${y.aid}')"><div><b>${U.esc(y.name)}</b><br><span class="muted small">${y.age} ans · ${y.pos} · potentiel ${y.pot} · ${U.esc(y.status)}</span></div><span class="badge" style="color:${U.ovrColor(y.ovr)}">${y.ovr}</span></div>`).join('') || '<div class="muted">Aucun jeune caché découvert.</div>'}
        <div class="section-title">Meilleurs jeunes déjà pros</div>
        ${academy.map(p => `<div class="row" onclick="UI.playerProfile(${p.id})"><div><b>${U.esc(p.name)}</b><br><span class="muted small">${p.age} ans · ${p.mainPos} · potentiel ${p.pot}</span></div><span class="badge" style="color:${U.ovrColor(p.ovr)}">${p.ovr}</span></div>`).join('') || '<div class="muted">Aucun jeune notable.</div>'}
      </div>${this.nav('club')}`);
  },

  academyQuality(clubId) {
    const key = 'academy_' + clubId;
    if (GAME.G[key] == null) {
      const c = DB.clubById.get(clubId);
      GAME.G[key] = U.clamp(Math.round((c.rep || 60) * 0.85 + U.ri(-6, 8)), 35, 95);
    }
    return GAME.G[key];
  },

  academyUpgradeCost(clubId) {
    const q = this.academyQuality(clubId);
    return Math.round((q * q * 18000 + 750000) / 50000) * 50000;
  },

  academyUpgrade() {
    this.preserveScrollOnce();
    const cid = GAME.G.myClub;
    const cost = this.academyUpgradeCost(cid);
    if (GAME.budget(cid) < cost) return this.toast('Budget insuffisant pour améliorer le centre. Même les rêves ont une facture.');
    GAME.addBudget(cid, -cost);
    GAME.G['academy_' + cid] = U.clamp(this.academyQuality(cid) + U.ri(4, 8), 35, 99);
    NEWS.add(`🏗️ Centre de formation amélioré : niveau ${GAME.G['academy_' + cid]}/100.`, 'club');
    SAVE.save(); this.club();
  },


  // ---------- TACTIQUES ----------
  tactics(from = 'club') {
    if (typeof TACTICS === 'undefined' || !GAME.G.myClub) return this.club();
    this._tacFrom = from;
    const T = TACTICS.ensure();
    const trust = TACTICS.trust();
    const kws = TACTICS.parseSpeech(T.speech);
    const formChips = Object.keys(TACTICS.FORMATIONS).map(f =>
      `<button class="chip ${T.formation === f ? 'active' : ''}" onclick="UI.setFormation('${f}')">${f}</button>`).join('');
    const styleCards = Object.entries(TACTICS.STYLES).map(([k, st]) =>
      `<div class="row ${T.style === k ? 'mine' : ''}" onclick="UI.setStyle('${k}')">
        <div><b>${st.name}</b><br><span class="muted small">${st.desc}</span></div>
        ${T.style === k ? '<span class="badge" style="color:var(--acc)">✓</span>' : ''}
      </div>`).join('');
    const kwTags = kws.length
      ? kws.map(k => `<span class="chip active" style="cursor:default">${k.label}</span>`).join('')
      : '<span class="muted small">Aucune consigne détectée. Parle pressing, bloc, possession, contres, ailes…</span>';
    const trustColor = trust >= 65 ? 'var(--acc)' : trust >= 40 ? 'var(--gold)' : 'var(--red)';
    const trustNote = trust >= 65 ? 'Le vestiaire applique tes consignes.' : trust >= 40 ? 'Exécution partielle : les joueurs doutent encore.' : 'Confiance trop basse : les consignes peuvent se retourner contre toi.';
    this.render(`${this.header('Tactiques')}
      <div class="content">
        <div class="card">
          <div class="stat-row"><span>Confiance du vestiaire</span><b style="color:${trustColor}">${trust}/100</b></div>
          <div class="bar"><div style="width:${trust}%;background:${trustColor}"></div></div>
          <p class="muted small" style="margin-top:8px">${trustNote} La confiance vient de ta crédibilité et du moral du groupe : gagne des matchs.</p>
        </div>
        <div class="section-title">Formation</div>
        <div class="chips wrap">${formChips}</div>
        <div class="section-title">Style de jeu</div>
        ${styleCards}
        <div class="section-title">Discours du coach</div>
        <div class="card">
          <p class="muted small" style="margin-bottom:8px">Explique en français le style que tu veux voir. Les joueurs essaieront de l'exécuter en match, selon leur confiance en toi.</p>
          <textarea class="input speech" id="tacSpeech" rows="4" placeholder="Ex : Je veux un pressing haut dès la perte du ballon, des passes courtes, et on déborde sur les ailes pour centrer."
            oninput="UI.speechChanged()">${U.esc(T.speech || '')}</textarea>
          <div class="chips wrap" id="tacKws" style="margin-top:8px">${kwTags}</div>
        </div>
        <button class="btn btn-primary btn-big" onclick="UI.saveTactics()">✅ Valider la tactique</button>
        <button class="btn btn-ghost" onclick="${from === 'prematch' ? 'UI.preMatch(UI._pending, UI._dayResults)' : 'UI.club()'}">‹ Retour</button>
      </div>${this.nav('club')}`);
  },

  setFormation(f) {
    this.preserveScrollOnce();
    TACTICS.ensure().formation = f;
    this._keepSpeech(); this.tactics(this._tacFrom);
  },

  setStyle(k) {
    this.preserveScrollOnce();
    TACTICS.ensure().style = k;
    this._keepSpeech(); this.tactics(this._tacFrom);
  },

  _keepSpeech() {
    const el = this.el('tacSpeech');
    if (el) TACTICS.ensure().speech = el.value.slice(0, 600);
  },

  speechChanged() {
    this._keepSpeech();
    const kws = TACTICS.parseSpeech(TACTICS.ensure().speech);
    const box = this.el('tacKws');
    if (box) box.innerHTML = kws.length
      ? kws.map(k => `<span class="chip active" style="cursor:default">${k.label}</span>`).join('')
      : '<span class="muted small">Aucune consigne détectée. Parle pressing, bloc, possession, contres, ailes…</span>';
  },

  saveTactics() {
    this.preserveScrollOnce();
    this._keepSpeech();
    SAVE.save();
    this.toast('Tactique enregistrée. Le vestiaire est prévenu.');
    this._tacFrom === 'prematch' ? this.preMatch(this._pending, this._dayResults) : this.club();
  },

  academy() {
    this.academyScreen();
  },

  academyScreen(tab) {
    this.screen = 'academy';
    this._activeAcademyAid = null;
    if (!GAME.G.myClub || typeof ACADEMY === 'undefined') return this.club();
    if (tab) this._acadTab = tab;
    if (!this._acadTab) this._acadTab = 'apercu';
    if (!this._acadSort) this._acadSort = 'pot';
    const all = ACADEMY.clubYouth(GAME.G.myClub);
    all.forEach(y => ACADEMY.ensureYouthV2(y));
    const A = ACADEMY.ensure();
    const I = ACADEMY.infra();
    const sorters = { pot: (a, b) => b.pot - a.pot, ovr: (a, b) => b.ovr - a.ovr, age: (a, b) => a.age - b.age };
    const centre = all.filter(y => y.status === 'academy').sort(sorters[this._acadSort]);
    const scouted = all.filter(y => y.status === 'scouted').sort(sorters[this._acadSort]);

    const tabs = [['apercu', 'Aperçu'], ['categories', 'U6-U19'], ['u19', 'U19 & Réserve'], ['centre', `Centre (${centre.length})`], ['cibles', `Cibles (${scouted.length})`], ['scouting', 'Scouting & Infra']];
    const tabBar = `<div class="chips">${tabs.map(([k, lb]) => `<button class="chip ${this._acadTab === k ? 'active' : ''}" onclick="UI.academyScreen('${k}')">${lb}</button>`).join('')}</div>`;
    const sortBar = `<div class="chips">${[['pot', 'Potentiel'], ['ovr', 'Général'], ['age', 'Âge']].map(([k, lb]) => `<button class="chip ${this._acadSort === k ? 'active' : ''}" onclick="UI._acadSort='${k}';UI.academyScreen()">${lb}</button>`).join('')}</div>`;

    const rowOf = y => {
      const P = y.pursuit, perso = ACADEMY.persoOf(y);
      let state = '';
      if (y.status === 'scouted') {
        if (P && P.offerMade) state = `<span class="small" style="color:var(--gold)">⏳ Réfléchit · réponse ~${U.fmtDateShort(P.decisionDay, GAME.G.season)}</span>`;
        else if (P && P.failed) state = `<span class="small" style="color:var(--red)">A refusé · retenter J${P.retryDay}</span>`;
        else if (P) state = `<span class="small" style="color:var(--acc)">Séduction ${P.appeal}/100</span>`;
        else state = `<span class="muted small">Pas encore approché</span>`;
      } else {
        const last = y.devLog && y.devLog[0];
        const trend = last ? (last.delta > 0 ? ` <span class="small" style="color:var(--acc)">▲+${last.delta}</span>` : last.delta < 0 ? ` <span class="small" style="color:var(--red)">▼${last.delta}</span>` : '') : '';
        state = `<span class="muted small">${perso.label} · plan ${y.focus}</span>${trend}`;
      }
      return `<div class="row" onclick="UI.academyPlayer('${y.aid}')">
        <div><b>${U.esc(y.fullName)}</b><br><span class="muted small">${y.age} ans · ${y.pos} · ${U.esc(y.nat)}</span>${state ? '<br>' + state : ''}</div>
        <div class="tr"><span class="badge" style="color:${U.ovrColor(y.ovr)}">${y.ovr}</span><br><span class="muted small">pot. ${ACADEMY.potRange(y)}</span></div>
      </div>`;
    };

    let body = '';
    if (this._acadTab === 'apercu') {
      const avgPot = centre.length ? Math.round(centre.reduce((a, y) => a + y.pot, 0) / centre.length) : 0;
      const gems = centre.filter(y => y.pot >= 85).length;
      const pending = scouted.filter(y => y.pursuit && y.pursuit.offerMade).length;
      const activeMissions = ACADEMY.missions().filter(m => !m.done);
      const reports = (A.reports || []).slice(0, 10).map(r => {
        const y2 = r.aid ? all.find(x => x.aid === r.aid) : null;
        return `<div class="news-item"${y2 ? ` onclick="UI.academyPlayer('${y2.aid}')" style="cursor:pointer"` : ''}><span class="muted small">${U.fmtDateShort(r.day, r.season)}</span> ${U.esc(r.txt)}</div>`;
      }).join('');
      body = `
        <div class="card">
          <div class="section-title">Tableau de bord</div>
          <div class="kpi-grid">
            <div class="kpi"><b>${centre.length}</b><span>au centre</span></div>
            <div class="kpi"><b style="color:var(--gold)">${gems}</b><span>pépites 85+</span></div>
            <div class="kpi"><b>${scouted.length}</b><span>cibles</span></div>
            <div class="kpi"><b style="color:${pending ? 'var(--acc)' : 'var(--fg)'}">${pending}</b><span>offres en cours</span></div>
            <div class="kpi"><b>${avgPot || '—'}</b><span>pot. moyen</span></div>
            <div class="kpi"><b>${activeMissions.length}/3</b><span>scouts en mission</span></div>
          </div>
          <div class="stat-row"><span>Installations</span><div class="bar"><div style="width:${I.install * 20}%;background:var(--acc)"></div></div><b>${I.install}/5</b></div>
          <div class="stat-row"><span>Staff formateur</span><div class="bar"><div style="width:${I.staff * 20}%;background:var(--acc)"></div></div><b>${I.staff}/5</b></div>
          <div class="stat-row"><span>Internat & vie</span><div class="bar"><div style="width:${I.internat * 20}%;background:var(--acc)"></div></div><b>${I.internat}/5</b></div>
        </div>
        <div class="card"><div class="section-title">Catégories séparées</div>
          ${(() => { const cs = ACADEMY.categoryStats(GAME.G.myClub); return ['U6','U9','U12','U15','U17','U19','reserve'].map(k => `<div class="stat-row"><span>${k === 'reserve' ? 'Réserve/B' : k}</span><b>${cs[k].length}</b></div>`).join(''); })()}
          <button class="btn" onclick="UI.academyScreen('categories')">Voir toutes les catégories</button>
        </div>
        <div class="section-title">Rapports récents</div>${reports || '<div class="muted small">Aucun rapport.</div>'}`;
    } else if (this._acadTab === 'categories') {
      const cs = ACADEMY.categoryStats(GAME.G.myClub);
      const explain = {
        U6: 'Bases techniques, coordination, discipline et potentiel brut.',
        U9: 'Technique simple, coordination, discipline et plaisir de jouer.',
        U12: 'Bases solides, premières habitudes de travail.',
        U15: 'Début du vrai profil footballistique.',
        U17: 'Spécialisation, mental, poste secondaire et intensité.',
        U19: 'Proche du monde professionnel : matchs, statistiques, pression.',
        reserve: 'Équipe B : trop forts pour U19, pas encore prêts pour l’équipe première.'
      };
      body = ['U6','U9','U12','U15','U17','U19','reserve'].map(k => {
        const list = cs[k];
        const top = list.slice(0, 5).map(y => `<div class="row small-row" onclick="UI.academyPlayer('${y.aid}')"><span>${U.esc(y.name)} · ${y.pos}</span><span class="muted small">${y.age} ans · ${y.ovr} · pot. ${ACADEMY.potRange(y)}</span></div>`).join('');
        return `<div class="card"><h3>${k === 'reserve' ? 'Équipe réserve / B' : k}</h3><p class="muted small">${explain[k]}</p><div class="stat-row"><span>Joueurs</span><b>${list.length}</b></div>${top || '<div class="muted small">Aucun joueur dans cette catégorie.</div>'}</div>`;
      }).join('');
    } else if (this._acadTab === 'u19') {
      const cs = ACADEMY.categoryStats(GAME.G.myClub);
      const u19 = cs.U19.concat(cs.reserve).sort((a,b)=>(b.u19?.goals||0)-(a.u19?.goals||0) || b.ovr-a.ovr);
      const rows = u19.slice(0, 40).map(y => `<div class="row" onclick="UI.academyPlayer('${y.aid}')"><div><b>${U.esc(y.fullName)}</b><br><span class="muted small">${y.age} ans · ${y.pos}/${y.secondaryPos} · moral ${y.morale}/100 · fatigue ${y.fatigue}/100</span></div><div class="tr"><span class="badge">${y.u19?.goals || 0} ⚽</span><br><span class="muted small">${y.u19?.apps || 0} matchs · ${y.minutesSeason || 0} min</span></div></div>`).join('');
      const goals = u19.reduce((a,y)=>a+(y.u19?.goals||0),0);
      body = `<div class="card win"><div class="section-title">Équipe U19 / réserve</div><div class="kpi-grid"><div class="kpi"><b>${u19.length}</b><span>joueurs</span></div><div class="kpi"><b>${goals}</b><span>buts</span></div><div class="kpi"><b>${Math.round(u19.reduce((a,y)=>a+(y.morale||60),0)/Math.max(1,u19.length))}</b><span>moral moy.</span></div></div><p class="muted small">Un match jeunes est simulé chaque mois. Minutes, fatigue, moral, école et blessures influencent la progression. Même les gamins ont une gestion RH, quelle époque.</p></div>${rows || '<div class="muted small">Aucun joueur U19 ou réserve.</div>'}`;
    } else if (this._acadTab === 'centre') {
      body = `${sortBar}
        <p class="muted small" style="margin:0 4px 10px">Bilan de progression chaque mois : plan de formation, matchs U19, personnalité et infrastructures font la différence.</p>
        ${centre.slice(0, 50).map(rowOf).join('') || '<div class="muted small" style="padding:8px 4px">Centre vide. Va chercher des talents dans l\'onglet Cibles.</div>'}`;
    } else if (this._acadTab === 'cibles') {
      body = `${sortBar}
        <p class="muted small" style="margin:0 4px 10px">Le potentiel affiché est une estimation — elle s'affine avec un meilleur staff et du temps. Approche, séduis, puis fais ton offre.</p>
        ${scouted.slice(0, 50).map(rowOf).join('') || '<div class="muted small" style="padding:8px 4px">Aucune cible. Lance une mission de scouting.</div>'}`;
    } else {
      const missions = ACADEMY.missions().filter(m => !m.done).map(m => {
        const R = ACADEMY.REGIONS[m.region];
        return `<div class="row small-row" style="cursor:default"><span>🧳 ${R.label}</span><span class="muted small">retour ~${U.fmtDateShort(m.endDay, GAME.G.season)}</span></div>`;
      }).join('');
      const regionBtns = Object.entries(ACADEMY.REGIONS).map(([k, R]) =>
        `<button class="btn" onclick="UI.acadMission('${k}')">${R.label}<br><small>${U.money(ACADEMY.missionCost(k))} · 3-6 semaines</small></button>`).join('');
      const infraRows = Object.entries(ACADEMY.INFRA_DEFS).map(([k, d]) => {
        const lvl = I[k] || 1;
        return `<div class="card"><div class="stat-row"><span style="width:auto;flex:1;color:var(--fg)">${d.label}</span><b>${lvl}/5</b></div>
          <div class="bar"><div style="width:${lvl * 20}%;background:var(--acc)"></div></div>
          <p class="muted small" style="margin:6px 0 8px">${d.desc}</p>
          ${lvl >= 5 ? '<span class="small" style="color:var(--acc)">Niveau maximum atteint.</span>' : `<button class="btn" onclick="UI.acadUpgrade('${k}')">${GAME.G.role === 'coach' ? 'Demander l\'amélioration' : 'Améliorer'} (${U.money(ACADEMY.infraCost(k))})</button>`}
        </div>`;
      }).join('');
      const scLevel = A.scouting || 45;
      const scCost = ACADEMY.scoutingCost();
      const scMaxed = scLevel >= 99;
      body = `
        <div class="card win">
          <div class="section-title">Réseau scouting jeunes</div>
          <div class="stat-row"><span>Niveau actuel</span><b>${scLevel}/100</b></div>
          <div class="bar"><div style="width:${scLevel}%;background:var(--acc)"></div></div>
          <p class="muted small" style="margin:8px 0">Meilleur scouting = plus de talents trouvés et meilleure lecture du potentiel. Une idée folle : afficher le prix avant de prendre l'argent.</p>
          ${GAME.G.role === 'president' ? (scMaxed ? '<span class="small" style="color:var(--acc)">Niveau maximum atteint.</span>' : `<button class="btn btn-primary" onclick="UI.investScouting('academy')">🛰️ Investir scouting jeunes — ${U.money(scCost)}<br><small>Niveau actuel : ${scLevel}/100</small></button>`) : `<button class="btn" onclick="UI.requestYouthScouting()">📝 Demander un rapport jeunes au Président</button>`}
        </div>
        <div class="section-title">Missions en cours (${ACADEMY.missions().filter(m => !m.done).length}/3)</div>
        ${missions || '<div class="muted small" style="padding:0 4px 8px">Aucun scout sur le terrain.</div>'}
        <div class="section-title">Envoyer un scout</div>
        <div class="card">${regionBtns}</div>
        <div class="section-title">Infrastructures du centre</div>
        ${infraRows}`;
    }

    this.render(`${this.header('Académie')}
      <div class="content">
        ${tabBar}
        ${body}
      </div>${this.nav('academy')}`);
  },

  acadMission(regionKey) {
    this.preserveScrollOnce();
    const r = ACADEMY.startMission(regionKey);
    this.toast(r.msg); SAVE.save(); this.academyScreen('scouting');
  },

  acadUpgrade(axis) {
    this.preserveScrollOnce();
    const r = ACADEMY.upgradeInfra(axis);
    this.toast(r.msg); SAVE.save(); this.academyScreen('scouting');
  },

  academyPlayer(aid) {
    this.screen = 'academy';
    this._activeAcademyAid = aid;
    const y = ACADEMY.clubYouth(GAME.G.myClub).find(x => x.aid === aid);
    if (!y) return this.academyScreen();
    ACADEMY.ensureYouthV2(y);
    const P = y.pursuit, perso = ACADEMY.persoOf(y);
    const statusText = y.status === 'academy' ? 'Pensionnaire du centre' : y.status === 'scouted' ? 'Cible — à convaincre' : U.esc(y.status || 'Repéré');
    const cost = ACADEMY.academyRecruitCost(y);
    const subBar = (lb, v) => `<div class="stat-row"><span>${lb}</span><div class="bar"><div style="width:${v}%;background:${U.ovrColor(v)}"></div></div><b>${v}</b></div>`;
    const devHist = (y.devLog || []).slice(0, 4).map(d =>
      `<span class="chip" style="cursor:default;color:${d.delta > 0 ? 'var(--acc)' : d.delta < 0 ? 'var(--red)' : 'var(--muted)'}">${d.delta > 0 ? '+' : ''}${d.delta}</span>`).join('');

    let nego = '';
    if (y.status === 'scouted') {
      if (!P || P.failed) {
        const locked = P && P.failed && GAME.G.day < (P.retryDay || 0);
        nego = `<div class="card">
          <div class="section-title">Recrutement</div>
          ${P && P.failed ? `<p class="small" style="color:var(--red);margin-bottom:8px">Il a refusé une première offre.${locked ? ` Nouvelle approche possible à partir de J${P.retryDay}.` : ' Tu peux retenter ta chance.'}</p>` : `<p class="muted small" style="margin-bottom:8px">Approche son entourage, séduis-le, puis fais ton offre — il prendra quelques jours pour décider${y.pot >= 88 ? ' (et un crack fera durer le suspense)' : ''}. Sa personnalité « ${perso.label} » ${perso.seduce > 0 ? 'facilite' : perso.seduce < 0 ? 'complique' : 'n\'influence pas'} la négociation.</p>`}
          ${locked ? '' : `<button class="btn btn-primary" onclick="UI.startPursuit('${y.aid}')">🤝 Lancer l'approche</button>`}
        </div>`;
      } else if (P.offerMade) {
        nego = `<div class="card alert">
          <div class="section-title">Offre en réflexion</div>
          <div class="stat-row"><span>Séduction</span><b style="color:var(--acc)">${P.appeal}/100</b></div>
          <div class="bar"><div style="width:${P.appeal}%;background:var(--acc)"></div></div>
          <p class="muted small" style="margin-top:8px">📨 L'offre (${U.money(cost)}) est entre ses mains. Réponse attendue vers le ${U.fmtDateShort(P.decisionDay, GAME.G.season)}.</p>
        </div>`;
      } else {
        const actBtn = (k, a) => P.acts[k]
          ? `<button class="btn" disabled style="opacity:.45">${a.label} ✓</button>`
          : `<button class="btn" onclick="UI.pursuitAct('${y.aid}','${k}')">${a.label}${k === 'agent' ? ` (${U.money(ACADEMY.agentFee(y))})` : ''}<br><small>${a.hint}</small></button>`;
        nego = `<div class="card">
          <div class="section-title">Séduire ${U.esc(y.name)}</div>
          <div class="stat-row"><span>Séduction</span><b style="color:${P.appeal >= 60 ? 'var(--acc)' : P.appeal >= 40 ? 'var(--gold)' : 'var(--red)'}">${P.appeal}/100</b></div>
          <div class="bar"><div style="width:${P.appeal}%;background:${P.appeal >= 60 ? 'var(--acc)' : P.appeal >= 40 ? 'var(--gold)' : 'var(--red)'}"></div></div>
          <p class="muted small" style="margin:8px 0 10px">Chaque action ne peut être faite qu'une fois.</p>
          ${actBtn('agent', ACADEMY.ACTS.agent)}
          ${actBtn('parents', ACADEMY.ACTS.parents)}
          ${actBtn('projet', ACADEMY.ACTS.projet)}
          <button class="btn btn-primary btn-big" onclick="UI.makeYouthOffer('${y.aid}')">📨 Faire l'offre officielle (${U.money(cost)})</button>
        </div>`;
      }
    }

    let plan = '';
    if (y.status === 'academy') {
      const focusChip = (k, lb) => `<button class="chip ${y.focus === k ? 'active' : ''}" onclick="UI.setYouthFocus('${y.aid}','${k}')">${lb}</button>`;
      plan = `<div class="card">
        <div class="section-title">Plan de formation</div>
        <div class="chips wrap">${focusChip('polyvalent', '⚖️ Polyvalent')}${focusChip('technique', '🎯 Technique')}${focusChip('physique', '💪 Physique')}${focusChip('mental', '🧠 Mental')}${focusChip('finition', '🥅 Finition')}${focusChip('defense', '🛡️ Défense')}${focusChip('passes', '🎯 Passes')}${focusChip('vitesse', '⚡ Vitesse')}${focusChip('endurance', '🏃 Endurance')}${focusChip('gardien', '🧤 Gardien')}</div>
        <p class="muted small">Le plan oriente sa progression mensuelle. ${devHist ? 'Derniers mois : ' : ''}</p>
        ${devHist ? `<div class="chips wrap">${devHist}</div>` : ''}
        ${y.u19.apps ? `<div class="stat-row"><span>Matchs U19</span><b>${y.u19.apps} m. · ${y.u19.goals} buts</b></div>` : ''}
      </div>`;
    }

    const promoteLabel = GAME.G.role === 'coach' ? '⬆️ Demander montée équipe première' : '⬆️ Monter en équipe première';
    const canPromote = y.status === 'academy' && y.age >= 16;
    this.render(`${this.header('Profil académie')}
      <div class="content">
        <div class="card">
          <div class="profile-head">
            <div class="big-ovr" style="color:${U.ovrColor(y.ovr)}">${y.ovr}</div>
            <div class="grow"><h3>${U.esc(y.fullName)}</h3>
              <span class="muted small">${y.age} ans · ${y.pos} · ${U.esc(y.nat)} · ${y.height} cm</span><br>
              <span class="chip" style="cursor:default;margin-top:6px;display:inline-block">${perso.label}</span>
            </div>
            <div class="tr"><span class="muted small">potentiel</span><br><b style="font-size:19px;color:var(--gold)">${ACADEMY.potRange(y)}</b>${y.potFuzz > 3 ? '<br><span class="muted small">évaluation incertaine</span>' : y.potFuzz > 0 ? '<br><span class="muted small">évaluation fiable</span>' : '<br><span class="small" style="color:var(--acc)">évaluation certaine</span>'}</div>
          </div>
          <p class="muted small" style="margin:8px 0 4px">${perso.desc}</p>
          ${subBar('Technique', y.tech)}
          ${subBar('Physique', y.phys)}
          ${subBar('Mental', y.ment)}
          <div class="stat-row"><span>Catégorie</span><b>${y.category}</b></div>
          <div class="stat-row"><span>Poste secondaire</span><b>${y.secondaryPos}</b></div>
          <div class="stat-row"><span>Moral</span><b>${y.morale}/100</b></div>
          <div class="stat-row"><span>École</span><b>${y.school}/100</b></div>
          <div class="stat-row"><span>Famille</span><b>${y.familyPressure}/100</b></div>
          <div class="stat-row"><span>Fatigue</span><b>${y.fatigue}/100</b></div>
          ${y.injuryDays ? `<div class="stat-row"><span>Blessure</span><b class="neg">${y.injuryDays} j</b></div>` : ''}
          <div class="stat-row"><span>Contrat</span><b>${U.esc(y.contractType)}</b></div>
          <div class="stat-row"><span>Statut</span><b>${statusText}</b></div>
          <div class="stat-row"><span>Arrivée pro prévue</span><b>S${y.appearSeason}</b></div>
        </div>
        ${plan}
        ${nego}
        ${canPromote ? `<button class="btn btn-primary" onclick="UI.promoteAcademyYouth('${y.aid}')">${promoteLabel}</button>` : ''}
        ${y.status === 'academy' ? `<button class="btn" onclick="UI.requestYouthLoan('${y.aid}')">🔁 Préparer prêt futur</button>` : ''}
        ${y.status === 'academy' && GAME.G.role === 'president' ? `<button class="btn btn-danger" onclick="UI.sellAcademyYouth('${y.aid}')">💼 Vendre le jeune</button>` : ''}
        <button class="btn btn-ghost" onclick="UI.academyScreen()">‹ Retour académie</button>
      </div>${this.nav('academy')}`);
  },

  setYouthFocus(aid, focus) {
    this.preserveScrollOnce();
    const r = ACADEMY.setFocus(aid, focus);
    this.toast(r.msg); SAVE.save(); this.academyPlayer(aid);
  },

  startPursuit(aid) {
    this.preserveScrollOnce();
    const r = ACADEMY.startPursuit(aid);
    this.toast(r.msg); SAVE.save(); this.academyPlayer(aid);
  },

  pursuitAct(aid, act) {
    this.preserveScrollOnce();
    const r = ACADEMY.pursuitAct(aid, act);
    this.toast(r.msg); SAVE.save(); this.academyPlayer(aid);
  },

  makeYouthOffer(aid) {
    this.preserveScrollOnce();
    const r = ACADEMY.makeYouthOffer(aid);
    this.toast(r.msg); SAVE.save(); this.academyPlayer(aid);
  },

  investScouting(from = 'academy') {
    this.preserveScrollOnce();
    const r = ACADEMY.investScouting();
    this.toast(r.msg); SAVE.save();
    from === 'club' ? this.club() : this.academyScreen('scouting');
  },

  requestYouthScouting() {
    const pos = prompt('Poste recherché ? Exemple : ST, CM, CB. Laisse vide pour général.', '') || '';
    this.preserveScrollOnce();
    const r = ACADEMY.requestScouting(pos);
    this.toast(r.msg); SAVE.save(); this.academyScreen('cibles');
  },

  promoteAcademyYouth(aid) {
    const r = ACADEMY.promoteToFirstTeam(aid);
    this.toast(r.msg); SAVE.save(); r.ok ? this.squad() : this.academyPlayer(aid);
  },

  requestYouthLoan(aid) {
    const r = ACADEMY.requestYouthLoan(aid);
    this.toast(r.msg); SAVE.save(); this.academyPlayer(aid);
  },

  sellAcademyYouth(aid) {
    const r = ACADEMY.sellYouth(aid);
    this.toast(r.msg); SAVE.save(); r.ok ? this.academyScreen() : this.academyPlayer(aid);
  },

  requestCoachJobs() {
    const r = TRANSFERS.generateCoachOffers();
    if (!r.ok) { this.toast(r.msg); return this.club(); }
    const rows = (GAME.G.coachOffers || []).map((o, i) => {
      const c = DB.clubById.get(o.club);
      return `<div class="card"><b>${U.esc(c.name)}</b><br><span class="muted small">Réputation ${Math.round(c.rep)} · salaire proposé ${U.money(o.wage)}/sem</span><button class="btn btn-primary" onclick="UI.acceptCoachJob(${i})">Accepter ce poste</button></div>`;
    }).join('');
    this.render(`${this.header('Offres Coach')}<div class="content">${rows || '<div class="muted">Aucune offre.</div>'}<button class="btn btn-ghost" onclick="UI.club()">‹ Retour</button></div>${this.nav('club')}`);
  },

  acceptCoachJob(i) {
    const r = TRANSFERS.acceptCoachOffer(i);
    this.toast(r.msg); SAVE.save(); this.home();
  },

  showYouthSigningAlert() {
    document.querySelectorAll('.youth-signing-overlay').forEach(x => x.remove());
    if (!GAME.G || typeof ACADEMY === 'undefined' || !GAME.G.myClub) return;
    const y = ACADEMY.nextSigningAlert();
    if (!y) return;
    const cost = ACADEMY.academyRecruitCost(y);
    const legal = y.age < 16
      ? 'Signature obligatoire avec les parents ou le tuteur légal, et l’agent si le jeune en a un.'
      : 'Signature avec le jeune et son agent directement.';
    const overlay = document.createElement('div');
    overlay.className = 'youth-signing-overlay';
    overlay.innerHTML = `
      <div class="youth-signing-modal">
        <div class="ys-kicker">Alerte signature centre de formation</div>
        <h2>${U.esc(y.fullName)} a accepté</h2>
        <p>${U.esc(y.name)} veut rejoindre ton centre de formation. Maintenant tu valides ou tu refuses. Oui, même dans un jeu, la paperasse a survécu.</p>
        <div class="ys-grid">
          <div><span>Âge</span><b>${y.age} ans</b></div>
          <div><span>Poste</span><b>${U.esc(y.pos)}</b></div>
          <div><span>Coût</span><b>${U.money(cost)}</b></div>
          <div><span>Potentiel</span><b>${ACADEMY.potRange(y)}</b></div>
        </div>
        <div class="ys-legal">${legal}</div>
        <div class="ys-actions">
          <button class="btn btn-primary" onclick="UI.confirmYouthSigning('${y.aid}')">✅ Signer maintenant</button>
          <button class="btn btn-ghost" onclick="UI.refuseYouthSigning('${y.aid}')">Refuser</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  },

  confirmYouthSigning(aid) {
    const r = ACADEMY.resolveYouthSigning(aid, true);
    this.toast(r.msg); SAVE.save();
    document.querySelectorAll('.youth-signing-overlay').forEach(x => x.remove());
    if (r.ok && this.screen === 'academy') this._activeAcademyAid ? this.academyPlayer(this._activeAcademyAid) : this.academyScreen(this._acadTab || 'centre');
    else if (r.ok && this.screen === 'club') this.club();
    else setTimeout(() => this.showYouthSigningAlert(), 80);
  },

  refuseYouthSigning(aid) {
    const r = ACADEMY.resolveYouthSigning(aid, false);
    this.toast(r.msg); SAVE.save();
    document.querySelectorAll('.youth-signing-overlay').forEach(x => x.remove());
    setTimeout(() => this.showYouthSigningAlert(), 80);
  },

  // ---------- SAUVEGARDES ----------
  saveScreen() {
    const meta = SAVE.meta();
    const inGame = !!GAME.G;
    this.render(`<div class="topbar"><button class="btn-back" onclick="${inGame ? 'UI.home()' : 'UI.mainMenu()'}">‹</button><h2>Sauvegardes & Options</h2></div>
      <div class="content">
        ${meta ? `<div class="card"><b>${U.esc(meta.club)}</b> — Saison ${meta.season}, jour ${meta.day}<br><span class="muted small">${(meta.size / 1e6).toFixed(2)} Mo · ${new Date(meta.ts).toLocaleString('fr-CA')}</span></div>` : '<div class="muted">Aucune sauvegarde.</div>'}
        ${inGame ? `<button class="btn btn-primary" onclick="const r=SAVE.save();UI.toast(r.ok?'Sauvegardé ('+(r.size/1e6).toFixed(1)+' Mo)':r.msg)">💾 Sauvegarder maintenant</button>` : ''}
        ${inGame ? `<button class="btn" onclick="SAVE.exportSave()">📤 Exporter la sauvegarde (.json)</button>` : ''}
        <label class="btn" style="text-align:center">📥 Importer une sauvegarde
          <input type="file" accept=".json" style="display:none" onchange="SAVE.importSave(this.files[0],r=>{UI.toast(r.ok?'Import réussi !':r.msg);if(r.ok)UI.home()})"></label>
        ${meta ? `<button class="btn btn-ghost" onclick="if(confirm('Supprimer définitivement la sauvegarde ?')){SAVE.erase();UI.mainMenu()}">🗑️ Supprimer la sauvegarde</button>` : ''}
        <button class="btn btn-ghost" onclick="UI.mainMenu()">🏠 Menu principal</button>
        <p class="muted small">Football Empire: World Simulation v1.1<br>Base de données : FC26 (18 405 joueurs réels) · Simulation 100 % hors ligne<br>🎮 Manette PS4/PS5 : croix directionnelle = navigation, X = valider, O = retour</p>
      </div>`);
  }
};

// ============ SUPPORT MANETTE PS4/PS5 (navigation menus) ============
const GAMEPAD = {
  idx: -1, lastMove: 0, focus: 0,
  init() {
    window.addEventListener('gamepadconnected', e => { this.idx = e.gamepad.index; UI.toast('🎮 Manette connectée : ' + e.gamepad.id.slice(0, 30)); });
    window.addEventListener('gamepaddisconnected', () => { this.idx = -1; });
    this.loop();
  },
  focusables() { return [...document.querySelectorAll('button, .row, input, label.btn')]; },
  loop() {
    requestAnimationFrame(() => this.loop());
    if (this.idx < 0) return;
    const gp = navigator.getGamepads()[this.idx];
    if (!gp) return;
    const now = Date.now();
    if (now - this.lastMove < 180) return;
    const els = this.focusables();
    if (!els.length) return;
    const up = gp.buttons[12] && gp.buttons[12].pressed || gp.axes[1] < -0.6;
    const down = gp.buttons[13] && gp.buttons[13].pressed || gp.axes[1] > 0.6;
    const cross = gp.buttons[0] && gp.buttons[0].pressed;   // X
    const circle = gp.buttons[1] && gp.buttons[1].pressed;  // O
    if (up || down) {
      this.focus = U.clamp(this.focus + (down ? 1 : -1), 0, els.length - 1);
      els.forEach(e => e.classList.remove('gp-focus'));
      els[this.focus].classList.add('gp-focus');
      els[this.focus].scrollIntoView({ block: 'nearest' });
      this.lastMove = now;
    }
    if (cross) { const e = els[this.focus]; if (e) e.click(); this.lastMove = now + 150; }
    if (circle) { const back = document.querySelector('.btn-back'); if (back) back.click(); this.lastMove = now + 150; }
  }
};

window.addEventListener('DOMContentLoaded', () => UI.init());
