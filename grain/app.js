/* ============================================
   GRAIN — app.js
   ============================================ */

const STORAGE_KEY = 'grain_v1';

const PALETTE = [
  '#1E5E2C', // forest
  '#1B5B8A', // ocean
  '#5B3D9E', // grape
  '#A0391A', // clay
  '#B86A0A', // amber
  '#9A1D5A', // rose
  '#0F6B62', // teal
  '#3D3A35', // slate
];

/* ─── State ──────────────────────────────── */

let state = { habits: [] };

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (_) { /* ignore corrupt storage */ }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ─── Date helpers ────────────────────────── */

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function shortDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isDone(habit, date) {
  return habit.completions.includes(date);
}

/* ─── Streak calculations ─────────────────────── */

function streak(habit) {
  const t = today();
  let cur = t;

  if (!isDone(habit, t)) {
    const yest = daysAgo(1);
    if (!isDone(habit, yest)) return 0;
    cur = yest;
  }

  let count = 0;
  while (isDone(habit, cur)) {
    count++;
    const d = new Date(cur + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    cur = d.toISOString().slice(0, 10);
  }
  return count;
}

function bestStreak(habit) {
  if (!habit.completions.length) return 0;
  const sorted = [...habit.completions].sort();
  let best = 1, run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const cur  = new Date(sorted[i]     + 'T00:00:00');
    if ((cur - prev) / 86400000 === 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

function overallStreak() {
  if (!state.habits.length) return 0;
  const all = new Set(state.habits.flatMap(h => h.completions));
  const t = today();
  let cur = t;
  if (!all.has(t)) {
    const yest = daysAgo(1);
    if (!all.has(yest)) return 0;
    cur = yest;
  }
  let count = 0;
  while (all.has(cur)) {
    count++;
    const d = new Date(cur + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    cur = d.toISOString().slice(0, 10);
  }
  return count;
}

/* ─── Render: header ────────────────────────── */

function renderHeader() {
  const el = document.getElementById('header-date');
  el.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

/* ─── Render: today panel ─────────────────────── */

function renderToday() {
  const t     = today();
  const list  = document.getElementById('habit-list');
  const empty = document.getElementById('empty');
  const tally = document.getElementById('tally');
  const fill  = document.getElementById('progress-fill');
  const bar   = document.getElementById('progress-bar');

  list.innerHTML = '';

  if (!state.habits.length) {
    empty.hidden = false;
    tally.textContent = '0 / 0';
    fill.style.width  = '0%';
    bar.setAttribute('aria-valuenow', 0);
    return;
  }

  empty.hidden = true;

  const total = state.habits.length;
  const done  = state.habits.filter(h => isDone(h, t)).length;
  const pct   = Math.round((done / total) * 100);

  tally.textContent = `${done} / ${total}`;
  fill.style.width  = `${pct}%`;
  bar.setAttribute('aria-valuenow', pct);

  state.habits.forEach(h => {
    const completed = isDone(h, t);
    const s         = streak(h);

    const li = document.createElement('li');
    li.className   = `habit-item${completed ? ' done' : ''}`;
    li.dataset.id  = h.id;
    li.tabIndex    = 0;
    li.setAttribute('role', 'button');
    li.setAttribute('aria-pressed', completed ? 'true' : 'false');
    li.setAttribute('aria-label', `${h.name}${completed ? ' — done' : ''}`);

    li.innerHTML = `
      <div class="habit-check" style="--hcolor:${h.color}" aria-hidden="true">
        <svg class="check-svg" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" stroke-width="1.75"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="habit-name">${esc(h.name)}</span>
      ${s > 0 ? `<span class="habit-streak" aria-label="${s} day streak">
        <span class="streak-gem" aria-hidden="true">◆</span>${s}d
      </span>` : ''}
      <button class="habit-del" aria-label="Delete ${esc(h.name)}" tabindex="-1">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round"/>
          <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" stroke="currentColor"
            stroke-width="1.75" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    function onToggle(e) {
      if (e.target.closest('.habit-del')) return;
      toggle(h.id, li);
    }

    li.addEventListener('click', onToggle);
    li.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(e); }
    });

    li.querySelector('.habit-del').addEventListener('click', e => {
      e.stopPropagation();
      remove(h.id, li);
    });

    list.appendChild(li);
  });
}

/* ─── Render: stats ──────────────────────────── */

function renderStats() {
  const t       = today();
  const habits  = state.habits;
  const total   = habits.length;

  const todayDone = total ? habits.filter(h => isDone(h, t)).length : null;
  const todayPct  = total ? Math.round((todayDone / total) * 100) : null;

  let weekDone = 0, weekTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = daysAgo(i);
    habits.forEach(h => { weekTotal++; if (isDone(h, d)) weekDone++; });
  }
  const weekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : null;

  const oStreak = overallStreak();
  const bStreak = total ? Math.max(...habits.map(h => bestStreak(h))) : 0;

  document.getElementById('stat-streak').textContent = oStreak;
  document.getElementById('stat-today').textContent  = todayPct !== null ? `${todayPct}%` : '—';
  document.getElementById('stat-week').textContent   = weekPct  !== null ? `${weekPct}%`  : '—';
  document.getElementById('stat-best').textContent   = bStreak;
}

/* ─── Render: heatmap ─────────────────────────── */

function renderHeatmap() {
  const t       = today();
  const td      = new Date(t + 'T00:00:00');
  const habits  = state.habits;
  const maxH    = habits.length || 1;

  const dow   = td.getDay();
  const toMon = (dow === 0) ? 6 : dow - 1;
  const thisMon = new Date(td);
  thisMon.setDate(thisMon.getDate() - toMon);

  const startDate = new Date(thisMon);
  startDate.setDate(startDate.getDate() - 14 * 7);

  const endDate = new Date(thisMon);
  endDate.setDate(endDate.getDate() + 6);

  const dates = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  const grid = document.getElementById('heatmap-grid');
  grid.innerHTML = '';

  dates.forEach(date => {
    const future = date > t;
    const count  = future ? 0 : habits.filter(h => isDone(h, date)).length;
    const level  = (!future && count > 0) ? Math.ceil((count / maxH) * 4) : 0;

    const cell = document.createElement('div');
    cell.className = `hcell${date === t ? ' hcell-today' : ''}${future ? ' hcell-future' : ''}`;
    cell.dataset.level = level;

    if (!future) {
      const label = `${shortDate(date)}: ${count} of ${maxH}`;
      cell.setAttribute('aria-label', label);
    }

    grid.appendChild(cell);
  });
}

/* ─── Actions ───────────────────────────────── */

function toggle(id, li) {
  const t = today();
  const h = state.habits.find(x => x.id === id);
  if (!h) return;

  if (isDone(h, t)) {
    h.completions = h.completions.filter(d => d !== t);
  } else {
    h.completions.push(t);
    const check = li.querySelector('.habit-check');
    burst(check, h.color);
  }

  save();
  renderToday();
  renderStats();
  renderHeatmap();
}

function remove(id, li) {
  li.classList.add('is-deleting');
  setTimeout(() => {
    state.habits = state.habits.filter(h => h.id !== id);
    save();
    renderAll();
  }, 210);
}

function addHabit(name, color) {
  const id = `h${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  state.habits.push({ id, name, color, completions: [], createdAt: today() });
  save();
  renderAll();
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) el.classList.add('is-new');
  });
}

/* ─── Particle burst ─────────────────────────── */

function burst(origin, color) {
  const r = origin.getBoundingClientRect();
  const cx = r.left + r.width  / 2;
  const cy = r.top  + r.height / 2;

  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
    const dist  = 20 + Math.random() * 18;
    const tx    = Math.cos(angle) * dist;
    const ty    = Math.sin(angle) * dist;

    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left:${cx - 2.5}px;
      top:${cy - 2.5}px;
      background:${color};
      --tx:${tx}px;
      --ty:${ty}px;
    `;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 560);
  }
}

/* ─── Escape HTML ───────────────────────────── */

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── Render all ────────────────────────────── */

function renderAll() {
  renderHeader();
  renderToday();
  renderStats();
  renderHeatmap();
}

/* ─── Modal ────────────────────────────────── */

let selectedColor = PALETTE[0];

function buildColorPicker() {
  const container = document.getElementById('color-picker');
  container.innerHTML = '';

  PALETTE.forEach((color, i) => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = `cswatch${i === 0 ? ' active' : ''}`;
    btn.style.background = color;
    btn.setAttribute('aria-label', `Color option ${i + 1}`);
    btn.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');

    btn.addEventListener('click', () => {
      selectedColor = color;
      container.querySelectorAll('.cswatch').forEach(s => {
        s.classList.remove('active');
        s.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    });

    container.appendChild(btn);
  });

  selectedColor = PALETTE[0];
}

function openModal() {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.classList.add('open');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.getElementById('habit-name').value = '';
  buildColorPicker();
  requestAnimationFrame(() => document.getElementById('habit-name').focus());
}

function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  backdrop.classList.remove('open');
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ─── Event listeners ─────────────────────────── */

document.getElementById('btn-add').addEventListener('click', openModal);
document.getElementById('btn-empty').addEventListener('click', openModal);
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);

document.getElementById('modal-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('habit-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('habit-name').value.trim();
  if (!name) return;
  addHabit(name, selectedColor);
  closeModal();
});

/* ─── Init ────────────────────────────────────── */

loadState();
buildColorPicker();
renderAll();
