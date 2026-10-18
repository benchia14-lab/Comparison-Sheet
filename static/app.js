const state = { quotes: [], baseline: [], baselineName: '', groups: [], imported: [] };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cash = value => value == null || value === '' ? '—' : new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(value));
const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
let report = null;
const previewUrls = new Map();
let previewRender = 0;
let previewQuoteId = null;
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const cents = value => Math.round(value * 100) / 100;
const rate = value => Math.round(value * 1e6) / 1e6;
const verifyButton = (quoteId, entry) => `<button type="button" class="verify-price ${entry.price_verified ? 'is-verified' : ''}" data-verify-quote="${esc(quoteId)}" data-verify-line="${esc(entry.line_id)}" aria-pressed="${entry.price_verified ? 'true' : 'false'}" title="${entry.price_verified ? 'Click to clear price verification' : 'Confirm this price against the source quote'}">${entry.price_verified ? '✓ Price verified' : 'Verify price'}</button>`;
const pageCopy = {
  overview: ['Quote comparison', 'Bring every supplier onto the same page. Find the best price, line by line.'],
  quotes: ['Quotes', 'Review every supplier quote in one consistent format, including the source line behind each price.'],
  comparison: ['Comparison', 'Compare the same item across supplier columns and see precisely which quote lines were matched.']
};
function showView(view) {
  const selected = pageCopy[view] ? view : 'overview';
  for (const name of Object.keys(pageCopy)) {
    $(name).hidden = name !== selected;
    document.querySelector(`nav [data-view="${name}"]`).classList.toggle('active', name === selected);
  }
  $('pageTitle').textContent = pageCopy[selected][0];
  $('pageSubtitle').textContent = pageCopy[selected][1];
  document.querySelector('.breadcrumb strong').textContent = pageCopy[selected][0];
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));

function renderQuoteDetails() {
  const cards = [];
  if (state.baseline.length) {
    cards.push(`<section class="panel quote-detail-card"><div class="quote-detail-head"><div><span class="heading-eyebrow">BASELINE / TENDER</span><h2>${esc(state.baselineName || 'Baseline sheet')}</h2><p>Required quantities and tender unit prices from the baseline.</p></div><span class="file-count">${state.baseline.length} items</span></div><div class="table-scroll"><table class="source-table"><thead><tr><th>CODE</th><th>DESCRIPTION</th><th>QTY</th><th>UNIT</th><th>TENDER UNIT</th><th>TENDER TOTAL</th><th>SOURCE</th></tr></thead><tbody>${state.baseline.map(e=>`<tr><td>${esc(e.code)}</td><td><strong>${esc(e.description)}</strong></td><td>${esc(e.qty)}</td><td>${esc(e.unit)}</td><td>${cash(e.unit_price)}</td><td>${cash(e.total)}</td><td><small>${esc(e.source)}</small></td></tr>`).join('')}</tbody></table></div></section>`);
  }
  state.quotes.forEach((q,qi) => {
    const file = state.imported.find(f=>f.id===q.id)?.name || 'Entered manually';
    const lineCost = q.items.reduce((sum,e)=>sum+(Number(e.total)||0),0);
    const metadata = [['Quote no.',q.quote_number],['Quote date',q.quote_date],['Expiry',q.expiry_date],['Price basis',q.price_basis]].filter(([,value])=>value&&value!=='unspecified');
    cards.push(`<section class="panel quote-detail-card"><div class="quote-detail-head"><div><span class="heading-eyebrow">SUPPLIER ${qi+1} / SOURCE QUOTE</span><h2>${esc(q.name)}</h2><p class="source-file">${esc(file)}</p></div><a class="subtle-btn quote-compare-link" href="#comparison">View comparison →</a></div><div class="quote-meta">${metadata.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}<div><span>Items</span><strong>${q.items.length}</strong></div></div><div class="quote-totals"><div><span>Product lines</span><strong>${cash(lineCost)}</strong></div><div><span>Freight</span><strong>${cash(q.freight||0)}</strong></div><div><span>Tax / GST</span><strong>${cash(q.tax||0)}</strong></div><div><span>Document total</span><strong>${cash(q.quoted_total)}</strong></div></div><div class="table-scroll"><table class="source-table"><thead><tr><th>CODE</th><th>QUOTED DESCRIPTION</th><th>QTY</th><th>UNIT</th><th>UNIT PRICE</th><th>LINE TOTAL</th><th>INC GST TOTAL</th><th>SOURCE</th><th>PRICE CHECK</th></tr></thead><tbody>${q.items.length ? q.items.map(e=>`<tr><td><strong>${esc(e.code || '—')}</strong></td><td class="source-description">${esc(e.full_description || e.description)}${e.price_warning ? '<small class="incomplete">Quoted total needs checking</small>' : ''}</td><td>${esc(e.qty)}</td><td>${esc(e.unit)}</td><td>${cash(e.unit_price)}</td><td>${cash(e.total)}</td><td>${cash(e.inc_gst_total)}</td><td><small>${esc(e.source)}</small></td><td>${verifyButton(q.id,e)}</td></tr>`).join('') : '<tr><td colspan="9" class="table-empty">No priced lines were detected. Add or correct lines in Comparison.</td></tr>'}</tbody></table></div></section>`);
    if (previewUrls.has(q.id)) cards[cards.length-1] = cards[cards.length-1].replace('<a class="subtle-btn quote-compare-link"', `<button class="subtle-btn preview-trigger" type="button" data-preview="${esc(q.id)}">▣ View original PDF</button><a class="subtle-btn quote-compare-link"`);
    if (q.raw_text) cards[cards.length-1] = cards[cards.length-1].replace(/<\/section>$/, `<details class="quote-raw"><summary>View all extracted document text</summary><pre>${esc(q.raw_text)}</pre></details></section>`);
  });
  $('quoteDetails').innerHTML = cards.length ? cards.join('') : '<div class="panel quote-empty">Upload quotes on Overview to see each supplier’s full line list here.</div>';
}

