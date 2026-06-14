// Folio — Proposal Generator
// All data stored in localStorage. Nothing leaves the browser.

const $ = id => document.getElementById(id);

// ── Storage ──────────────────────────────────────────────────
const STORE_KEY    = 'folio_proposals_v1';
const SETTINGS_KEY = 'folio_proposal_settings_v1';

function loadProposals() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
  catch { return []; }
}
function saveProposals(arr) { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); }

function loadSettings() {
  const defaults = { name: '', email: '', website: '', phone: '', currency: 'USD', validityDays: 30, prefix: 'PROP', nextSteps: '' };
  try { return Object.assign(defaults, JSON.parse(localStorage.getItem(SETTINGS_KEY))); }
  catch { return defaults; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

// ── State ─────────────────────────────────────────────────────
let proposals  = loadProposals();
let settings   = loadSettings();
let editingId  = null;
let previewId  = null;
let activeFilter = 'all';

// ── Routing ───────────────────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $(id).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === id.replace('view-', ''));
  });
}

// ── Utilities ─────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function fmtMoney(n, currency) {
  const sym = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', JPY: '¥' };
  const s = sym[currency] || '$';
  return s + Math.round(+n || 0).toLocaleString('en-US');
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function addDays(iso, n) {
  const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
}

function nextNumber() {
  const prefix = settings.prefix || 'PROP';
  const year   = new Date().getFullYear();
  const max    = proposals.reduce((n, p) => {
    const m = p.number && p.number.match(/(\d+)$/);
    return m ? Math.max(n, +m[1]) : n;
  }, 0);
  return `${prefix}-${year}-${String(max + 1).padStart(3, '0')}`;
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  const total    = proposals.filter(p => p.status !== 'draft').length;
  const accepted = proposals.filter(p => p.status === 'accepted').length;
  const pending  = proposals.filter(p => p.status === 'sent').length;
  const value    = proposals
    .filter(p => p.status === 'accepted')
    .reduce((s, p) => s + proposalTotal(p), 0);

  $('stat-total').textContent    = total;
  $('stat-accepted').textContent = accepted;
  $('stat-pending').textContent  = pending;
  $('stat-value').textContent    = fmtMoney(value, 'USD');
  $('dash-sub').textContent      = proposals.length
    ? `${proposals.length} proposal${proposals.length === 1 ? '' : 's'}`
    : 'No proposals yet';

  const filtered = proposals.filter(p => activeFilter === 'all' || p.status === activeFilter);
  const tbody = $('proposal-tbody');
  const empty = $('table-empty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.hidden = false;
  } else {
    empty.hidden = true;
    tbody.innerHTML = filtered.map(p => `
      <tr>
        <td class="td-number">${p.number || '—'}</td>
        <td class="td-client">${esc(p.clientName || '—')}</td>
        <td>${esc(p.projectTitle || '—')}</td>
        <td>${fmtDate(p.createdAt)}</td>
        <td class="td-amount">${fmtMoney(proposalTotal(p), p.currency)}</td>
        <td><span class="status-badge badge-${p.status}">${p.status}</span></td>
        <td>
          <div class="td-actions">
            <button class="action-btn" onclick="editProposal('${p.id}')">Edit</button>
            <button class="action-btn" onclick="openPreview('${p.id}')">Preview</button>
            <button class="action-btn danger" onclick="deleteProposal('${p.id}')">Delete</button>
          </div>
        </td>
      </tr>`).join('');
  }
}

