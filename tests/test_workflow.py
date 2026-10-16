import io
import unittest

import pymupdf as fitz
import openpyxl

from app import app, build_groups, compare, parse_file, parse_pdf_text


class WorkflowTests(unittest.TestCase):
    def test_csv_matching_financials_and_export(self):
        a = b'Code,Description,Qty,Unit Price,Total\nSIN01,Caroma handwash basin,2,220,440\nTAP01,Urbane mixer,1,100,100\n'
        b = b'SKU,Item Description,Quantity,Unit Rate,Amount\nSIN01,Handwash basin Caroma,2,200,400\nTAP01,Mixer Urbane,1,120,120\n'
        items_a, _ = parse_file('a.csv', a)
        items_b, _ = parse_file('b.csv', b)
        quotes = [{'name': 'A', 'items': items_a, 'freight': 30, 'tax': 20},
                  {'name': 'B', 'items': items_b, 'freight': 5, 'discount': 10}]
        groups = build_groups(quotes, [])
        report = compare(quotes, groups)
        self.assertEqual(len(groups), 2)
        self.assertEqual(report['totals'], [540, 520])
        self.assertEqual(report['landed'], [590, 515])
        self.assertEqual(report['complete'], [True, True])
        with app.test_client() as client:
            response = client.post('/api/export', json={'project': 'Test', 'quotes': quotes, 'groups': groups})
        self.assertEqual(response.status_code, 200)
        book = openpyxl.load_workbook(io.BytesIO(response.data), data_only=True)
        self.assertEqual(book.sheetnames, ['Financial summary', 'Comparison', 'Source lines'])
        self.assertEqual(book['Financial summary']['I5'].value, 515)

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