async function api(path, data) {
  const res = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  if (!res.ok) throw new Error((await res.text()).slice(0,180));
  return res.json();
}
async function refresh(rematch=false) {
  const payload = {quotes: state.quotes, baseline: state.baseline};
  if (!rematch) payload.groups = state.groups;
  report = await api('/api/compare', payload);
  state.groups = report.rows.map(({description,code,qty,unit,baseline_price,matches,confidence}) => ({description,code,qty,unit,baseline_price,matches,confidence}));
  render();
}
function render() {
  renderQuoteDetails();
  $('quoteCount').textContent = state.quotes.length;
  $('itemCount').textContent = report?.row_count || 0;
  const issueCount = (report?.rows || []).filter(row => row.confidence === 'review' || row.prices.some(p => p == null) || row.prices.some((p,i) => p != null && (row.matches?.[i]?.qty !== row.qty || row.matches?.[i]?.unit !== row.unit || row.matches?.[i]?.price_warning))).length;
  $('reviewCount').textContent = issueCount;
  const complete = (report?.complete || []).map((yes,i) => yes ? i : -1).filter(i => i >= 0);
  const winner = complete.length ? complete.reduce((a,b) => report.landed[a] <= report.landed[b] ? a : b) : -1;
  $('bestQuote').textContent = winner >= 0 ? cash(report.landed[winner]) : '—';
  $('bestQuoteFoot').textContent = winner >= 0 ? report.names[winner] : (state.quotes.length ? 'No quote covers every item yet' : 'Upload quotes to see results');
  $('exportBtn').disabled = !report?.row_count;
  $('fileCount').textContent = `${state.imported.length} file${state.imported.length === 1 ? '' : 's'}`;
  $('fileList').innerHTML = state.imported.length ? state.imported.map((f,i) => `<div class="file-row"><div class="file-tag">${esc((f.name.split('.').pop()||'Q').slice(0,4).toUpperCase())}</div><div class="file-info"><strong title="${esc(f.name)}">${esc(f.name)}</strong><small>${f.kind === 'baseline' ? 'Baseline' : 'Quote'} · ${f.items.length} line items</small>${f.warning ? `<div class="file-warning">${esc(f.warning)}</div>` : ''}</div><button class="file-remove" title="Remove file" data-file="${i}">×</button></div>`).join('') : '<div class="empty-files"><div class="empty-icon">▤</div><strong>No files yet</strong><span>Your uploaded quotes will appear here.</span></div>';
  const incomplete = state.quotes.map((q,i) => report && !report.complete[i] ? `${q.name} (${report.covered[i]}/${report.row_count} lines)` : null).filter(Boolean);
  $('coverageNotice').hidden = !incomplete.length;
  $('coverageNotice').textContent = incomplete.length ? `Incomplete coverage: ${incomplete.join('; ')}. The totals shown exclude missing items, so compare complete quotes before choosing a supplier.` : '';
  const minComplete = winner >= 0 ? report.landed[winner] : null;
  $('financialTable').querySelector('tbody').innerHTML = state.quotes.length ? state.quotes.map((q,i) => `<tr><td><strong>${esc(q.name)}</strong><small>${esc(q.price_basis || 'basis unspecified')}</small></td><td><span class="flag ${report.complete[i] ? 'ok' : 'review'}">${report.covered[i]}/${report.row_count} ${report.complete[i] ? 'complete' : 'incomplete'}</span></td><td>${cash(report.totals[i])}</td>${['freight','tax','discount'].map(field => `<td><span>$</span><input type="number" step="0.01" min="0" value="${q[field] ?? 0}" aria-label="${esc(q.name)} ${field}" data-qi="${i}" data-cost="${field}"></td>`).join('')}<td class="total-evaluated">${cash(report.landed[i])}</td><td>${cash(q.quoted_total)}${q.quoted_total != null ? `<small class="${Math.abs(report.landed[i]-q.quoted_total) <= .02 ? '' : 'incomplete'}">${Math.abs(report.landed[i]-q.quoted_total) <= .02 ? 'Matches quote' : 'Check variance'}</small>` : ''}</td><td class="${report.complete[i] ? '' : 'incomplete'}">${report.complete[i] && minComplete !== null ? cash(report.landed[i] - minComplete) : 'Incomplete'}</td></tr>`).join('') : '<tr><td colspan="9" class="table-empty">Add quotes to see the financial summary.</td></tr>';
  const table = $('comparisonTable');
  table.querySelector('thead').innerHTML = `<tr><th class="item-head">ITEM / MATCH GROUP</th><th>REQUIRED QTY</th><th>BASELINE UNIT</th>${state.quotes.map(q=>`<th class="supplier-head"><strong>${esc(q.name)}</strong><small>${esc(q.price_basis || 'basis unspecified')}</small>${previewUrls.has(q.id) ? `<button class="preview-mini" type="button" data-preview="${esc(q.id)}">View original PDF ↗</button>` : ''}</th>`).join('')}<th>LOWEST UNIT</th><th>REVIEW</th></tr>`;
  const tbody = table.querySelector('tbody');
  if (!report?.rows.length) { tbody.innerHTML = `<tr class="placeholder-row"><td colspan="${state.quotes.length+5}"><div class="table-empty">Upload two or more quotes to compare pricing across suppliers.<small>You can also add rows and quotes manually.</small></div></td></tr>`; return; }
  tbody.innerHTML = report.rows.map((row,gi) => {
    const missing = row.prices.some(p => p == null);
    const mismatch = row.prices.some((p,i) => p != null && row.matches?.[i]?.qty !== row.qty);
    const unitMismatch = row.prices.some((p,i) => p != null && row.matches?.[i]?.unit !== row.unit);
    const priceWarning = row.prices.some((p,i) => p != null && row.matches?.[i]?.price_warning);
    const flag = missing ? '<span class="flag missing">Missing quote</span>' : mismatch ? '<span class="flag review">Qty differs</span>' : unitMismatch ? '<span class="flag review">Unit differs</span>' : priceWarning ? '<span class="flag review">Total differs</span>' : row.confidence === 'review' ? '<span class="flag review">Check match</span>' : '<span class="flag ok">Matched</span>';
    const prices = state.quotes.map((q,qi) => {
      // Mark the cheapest price only when there is something to compare it with.
      const best=row.prices[qi]!=null&&row.prices[qi]===row.best&&row.prices.filter(p=>p!=null).length>1;
      const entry=row.matches?.[qi];
      return `<td class="supplier-cell ${best?'supplier-best':''}">${best?'<span class="cheapest-tag">✓ Cheapest</span>':''}${entry ? `<div class="matched-line"><strong>${esc(entry.full_description || entry.description)}</strong></div>` : '<div class="unmatched-line">No matching line in this quote</div>'}<div class="supplier-pricing"><label>Unit <span>$</span><input aria-label="${esc(q.name)} unit price for ${esc(row.description)}" type="number" min="0" step="0.01" value="${row.prices[qi] ?? ''}" placeholder="missing" data-gi="${gi}" data-qi="${qi}" data-field="price"></label><strong title="Total at the required quantity">${cash(row.values[qi])}</strong></div></td>`;
    }).join('');
    const actions = row.confidence === 'unmatched' || row.confidence === 'new' ? `<button class="subtle-btn match-btn" data-merge="${gi}" title="Match this line to another item">Match item</button>` : '';
    return `<tr><td class="item-cell"><input class="desc-input" aria-label="Description" value="${esc(row.description)}" data-gi="${gi}" data-field="description"><small>${esc(row.code || row.unit || '')} ${actions}</small></td><td><input class="qty-input" aria-label="Required quantity" type="number" min="0.01" step="any" value="${row.qty}" data-gi="${gi}" data-field="qty"></td><td><span>$</span><input class="baseline-input" aria-label="Baseline unit price" type="number" min="0" step="0.01" value="${row.baseline_price ?? ''}" data-gi="${gi}" data-field="baseline"></td>${prices}<td class="best-cell">${cash(row.best)}<small>${esc(row.winners.join(', '))}</small></td><td>${flag}</td></tr>`;
  }).join('');
}

