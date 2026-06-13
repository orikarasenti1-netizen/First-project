/* ============================================
   FOLIO — app.js
   ============================================ */

const KEY = 'folio_v1';

const CURRENCIES = {
  USD: { symbol: '$',  locale: 'en-US' },
  EUR: { symbol: '€',  locale: 'de-DE' },
  GBP: { symbol: '£',  locale: 'en-GB' },
  CAD: { symbol: 'CA$',locale: 'en-CA' },
  AUD: { symbol: 'A$', locale: 'en-AU' },
  JPY: { symbol: '¥',  locale: 'ja-JP' },
};

/* ─── State ─────────────────────────────── */

let db = {
  settings: {
    name: '', email: '', phone: '', address: '',
    currency: 'USD', tax: 0, terms: 'Net 30',
    prefix: 'INV', notes: '', nextNum: 1,
  },
  invoices: [],
};

let currentFilter  = 'all';
let editingId      = null;   // null = new invoice
let itemIdCounter  = 0;

function load() {
  try { const r = localStorage.getItem(KEY); if (r) db = JSON.parse(r); } catch (_) {}
}
function persist() { localStorage.setItem(KEY, JSON.stringify(db)); }

/* ─── Routing / Views ────────────────────── */

let currentView = 'dashboard';

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + id).classList.remove('hidden');
  currentView = id;
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === id);
  });
}

/* ─── Currency / Money ───────────────────── */

