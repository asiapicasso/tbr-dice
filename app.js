(() => {
  'use strict';

  const MAX_FACES = 6;
  const MAX_LABEL = 16;
  const MAX_OPTIONS = 30;
  const STORAGE_KEY = 'tbr-dice:v2';
  const DICE = ['genre', 'medium'];
  const DURATION = { genre: 1300, medium: 1700 };

  // Cube rotation [x, y] that brings face i to the front (matches the CSS face order).
  const FACE_ROTATION = [[0, 0], [0, -90], [0, -180], [0, 90], [-90, 0], [90, 0]];

  const DEFAULTS = {
    genre: [
      ['Fantasy', true], ['Sci-Fi', true], ['Romance', true], ['Mystery', true],
      ['Historical', true], ['Non-fiction', true],
      ['Horror', false], ['Thriller', false], ['Classics', false],
      ['Contemporary', false], ['Poetry', false],
    ],
    medium: [
      ['New', true], ['Second hand', true], ['E-book', true], ['Audiobook', true],
      ['Library loan', true], ["Reader's choice", true],
      ['Graphic novel', false], ['Manga / comic', false], ['Reread', false], ['Borrowed', false],
    ],
  };

  const $ = (sel) => document.querySelector(sel);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- state ---------- */

  const defaultsFor = (key) => DEFAULTS[key].map(([label, checked]) => ({ label, checked }));

  function load() {
    const state = {};
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* ignore */ }
    for (const key of DICE) {
      const list = saved && Array.isArray(saved[key]) ? saved[key] : null;
      const clean = list && list
        .filter((o) => o && typeof o.label === 'string' && o.label.trim())
        .slice(0, MAX_OPTIONS)
        .map((o) => ({ label: o.label.trim().slice(0, MAX_LABEL), checked: !!o.checked }));
      let seen = 0;
      if (clean) for (const o of clean) if (o.checked && ++seen > MAX_FACES) o.checked = false;
      state[key] = clean && seen > 0 ? clean : defaultsFor(key);
    }
    return state;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }

  const state = load();
  const checkedOf = (key) => state[key].filter((o) => o.checked);

  /* ---------- dice ---------- */

  const dice = {};
  for (const key of DICE) {
    const el = document.querySelector(`.die[data-die="${key}"]`);
    dice[key] = { el, cube: el.querySelector('.cube'), x: 0, y: 0 };
  }

  const rollBtn = $('#roll');
  const resultEl = $('#result');
  let rolling = false;
  let typing = 0;

  function randomInt(n) {
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  // Fewer than 6 checked options: repeat them around the cube.
  function renderFaces(key) {
    const labels = checkedOf(key).map((o) => o.label);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < MAX_FACES; i++) {
      const label = labels[i % labels.length];
      const longest = Math.max(...label.split(/[\s/-]+/).map((w) => w.length), 1);
      const scale = Math.max(0.05, Math.min(0.13, 0.8 / longest));
      const face = document.createElement('div');
      face.className = 'face';
      face.style.fontSize = `calc(var(--s) * ${scale.toFixed(3)})`;
      face.textContent = label;
      frag.append(face);
    }
    dice[key].cube.replaceChildren(frag);
  }

  // Smallest angle past `current + turns` full spins that lands on `base`.
  function nextAngle(current, base, turns) {
    const target = current + turns * 360;
    return target + ((((base - target) % 360) + 360) % 360);
  }

  function roll() {
    if (rolling) return;
    rolling = true;
    typing++;
    rollBtn.disabled = true;
    resultEl.textContent = '> rolling...';

    const picks = {};
    let wait = 0;
    for (const key of DICE) {
      const die = dice[key];
      const labels = checkedOf(key).map((o) => o.label);
      const pick = randomInt(labels.length);          // uniform over the options
      const faces = [];
      for (let i = 0; i < MAX_FACES; i++) if (i % labels.length === pick) faces.push(i);
      const face = faces[randomInt(faces.length)];
      picks[key] = labels[pick];

      const dur = reducedMotion.matches ? 0 : DURATION[key];
      wait = Math.max(wait, dur);
      die.x = nextAngle(die.x, FACE_ROTATION[face][0], 2 + randomInt(2));
      die.y = nextAngle(die.y, FACE_ROTATION[face][1], 2 + randomInt(3));
      die.el.style.setProperty('--dur', `${dur}ms`);
      die.el.classList.remove('rolling', 'landed');
      void die.el.offsetWidth; // restart the hop animation
      die.el.classList.add('rolling');
      die.cube.style.transform = `rotateX(${die.x}deg) rotateY(${die.y}deg)`;
    }

    setTimeout(() => {
      for (const key of DICE) {
        dice[key].el.classList.remove('rolling');
        dice[key].el.classList.add('landed');
      }
      rolling = false;
      rollBtn.disabled = false;
      typeResult(picks);
      if (drawerOpen) print(`rolled: ${picks.genre} x ${picks.medium}`, 'muted');
    }, wait + 60);
  }

  function typeResult(picks) {
    const run = ++typing;
    const parts = [
      ['> next read: ', 'span'], [picks.genre.toUpperCase(), 'b'],
      [' x ', 'span'], [picks.medium.toUpperCase(), 'b'], [' ', 'span'],
    ];
    resultEl.replaceChildren();
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    cursor.textContent = '█';
    if (reducedMotion.matches) {
      for (const [text, tag] of parts) {
        const node = document.createElement(tag);
        node.textContent = text;
        resultEl.append(node);
      }
      resultEl.append(cursor);
      return;
    }
    let p = 0, c = 0, node = null;
    const tick = () => {
      if (run !== typing) return;
      if (p >= parts.length) { resultEl.append(cursor); return; }
      if (c === 0) {
        node = document.createElement(parts[p][1]);
        resultEl.append(node);
      }
      node.textContent += parts[p][0][c++];
      if (c >= parts[p][0].length) { p++; c = 0; }
      setTimeout(tick, 24);
    };
    tick();
  }

  function clearResult() {
    typing++;
    resultEl.textContent = '> faces updated. roll again.';
  }

  /* ---------- drawer terminal ---------- */

  const drawer = $('#drawer');
  const listEl = $('#list');
  const logEl = $('#log');
  const countEl = $('#count');
  const ps1El = $('#ps1');
  const cmdEl = $('#cmd');
  const history = [];
  let historyAt = 0;
  let current = 'genre';
  let drawerOpen = false;

  function print(text, cls = '') {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = text;
    logEl.append(line);
    while (logEl.childElementCount > 80) logEl.firstElementChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderDrawer() {
    const options = state[current];
    const count = checkedOf(current).length;
    const full = count >= MAX_FACES;

    for (const tab of drawer.querySelectorAll('.tab')) {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === current));
    }
    for (const key of DICE) dice[key].el.classList.toggle('active', drawerOpen && key === current);
    countEl.textContent = `[${count}/${MAX_FACES} faces]`;
    countEl.classList.toggle('full', full);
    ps1El.textContent = `tbr@dice:~/${current}$`;

    const frag = document.createDocumentFragment();
    options.forEach((opt, i) => {
      const li = document.createElement('li');

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt';
      btn.dataset.index = i;
      btn.setAttribute('role', 'checkbox');
      btn.setAttribute('aria-checked', String(opt.checked));
      if (!opt.checked && full) {
        btn.classList.add('locked');
        btn.setAttribute('aria-disabled', 'true');
      }
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(i + 1).padStart(2, '0');
      const box = document.createElement('span');
      box.textContent = opt.checked ? '[x]' : '[ ]';
      const label = document.createElement('span');
      label.textContent = opt.label;
      btn.append(n, box, label);

      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rm';
      rm.dataset.index = i;
      rm.textContent = 'rm';
      rm.setAttribute('aria-label', `Remove ${opt.label}`);

      li.append(btn, rm);
      frag.append(li);
    });
    listEl.replaceChildren(frag);
  }

  function openDrawer(key) {
    const switched = key !== current || !drawerOpen;
    current = key;
    drawerOpen = true;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
    renderDrawer();
    if (switched) print(`editing the ${key} die: click an option or type a command ('help').`, 'muted');
    cmdEl.focus({ preventScroll: true });
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    for (const key of DICE) dice[key].el.classList.remove('active');
    dice[current].el.focus({ preventScroll: true });
  }

  /* ---------- editing ---------- */

  function commit() {
    save();
    renderFaces(current);
    renderDrawer();
    clearResult();
  }

  function guard() {
    if (rolling) { print('dice are still rolling, hold on.', 'err'); return false; }
    return true;
  }

  function setChecked(index, value) {
    if (!guard()) return;
    const opt = state[current][index];
    const count = checkedOf(current).length;
    if (opt.checked === value) {
      print(`'${opt.label}' is already ${value ? 'on' : 'off'} the die.`, 'muted');
      return;
    }
    if (value && count >= MAX_FACES) {
      print(`a die only has ${MAX_FACES} faces: uncheck one first.`, 'err');
      return;
    }
    if (!value && count <= 1) {
      print('a die needs at least 1 face.', 'err');
      return;
    }
    opt.checked = value;
    commit();
    print(`${value ? '[x]' : '[ ]'} ${opt.label}`);
  }

  function addOption(raw) {
    if (!guard()) return;
    const label = raw.trim().replace(/\s+/g, ' ');
    if (!label) { print('usage: add <name>', 'err'); return; }
    if (label.length > MAX_LABEL) { print(`too long: max ${MAX_LABEL} characters.`, 'err'); return; }
    const options = state[current];
    if (options.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      print(`'${label}' already exists.`, 'err');
      return;
    }
    if (options.length >= MAX_OPTIONS) { print(`list is full (${MAX_OPTIONS}): rm something first.`, 'err'); return; }
    const checked = checkedOf(current).length < MAX_FACES;
    options.push({ label, checked });
    commit();
    print(checked ? `added '${label}' to the die.` : `added '${label}' (unchecked: the die is full).`);
  }

  function removeOption(index) {
    if (!guard()) return;
    const options = state[current];
    const opt = options[index];
    if (opt.checked && checkedOf(current).length <= 1) {
      print('cannot remove the last face of the die.', 'err');
      return;
    }
    options.splice(index, 1);
    commit();
    print(`removed '${opt.label}'.`);
  }

  function resetOptions() {
    if (!guard()) return;
    state[current] = defaultsFor(current);
    commit();
    print(`${current} die reset to defaults.`);
  }

  // Resolve "3" or "fant" to an option index.
  function find(arg) {
    const options = state[current];
    if (!arg) return -1;
    if (/^\d+$/.test(arg)) {
      const i = Number(arg) - 1;
      return i >= 0 && i < options.length ? i : -1;
    }
    const q = arg.toLowerCase();
    const exact = options.findIndex((o) => o.label.toLowerCase() === q);
    return exact >= 0 ? exact : options.findIndex((o) => o.label.toLowerCase().startsWith(q));
  }

  const HELP = [
    'ls                  list the options',
    'add <name>          add an option',
    'rm <n|name>         remove an option',
    'check <n|name>      put it on the die (max 6)',
    'uncheck <n|name>    take it off the die',
    '<n>                 toggle option n',
    'use genre|medium    switch die',
    'reset               restore the defaults',
    'roll                roll the dice',
    'clear               clear this console',
    'exit                close the editor (Esc)',
  ];

  function exec(line) {
    const input = line.trim();
    if (!input) return;
    print(`${ps1El.textContent} ${input}`, 'in');
    const space = input.indexOf(' ');
    const cmd = (space < 0 ? input : input.slice(0, space)).toLowerCase();
    const arg = space < 0 ? '' : input.slice(space + 1).trim();

    const withTarget = (fn) => {
      const i = find(arg);
      if (i < 0) print(arg ? `no such option: ${arg}` : `usage: ${cmd} <n|name>`, 'err');
      else fn(i);
    };

    if (/^\d+$/.test(input)) {
      const i = find(input);
      if (i < 0) print(`no such option: ${input}`, 'err');
      else setChecked(i, !state[current][i].checked);
      return;
    }

    switch (cmd) {
      case 'help': case '?':
        HELP.forEach((l) => print(l));
        break;
      case 'ls': case 'list':
        state[current].forEach((o, i) => print(`${String(i + 1).padStart(2, '0')} ${o.checked ? '[x]' : '[ ]'} ${o.label}`));
        print(`${checkedOf(current).length}/${MAX_FACES} faces used.`, 'muted');
        break;
      case 'add': case 'touch':
        addOption(arg);
        break;
      case 'rm': case 'del': case 'remove':
        withTarget(removeOption);
        break;
      case 'check': case 'on':
        withTarget((i) => setChecked(i, true));
        break;
      case 'uncheck': case 'off':
        withTarget((i) => setChecked(i, false));
        break;
      case 'toggle':
        withTarget((i) => setChecked(i, !state[current][i].checked));
        break;
      case 'use': case 'cd': {
        const key = arg.replace(/^[~/.]+/, '').toLowerCase();
        if (DICE.includes(key)) openDrawer(key);
        else print('usage: use genre|medium', 'err');
        break;
      }
      case 'genre': case 'medium':
        openDrawer(cmd);
        break;
      case 'reset':
        resetOptions();
        break;
      case 'roll':
        if (rolling) print('dice are already rolling.', 'err');
        else roll();
        break;
      case 'clear': case 'cls':
        logEl.replaceChildren();
        break;
      case 'exit': case 'quit': case 'q':
        closeDrawer();
        break;
      default:
        print(`command not found: ${cmd} (try 'help')`, 'err');
    }
  }

  /* ---------- events ---------- */

  rollBtn.addEventListener('click', roll);

  for (const key of DICE) {
    dice[key].el.addEventListener('click', () => openDrawer(key));
  }

  for (const tab of drawer.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => openDrawer(tab.dataset.tab));
  }
  $('#close').addEventListener('click', closeDrawer);

  listEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const index = Number(btn.dataset.index);
    const kind = btn.classList.contains('rm') ? '.rm' : '.opt';
    if (kind === '.rm') removeOption(index);
    else setChecked(index, !state[current][index].checked);
    // the list was re-rendered: keep keyboard focus where it was
    const again = listEl.querySelectorAll(kind);
    if (again.length) again[Math.min(index, again.length - 1)].focus({ preventScroll: true });
  });

  listEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    const kind = btn.classList.contains('rm') ? '.rm' : '.opt';
    const all = [...listEl.querySelectorAll(kind)];
    const next = all.indexOf(btn) + (e.key === 'ArrowDown' ? 1 : -1);
    if (next >= all.length) cmdEl.focus();
    else if (next >= 0) all[next].focus();
  });

  $('#prompt').addEventListener('submit', (e) => {
    e.preventDefault();
    const line = cmdEl.value;
    cmdEl.value = '';
    if (line.trim()) {
      history.push(line);
      if (history.length > 50) history.shift();
    }
    historyAt = history.length;
    exec(line);
  });

  cmdEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && historyAt > 0) {
      e.preventDefault();
      cmdEl.value = history[--historyAt];
    } else if (e.key === 'ArrowDown' && historyAt < history.length) {
      e.preventDefault();
      cmdEl.value = history[++historyAt] || '';
    }
  });

  // Like a real terminal: clicking anywhere in the console focuses the prompt.
  drawer.querySelector('.console').addEventListener('click', () => {
    if (!String(window.getSelection())) cmdEl.focus({ preventScroll: true });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    if (target.matches('input, textarea')) return;

    const die = target.closest('.die');
    const activate = e.key === 'Enter' || e.key === ' ';
    if (activate) {
      if (die) { e.preventDefault(); openDrawer(die.dataset.die); return; }
      if (target.closest('button')) return; // native button activation
      e.preventDefault();
      roll();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 'g') { e.preventDefault(); openDrawer('genre'); }
    else if (k === 'm') { e.preventDefault(); openDrawer('medium'); }
    else if (k === 'r') roll();
  });

  /* ---------- init ---------- */

  for (const key of DICE) renderFaces(key);
  renderDrawer();
  resultEl.textContent = '> ready. press [space] or hit the button.';
})();