async function renderPdfPreview(url, token) {
  const pages = $('pdfPreviewPages');
  pages.textContent = 'Loading original PDF…';
  try {
    const pdf = await pdfjsLib.getDocument({url}).promise;
    if (token !== previewRender) return;
    pages.textContent = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      if (token !== previewRender) return;
      const page = await pdf.getPage(pageNumber);
      const sheet = document.createElement('div');
      sheet.className = 'pdf-rendered-page';
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-label', `PDF page ${pageNumber} of ${pdf.numPages}`);
      sheet.append(canvas);
      pages.append(sheet);
      const base = page.getViewport({scale:1});
      const scale = Math.min(2, Math.max(1, (pages.clientWidth - 40) / base.width));
      const viewport = page.getViewport({scale});
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:pixelRatio === 1 ? null : [pixelRatio,0,0,pixelRatio,0,0]}).promise;
    }
  } catch (error) {
    if (token !== previewRender) return;
    pages.textContent = 'Preview unavailable. Open the PDF in a new tab to inspect it.';
  }
}
function renderPreviewEditor() {
  const quote = state.quotes.find(q => q.id === previewQuoteId);
  if (!quote) return;
  const lineCost = cents(quote.items.reduce((sum, item) => sum + (Number(item.total) || 0), 0));
  $('pdfPreviewSummary').innerHTML = [
    ['Quote no.', quote.quote_number || '—'],
    ['Date', quote.quote_date || '—'],
    ['Price basis', quote.price_basis || 'unspecified'],
    ['Line items', quote.items.length],
    ['Current line cost', cash(lineCost)],
    ['Original PDF total', cash(quote.quoted_total)]
  ].map(([label,value]) => `<span>${esc(label)}<strong>${esc(value)}</strong></span>`).join('');
  $('pdfPreviewLines').innerHTML = quote.items.length ? quote.items.map((entry, index) => `<tr data-line-id="${esc(entry.line_id)}"><td><label class="preview-field-label">Code<input aria-label="Line ${index+1} code" data-edit="code" value="${esc(entry.code || '')}"></label><label class="preview-field-label">Description<textarea aria-label="Line ${index+1} description" data-edit="description" rows="2">${esc(entry.full_description || entry.description)}</textarea></label></td><td><label class="preview-field-label">Qty<input aria-label="Line ${index+1} quantity" data-edit="qty" type="number" min="0.000001" step="any" value="${esc(entry.qty)}"></label><label class="preview-field-label">Unit<input aria-label="Line ${index+1} unit" data-edit="unit" value="${esc(entry.unit || 'ea')}"></label></td><td><label class="preview-field-label">Unit price<input aria-label="Line ${index+1} unit price" data-edit="unit_price" type="number" min="0" step="any" value="${esc(entry.unit_price)}"></label></td><td><label class="preview-field-label">Line total<input aria-label="Line ${index+1} line total" data-edit="total" type="number" min="0" step="any" value="${esc(entry.total)}"></label></td><td class="preview-source">${esc(entry.source || 'Manual addition')}${entry.edited ? '<small>Edited</small>' : ''}</td><td>${verifyButton(quote.id,entry)}<button type="button" class="preview-remove" data-preview-action="remove" aria-label="Remove line ${index+1}">Remove</button></td></tr>`).join('') : '<tr class="preview-empty"><td colspan="6">No lines yet. Use Add line to enter one.</td></tr>';
}
function updateGroupsForLine(quoteIndex, lineId, entry) {
  state.groups = state.groups.filter(group => {
    if (group.matches?.[quoteIndex]?.line_id !== lineId) return true;
    if (entry) group.matches[quoteIndex] = {...entry};
    else delete group.matches[quoteIndex];
    const otherMatches = Object.keys(group.matches).length;
    const fromBaseline = state.baseline.some(b => b.code === group.code && b.description === group.description);
    if (!otherMatches && !fromBaseline) return false;
    if (entry && otherMatches === 1 && !fromBaseline) {
      group.description = entry.description;
      group.code = entry.code;
      group.qty = entry.qty;
      group.unit = entry.unit;
    }
    return true;
  });
}
function addGroupForLine(quoteIndex, entry) {
  const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const match = state.groups.find(group => !group.matches?.[quoteIndex] && ((entry.code && group.code && normalized(entry.code) === normalized(group.code)) || normalized(entry.description) === normalized(group.description)));
  if (match) match.matches[quoteIndex] = {...entry};
  else state.groups.push({description:entry.description,code:entry.code,qty:entry.qty,unit:entry.unit,baseline_price:null,matches:{[quoteIndex]:{...entry}},confidence:'new'});
}
async function savePreviewChange(quote, lineId, field, value) {
  const quoteIndex = state.quotes.indexOf(quote);
  const entry = quote.items.find(item => item.line_id === lineId);
  if (!entry) return;
  if (['qty','unit_price','total'].includes(field)) {
    const number = Number(value);
    if (value === '' || !Number.isFinite(number) || number < 0 || (field === 'qty' && number <= 0)) { alert('Enter a valid positive quantity or non-negative price.'); renderPreviewEditor(); return; }
    if (field === 'total') { entry.total = cents(number); entry.unit_price = rate(entry.total / Number(entry.qty)); }
    else if (field === 'unit_price') { entry.unit_price = rate(number); entry.total = cents(Number(entry.qty) * entry.unit_price); }
    else { entry.qty = number; entry.total = cents(entry.qty * Number(entry.unit_price)); }
  } else {
    value = value.trim();
    if (field === 'description' && !value) { alert('A description is required.'); renderPreviewEditor(); return; }
    if (field === 'description') { entry.description = value; entry.full_description = value; }
    else entry[field] = field === 'code' ? value.toUpperCase() : value;
  }
  entry.edited = true;
  entry.price_verified = false;
  delete entry.price_verified_at;
  entry.price_warning = false;
  delete entry.inc_gst_unit;
  delete entry.inc_gst_total;
  updateGroupsForLine(quoteIndex, lineId, entry);
  const record = state.imported.find(file => file.id === quote.id);
  if (record) record.items = quote.items;
  const scroll = document.querySelector('.preview-lines-scroll').scrollTop;
  await refresh();
  renderPreviewEditor();
  document.querySelector('.preview-lines-scroll').scrollTop = scroll;
}
function openPdfPreview(id) {
  const quote = state.quotes.find(q => q.id === id);
  const url = previewUrls.get(id);
  if (!quote || !url) return;
  const sourceFile = state.imported.find(f => f.id === id)?.name || quote.name;
  previewQuoteId = id;
  quote.items.forEach(entry => { if (!entry.line_id) entry.line_id = newId(); });
  $('pdfPreviewTitle').textContent = `Original PDF · ${quote.name}`;
  $('pdfPreviewSubtitle').textContent = sourceFile;
  renderPreviewEditor();
  $('pdfOpenLink').href = url;
  $('pdfPreviewDialog').showModal();
  const token = ++previewRender;
  if (globalThis.pdfjsLib) renderPdfPreview(url, token);
  else { $('pdfPreviewPages').hidden = true; $('pdfPreviewFrame').hidden = false; $('pdfPreviewFrame').src = url; }
}
async function togglePriceVerification(quoteId, lineId) {
  const quoteIndex = state.quotes.findIndex(quote => quote.id === quoteId);
  const quote = state.quotes[quoteIndex];
  const entry = quote?.items.find(item => item.line_id === lineId);
  if (!entry) return;
  entry.price_verified = !entry.price_verified;
  if (entry.price_verified) entry.price_verified_at = new Date().toISOString();
  else delete entry.price_verified_at;
  updateGroupsForLine(quoteIndex, lineId, entry);
  const comparisonScroll = document.querySelector('.comparison-panel .table-scroll').scrollLeft;
  const previewScroll = document.querySelector('.preview-lines-scroll').scrollTop;
  await refresh();
  document.querySelector('.comparison-panel .table-scroll').scrollLeft = comparisonScroll;
  if (previewQuoteId === quoteId) {
    renderPreviewEditor();
    document.querySelector('.preview-lines-scroll').scrollTop = previewScroll;
  }
}
document.addEventListener('click', async event => {
  const verify = event.target.closest('[data-verify-line]');
  if (verify) { event.preventDefault(); await togglePriceVerification(verify.dataset.verifyQuote, verify.dataset.verifyLine); return; }
  const button = event.target.closest('[data-preview]');
  if (button) {event.preventDefault(); openPdfPreview(button.dataset.preview)}
});
$('pdfPreviewClose').addEventListener('click', () => $('pdfPreviewDialog').close());
$('pdfPreviewDialog').addEventListener('close', () => { previewQuoteId = null; previewRender++; $('pdfPreviewPages').replaceChildren(); $('pdfPreviewFrame').src = 'about:blank'; });
$('pdfAddLine').addEventListener('click', () => {
  const tbody = $('pdfPreviewLines');
  tbody.querySelector('.preview-empty')?.remove();
  if (tbody.querySelector('.preview-draft')) { tbody.querySelector('.preview-draft textarea').focus(); return; }
  tbody.insertAdjacentHTML('beforeend', '<tr class="preview-draft"><td><label class="preview-field-label">Code<input data-draft="code" placeholder="Optional code"></label><label class="preview-field-label">Description<textarea data-draft="description" rows="2" placeholder="Item description"></textarea></label></td><td><label class="preview-field-label">Qty<input data-draft="qty" type="number" min="0.000001" step="any" value="1"></label><label class="preview-field-label">Unit<input data-draft="unit" value="ea"></label></td><td><label class="preview-field-label">Unit price<input data-draft="unit_price" type="number" min="0" step="any" value="0"></label></td><td><label class="preview-field-label">Line total<input data-draft="total" type="number" min="0" step="any" value="0"></label></td><td class="preview-source">Manual addition</td><td><button type="button" class="preview-save" data-preview-action="save">Save line</button><button type="button" class="preview-remove" data-preview-action="cancel">Cancel</button></td></tr>');
  tbody.querySelector('.preview-draft textarea').focus();
});
$('pdfPreviewLines').addEventListener('change', async event => {
  const draft = event.target.closest('[data-draft]');
  if (draft && ['qty','unit_price','total'].includes(draft.dataset.draft)) {
    const row = draft.closest('tr');
    const qty = Number(row.querySelector('[data-draft="qty"]').value);
    const price = Number(row.querySelector('[data-draft="unit_price"]').value);
    if (qty > 0 && price >= 0) {
      if (draft.dataset.draft === 'total') row.querySelector('[data-draft="unit_price"]').value = rate(Number(draft.value) / qty);
      else row.querySelector('[data-draft="total"]').value = cents(qty * price);
    }
    return;
  }
  const input = event.target.closest('[data-edit]');
  if (!input || !previewQuoteId) return;
  const quote = state.quotes.find(q => q.id === previewQuoteId);
  if (quote) await savePreviewChange(quote, input.closest('tr').dataset.lineId, input.dataset.edit, input.value);
});
$('pdfPreviewLines').addEventListener('click', async event => {
  const button = event.target.closest('[data-preview-action]');
  if (!button || !previewQuoteId) return;
  const quote = state.quotes.find(q => q.id === previewQuoteId);
  if (!quote) return;
  const action = button.dataset.previewAction;
  if (action === 'cancel') { renderPreviewEditor(); return; }
  if (action === 'save') {
    const row = button.closest('tr');
    const get = key => row.querySelector(`[data-draft="${key}"]`).value.trim();
    const description = get('description'), qty = Number(get('qty')), unitPrice = Number(get('unit_price')), total = Number(get('total'));
    if (!description || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(total) || total < 0) { alert('Enter a description, positive quantity and valid prices.'); return; }
    const entry = {line_id:newId(),code:get('code').toUpperCase(),description,full_description:description,qty,unit:get('unit') || 'ea',unit_price:rate(unitPrice),total:cents(qty*unitPrice),source:'Manual addition',edited:true,price_warning:false};
    if (Math.abs(total - entry.total) > .01) { entry.total = cents(total); entry.unit_price = rate(entry.total / qty); }
    quote.items.push(entry);
    addGroupForLine(state.quotes.indexOf(quote), entry);
  } else if (action === 'remove') {
    const lineId = button.closest('tr').dataset.lineId;
    const index = quote.items.findIndex(item => item.line_id === lineId);
    if (index < 0) return;
    quote.items.splice(index, 1);
    updateGroupsForLine(state.quotes.indexOf(quote), lineId, null);
  }
  const record = state.imported.find(file => file.id === quote.id);
  if (record) record.items = quote.items;
  await refresh();
  renderPreviewEditor();
});
window.addEventListener('beforeunload', () => {for(const url of previewUrls.values()) URL.revokeObjectURL(url)});