function fmt(amount, currency) {
  const c = currency || db.settings.currency;
  const info = CURRENCIES[c] || CURRENCIES.USD;
  if (c === 'JPY') return info.symbol + Math.round(amount).toLocaleString(info.locale);
  return info.symbol + amount.toLocaleString(info.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Date helpers ───────────────────────── */

function today() { return new Date().toISOString().slice(0, 10); }

function addDays(date, days) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function displayDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function dueDateFromTerms(issueDate, terms) {
  const map = { 'Due on receipt': 0, 'Net 7': 7, 'Net 30': 30, 'Net 60': 60, 'Net 90': 90 };
  return addDays(issueDate, map[terms] ?? 30);
}

function computeStatus(inv) {
  if (inv.status === 'paid') return 'paid';
  if (inv.status === 'draft') return 'draft';
  if (inv.dueDate && today() > inv.dueDate) return 'overdue';
  return inv.status || 'sent';
}

/* ─── Invoice number ─────────────────────── */

function nextInvoiceNumber() {
  const n = db.settings.nextNum;
  const year = new Date().getFullYear();
  return `${db.settings.prefix || 'INV'}-${year}-${String(n).padStart(3, '0')}`;
}

/* ─── Totals calculation ─────────────────── */

function calcTotals(items, discountPct, taxPct) {
  const subtotal = items.reduce((s, it) => s + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0), 0);
  const discount = subtotal * ((parseFloat(discountPct) || 0) / 100);
  const taxable  = subtotal - discount;
  const tax      = taxable * ((parseFloat(taxPct) || 0) / 100);
  const total    = taxable + tax;
  return { subtotal, discount, tax, total };
}

/* ─── Dashboard ──────────────────────────── */

function renderDashboard() {
  const invoices = db.invoices;

  // Stats
  let total = 0, paid = 0, outstanding = 0, overdue = 0;
  const cur = db.settings.currency;
  invoices.forEach(inv => {
    const s = computeStatus(inv);
    total += inv.total;
    if (s === 'paid') paid += inv.total;
    else if (s === 'overdue') overdue += inv.total;
    else if (s === 'sent') outstanding += inv.total;
  });

  document.getElementById('stat-total').textContent = fmt(total, cur);
  document.getElementById('stat-paid').textContent = fmt(paid, cur);
  document.getElementById('stat-outstanding').textContent = fmt(outstanding, cur);
  document.getElementById('stat-overdue').textContent = fmt(overdue, cur);

  document.getElementById('dash-sub').textContent =
    invoices.length === 0 ? 'No invoices yet' :
    `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`;

  // Table
  const filtered = currentFilter === 'all'
    ? invoices
    : invoices.filter(inv => computeStatus(inv) === currentFilter);

  const tbody = document.getElementById('invoice-tbody');
  const empty = document.getElementById('table-empty');

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  // Sort newest first
  const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  sorted.forEach(inv => {
    const status = computeStatus(inv);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="td-number">${esc(inv.number)}</span></td>
      <td><span class="td-client">${esc(inv.clientName || '—')}</span></td>
      <td>${displayDate(inv.issueDate)}</td>
      <td>${displayDate(inv.dueDate)}</td>
      <td class="td-amount">${fmt(inv.total, inv.currency)}</td>
      <td><span class="status-badge badge-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
      <td>
        <div class="td-actions">
          <button class="action-btn" data-action="view" data-id="${inv.id}">View</button>
          <button class="action-btn" data-action="edit" data-id="${inv.id}">Edit</button>
          <button class="action-btn danger" data-action="delete" data-id="${inv.id}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─── Invoice Form ───────────────────────── */

let formItems = [];

function openNewInvoice() {
  editingId = null;
  document.getElementById('form-title').textContent = 'New Invoice';
  document.getElementById('btn-send').textContent = 'Mark as Sent';

  const s = db.settings;
  v('f-from-name', s.name);
  v('f-from-email', s.email);
  v('f-from-address', s.address);
  v('f-to-name', '');
  v('f-to-email', '');
  v('f-to-address', '');
  v('f-number', nextInvoiceNumber());
  v('f-issue-date', today());
  v('f-due-date', dueDateFromTerms(today(), s.terms));
  v('f-currency', s.currency || 'USD');
  v('f-discount', '0');
  v('f-tax', String(s.tax || 0));
  v('f-notes', s.notes || '');

  formItems = [newItem()];
  renderFormItems();
  updateFormTotals();
  showView('form');
}

function openEditInvoice(id) {
  const inv = db.invoices.find(i => i.id === id);
  if (!inv) return;
  editingId = id;
  document.getElementById('form-title').textContent = 'Edit Invoice';

  v('f-from-name', inv.fromName || '');
  v('f-from-email', inv.fromEmail || '');
  v('f-from-address', inv.fromAddress || '');
  v('f-to-name', inv.clientName || '');
  v('f-to-email', inv.clientEmail || '');
  v('f-to-address', inv.clientAddress || '');
  v('f-number', inv.number);
  v('f-issue-date', inv.issueDate);
  v('f-due-date', inv.dueDate);
  v('f-currency', inv.currency || 'USD');
  v('f-discount', String(inv.discountPct || 0));
  v('f-tax', String(inv.taxPct || 0));
  v('f-notes', inv.notes || '');

  formItems = inv.items.map(it => ({ ...it }));
  renderFormItems();
  updateFormTotals();
  showView('form');
}

function newItem() {
  return { id: ++itemIdCounter, description: '', qty: 1, rate: 0 };
}

function renderFormItems() {
  const tbody = document.getElementById('items-tbody');
  tbody.innerHTML = '';
  formItems.forEach(item => {
    const amount = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
    const currency = gv('f-currency');
    const tr = document.createElement('tr');
    tr.dataset.itemId = item.id;
    tr.innerHTML = `
      <td class="col-desc"><input class="item-input" type="text" placeholder="Description of service or product" value="${esc(item.description)}" data-field="description"></td>
      <td class="col-qty"><input class="item-input" type="number" value="${item.qty}" min="0" step="any" data-field="qty" style="text-align:right"></td>
      <td class="col-rate"><input class="item-input" type="number" value="${item.rate}" min="0" step="any" data-field="rate" style="text-align:right"></td>
      <td class="col-amount"><span class="item-amount">${fmt(amount, currency)}</span></td>
      <td class="col-del">
        <button type="button" class="del-item-btn" title="Remove line">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </td>
    `;

    tr.querySelectorAll('.item-input').forEach(inp => {
      inp.addEventListener('input', () => {
        item[inp.dataset.field] = inp.value;
        const a = (parseFloat(item.qty) || 0) * (parseFloat(item.rate) || 0);
        tr.querySelector('.item-amount').textContent = fmt(a, gv('f-currency'));
        updateFormTotals();
      });
    });

    tr.querySelector('.del-item-btn').addEventListener('click', () => {
      if (formItems.length === 1) return; // keep at least one
      formItems = formItems.filter(i => i.id !== item.id);
      renderFormItems();
      updateFormTotals();
    });

    tbody.appendChild(tr);
  });
}

function updateFormTotals() {
  const t = calcTotals(formItems, gv('f-discount'), gv('f-tax'));
  const cur = gv('f-currency');
  set('t-subtotal', fmt(t.subtotal, cur));
  set('t-discount', '−' + fmt(t.discount, cur));
  set('t-tax', fmt(t.tax, cur));
  set('t-total', fmt(t.total, cur));
}

function collectInvoice(status) {
  const t = calcTotals(formItems, gv('f-discount'), gv('f-tax'));
  return {
    id:            editingId || uid(),
    number:        gv('f-number'),
    status:        status,
    createdAt:     editingId ? (db.invoices.find(i => i.id === editingId)?.createdAt || today()) : today(),
    issueDate:     gv('f-issue-date'),
    dueDate:       gv('f-due-date'),
    currency:      gv('f-currency'),
    fromName:      gv('f-from-name'),
    fromEmail:     gv('f-from-email'),
    fromAddress:   gv('f-from-address'),
    clientName:    gv('f-to-name'),
    clientEmail:   gv('f-to-email'),
    clientAddress: gv('f-to-address'),
    items:         formItems.map(i => ({ ...i })),
    discountPct:   parseFloat(gv('f-discount')) || 0,
    taxPct:        parseFloat(gv('f-tax')) || 0,
    subtotal:      t.subtotal,
    discountAmt:   t.discount,
    taxAmt:        t.tax,
    total:         t.total,
    notes:         gv('f-notes'),
  };
}

function saveInvoice(status) {
  const inv = collectInvoice(status);
  if (editingId) {
    db.invoices = db.invoices.map(i => i.id === editingId ? inv : i);
  } else {
    db.settings.nextNum++;
    db.invoices.push(inv);
  }
  persist();
}

/* ─── Preview ────────────────────────────── */

function openPreview(id) {
  const inv = id ? db.invoices.find(i => i.id === id) : collectInvoice(editingId ? computeStatus(db.invoices.find(i => i.id === editingId)) : 'draft');
  if (!inv) return;

  const status = computeStatus(inv);

  set('doc-from-name', inv.fromName || '');
  set('doc-from-email', inv.fromEmail || '');
  set('doc-from-address', inv.fromAddress || '');
  set('doc-number', inv.number || '');
  set('doc-issue-date', displayDate(inv.issueDate));
  set('doc-due-date', displayDate(inv.dueDate));
  set('doc-to-name', inv.clientName || '');
  set('doc-to-email', inv.clientEmail || '');
  set('doc-to-address', inv.clientAddress || '');

  // Items
  const tbody = document.getElementById('doc-items-tbody');
  tbody.innerHTML = '';
  (inv.items || []).forEach(it => {
    const amt = (parseFloat(it.qty)||0) * (parseFloat(it.rate)||0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(it.description || '')}</td>
      <td style="text-align:right">${parseFloat(it.qty)||0}</td>
      <td style="text-align:right">${fmt(parseFloat(it.rate)||0, inv.currency)}</td>
      <td style="text-align:right">${fmt(amt, inv.currency)}</td>
    `;
    tbody.appendChild(tr);
  });

  set('doc-subtotal', fmt(inv.subtotal || 0, inv.currency));

  const discRow = document.getElementById('doc-discount-row');
  const taxRow  = document.getElementById('doc-tax-row');

  if (inv.discountPct > 0) {
    set('doc-discount-label', `Discount (${inv.discountPct}%)`);
    set('doc-discount', '−' + fmt(inv.discountAmt || 0, inv.currency));
    discRow.style.display = '';
  } else { discRow.style.display = 'none'; }

  if (inv.taxPct > 0) {
    set('doc-tax-label', `Tax (${inv.taxPct}%)`);
    set('doc-tax', fmt(inv.taxAmt || 0, inv.currency));
    taxRow.style.display = '';
  } else { taxRow.style.display = 'none'; }

  set('doc-total', fmt(inv.total || 0, inv.currency));

  const notesWrap = document.getElementById('doc-notes-wrap');
  if (inv.notes) { set('doc-notes', inv.notes); notesWrap.style.display = ''; }
  else           { notesWrap.style.display = 'none'; }

  const stamp = document.getElementById('doc-paid-stamp');
  stamp.className = `doc-stamp paid-stamp${status === 'paid' ? ' visible' : ''}`;

  // Mark paid button
  const markPaidBtn = document.getElementById('btn-mark-paid');
  if (id) {
    markPaidBtn.style.display = '';
    markPaidBtn.textContent = status === 'paid' ? 'Mark as Unpaid' : 'Mark as Paid';
    markPaidBtn.onclick = () => {
      const i = db.invoices.find(x => x.id === id);
      if (i) { i.status = i.status === 'paid' ? 'sent' : 'paid'; persist(); openPreview(id); }
    };
  } else {
    markPaidBtn.style.display = 'none';
  }

  showView('preview');
}

/* ─── Settings ───────────────────────────── */

function loadSettings() {
  const s = db.settings;
  v('s-name', s.name || '');
  v('s-email', s.email || '');
  v('s-phone', s.phone || '');
  v('s-address', s.address || '');
  v('s-currency', s.currency || 'USD');
  v('s-tax', String(s.tax || 0));
  v('s-terms', s.terms || 'Net 30');
  v('s-prefix', s.prefix || 'INV');
  v('s-notes', s.notes || '');
}

function saveSettings() {
  db.settings.name     = gv('s-name');
  db.settings.email    = gv('s-email');
  db.settings.phone    = gv('s-phone');
  db.settings.address  = gv('s-address');
  db.settings.currency = gv('s-currency');
  db.settings.tax      = parseFloat(gv('s-tax')) || 0;
  db.settings.terms    = gv('s-terms');
  db.settings.prefix   = gv('s-prefix') || 'INV';
  db.settings.notes    = gv('s-notes');
  persist();
  showFlash('Settings saved');
}

/* ─── Flash message ──────────────────────── */

function showFlash(msg) {
  let el = document.getElementById('flash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash';
    el.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;background:#111827;color:white;padding:.6rem 1.1rem;border-radius:6px;font-size:.82rem;font-weight:500;z-index:999;transition:opacity .3s;`;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

/* ─── DOM helpers ────────────────────────── */

function gv(id) { return document.getElementById(id)?.value ?? ''; }
function v(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function set(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function uid() { return 'i' + Date.now() + Math.random().toString(36).slice(2,6); }

/* ─── Event listeners ─────────────────────── */

// Sidebar nav
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'form') {
      openNewInvoice();
    } else if (view === 'settings') {
      loadSettings();
      showView('settings');
    } else {
      renderDashboard();
      showView('dashboard');
    }
  });
});

// Dashboard new buttons
document.getElementById('dash-new-btn').addEventListener('click', openNewInvoice);
document.getElementById('empty-new-btn').addEventListener('click', openNewInvoice);

// Table actions (delegated)
document.getElementById('invoice-tbody').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'view')   openPreview(id);
  if (action === 'edit')   openEditInvoice(id);
  if (action === 'delete') {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    db.invoices = db.invoices.filter(i => i.id !== id);
    persist(); renderDashboard();
  }
});

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderDashboard();
  });
});

