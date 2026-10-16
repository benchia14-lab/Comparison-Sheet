import io
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import pymupdf as fitz
import openpyxl

from app import build_groups, compare, parse_file, parse_pdf_text

HERE = Path(__file__).resolve().parent


def export_workbook(project, quotes, report, generated_at='2026-10-16T09:00:00'):
    """Build the browser export with Node and return it opened with cached formula results."""
    payload = json.dumps({'project': project, 'quotes': quotes, 'report': report, 'generatedAt': generated_at})
    with tempfile.TemporaryDirectory() as folder:
        out = Path(folder) / 'export.xlsx'
        subprocess.run(['node', str(HERE / 'export_workbook.js'), str(out)], input=payload.encode(), check=True)
        data = out.read_bytes()
    return openpyxl.load_workbook(io.BytesIO(data), data_only=True), openpyxl.load_workbook(io.BytesIO(data))


class WorkflowTests(unittest.TestCase):
    def test_csv_matching_and_financials(self):
        a = b'Code,Description,Qty,Unit Price,Total\nSIN01,Caroma handwash basin,2,220,440\nTAP01,Urbane mixer,1,100,100\n'
        b = b'SKU,Item Description,Quantity,Unit Rate,Amount\nSIN01,Handwash basin Caroma,2,200,400\nTAP01,Mixer Urbane,1,120,120\n'
        items_a, _ = parse_file('a.csv', a)
        items_b, _ = parse_file('b.csv', b)
        items_a[0]['price_verified'] = True
        items_a[0]['price_verified_at'] = '2026-10-16T12:00:00.000Z'
        quotes = [{'name': 'A', 'items': items_a, 'freight': 30, 'tax': 20},
                  {'name': 'B', 'items': items_b, 'freight': 5, 'discount': 10}]
        groups = build_groups(quotes, [])
        report = compare(quotes, groups)
        self.assertEqual(len(groups), 2)
        self.assertEqual(report['totals'], [540, 520])
        self.assertEqual(report['landed'], [590, 515])
        self.assertEqual(report['complete'], [True, True])

    @unittest.skipUnless(shutil.which('node'), 'Node.js is needed to run the browser workbook export')
    def test_export_workbook_layout(self):
        a = b'Code,Description,Qty,Unit Price,Total\nSIN01,Caroma handwash basin,2,220,440\nTAP01,Urbane mixer,1,100,100\n'
        b = b'SKU,Item Description,Quantity,Unit Rate,Amount\nSIN01,Handwash basin Caroma,2,200,400\nTAP01,Mixer Urbane,1,120,120\n'
        items_a, _ = parse_file('a.csv', a)
        items_b, _ = parse_file('b.csv', b)
        items_a[0]['price_verified'] = True
        quotes = [{'name': 'A', 'items': items_a, 'freight': 30, 'tax': 20, 'quote_number': '1001',
                   'quote_date': '01/10/2026', 'expiry_date': '31/10/2026', 'price_basis': 'ex GST', 'source_file': 'a.csv'},
                  {'name': 'B: Plumbing/Supply', 'items': items_b, 'freight': 5, 'discount': 10,
                   'expiry_date': '01/10/2026', 'quoted_total': 515}]
        report = compare(quotes, build_groups(quotes, []))
        values, formulas = export_workbook('Test project', quotes, report)
        self.assertEqual(values.sheetnames, ['Summary', 'Comparison', 'A', 'B Plumbing Supply'])
        summary = values['Summary']
        self.assertEqual([c.value for c in summary[9]][:3], ['Rank', 'Supplier', 'Quote no.'])
        self.assertEqual(summary['B10'].value, 'A')
        self.assertEqual(summary['C10'].value, '1001')
        self.assertEqual(summary['D10'].value.date().isoformat(), '2026-10-01')
        self.assertEqual(summary['F10'].value, 'Valid')
        self.assertEqual(summary['F11'].value, 'Expired')
        self.assertEqual((summary['A11'].value, summary['M11'].value, summary['O11'].value), (1, 515, 0))
        self.assertEqual((summary['A10'].value, summary['M10'].value, summary['O10'].value), (2, 590, 75))
        self.assertEqual(summary['H5'].value, 515)  # lowest complete quote tile
        self.assertEqual(formulas['Summary']['M10'].value, '=I10+J10+K10-L10')
        comparison = values['Comparison']
        self.assertEqual([c.value for c in comparison[6]][:9],
                         ['#', 'Description', 'Code', 'Req. qty', 'Unit', 'Unit price', 'Total at req. qty', 'Unit price', 'Total at req. qty'])
        self.assertEqual((comparison['B7'].value, comparison['F7'].value, comparison['G7'].value, comparison['H7'].value), ('Caroma handwash basin', 220, 440, 200))
        self.assertEqual(comparison['K7'].value, 'B: Plumbing/Supply')
        self.assertEqual(formulas['Comparison']['G7'].value, '=D7*F7')
        self.assertEqual(comparison['F7'].comment.text, 'Price verified against the source quote')
        quote = values['A']
        self.assertEqual((quote['C4'].value, quote['C5'].value, quote['C9'].value, quote['C10'].value), ('A', '1001', 'ex GST', 'a.csv'))
        self.assertEqual([c.value for c in quote[14]][:4], ['#', 'Code', 'Description', 'Qty'])
        self.assertEqual((quote['B15'].value, quote['F15'].value, quote['G15'].value, quote['J15'].value), ('SIN01', 220, 440, 'Verified'))
        self.assertEqual(quote['J16'].value, 'Not checked')
        self.assertEqual(quote['H10'].value, 590)
        self.assertEqual(values['B Plumbing Supply']['H12'].value, 0)  # matches the document total

    def test_real_quote_layouts_match_and_reconcile(self):
        benton = '''BENTONS DERRIMUT
Product No. Description UOM Qty Price Ex GST Price Inc GST Total Inc GST
BB0161683456      OLIVERI APOLLO MEGA BOWL            EA        1      1,003.64      1,104.00        1,104.00
                  SINK STAINLESS STEEL
                  AP1491
$1104.00
BB0161683459       BILLI OMNIONE PLUS 9 W/               EA        1      7,067.38      7,774.12        7,774.12
                  XL LEVERED DISPENSER & GOOSENECK MIXER CHROME
$7774.12
GST                        $807.10
GST Inc Total              $8,878.12'''
        reece = '''Reece Australia Pty Ltd
Line Product Description Qty Price Unit Net Price GST Total price
2      101 4009662 - Apollo Mega Bowl Sink                             1.00     1004.00 EA         1004.00      100.40     1104.40
4      101 926065lgch Billi Omnione Plus 9 With Xl                       1.00     6922.00 EA         6922.00      692.20     7614.20
                Levered Dispenser & Gooseneck Mixer Chrome
                      *********************************
50 Each Delivery Fee - Ground Floor Only                        1.00         1.00 EA             1.00         0.10         1.10
Document Total     7,927.00      792.70     8,719.70'''
        a, ma = parse_pdf_text(benton)
        b, mb = parse_pdf_text(reece)
        self.assertEqual((len(a), len(b)), (2, 2))
        self.assertIn('SINK STAINLESS STEEL AP1491', a[0]['full_description'])
        self.assertIn('Levered Dispenser', b[1]['full_description'])
        quotes = [{'name': ma['name'], 'items': a, **ma}, {'name': mb['name'], 'items': b, **mb}]
        report = compare(quotes, build_groups(quotes, []))
        self.assertEqual(report['row_count'], 2)
        self.assertEqual(report['complete'], [True, True])
        self.assertEqual(report['rows'][0]['winners'], ["Benton's"])
        self.assertEqual(report['rows'][1]['winners'], ['Reece'])
        self.assertEqual(report['totals'], [8071.02, 7926.0])
        self.assertEqual(report['landed'], [8878.12, 8719.7])

    def test_missing_line_is_not_complete(self):
        quotes = [{'name': 'A', 'items': [{'description': 'Pump 1234', 'code': 'P1234', 'qty': 1, 'unit': 'ea', 'unit_price': 10}]},
                  {'name': 'B', 'items': [{'description': 'Other 3456', 'code': 'X3456', 'qty': 1, 'unit': 'ea', 'unit_price': 5}]}]
        report = compare(quotes, build_groups(quotes, []))
        self.assertEqual(report['covered'], [1, 1])
        self.assertEqual(report['complete'], [False, False])

    def test_edited_line_total_reconciles_with_comparison(self):
        # A manually entered line total can imply a unit rate with more than two decimals.
        quotes = [{'name': 'Edited supplier', 'items': [{'description': 'Custom bracket', 'code': 'BR1',
                   'qty': 3, 'unit': 'ea', 'unit_price': 33.333333, 'total': 100,
                   'source': 'Manual addition'}]}]
        groups = build_groups(quotes, [])
        report = compare(quotes, groups)
        self.assertEqual(report['totals'], [100])

    def test_pdf_line_extraction(self):
        pdf = fitz.open()
        page = pdf.new_page()
        for y, columns in [(40, ['Description', 'Qty', 'Unit price', 'Total']),
                           (60, ['SIN01 Caroma basin', '2', '$123.00', '$246.00'])]:
            for x, text in zip([40, 320, 390, 480], columns):
                page.insert_text((x, y), text)
        items, kind = parse_file('quote.pdf', pdf.tobytes())
        self.assertEqual(kind, 'quote')
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['unit_price'], 123)
        self.assertEqual(items[0]['qty'], 2)


if __name__ == '__main__':
    unittest.main()