function proposalTotal(p) {
  if (p.pricingType === 'items') return (p.priceItems || []).reduce((s, i) => s + (+i.amount || 0), 0);
  return +p.fixedTotal || 0;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Form ──────────────────────────────────────────────────────
let deliverables = [];
let milestones   = [];
let priceItems   = [];

function newProposal() {
  editingId = null;
  deliverables = [{ id: uid(), title: '', description: '' }];
  milestones   = [];
  priceItems   = [{ id: uid(), description: '', amount: '' }];

  $('form-title').textContent = 'New Proposal';
  $('f-client-name').value    = '';
  $('f-client-company').value = '';
  $('f-client-email').value   = '';
  $('f-project-title').value  = '';
  $('f-number').value         = nextNumber();
  $('f-date').value           = todayISO();
  $('f-valid-until').value    = addDays(todayISO(), settings.validityDays || 30);
  $('f-currency').value       = settings.currency || 'USD';
  $('f-challenge').value      = '';
  $('f-approach').value       = '';
  $('f-start-date').value     = '';
  $('f-end-date').value       = '';
  $('f-fixed-total').value    = '';
  $('f-deposit').value        = '50';
  $('deposit-calc').textContent = 'upfront';
  $('f-revisions').value      = '2';
  $('f-payment-terms').value  = 'Net 14';
  $('f-ip').value             = 'Transfers on full payment';
  $('f-next-steps').value     = settings.nextSteps || '';
  $('f-notes').value          = '';
  $('pt-fixed').checked       = true;
  $('fixed-pricing').style.display  = '';
  $('items-pricing').style.display  = 'none';

  renderDeliverables();
  renderMilestones();
  renderPriceItems();
  updateDepositCalc();
  showView('view-form');
}

function editProposal(id) {
  const p = proposals.find(x => x.id === id);
  if (!p) return;
  editingId = id;

  deliverables = (p.deliverables || []).map(d => ({ ...d }));
  milestones   = (p.milestones || []).map(m => ({ ...m }));
  priceItems   = (p.priceItems || []).map(i => ({ ...i }));

  if (!deliverables.length) deliverables.push({ id: uid(), title: '', description: '' });
  if (!priceItems.length)   priceItems.push({ id: uid(), description: '', amount: '' });

  $('form-title').textContent     = 'Edit Proposal';
  $('f-client-name').value        = p.clientName || '';
  $('f-client-company').value     = p.clientCompany || '';
  $('f-client-email').value       = p.clientEmail || '';
  $('f-project-title').value      = p.projectTitle || '';
  $('f-number').value             = p.number || '';
  $('f-date').value               = p.createdAt || todayISO();
  $('f-valid-until').value        = p.validUntil || '';
  $('f-currency').value           = p.currency || 'USD';
  $('f-challenge').value          = p.challenge || '';
  $('f-approach').value           = p.approach || '';
  $('f-start-date').value         = p.startDate || '';
  $('f-end-date').value           = p.endDate || '';
  $('f-fixed-total').value        = p.fixedTotal || '';
  $('f-deposit').value            = p.deposit || '50';
  $('f-revisions').value          = p.revisions || '2';
  $('f-payment-terms').value      = p.paymentTerms || 'Net 14';
  $('f-ip').value                 = p.ipTerms || 'Transfers on full payment';
  $('f-next-steps').value         = p.nextSteps || '';
  $('f-notes').value              = p.notes || '';

  const type = p.pricingType || 'fixed';
  document.querySelector(`input[name="pricing-type"][value="${type}"]`).checked = true;
  $('fixed-pricing').style.display  = type === 'fixed' ? '' : 'none';
  $('items-pricing').style.display  = type === 'items' ? '' : 'none';

  renderDeliverables();
  renderMilestones();
  renderPriceItems();
  updateDepositCalc();
  showView('view-form');
}

function readForm() {
  const currency = $('f-currency').value;
  const pricingType = document.querySelector('input[name="pricing-type"]:checked').value;
  return {
    clientName:   $('f-client-name').value.trim(),
    clientCompany:$('f-client-company').value.trim(),
    clientEmail:  $('f-client-email').value.trim(),
    projectTitle: $('f-project-title').value.trim(),
    number:       $('f-number').value.trim(),
    createdAt:    $('f-date').value,
    validUntil:   $('f-valid-until').value,
    currency,
    challenge:    $('f-challenge').value.trim(),
    approach:     $('f-approach').value.trim(),
    deliverables: deliverables.slice(),
    startDate:    $('f-start-date').value,
    endDate:      $('f-end-date').value,
    milestones:   milestones.slice(),
    pricingType,
    fixedTotal:   $('f-fixed-total').value,
    deposit:      $('f-deposit').value,
    priceItems:   priceItems.slice(),
    revisions:    $('f-revisions').value,
    paymentTerms: $('f-payment-terms').value,
    ipTerms:      $('f-ip').value,
    nextSteps:    $('f-next-steps').value.trim(),
    notes:        $('f-notes').value.trim(),
  };
}

function saveDraft() {
  const data = readForm();
  if (editingId) {
    const idx = proposals.findIndex(p => p.id === editingId);
    if (idx !== -1) proposals[idx] = { ...proposals[idx], ...data, status: 'draft' };
  } else {
    proposals.unshift({ id: uid(), status: 'draft', ...data });
    editingId = proposals[0].id;
  }
  saveProposals(proposals);
  renderDashboard();
}

function markSent() {
  const data = readForm();
  const status = 'sent';
  if (editingId) {
    const idx = proposals.findIndex(p => p.id === editingId);
    if (idx !== -1) proposals[idx] = { ...proposals[idx], ...data, status };
  } else {
    proposals.unshift({ id: uid(), status, ...data });
    editingId = proposals[0].id;
  }
  saveProposals(proposals);
  renderDashboard();
  openPreview(editingId);
}

function deleteProposal(id) {
  if (!confirm('Delete this proposal?')) return;
  proposals = proposals.filter(p => p.id !== id);
  saveProposals(proposals);
  renderDashboard();
}

// ── Deliverables ──────────────────────────────────────────────
function renderDeliverables() {
  const wrap = $('deliverables-wrap');
  wrap.innerHTML = deliverables.map((d, i) => `
    <div class="deliverable-item" data-id="${d.id}">
      <span class="item-num">${i + 1}</span>
      <div class="deliverable-inputs">
        <input class="item-input" type="text" placeholder="Deliverable title"
          value="${esc(d.title)}"
          oninput="updateDeliverable('${d.id}','title',this.value)">
        <input class="item-input" type="text" placeholder="Brief description (optional)"
          value="${esc(d.description || '')}"
          oninput="updateDeliverable('${d.id}','description',this.value)">
      </div>
      <button class="del-item-btn" onclick="removeDeliverable('${d.id}')" title="Remove">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('');
}

function updateDeliverable(id, key, val) {
  const d = deliverables.find(x => x.id === id);
  if (d) d[key] = val;
}
function removeDeliverable(id) {
  deliverables = deliverables.filter(d => d.id !== id);
  renderDeliverables();
}

// ── Milestones ────────────────────────────────────────────────
function renderMilestones() {
  const wrap = $('milestones-wrap');
  if (!milestones.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = milestones.map(m => `
    <div class="milestone-item" data-id="${m.id}" style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;">
      <input class="item-input" type="text" placeholder="Milestone" style="flex:1"
        value="${esc(m.title)}" oninput="updateMilestone('${m.id}','title',this.value)">
      <input class="item-input" type="date" style="width:160px"
        value="${esc(m.date || '')}" oninput="updateMilestone('${m.id}','date',this.value)">
      <button class="del-item-btn" onclick="removeMilestone('${m.id}')" title="Remove">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('');
}

function updateMilestone(id, key, val) {
  const m = milestones.find(x => x.id === id);
  if (m) m[key] = val;
}
function removeMilestone(id) {
  milestones = milestones.filter(m => m.id !== id);
  renderMilestones();
}

// ── Price items ───────────────────────────────────────────────
function renderPriceItems() {
  const wrap = $('price-items-wrap');
  wrap.innerHTML = priceItems.map(item => `
    <div class="price-item" data-id="${item.id}" style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;">
      <input class="item-input" type="text" placeholder="Description" style="flex:1"
        value="${esc(item.description)}" oninput="updatePriceItem('${item.id}','description',this.value)">
      <input class="item-input price-item-amount" type="number" placeholder="0" style="width:120px"
        value="${esc(String(item.amount || ''))}" oninput="updatePriceItem('${item.id}','amount',this.value)">
      <button class="del-item-btn" onclick="removePriceItem('${item.id}')" title="Remove">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="3" y1="3" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="11" y1="3" x2="3" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </div>`).join('');
  updateItemsTotal();
}

function updatePriceItem(id, key, val) {
  const item = priceItems.find(x => x.id === id);
  if (item) { item[key] = val; updateItemsTotal(); }
}
function removePriceItem(id) {
  priceItems = priceItems.filter(i => i.id !== id);
  renderPriceItems();
}
function updateItemsTotal() {
  const total = priceItems.reduce((s, i) => s + (+i.amount || 0), 0);
  $('items-total').textContent = fmtMoney(total, $('f-currency').value);
}

function updateDepositCalc() {
  const total   = +$('f-fixed-total').value || 0;
  const pct     = +$('f-deposit').value || 0;
  const deposit = Math.round(total * pct / 100);
  $('deposit-calc').textContent = total
    ? `= ${fmtMoney(deposit, $('f-currency').value)} upfront`
    : 'upfront';
  $('fixed-sym').textContent = { USD:'$', EUR:'€', GBP:'£', CAD:'CA$', AUD:'A$', JPY:'¥' }[$('f-currency').value] || '$';
}

// ── Preview ───────────────────────────────────────────────────
function openPreview(id) {
  const p = proposals.find(x => x.id === id);
  if (!p) return;
  previewId = id;
  renderPreview(p);
  showView('view-preview');
}

function renderPreview(p) {
  $('pdoc-from-name').textContent  = settings.name  || '—';
  $('pdoc-from-email').textContent = settings.email || '';
  $('pdoc-number').textContent     = p.number || '—';
  $('pdoc-date').textContent       = fmtDate(p.createdAt);
  $('pdoc-valid').textContent      = fmtDate(p.validUntil);

  $('pdoc-client-name').textContent    = p.clientName || '';
  $('pdoc-client-company').textContent = p.clientCompany || '';
  $('pdoc-client-email').textContent   = p.clientEmail || '';
  $('pdoc-project-title').textContent  = p.projectTitle || 'Untitled Project';

  const challengeSection = $('pdoc-challenge-section');
  if (p.challenge) {
    $('pdoc-challenge').textContent = p.challenge;
    challengeSection.style.display = '';
  } else { challengeSection.style.display = 'none'; }

  const approachSection = $('pdoc-approach-section');
  if (p.approach) {
    $('pdoc-approach').textContent = p.approach;
    approachSection.style.display = '';
  } else { approachSection.style.display = 'none'; }

  // Deliverables
  const delSection = $('pdoc-deliverables-section');
  const dels = (p.deliverables || []).filter(d => d.title);
  if (dels.length) {
    $('pdoc-deliverables').innerHTML = dels.map((d, i) => `
      <div class="pdoc-deliverable">
        <span class="pdoc-del-num">${i + 1}</span>
        <div>
          <p class="pdoc-del-title">${esc(d.title)}</p>
          ${d.description ? `<p class="pdoc-del-desc">${esc(d.description)}</p>` : ''}
        </div>
      </div>`).join('');
    delSection.style.display = '';
  } else { delSection.style.display = 'none'; }

  // Timeline
  const tlSection = $('pdoc-timeline-section');
  if (p.startDate || p.endDate || (p.milestones || []).length) {
    $('pdoc-start-date').textContent = fmtDate(p.startDate);
    $('pdoc-end-date').textContent   = fmtDate(p.endDate);
    $('pdoc-milestones').innerHTML = (p.milestones || []).map(m => `
      <div class="pdoc-milestone">
        <span class="pdoc-ms-dot"></span>
        <span class="pdoc-ms-title">${esc(m.title)}</span>
        <span class="pdoc-ms-date">${fmtDate(m.date)}</span>
      </div>`).join('');
    tlSection.style.display = '';
  } else { tlSection.style.display = 'none'; }

  // Investment
  const inv = $('pdoc-investment');
  const currency = p.currency || 'USD';
  if (p.pricingType === 'items') {
    const items = p.priceItems || [];
    const total = items.reduce((s, i) => s + (+i.amount || 0), 0);
    inv.innerHTML = `
      <table class="pdoc-items-table">
        <thead><tr><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${items.map(i => `<tr><td>${esc(i.description)}</td><td>${fmtMoney(i.amount, currency)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="pdoc-items-total"><span>Total</span><span>${fmtMoney(total, currency)}</span></div>`;
  } else {
    const total   = +p.fixedTotal || 0;
    const pct     = +p.deposit || 0;
    const deposit = Math.round(total * pct / 100);
    inv.innerHTML = `
      <div class="pdoc-investment-fixed">
        <span class="pdoc-investment-amount">${fmtMoney(total, currency)}</span>
        <span class="pdoc-investment-label">fixed price</span>
      </div>
      ${pct ? `<p style="font-size:0.85rem;color:var(--muted)">Deposit required: ${fmtMoney(deposit, currency)} (${pct}%) upon acceptance</p>` : ''}`;
  }

  // Terms
  $('pdoc-terms-line').textContent = [
    p.revisions ? `${p.revisions} revision${+p.revisions === 1 ? '' : 's'} included` : '',
    p.paymentTerms || '',
    p.ipTerms || ''
  ].filter(Boolean).join(' · ');

  // Next steps
  const ns = $('pdoc-next-steps');
  if (p.nextSteps) {
    $('pdoc-next-steps').querySelector('.pdoc-section-body') || null;
    ns.style.display = '';
    ns.querySelector('.pdoc-section-body').textContent = p.nextSteps;
  } else { ns.style.display = 'none'; }

  // Notes
  const notesWrap = $('pdoc-notes-wrap');
  if (p.notes) {
    $('pdoc-notes').textContent = p.notes;
    notesWrap.style.display = '';
  } else { notesWrap.style.display = 'none'; }

  // Footer
  $('pdoc-footer-name').textContent  = settings.name || '';
  $('pdoc-footer-email').textContent = settings.email || '';

  // Stamp
  const stamp = $('pdoc-stamp');
  stamp.classList.toggle('visible', p.status === 'accepted');
}

function emailProposal(p) {
  const to      = p.clientEmail || '';
  const subject = `Proposal: ${p.projectTitle || 'Project'}`;
  const body    = [
    `Hi ${p.clientName || 'there'},`,
    '',
    `Please find my proposal for "${p.projectTitle || 'your project'}" attached.`,
    '',
    `Proposal number: ${p.number || ''}`,
    `Valid until: ${fmtDate(p.validUntil)}`,
    `Total: ${fmtMoney(proposalTotal(p), p.currency)}`,
    '',
    p.nextSteps || 'Please review and let me know if you have any questions.',
    '',
    `Best,`,
    settings.name || '',
  ].join('\n');
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── Settings ──────────────────────────────────────────────────
function loadSettingsForm() {
  $('s-name').value       = settings.name || '';
  $('s-email').value      = settings.email || '';
  $('s-website').value    = settings.website || '';
  $('s-phone').value      = settings.phone || '';
  $('s-currency').value   = settings.currency || 'USD';
  $('s-validity').value   = settings.validityDays || 30;
  $('s-prefix').value     = settings.prefix || 'PROP';
  $('s-next-steps').value = settings.nextSteps || '';
}

// ── Event Wiring ──────────────────────────────────────────────

// Nav
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'form') { newProposal(); return; }
    if (view === 'settings') loadSettingsForm();
    showView('view-' + view);
    renderDashboard();
  });
});

// Dashboard
$('dash-new-btn').addEventListener('click', newProposal);
$('empty-new-btn').addEventListener('click', newProposal);

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderDashboard();
  });
});

// Form
$('form-back').addEventListener('click', () => { showView('view-dashboard'); renderDashboard(); });
$('btn-save-draft').addEventListener('click', () => { saveDraft(); showView('view-dashboard'); renderDashboard(); });
$('btn-preview').addEventListener('click', () => {
  saveDraft();
  openPreview(editingId);
});
$('btn-send').addEventListener('click', markSent);

$('btn-add-deliverable').addEventListener('click', () => {
  deliverables.push({ id: uid(), title: '', description: '' });
  renderDeliverables();
});
$('btn-add-milestone').addEventListener('click', () => {
  milestones.push({ id: uid(), title: '', date: '' });
  renderMilestones();
});
$('btn-add-price-item').addEventListener('click', () => {
  priceItems.push({ id: uid(), description: '', amount: '' });
  renderPriceItems();
});

document.querySelectorAll('input[name="pricing-type"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const type = document.querySelector('input[name="pricing-type"]:checked').value;
    $('fixed-pricing').style.display = type === 'fixed' ? '' : 'none';
    $('items-pricing').style.display = type === 'items' ? '' : 'none';
  });
});

$('f-fixed-total').addEventListener('input', updateDepositCalc);
$('f-deposit').addEventListener('input', updateDepositCalc);
$('f-currency').addEventListener('input', () => { updateDepositCalc(); updateItemsTotal(); });

// Preview
$('preview-back').addEventListener('click', () => {
  if (editingId) { showView('view-form'); }
  else { showView('view-dashboard'); renderDashboard(); }
});
$('btn-mark-accepted').addEventListener('click', () => {
  if (!previewId) return;
  const p = proposals.find(x => x.id === previewId);
  if (p) { p.status = 'accepted'; saveProposals(proposals); renderPreview(p); renderDashboard(); }
});
$('btn-email').addEventListener('click', () => {
  if (!previewId) return;
  const p = proposals.find(x => x.id === previewId);
  if (p) emailProposal(p);
});
$('btn-to-invoice').addEventListener('click', () => {
  if (!previewId) return;
  const p = proposals.find(x => x.id === previewId);
  if (!p) return;
  const total   = proposalTotal(p);
  const note    = `${p.projectTitle || 'Project'} — Proposal ${p.number || ''}`;
  window.location.href = `../invoice/?prefill=${encodeURIComponent(JSON.stringify({
    clientName: p.clientName, clientEmail: p.clientEmail,
    clientCompany: p.clientCompany, currency: p.currency,
    note, total
  }))}`;
});
$('btn-print').addEventListener('click', () => window.print());

// Settings
$('btn-save-settings').addEventListener('click', () => {
  settings = {
    name:        $('s-name').value.trim(),
    email:       $('s-email').value.trim(),
    website:     $('s-website').value.trim(),
    phone:       $('s-phone').value.trim(),
    currency:    $('s-currency').value,
    validityDays:+$('s-validity').value || 30,
    prefix:      $('s-prefix').value.trim() || 'PROP',
    nextSteps:   $('s-next-steps').value.trim(),
  };
  saveSettings(settings);
  showView('view-dashboard');
  renderDashboard();
});

// ── Boot ──────────────────────────────────────────────────────
renderDashboard();
showView('view-dashboard');
