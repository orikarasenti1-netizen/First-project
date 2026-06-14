// Freelance Rate Calculator
// All calculations run client-side, no data leaves the browser.

const el = id => document.getElementById(id);

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function calculate() {
  // Inputs
  const income   = parseFloat(el('income').value)   || 80000;
  const vacation = parseFloat(el('vacation').value)  || 4;
  const hours    = parseFloat(el('hours').value)     || 40;
  const billable = parseFloat(el('billable').value)  / 100 || 0.60;
  const expenses = parseFloat(el('expenses').value)  || 4000;
  const tax      = parseFloat(el('tax').value)       / 100 || 0.28;

  // Core math
  const work_weeks      = 52 - vacation;
  const total_hours_yr  = work_weeks * hours;
  const billable_hrs_yr = total_hours_yr * billable;

  // Gross revenue needed to net the target after tax and expenses
  const gross_needed = (income + expenses) / (1 - tax);

  // Floor rate (break-even)
  const min_hourly = gross_needed / billable_hrs_yr;

  // Recommended rate adds 25% buffer for slow months, scope creep, chasing invoices
  const rec_hourly = min_hourly * 1.25;

  // Derived rates (based on recommended)
  const half_day = rec_hourly * 4;
  const day_rate  = rec_hourly * 8;
  const week_rate = rec_hourly * hours * billable;
  const month_rate = week_rate * 4.33;

  // Update rate displays
  el('min-hourly').textContent = fmt(min_hourly) + '/hr';
  el('rec-hourly').textContent = fmt(rec_hourly) + '/hr';
  el('half-day-rate').textContent = fmt(half_day);
  el('day-rate').textContent  = fmt(day_rate);
  el('week-rate').textContent = fmt(week_rate);
  el('month-rate').textContent = fmt(month_rate);

  // Insight message
  const billable_hrs_week = hours * billable;
  const admin_hrs_week    = hours - billable_hrs_week;

  let insight = `At ${fmt(rec_hourly)}/hr, you need ${Math.ceil(billable_hrs_week)} billable hours per week — leaving ${Math.floor(admin_hrs_week)} hrs for proposals, admin, and your own growth.`;

  if (rec_hourly > 200) {
    insight += ' At this level, project-based pricing often outperforms hourly — clients pay for outcomes, not time.';
  } else if (rec_hourly < 50) {
    insight += ' Consider what niche or specialisation could help you command a higher rate.';
  }

  el('insight-text').textContent = insight;
}

function syncSlider(sliderId, inputId, displayId, displayFn) {
  const slider = el(sliderId);
  const input  = inputId ? el(inputId) : null;
  const disp   = displayId ? el(displayId) : null;

  if (slider) {
    slider.addEventListener('input', () => {
      if (input)  input.value    = slider.value;
      if (disp)   disp.textContent = displayFn(slider.value);
      calculate();
    });
  }
  if (input) {
    input.addEventListener('input', () => {
      if (slider) {
        // Clamp to slider range
        const clamped = Math.max(+slider.min, Math.min(+slider.max, +input.value));
        slider.value = clamped;
      }
      calculate();
    });
  }
}

// Wire up all controls
syncSlider('income-range', 'income', null, v => v);
el('income').addEventListener('input', () => {
  const v = parseFloat(el('income').value) || 0;
  el('income-range').value = Math.max(20000, Math.min(300000, v));
  calculate();
});

syncSlider('vacation', null, 'vacation-val', v => v + ' week' + (v == 1 ? '' : 's'));
syncSlider('hours', null, 'hours-val', v => v + ' hrs');
syncSlider('billable', null, 'billable-val', v => v + '%');
syncSlider('tax', null, 'tax-val', v => v + '%');

el('expenses').addEventListener('input', calculate);

// Initial render
calculate();
