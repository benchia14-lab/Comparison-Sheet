const state = { quotes: [], baseline: [], baselineName: '', groups: [], imported: [] };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cash = value => value == null || value === '' ? '—' : new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(value));
const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
let report = null;
const previewUrls = new Map();
let previewRender = 0;
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
    cards.push(`<section class="panel quote-detail-card"><div class="quote-detail-head"><div><span class="heading-eyebrow">SUPPLIER ${qi+1} / SOURCE QUOTE</span><h2>${esc(q.name)}</h2><p class="source-file">${esc(file)}</p></div><a class="subtle-btn quote-compare-link" href="#comparison">View comparison →</a></div><div class="quote-meta">${metadata.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}<div><span>Items</span><strong>${q.items.length}</strong></div></div><div class="quote-totals"><div><span>Product lines</span><strong>${cash(lineCost)}</strong></div><div><span>Freight</span><strong>${cash(q.freight||0)}</strong></div><div><span>Tax / GST</span><strong>${cash(q.tax||0)}</strong></div><div><span>Document total</span><strong>${cash(q.quoted_total)}</strong></div></div><div class="table-scroll"><table class="source-table"><thead><tr><th>CODE</th><th>QUOTED DESCRIPTION</th><th>QTY</th><th>UNIT</th><th>UNIT PRICE</th><th>LINE TOTAL</th><th>INC GST TOTAL</th><th>SOURCE</th></tr></thead><tbody>${q.items.length ? q.items.map(e=>`<tr><td><strong>${esc(e.code || '—')}</strong></td><td class="source-description">${esc(e.full_description || e.description)}${e.price_warning ? '<small class="incomplete">Quoted total needs checking</small>' : ''}</td><td>${esc(e.qty)}</td><td>${esc(e.unit)}</td><td>${cash(e.unit_price)}</td><td>${cash(e.total)}</td><td>${cash(e.inc_gst_total)}</td><td><small>${esc(e.source)}</small></td></tr>`).join('') : '<tr><td colspan="8" class="table-empty">No priced lines were detected. Add or correct lines in Comparison.</td></tr>'}</tbody></table></div></section>`);
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
      const entry=row.matches?.[qi],best=entry&&row.prices[qi]===row.best;
      return `<td class="supplier-cell ${best?'supplier-best':''}">${entry ? `<div class="matched-line"><strong>${esc(entry.full_description || entry.description)}</strong><small>${esc(entry.code || 'No code')} · ${esc(entry.qty)} ${esc(entry.unit)} quoted</small><small>${esc(entry.source)}</small></div>` : '<div class="unmatched-line">No matching line in this quote</div>'}<div class="supplier-pricing"><label>Unit <span>$</span><input aria-label="${esc(q.name)} unit price for ${esc(row.description)}" type="number" min="0" step="0.01" value="${row.prices[qi] ?? ''}" placeholder="missing" data-gi="${gi}" data-qi="${qi}" data-field="price"></label><div>At required qty <strong>${cash(row.values[qi])}</strong></div></div></td>`;
    }).join('');
    const actions = row.confidence === 'unmatched' || row.confidence === 'new' ? `<button class="subtle-btn match-btn" data-merge="${gi}" title="Match this line to another item">Match item</button>` : '';
    return `<tr><td class="item-cell"><input class="desc-input" aria-label="Description" value="${esc(row.description)}" data-gi="${gi}" data-field="description"><small>${esc(row.code || row.unit || '')} ${actions}</small></td><td><input class="qty-input" aria-label="Required quantity" type="number" min="0.01" step="any" value="${row.qty}" data-gi="${gi}" data-field="qty"></td><td><span>$</span><input class="baseline-input" aria-label="Baseline unit price" type="number" min="0" step="0.01" value="${row.baseline_price ?? ''}" data-gi="${gi}" data-field="baseline"></td>${prices}<td class="best-cell">${cash(row.best)}<small>${esc(row.winners.join(', '))}</small>${row.spread ? `<small>${cash(row.spread)} spread</small>` : ''}</td><td>${flag}</td></tr>`;
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
function openPdfPreview(id) {
  const quote = state.quotes.find(q => q.id === id);
  const url = previewUrls.get(id);
  if (!quote || !url) return;
  const sourceFile = state.imported.find(f => f.id === id)?.name || quote.name;
  $('pdfPreviewTitle').textContent = `Original PDF · ${quote.name}`;
  $('pdfPreviewSubtitle').textContent = sourceFile;
  $('pdfPreviewSummary').innerHTML = [
    ['Quote no.', quote.quote_number || '—'],
    ['Date', quote.quote_date || '—'],
    ['Price basis', quote.price_basis || 'unspecified'],
    ['Line items', quote.items.length],
    ['Document total', cash(quote.quoted_total)]
  ].map(([label,value]) => `<span>${esc(label)}<strong>${esc(value)}</strong></span>`).join('');
  $('pdfPreviewLines').innerHTML = quote.items.length ? quote.items.map(entry => `<tr><td><strong>${esc(entry.code || 'No code')}</strong><small>${esc(entry.full_description || entry.description)}</small></td><td>${esc(entry.qty)} ${esc(entry.unit)}</td><td>${cash(entry.unit_price)}</td><td>${cash(entry.total)}</td><td>${esc(entry.source)}</td></tr>`).join('') : '<tr><td colspan="5">No priced items were extracted from this PDF.</td></tr>';
  $('pdfOpenLink').href = url;
  $('pdfPreviewDialog').showModal();
  const token = ++previewRender;
  if (globalThis.pdfjsLib) renderPdfPreview(url, token);
  else { $('pdfPreviewPages').hidden = true; $('pdfPreviewFrame').hidden = false; $('pdfPreviewFrame').src = url; }
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-preview]');
  if (button) {event.preventDefault(); openPdfPreview(button.dataset.preview)}
});
$('pdfPreviewClose').addEventListener('click', () => $('pdfPreviewDialog').close());
$('pdfPreviewDialog').addEventListener('close', () => { previewRender++; $('pdfPreviewPages').replaceChildren(); $('pdfPreviewFrame').src = 'about:blank'; });
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
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
      if(entry.kind === 'baseline') {
        for(const previous of state.imported.filter(f=>f.kind==='baseline')){
          if(previewUrls.has(previous.id)){URL.revokeObjectURL(previewUrls.get(previous.id));previewUrls.delete(previous.id)}
        }
        state.imported = state.imported.filter(f => f.kind !== 'baseline');
      }
      const record = {...entry,name,id};
      state.imported.push(record);
      if(name.toLowerCase().endsWith('.pdf') && files[i]) previewUrls.set(id, URL.createObjectURL(files[i]));
      if (entry.kind === 'baseline') {state.baseline = entry.items; state.baselineName = name;}
      else state.quotes.push({id,name:entry.name,items:entry.items,freight:entry.freight||0,tax:entry.tax||0,
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
      const existing=sourceItem || {description:group.description,code:group.code,qty:group.qty,unit:group.unit,source:'Manual correction'};
      existing.unit_price=price; existing.total=price*existing.qty;
      existing.price_warning=false;
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
  state.quotes.push({name:name.trim(),items:[]});await refresh();
});
$('exportBtn').addEventListener('click',async()=>{
  const button=$('exportBtn');button.disabled=true;button.textContent='Preparing spreadsheet…';
  try{
    const res=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:$('project').value,quotes:state.quotes,groups:state.groups})});
    if(!res.ok)throw new Error('Export failed');
    const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download='quote-comparison.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(err){alert(err.message)}finally{button.disabled=false;button.textContent='↧   Export comparison'}
});
refresh();
showView(location.hash.slice(1));