// Form back
document.getElementById('form-back').addEventListener('click', () => { renderDashboard(); showView('dashboard'); });

// Add line item
document.getElementById('btn-add-item').addEventListener('click', () => {
  formItems.push(newItem());
  renderFormItems();
  updateFormTotals();
});

// Discount / tax inputs
document.getElementById('f-discount').addEventListener('input', updateFormTotals);
document.getElementById('f-tax').addEventListener('input', updateFormTotals);
document.getElementById('f-currency').addEventListener('change', () => { renderFormItems(); updateFormTotals(); });

// Save draft
document.getElementById('btn-save-draft').addEventListener('click', () => {
  saveInvoice('draft');
  showFlash('Draft saved');
  renderDashboard();
  showView('dashboard');
});

// Mark as sent
document.getElementById('btn-send').addEventListener('click', () => {
  saveInvoice('sent');
  showFlash('Invoice saved');
  renderDashboard();
  showView('dashboard');
});

// Preview from form
document.getElementById('btn-preview').addEventListener('click', () => {
  // Save first so preview is accurate
  if (editingId) saveInvoice(computeStatus(db.invoices.find(i => i.id === editingId)));
  else {
    const inv = collectInvoice('draft');
    openPreviewDirect(inv);
    return;
  }
  openPreview(editingId);
});

function openPreviewDirect(inv) {
  // Temp preview without saving
  const tmp = [...db.invoices];
  inv.id = inv.id || uid();
  db.invoices.push(inv);
  openPreview(inv.id);
  db.invoices = tmp; // restore
}

// Preview back
document.getElementById('preview-back').addEventListener('click', () => {
  if (editingId) { showView('form'); }
  else { renderDashboard(); showView('dashboard'); }
});

// Print
document.getElementById('btn-print').addEventListener('click', () => window.print());

// Settings save
document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

/* ─── Init ───────────────────────────────── */

load();
renderDashboard();
showView('dashboard');
