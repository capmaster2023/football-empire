// ============ UTIL ============
const U = {
  seed: Date.now() % 2147483647,
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; },
  ri(a, b) { return a + Math.floor(this.rnd() * (b - a + 1)); },
  pick(arr) { return arr[Math.floor(this.rnd() * arr.length)]; },
  gauss(mu = 0, sig = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.rnd();
    while (v === 0) v = this.rnd();
    return mu + sig * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  },
  poisson(lambda) {
    const L = Math.exp(-lambda); let k = 0, p = 1;
    do { k++; p *= this.rnd(); } while (p > L);
    return k - 1;
  },
  clamp(x, a, b) { return Math.max(a, Math.min(b, x)); },

  // Argent
  money(v) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + ' Md€';
    if (abs >= 1e6) return (v / 1e6).toFixed(1) + ' M€';
    if (abs >= 1e3) return Math.round(v / 1e3) + ' K€';
    return Math.round(v) + ' €';
  },

  // Comprend : "10" (=10 M€), "10M", "10 m€", "10 000 000", "750k".
  // Avant, le jeu avalait seulement un nombre simple. Naturellement, les humains écrivent l'argent n'importe comment.
  parseMoney(input, bareMeansMillions = true) {
    if (input == null) return NaN;
    let raw = String(input).trim().toLowerCase();
    if (!raw) return NaN;
    raw = raw.replace(/€/g, '').replace(/eur/g, '').replace(/,/g, '.').replace(/\s+/g, '');
    const hasM = /m|million/.test(raw);
    const hasK = /k/.test(raw);
    raw = raw.replace(/millions?/g, '').replace(/m/g, '').replace(/k/g, '');
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    if (hasM) return Math.round(n * 1e6);
    if (hasK) return Math.round(n * 1e3);
    if (bareMeansMillions && n < 1000) return Math.round(n * 1e6);
    return Math.round(n);
  },

  normalize(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  },

  // Dates : jour 0 = samedi 1er août de l'année de saison
  MONTHS: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
  DAYS: ['sam.', 'dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.'],
  dateOf(day, seasonYear) {
    const d = new Date(seasonYear, 7, 1); // 1er août
    d.setDate(d.getDate() + day);
    return d;
  },
  fmtDate(day, seasonYear) {
    const d = this.dateOf(day, seasonYear);
    return this.DAYS[day % 7] + ' ' + d.getDate() + ' ' + this.MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  },
  fmtDateShort(day, seasonYear) {
    const d = this.dateOf(day, seasonYear);
    return d.getDate() + ' ' + this.MONTHS[d.getMonth()];
  },

  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },

  posGroup(pos) {
    const p = String(pos).split(',')[0].trim();
    if (p === 'GK') return 'GK';
    if (['CB', 'LB', 'RB', 'LWB', 'RWB'].includes(p)) return 'DF';
    if (['CDM', 'CM', 'CAM', 'LM', 'RM'].includes(p)) return 'MF';
    return 'AT';
  },

  ovrColor(o) {
    if (o >= 85) return '#d4af37';
    if (o >= 78) return '#3fb950';
    if (o >= 70) return '#58a6ff';
    if (o >= 62) return '#c9d1d9';
    return '#8b949e';
  },

  // Générateur de noms pour les jeunes (regens)
  NAMES: {
    'England': [['Harry','Jack','Oliver','George','Charlie','Lewis','Mason','Callum','Kyle','Reece'],['Smith','Jones','Taylor','Brown','Wilson','Walker','Clarke','Wright','Hughes','Bennett']],
    'Spain': [['Pablo','Álvaro','Sergio','Iker','Adrián','Diego','Marcos','Javi','Rubén','Unai'],['García','Martínez','López','Sánchez','Torres','Navarro','Moreno','Ramos','Ortega','Vidal']],
    'Germany': [['Lukas','Felix','Jonas','Leon','Niklas','Tim','Finn','Maximilian','Paul','Moritz'],['Müller','Schmidt','Weber','Fischer','Wagner','Becker','Hoffmann','Koch','Richter','Klein']],
    'France': [['Lucas','Théo','Enzo','Hugo','Mathis','Nathan','Yanis','Rayan','Killian','Axel'],['Martin','Bernard','Dubois','Moreau','Laurent','Girard','Petit','Roux','Fontaine','Diallo']],
    'Italy': [['Marco','Luca','Alessandro','Matteo','Federico','Simone','Davide','Gianluca','Nicolò','Riccardo'],['Rossi','Russo','Ferrari','Esposito','Bianchi','Romano','Ricci','Greco','Conti','Gallo']],
    'Brazil': [['Gabriel','Lucas','Matheus','João','Vinícius','Pedro','Rafael','Thiago','Caio','Igor'],['Silva','Santos','Oliveira','Souza','Costa','Pereira','Almeida','Ferreira','Ribeiro','Barbosa']],
    'Argentina': [['Santiago','Mateo','Joaquín','Facundo','Tomás','Agustín','Nicolás','Lautaro','Franco','Thiago'],['González','Rodríguez','Fernández','López','Díaz','Martínez','Romero','Acosta','Medina','Sosa']],
    'Portugal': [['João','Diogo','Tiago','Gonçalo','Rúben','André','Rafael','Bruno','Nuno','Francisco'],['Silva','Santos','Ferreira','Costa','Oliveira','Rodrigues','Fernandes','Gomes','Lopes','Carvalho']],
    'Netherlands': [['Daan','Sem','Lars','Thijs','Bram','Jesse','Ruben','Nick','Joris','Sven'],['de Jong','Bakker','Visser','van Dijk','Smit','de Vries','Mulder','Bos','Vos','Kuipers']],
    'Burundi': [['Fiston','Jonathan','Cédric','Saido','Gaël','Éric','Bienvenu','Frédéric','Landry','Pacifique'],['Ndayishimiye','Niyonkuru','Bigirimana','Nduwimana','Hakizimana','Irakoze','Nkurunziza','Manirakiza','Bizimana','Ndikumana']],
    'default': [['Alex','Dani','Sami','Marco','Leo','Ivan','Nico','Emil','Omar','Adam'],['Petrov','Costa','Kimura','Ali','Novak','Silva','Traoré','Yilmaz','Kovac','Moreno']]
  },
  genName(nat) {
    const pool = this.NAMES[nat] || this.NAMES['default'];
    return this.pick(pool[0]) + ' ' + this.pick(pool[1]);
  }
};
