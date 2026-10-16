# QuoteLine

A local web dashboard for comparing supplier and subcontractor quotes. Import XLSX, CSV, text PDF, DOCX, or TXT files, review the extracted rows, compare unit prices at one required quantity, add tax/freight/discounts, and export an XLSX workbook.

The sidebar has three separate pages: **Overview** for the import and summary, **Quotes** for a standardized table of every supplier's source lines and quote details, and **Comparison** for a horizontal supplier-by-supplier matrix with matched descriptions, quantities, unit prices, and evaluated totals. Uploaded PDFs have a **View original PDF** button on the Quotes and Comparison pages, opening the source beside editable extracted rows. You can change descriptions, codes, quantities, units, unit prices and line totals, or add and remove lines. These changes update the comparison and exported workbook; the PDF and its quoted total remain the original reference.

For a download that runs directly in a browser without installing Python, download `QuoteLine-Standalone.html` from this repository and open it in your browser. Its spreadsheet, PDF and Word parsing libraries are bundled in the file, so it works offline.

After editing the web UI or standalone parser, rebuild the single file with `.venv/bin/python scripts/build_standalone.py`. The script downloads pinned library versions over HTTPS and checks their SHA-256 digests before embedding them.

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

The comparison workbook has a financial summary, comparison matrix, and source lines. An incomplete quote's subtotal excludes missing lines and is never selected as the lowest complete quote. Files are processed in memory and are not uploaded to an external AI service. The page's working state lasts only for the current tab session; export the spreadsheet to keep it.

## Test

```bash
.venv/bin/python -m unittest discover -s tests -v
```