async function importFiles(files) {
  if (!files.length) return;
  const form = new FormData();
  for (const file of files) form.append('files',file);
  $('dropzone').classList.add('dragging');
  try {
    const res = await fetch('/api/import',{method:'POST',body:form});
    if (!res.ok) throw new Error(`Import failed (${res.status})`);
    const parsed = await res.json();
    parsed.forEach((entry, i) => {
      if (entry.kind === 'error') { alert(`${entry.name}: ${entry.warning}`); return; }
      const name = files[i]?.name || entry.name;
      const id = newId();
      if(entry.kind === 'baseline') {
        for(const previous of state.imported.filter(f=>f.kind==='baseline')){
          if(previewUrls.has(previous.id)){URL.revokeObjectURL(previewUrls.get(previous.id));previewUrls.delete(previous.id)}
        }
        state.imported = state.imported.filter(f => f.kind !== 'baseline');
      }
      const record = {...entry,name,id};
      if (entry.kind !== 'baseline') record.items = entry.items.map(item => ({...item,line_id:newId()}));
      state.imported.push(record);
      if(name.toLowerCase().endsWith('.pdf') && files[i]) previewUrls.set(id, URL.createObjectURL(files[i]));
      if (entry.kind === 'baseline') {state.baseline = entry.items; state.baselineName = name;}
      else state.quotes.push({id,name:entry.name,items:record.items,freight:entry.freight||0,tax:entry.tax||0,
                              discount:entry.discount||0,quoted_total:entry.quoted_total??null,price_basis:entry.price_basis||'unspecified',
                              quote_number:entry.quote_number||'',quote_date:entry.quote_date||'',expiry_date:entry.expiry_date||'',
                              raw_text:entry.raw_text||''});
    });
    await refresh(true);
  } catch(err) {alert(err.message)} finally {$('dropzone').classList.remove('dragging'); $('fileInput').value='';}
}

