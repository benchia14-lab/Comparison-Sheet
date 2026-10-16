/* Builds the formatted comparison workbook in the browser with ExcelJS. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.QuoteLineWorkbook = factory(root.ExcelJS);
})(typeof self !== 'undefined' ? self : this, ExcelJS => {
  // Axis Services Group brand: PMS 877 grey (#8A8D8F), darker shade for filled headers, Arial text.
  const BRAND = '8A8D8F', BRAND_STRONG = '6B6E70', INK = '1F1F1F', GREY = '6F7173', LIGHT = 'F3F4F4', LINE = 'DDDEDF', WHITE = 'FFFFFF';
  const GOOD = ['E7F5EB', '2F8A5C'], WARN = ['FFF2D9', 'AD7625'], BAD = ['FCECEB', 'B4433A'];
  const MONEY = '$#,##0.00;[Red]-$#,##0.00', DATE = 'dd mmm yyyy', QTY = '#,##0.##';
  const FONT = 'Arial';

  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } });
  const font = (extra = {}) => ({ name: FONT, size: 10, color: { argb: 'FF' + INK }, ...extra, ...(extra.color ? { color: { argb: 'FF' + extra.color } } : {}) });
  const edge = { style: 'thin', color: { argb: 'FF' + LINE } };
  const num = value => { const n = Number(value); return value === null || value === '' || value === undefined || !Number.isFinite(n) ? null : n; };
  const cents = value => Math.round(value * 100) / 100;
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  // Quote dates are printed day-first (Australian layouts).
  function parseDate(value) {
    const m = text(value).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!m) return null;
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
    return date.getUTCMonth() === Number(m[2]) - 1 ? date : null;
  }
  function expiryStatus(value, today) {
    if (!text(value)) return ['Not stated', null];
    const date = parseDate(value);
    if (!date) return ['Check date', WARN];
    return date < today ? ['Expired', BAD] : ['Valid', GOOD];
  }
  function sheetName(name, used) {
    const base = (text(name).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Quote').slice(0, 28);
    let candidate = base, n = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base.slice(0, 26)} ${n++}`;
    used.add(candidate.toLowerCase());
    return candidate;
  }
  const ref = (sheet, address) => `'${sheet.replace(/'/g, "''")}'!${address}`;

  function setCell(ws, address, value, style = {}) {
    const cell = ws.getCell(address);
    cell.value = value instanceof Date || typeof value === 'number' || (value && typeof value === 'object') ? value : (value == null ? null : String(value));
    cell.font = font(style.font);
    if (style.fill) cell.fill = fill(style.fill);
    if (style.numFmt) cell.numFmt = style.numFmt;
    cell.alignment = { vertical: 'middle', wrapText: !!style.wrap, horizontal: style.align, indent: style.indent };
    if (style.border) cell.border = style.border;
    return cell;
  }
  function banner(ws, lastCol, title, subtitle, logo) {
    ws.mergeCells(1, 1, 1, lastCol);
    ws.mergeCells(2, 1, 2, lastCol);
    const brandLine = { style: 'thick', color: { argb: 'FF' + BRAND } };
    setCell(ws, 'A1', title, { font: { size: 18, bold: true }, border: { top: brandLine } });
    setCell(ws, 'A2', subtitle, { font: { size: 10, color: GREY }, border: { bottom: { style: 'thin', color: { argb: 'FF' + BRAND } } } });
    ws.getCell('A1').alignment = { vertical: 'bottom' };
    ws.getCell('A2').alignment = { vertical: 'top' };
    ws.getRow(1).height = 42;
    ws.getRow(2).height = 24;
    // The supplied logo, unscaled in proportion, at the top right with clear space around it.
    if (logo) {
      const height = 64, width = Math.round(height * logo.width / logo.height);
      ws.addImage(logo.id, { tl: { col: lastCol - 1, row: 0.12 }, ext: { width, height }, editAs: 'oneCell' });
    }
  }
  const LEFT_HEADERS = new Set(['Description', 'Code', 'Supplier', 'Source', 'Lowest supplier']);
  function headerRow(ws, rowNumber, titles, firstCol = 1) {
    titles.forEach((title, i) => setCell(ws, ws.getCell(rowNumber, firstCol + i).address, title, {
      fill: BRAND_STRONG, font: { bold: true, color: WHITE }, wrap: true, align: LEFT_HEADERS.has(title) ? 'left' : 'center',
      border: { bottom: { style: 'medium', color: { argb: 'FF55585A' } } }
    }));
    ws.getRow(rowNumber).height = 32;
  }
  function sectionTitle(ws, rowNumber, label, lastCol) {
    ws.mergeCells(rowNumber, 1, rowNumber, lastCol);
    setCell(ws, ws.getCell(rowNumber, 1).address, label.toUpperCase(), { font: { bold: true, size: 9, color: BRAND_STRONG } });
    ws.getRow(rowNumber).height = 22;
  }
  function badge(cell, label, colours) {
    cell.value = label;
    cell.font = font({ bold: true, size: 9, color: colours ? colours[1] : GREY });
    if (colours) cell.fill = fill(colours[0]);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  function bodyBorders(ws, fromRow, toRow, lastCol) {
    for (let r = fromRow; r <= toRow; r++) for (let c = 1; c <= lastCol; c++) {
      const cell = ws.getCell(r, c);
      cell.border = { ...(cell.border || {}), bottom: edge };
      if (!cell.font) cell.font = font();
    }
  }
  function pageSetup(ws, landscape, repeatRows) {
    ws.pageSetup = { orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
    if (repeatRows) ws.pageSetup.printTitlesRow = repeatRows;
    ws.headerFooter.oddFooter = '&L&8QuoteLine comparison&R&8Page &P of &N';
    ws.views = [{ showGridLines: false, ...(ws.views?.[0] || {}) }];
  }

  function rowStatus(row, quotes) {
    const matched = quotes.map((_, i) => row.matches?.[i]);
    if (row.prices.some(p => p == null)) return ['Missing quote', BAD];
    if (row.prices.some((p, i) => matched[i] && num(matched[i].qty) !== num(row.qty))) return ['Qty differs', WARN];
    if (row.prices.some((p, i) => matched[i] && text(matched[i].unit) !== text(row.unit))) return ['Unit differs', WARN];
    if (matched.some(e => e?.price_warning)) return ['Total differs', WARN];
    if (row.confidence === 'review') return ['Check match', WARN];
    return ['Matched', GOOD];
  }

  async function build({ project, quotes = [], report, generatedAt = new Date(), logo = null }) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'QuoteLine';
    wb.created = generatedAt;
    const today = new Date(Date.UTC(generatedAt.getFullYear(), generatedAt.getMonth(), generatedAt.getDate()));
    const stamp = generatedAt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    const projectName = text(project) || 'Quote comparison';
    const rows = report?.rows || [];
    const used = new Set(['summary', 'comparison']);
    const quoteSheets = quotes.map(q => sheetName(q.name, used));
    const complete = quotes.map((_, i) => !!report?.complete?.[i]);
    const landed = quotes.map((_, i) => report?.landed?.[i] ?? 0);
    const completeTotals = landed.filter((_, i) => complete[i]);
    const lowest = completeTotals.length ? Math.min(...completeTotals) : null;
    const winner = lowest == null ? -1 : landed.findIndex((v, i) => complete[i] && v === lowest);
    const ranks = landed.map((v, i) => complete[i] ? 1 + landed.filter((w, j) => complete[j] && w < v).length : null);
    const reviewCount = rows.filter(r => rowStatus(r, quotes)[0] !== 'Matched').length;

    const summary = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF' + BRAND_STRONG } } });
    const comparison = wb.addWorksheet('Comparison', { properties: { tabColor: { argb: 'FF' + BRAND_STRONG } } });
    const brandLogo = logo?.dataUrl ? { id: wb.addImage({ base64: logo.dataUrl, extension: 'png' }), width: logo.width, height: logo.height } : null;

    /* ---------- Comparison: one row per item, two columns per supplier ---------- */
    const hasBaseline = rows.some(r => num(r.baseline_price) != null);
    const itemCols = ['#', 'Description', 'Code', 'Req. qty', 'Unit', ...(hasBaseline ? ['Baseline unit', 'Baseline total'] : [])];
    const firstSupplierCol = itemCols.length + 1;
    const supplierCol = qi => firstSupplierCol + qi * 2;
    const resultCol = firstSupplierCol + quotes.length * 2;
    const lastCompCol = resultCol + 3;
    banner(comparison, lastCompCol, `${projectName} · Price comparison`,
      `Unit prices compared at the required quantity · Lowest price per line highlighted · Exported ${stamp}`, brandLogo);
    comparison.mergeCells(4, 1, 5, itemCols.length);
    setCell(comparison, 'A4', 'ITEMS', { fill: LIGHT, font: { bold: true, color: GREY, size: 9 }, indent: 1 });
    quotes.forEach((q, qi) => {
      const c = supplierCol(qi);
      comparison.mergeCells(4, c, 4, c + 1);
      comparison.mergeCells(5, c, 5, c + 1);
      setCell(comparison, comparison.getCell(4, c).address, q.name, { fill: qi === winner ? GOOD[0] : LIGHT, font: { bold: true, size: 11, color: qi === winner ? GOOD[1] : INK }, align: 'center' });
      const details = [q.quote_number && `Quote ${q.quote_number}`, q.quote_date, q.price_basis && q.price_basis !== 'unspecified' ? q.price_basis : null].filter(Boolean).join(' · ');
      setCell(comparison, comparison.getCell(5, c).address, details || 'No quote details', { fill: qi === winner ? GOOD[0] : LIGHT, font: { size: 9, color: GREY }, align: 'center' });
    });
    comparison.mergeCells(4, resultCol, 5, lastCompCol);
    setCell(comparison, comparison.getCell(4, resultCol).address, 'RESULT', { fill: LIGHT, font: { bold: true, color: GREY, size: 9 }, align: 'center' });
    const compHeader = 6;
    headerRow(comparison, compHeader, [...itemCols, ...quotes.flatMap(() => ['Unit price', 'Total at req. qty']), 'Lowest unit', 'Lowest supplier', 'Spread', 'Status']);
    const firstItemRow = compHeader + 1;
    rows.forEach((row, ri) => {
      const r = firstItemRow + ri, qty = num(row.qty) ?? 1;
      const qtyAddr = comparison.getCell(r, 4).address;
      setCell(comparison, comparison.getCell(r, 1).address, ri + 1, { font: { color: GREY }, align: 'center' });
      // Show the quote's full wording when the item came from that line (PDF descriptions wrap onto extra lines).
      const description = Object.values(row.matches || {}).find(e => e && e.description === row.description)?.full_description || row.description;
      setCell(comparison, comparison.getCell(r, 2).address, description, { wrap: true, font: { bold: true } });
      setCell(comparison, comparison.getCell(r, 3).address, row.code || '—', { font: { color: GREY } });
      setCell(comparison, qtyAddr, qty, { numFmt: QTY, align: 'center' });
      setCell(comparison, comparison.getCell(r, 5).address, row.unit || 'ea', { align: 'center' });
      if (hasBaseline) {
        const base = num(row.baseline_price);
        setCell(comparison, comparison.getCell(r, 6).address, base, { numFmt: MONEY });
        setCell(comparison, comparison.getCell(r, 7).address, base == null ? null : { formula: `${qtyAddr}*${comparison.getCell(r, 6).address}`, result: cents(qty * base) }, { numFmt: MONEY });
      }
      quotes.forEach((q, qi) => {
        const c = supplierCol(qi), price = row.prices?.[qi];
        const best = price != null && price === row.best && rows.length;
        const style = best ? { fill: GOOD[0], font: { bold: true, color: GOOD[1] } } : {};
        if (price == null) {
          comparison.mergeCells(r, c, r, c + 1);
          setCell(comparison, comparison.getCell(r, c).address, 'Not quoted', { font: { italic: true, color: BAD[1] }, align: 'center', fill: BAD[0] });
          return;
        }
        const priceCell = setCell(comparison, comparison.getCell(r, c).address, price, { numFmt: MONEY, ...style });
        if (row.matches?.[qi]?.price_verified) priceCell.note = 'Price verified against the source quote';
        setCell(comparison, comparison.getCell(r, c + 1).address, { formula: `${qtyAddr}*${priceCell.address}`, result: cents(qty * price) }, { numFmt: MONEY, ...style });
      });
      setCell(comparison, comparison.getCell(r, resultCol).address, row.best, { numFmt: MONEY, font: { bold: true } });
      setCell(comparison, comparison.getCell(r, resultCol + 1).address, (row.winners || []).join(', ') || '—', { wrap: true });
      setCell(comparison, comparison.getCell(r, resultCol + 2).address, row.spread, { numFmt: MONEY, font: { color: GREY } });
      badge(comparison.getCell(r, resultCol + 3), ...rowStatus(row, quotes));
      comparison.getRow(r).height = Math.max(20, Math.ceil(text(description).length / 45) * 14);
    });
    const lastItemRow = firstItemRow + rows.length - 1;
    bodyBorders(comparison, firstItemRow, Math.max(firstItemRow, lastItemRow), lastCompCol);
    // Totals block underneath each supplier's "total at required qty" column.
    const totalsStart = lastItemRow + 2;
    const totalLabels = ['Product lines', 'Freight', 'Tax / GST', 'Less discount', 'Total evaluated', 'Lines covered'];
    const totalRefs = quotes.map(() => ({}));
    totalLabels.forEach((label, i) => {
      const r = totalsStart + i, isTotal = label === 'Total evaluated';
      comparison.mergeCells(r, 2, r, firstSupplierCol - 1);
      setCell(comparison, comparison.getCell(r, 2).address, label, { font: { bold: isTotal, color: isTotal ? INK : GREY }, align: 'right', fill: isTotal ? LIGHT : undefined });
      quotes.forEach((q, qi) => {
        const c = supplierCol(qi) + 1, address = comparison.getCell(r, c).address;
        const totalCol = comparison.getColumn(c).letter;
        let value;
        if (label === 'Product lines') value = rows.length ? { formula: `SUM(${totalCol}${firstItemRow}:${totalCol}${lastItemRow})`, result: report.totals[qi] } : 0;
        if (label === 'Freight') value = num(q.freight) ?? 0;
        if (label === 'Tax / GST') value = num(q.tax) ?? 0;
        if (label === 'Less discount') value = num(q.discount) ?? 0;
        if (isTotal) {
          const [lines, freight, tax, discount] = [0, 1, 2, 3].map(k => comparison.getCell(totalsStart + k, c).address);
          value = { formula: `${lines}+${freight}+${tax}-${discount}`, result: landed[qi] };
        }
        if (label === 'Lines covered') value = `${report.covered[qi]} of ${report.row_count}${complete[qi] ? '' : ' · incomplete'}`;
        const isWin = isTotal && qi === winner;
        setCell(comparison, address, value, { numFmt: label === 'Lines covered' ? undefined : MONEY, align: label === 'Lines covered' ? 'right' : undefined,
          font: { bold: isTotal, color: isWin ? GOOD[1] : label === 'Lines covered' && !complete[qi] ? WARN[1] : INK }, fill: isWin ? GOOD[0] : isTotal ? LIGHT : undefined });
        totalRefs[qi][label] = address;
      });
      if (isTotal) for (let c = 1; c <= lastCompCol; c++) comparison.getCell(r, c).border = { top: { style: 'thin', color: { argb: 'FF' + INK } }, bottom: { style: 'double', color: { argb: 'FF' + INK } } };
    });
    comparison.getRow(totalsStart + 4).height = 22;
    [6, 40, 14, 9, 8, ...(hasBaseline ? [13, 14] : [])].forEach((w, i) => { comparison.getColumn(i + 1).width = w; });
    quotes.forEach((_, qi) => { comparison.getColumn(supplierCol(qi)).width = 13; comparison.getColumn(supplierCol(qi) + 1).width = 16; });
    [12, 20, 12, 14].forEach((w, i) => { comparison.getColumn(resultCol + i).width = w; });
    comparison.views = [{ state: 'frozen', xSplit: 2, ySplit: compHeader, showGridLines: false }];
    if (rows.length) comparison.autoFilter = { from: { row: compHeader, column: 1 }, to: { row: lastItemRow, column: lastCompCol } };
    pageSetup(comparison, true, `${compHeader - 2}:${compHeader}`);

    /* ---------- One sheet per supplier quote ---------- */
    quotes.forEach((q, qi) => {
      const name = quoteSheets[qi];
      const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: 'FF' + (qi === winner ? GOOD[1] : BRAND) } } });
      const cols = ['#', 'Code', 'Description', 'Qty', 'Unit', 'Unit price', 'Line total', 'Inc GST total', 'Source', 'Price check'];
      banner(ws, cols.length, q.name, `Supplier quote ${qi + 1} of ${quotes.length} · ${q.source_file || 'Entered manually'}`, brandLogo);
      const [status, statusColours] = expiryStatus(q.expiry_date, today);
      const verified = q.items.filter(e => e.price_verified).length;
      const left = [
        ['Supplier', q.name],
        ['Quote number', q.quote_number || 'Not stated'],
        ['Quote date', parseDate(q.quote_date) || q.quote_date || 'Not stated'],
        ['Expiry date', parseDate(q.expiry_date) || q.expiry_date || 'Not stated'],
        ['Quote status', status],
        ['Price basis', q.price_basis && q.price_basis !== 'unspecified' ? q.price_basis : 'Not stated'],
        ['Source file', q.source_file || 'Entered manually'],
      ];
      const lineCost = cents(q.items.reduce((s, e) => s + (num(e.total) ?? 0), 0));
      const firstLine = 15, lastLine = firstLine + q.items.length - 1;
      const right = [
        ['Line items', q.items.length],
        ['Prices verified', `${verified} of ${q.items.length}`],
        ['Product lines', q.items.length ? { formula: `SUM(G${firstLine}:G${lastLine})`, result: lineCost } : 0],
        ['Freight', num(q.freight) ?? 0],
        ['Tax / GST', num(q.tax) ?? 0],
        ['Less discount', num(q.discount) ?? 0],
        ['Quote total', { formula: 'H6+H7+H8-H9', result: cents(lineCost + (num(q.freight) ?? 0) + (num(q.tax) ?? 0) - (num(q.discount) ?? 0)) }],
        ['Document total', num(q.quoted_total)],
      ];
      sectionTitle(ws, 3, 'Quote details', cols.length);
      left.forEach(([label, value], i) => {
        const r = 4 + i;
        ws.mergeCells(r, 1, r, 2);
        setCell(ws, `A${r}`, label, { font: { color: GREY }, indent: 1 });
        const cell = setCell(ws, `C${r}`, value, { font: { bold: true }, numFmt: value instanceof Date ? DATE : undefined, align: 'left' });
        if (label === 'Quote status' && statusColours) { cell.font = font({ bold: true, color: statusColours[1] }); }
        if (label === 'Expiry date' && status === 'Expired') cell.font = font({ bold: true, color: BAD[1] });
        [1, 2, 3].forEach(c => { ws.getCell(r, c).border = { bottom: edge }; });
      });
      right.forEach(([label, value], i) => {
        const r = 4 + i, money = i >= 2, total = label === 'Quote total';
        ws.mergeCells(r, 5, r, 7);
        setCell(ws, `E${r}`, label, { font: { color: total ? INK : GREY, bold: total }, indent: 1, fill: total ? LIGHT : undefined });
        setCell(ws, `H${r}`, value ?? 'Not stated', { font: { bold: true }, numFmt: money ? MONEY : undefined, align: 'right', fill: total ? LIGHT : undefined });
        [5, 6, 7, 8].forEach(c => { ws.getCell(r, c).border = { bottom: edge }; });
      });
      if (num(q.quoted_total) != null) {
        const r = 4 + right.length;
        ws.mergeCells(r, 5, r, 7);
        setCell(ws, `E${r}`, 'Difference to document', { font: { color: GREY }, indent: 1 });
        setCell(ws, `H${r}`, { formula: 'H10-H11', result: cents(lineCost + (num(q.freight) ?? 0) + (num(q.tax) ?? 0) - (num(q.discount) ?? 0) - num(q.quoted_total)) }, { numFmt: MONEY, align: 'right', font: { bold: true } });
      }
      sectionTitle(ws, 13, 'Quoted product lines', cols.length);
      headerRow(ws, 14, cols);
      q.items.forEach((e, i) => {
        const r = firstLine + i;
        setCell(ws, `A${r}`, i + 1, { font: { color: GREY }, align: 'center' });
        setCell(ws, `B${r}`, e.code || '—', { font: { bold: !!e.code } });
        setCell(ws, `C${r}`, e.full_description || e.description, { wrap: true });
        setCell(ws, `D${r}`, num(e.qty), { numFmt: QTY, align: 'center' });
        setCell(ws, `E${r}`, e.unit || 'ea', { align: 'center' });
        setCell(ws, `F${r}`, num(e.unit_price), { numFmt: MONEY });
        setCell(ws, `G${r}`, num(e.total), { numFmt: MONEY, font: { bold: true } });
        setCell(ws, `H${r}`, num(e.inc_gst_total), { numFmt: MONEY, font: { color: GREY } });
        setCell(ws, `I${r}`, e.source || '', { font: { color: GREY, size: 9 }, wrap: true });
        badge(ws.getCell(`J${r}`), e.price_verified ? 'Verified' : e.price_warning ? 'Total differs' : 'Not checked', e.price_verified ? GOOD : e.price_warning ? WARN : null);
        if (i % 2) for (let c = 1; c <= 9; c++) ws.getCell(r, c).fill = fill('FAFAFA');
        ws.getRow(r).height = Math.max(20, Math.ceil(text(e.full_description || e.description).length / 55) * 14);
      });
      if (!q.items.length) {
        ws.mergeCells(firstLine, 1, firstLine, cols.length);
        setCell(ws, `A${firstLine}`, 'No priced lines were extracted from this quote.', { font: { italic: true, color: GREY }, align: 'center' });
      }
      bodyBorders(ws, firstLine, Math.max(firstLine, lastLine), cols.length);
      if (q.items.length) {
        const r = lastLine + 1;
        ws.mergeCells(r, 1, r, 6);
        setCell(ws, `A${r}`, 'Product lines total', { font: { bold: true }, align: 'right' });
        setCell(ws, `G${r}`, { formula: `SUM(G${firstLine}:G${lastLine})`, result: lineCost }, { numFmt: MONEY, font: { bold: true } });
        for (let c = 1; c <= cols.length; c++) ws.getCell(r, c).border = { top: { style: 'thin', color: { argb: 'FF' + INK } }, bottom: { style: 'double', color: { argb: 'FF' + INK } } };
      }
      [6, 16, 58, 8, 7, 13, 14, 14, 18, 13].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.views = [{ state: 'frozen', ySplit: 14, showGridLines: false }];
      pageSetup(ws, true, '14:14');
    });

    /* ---------- Summary ---------- */
    const sumCols = ['Rank', 'Supplier', 'Quote no.', 'Quote date', 'Expiry', 'Status', 'Price basis', 'Lines covered', 'Product lines', 'Freight', 'Tax / GST', 'Discount', 'Total evaluated', 'Document total', 'Above lowest'];
    banner(summary, sumCols.length, `${projectName} · Quote comparison summary`, `Exported ${stamp} from QuoteLine · ${quotes.length} quote${quotes.length === 1 ? '' : 's'} · ${rows.length} item${rows.length === 1 ? '' : 's'} compared`, brandLogo);
    const tiles = [
      ['Quotes received', quotes.length, null],
      ['Items compared', rows.length, null],
      ['Lowest complete quote', winner >= 0 ? lowest : 'None complete', winner >= 0 ? quotes[winner].name : 'No quote covers every item'],
      ['Lines needing review', reviewCount, reviewCount ? 'Missing, differing or uncertain lines' : 'All lines matched'],
    ];
    const tileSpans = [[1, 3], [4, 7], [8, 11], [12, 15]];
    tiles.forEach(([label, value, foot], i) => {
      const [a, b] = tileSpans[i];
      [4, 5, 6].forEach(r => summary.mergeCells(r, a, r, b));
      const accent = i === 2 && winner >= 0 ? GOOD : i === 3 && reviewCount ? WARN : null;
      setCell(summary, summary.getCell(4, a).address, label.toUpperCase(), { font: { size: 8, bold: true, color: GREY }, indent: 1, fill: accent ? accent[0] : LIGHT });
      setCell(summary, summary.getCell(5, a).address, value, { font: { size: 20, bold: true, color: accent ? accent[1] : INK }, indent: 1, numFmt: typeof value === 'number' && i === 2 ? MONEY : undefined, align: 'left', fill: accent ? accent[0] : LIGHT });
      setCell(summary, summary.getCell(6, a).address, foot || '', { font: { size: 9, color: GREY }, indent: 1, fill: accent ? accent[0] : LIGHT });
    });
    summary.getRow(4).height = 20; summary.getRow(5).height = 32; summary.getRow(6).height = 18;
    sectionTitle(summary, 8, 'Supplier overview', sumCols.length);
    headerRow(summary, 9, sumCols);
    quotes.forEach((q, qi) => {
      const r = 10 + qi, total = totalRefs[qi];
      const [status, colours] = expiryStatus(q.expiry_date, today);
      const isWin = qi === winner;
      const base = isWin ? { fill: GOOD[0] } : {};
      setCell(summary, `A${r}`, ranks[qi] ?? '—', { ...base, align: 'center', font: { bold: true, color: isWin ? GOOD[1] : INK } });
      const nameCell = setCell(summary, `B${r}`, q.name, { ...base, font: { bold: true, color: isWin ? GOOD[1] : INK } });
      nameCell.value = { text: q.name, hyperlink: `#${ref(quoteSheets[qi], 'A1')}`, tooltip: `Open the ${q.name} quote tab` };
      nameCell.font = font({ bold: true, underline: true, color: isWin ? GOOD[1] : BRAND_STRONG });
      setCell(summary, `C${r}`, q.quote_number || '—', base);
      setCell(summary, `D${r}`, parseDate(q.quote_date) || q.quote_date || '—', { ...base, numFmt: DATE, align: 'center' });
      setCell(summary, `E${r}`, parseDate(q.expiry_date) || q.expiry_date || '—', { ...base, numFmt: DATE, align: 'center' });
      badge(summary.getCell(`F${r}`), status, colours);
      setCell(summary, `G${r}`, q.price_basis && q.price_basis !== 'unspecified' ? q.price_basis : '—', { ...base, align: 'center' });
      badge(summary.getCell(`H${r}`), `${report.covered[qi]} of ${report.row_count}`, complete[qi] ? GOOD : WARN);
      const link = (label, result) => ({ formula: ref('Comparison', total[label]), result });
      setCell(summary, `I${r}`, link('Product lines', report.totals[qi]), { ...base, numFmt: MONEY });
      setCell(summary, `J${r}`, link('Freight', num(q.freight) ?? 0), { ...base, numFmt: MONEY });
      setCell(summary, `K${r}`, link('Tax / GST', num(q.tax) ?? 0), { ...base, numFmt: MONEY });
      setCell(summary, `L${r}`, link('Less discount', num(q.discount) ?? 0), { ...base, numFmt: MONEY });
      setCell(summary, `M${r}`, { formula: `I${r}+J${r}+K${r}-L${r}`, result: landed[qi] }, { ...base, numFmt: MONEY, font: { bold: true, color: isWin ? GOOD[1] : INK } });
      setCell(summary, `N${r}`, num(q.quoted_total), { ...base, numFmt: MONEY, font: { color: GREY } });
      setCell(summary, `O${r}`, complete[qi] && lowest != null ? cents(landed[qi] - lowest) : 'Incomplete',
        { ...base, numFmt: MONEY, align: complete[qi] ? undefined : 'center', font: { color: complete[qi] ? INK : WARN[1], italic: !complete[qi] } });
      summary.getRow(r).height = 22;
    });
    bodyBorders(summary, 10, Math.max(10, 9 + quotes.length), sumCols.length);
    const notesRow = 12 + quotes.length;
    sectionTitle(summary, notesRow, 'How to read this workbook', sumCols.length);
    [
      winner >= 0 ? `${quotes[winner].name} is the lowest complete quote at ${new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(lowest)}.` : 'No quote prices every item yet, so no lowest complete quote is selected.',
      'Comparison compares unit prices at the required quantity. The lowest price on each line is highlighted green; "Not quoted" lines are excluded from that supplier\'s total.',
      'Each supplier has its own tab with the quote details and every product line extracted from the source, including codes and the price-check status.',
      'Totals are live formulas: change a unit price, quantity, freight, tax or discount and the totals update. Ranks, lowest supplier and status reflect prices at export.',
      'Confirm scope, inclusions, tax and freight against each original quote before awarding work.',
    ].forEach((line, i) => {
      const r = notesRow + 1 + i;
      summary.mergeCells(r, 1, r, sumCols.length);
      setCell(summary, `A${r}`, `•  ${line}`, { font: { color: i ? GREY : INK, bold: !i }, wrap: true, indent: 1 });
      summary.getRow(r).height = 18;
    });
    [7, 26, 13, 13, 13, 12, 11, 13, 14, 12, 12, 12, 15, 15, 14].forEach((w, i) => { summary.getColumn(i + 1).width = w; });
    summary.views = [{ showGridLines: false }];
    pageSetup(summary, true);

    return wb.xlsx.writeBuffer();
  }

  return { build };
});
