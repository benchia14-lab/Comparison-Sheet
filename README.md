# QuoteLine

A local web dashboard for comparing supplier and subcontractor quotes. Import XLSX, CSV, text PDF, DOCX, or TXT files, review the extracted rows, compare unit prices at one required quantity, add tax/freight/discounts, and export an XLSX workbook.

The sidebar has three separate pages: **Overview** for the import and summary, **Quotes** for a standardized table of every supplier's source lines and quote details, and **Comparison** for a horizontal supplier-by-supplier matrix with matched descriptions, quantities, unit prices, and evaluated totals. Uploaded PDFs have a **View original PDF** button on the Quotes and Comparison pages, opening the source beside editable extracted rows. You can change descriptions, codes, quantities, units, unit prices and line totals, or add and remove lines. These changes update the comparison and exported workbook; the PDF and its quoted total remain the original reference. Use **Verify price** on an extracted line after checking it against the source. The verification status appears in Quotes, Comparison and the exported workbook; editing the line clears the check.

For a download that runs directly in a browser without installing Python, download `QuoteLine-Standalone.html` from this repository and open it in your browser. Its spreadsheet, PDF and Word parsing libraries are bundled in the file, so it works offline.

`QuoteLine.html` is the same app as a standard, small (about 80 KB) HTML file. It loads the pinned spreadsheet, PDF and Word libraries from the jsDelivr CDN with integrity checks, so it needs an internet connection when it opens; your quote files are still processed only in the browser.

After editing the web UI or standalone parser, rebuild both files with `.venv/bin/python scripts/build_standalone.py`. The script downloads pinned library versions over HTTPS and checks their SHA-256 digests before embedding them.

## Netlify

`netlify.toml` publishes `QuoteLine.html` as the site's home page (and the offline file at `/QuoteLine-Standalone.html`). Netlify serves static files only, so the hosted site is the browser version; `app.py` is for running locally. Netlify deploys the production branch, so changes appear on the live site once they are merged into `main`.

## Run

```bash
cd /workspace/Comparison-Sheet
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Open `http://127.0.0.1:8000` in the browser on the same machine. Upload one or more quotes. The supplied master workbook is recognised as a baseline: its **Supplier Comparison Sheet** supplies item descriptions, quantities and tender unit prices. The **Orders To Date**, **Procurement Schedule**, initial order and release tabs reference that sheet, so they are not imported as separate supplier quotes.

Spreadsheet quote tables should have a header such as `Description`, `Qty`, `Unit Price`, `Total` (or common equivalents). Text PDFs need selectable text with line items in columns. Scanned image PDFs require OCR before import. Every imported price should be checked against its source; uncertain matches, quantity changes, missing items and inconsistent line totals are flagged. Use **Match item** to join unmatched rows, or edit prices and required quantities directly. Enter freight, tax and discounts in the financial summary. Those fields default to zero because quote terms vary.

The Benton's and Reece PDF layouts in the included example are parsed with their own column rules. Their unit prices are compared **ex GST**; GST, the Reece delivery fee and each document total are read separately. Unknown PDF layouts are accepted only when a line's parsed quantity, unit price and total reconcile, so an unfamiliar layout may need manual rows rather than a misleading total.

**Export comparison** downloads a formatted workbook named after the project:

- **Summary**: headline figures, then one row per supplier with quote number, quote date, expiry (flagged when expired), price basis, coverage, product lines, freight, tax, discount, evaluated total, document total and the gap to the lowest complete quote.
- **Comparison**: a side-by-side price comparison with each supplier's unit price and total at the required quantity, the lowest price per line highlighted, and totals underneath.
- **One tab per quote**: the supplier's quote details and every extracted product line, including codes, full descriptions, inc-GST totals, the source line and the price-check status.

Totals are spreadsheet formulas, so they update if prices are edited in Excel. The workbook is built in the browser with ExcelJS by `static/export-workbook.js`, which all three versions of the app share. An incomplete quote's subtotal excludes missing lines and is never selected as the lowest complete quote. Files are processed in memory and are not uploaded to an external AI service. The page's working state lasts only for the current tab session; export the spreadsheet to keep it.

## Test

```bash
.venv/bin/python -m unittest discover -s tests -v
```