$('dropzone').addEventListener('click',()=> $('fileInput').click());
$('dropzone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('fileInput').click()}});
$('fileInput').addEventListener('change',e=>importFiles(e.target.files));
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();$('dropzone').classList.add('dragging')});
$('dropzone').addEventListener('dragleave',()=> $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop',e=>{e.preventDefault();importFiles(e.dataTransfer.files)});
$('fileList').addEventListener('click',async e=>{
  const button=e.target.closest('[data-file]'); if(!button)return;
  const index=Number(button.dataset.file), removed=state.imported.splice(index,1)[0];
  if(previewUrls.has(removed.id)){URL.revokeObjectURL(previewUrls.get(removed.id));previewUrls.delete(removed.id)}
  if(removed.kind==='baseline'){state.baseline=[];state.baselineName=''}
  else {const qi=state.quotes.findIndex(q=>q.id===removed.id);if(qi>=0)state.quotes.splice(qi,1)}
  await refresh(true);
});
$('comparisonTable').addEventListener('change',async e=>{
  const input=e.target, gi=Number(input.dataset.gi), field=input.dataset.field;
  if(!field)return;
  const group=state.groups[gi]; if(!group)return;
  if(field==='description') group.description=input.value.trim();
  if(field==='qty') group.qty=Math.max(.01,num(input.value)||1);
  if(field==='baseline') group.baseline_price=input.value===''?null:Math.max(0,num(input.value)||0);
  if(field==='price'){
    const qi=Number(input.dataset.qi);
    const old=group.matches[qi];
    const sourceItem=old && state.quotes[qi].items.find(x=>x.source===old.source && x.description===old.description);
    if(input.value==='') {
      if(sourceItem) state.quotes[qi].items.splice(state.quotes[qi].items.indexOf(sourceItem),1);
      delete group.matches[qi];
    }
    else {
      const price=Math.max(0,num(input.value)||0);
      const existing=sourceItem || {line_id:newId(),description:group.description,code:group.code,qty:group.qty,unit:group.unit,source:'Manual correction'};
      existing.unit_price=price; existing.total=price*existing.qty;
      existing.price_warning=false;
      existing.price_verified=false;
      delete existing.price_verified_at;
      group.matches[qi]=existing;
      if(!state.quotes[qi].items.includes(existing)) state.quotes[qi].items.push(existing);
    }
  }
  await refresh();
});
$('comparisonTable').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-merge]');if(!btn)return;
  const from=Number(btn.dataset.merge);
  const choices=state.groups.map((g,i)=>i===from?null:`${i+1}: ${g.description}`).filter(Boolean);
  const chosen=prompt(`Enter the item number to match this line with:\n${choices.slice(0,60).join('\n')}`);
  if(!chosen)return;
  const to=Number(chosen)-1;
  if(!Number.isInteger(to)||to<0||to>=state.groups.length||to===from){alert('Choose a valid item number.');return}
  const source=state.groups[from],target=state.groups[to];
  for(const [qi,entry] of Object.entries(source.matches)){
    if(target.matches[qi]){alert('That supplier already has an item matched to the target row.');return}
    target.matches[qi]=entry;
  }
  target.confidence='review';state.groups.splice(from,1);await refresh();
});
$('financialTable').addEventListener('change',async e=>{
  const input=e.target, field=input.dataset.cost, qi=Number(input.dataset.qi);
  if(!field || !state.quotes[qi])return;
  state.quotes[qi][field]=Math.max(0,num(input.value)||0);
  await refresh();
});
$('addRowBtn').addEventListener('click',async()=>{
  const description=prompt('Item description');if(!description?.trim())return;
  state.groups.push({description:description.trim(),code:'',qty:1,unit:'ea',baseline_price:null,matches:{},confidence:'new'});
  await refresh();
});
$('addQuoteBtn').addEventListener('click',async()=>{
  const name=prompt('Supplier or subcontractor name');if(!name?.trim())return;
  state.quotes.push({id:newId(),name:name.trim(),items:[]});await refresh();
});
// The sidebar's Axis logo as a PNG for the workbook banners; the export still works without it.
function brandLogo(){
  const img=document.querySelector('.brand-logo');
  if(!img?.complete||!img.naturalWidth)return null;
  try{
    const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    canvas.getContext('2d').drawImage(img,0,0);
    return {dataUrl:canvas.toDataURL('image/png'),width:img.naturalWidth,height:img.naturalHeight};
  }catch{return null}
}
$('exportBtn').addEventListener('click',async()=>{
  const button=$('exportBtn');button.disabled=true;button.textContent='Preparing spreadsheet…';
  try{
    if(!window.QuoteLineWorkbook)throw new Error('The spreadsheet library did not load. Check your internet connection and reload the page.');
    await refresh();
    const quotes=state.quotes.map(q=>({...q,source_file:state.imported.find(f=>f.id===q.id)?.name||''}));
    const buffer=await QuoteLineWorkbook.build({project:$('project').value,quotes,report,logo:brandLogo()});
    const file=($('project').value.trim()||'quote-comparison').replace(/[^\w .-]+/g,'').trim().replace(/\s+/g,'-')||'quote-comparison';
    const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));const a=document.createElement('a');a.href=url;a.download=`${file}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(err){alert(err.message)}finally{button.disabled=false;button.textContent='↧   Export comparison'}
});
refresh();
showView(location.hash.slice(1));
