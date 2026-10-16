// Test helper: builds the export workbook in Node. Usage: node export_workbook.js out.xlsx < data.json
const fs = require('fs');
const path = require('path');
const ExcelJS = require(path.join(__dirname, '../static/vendor/exceljs.min.js'));
const build = require(path.join(__dirname, '../static/export-workbook.js'))(ExcelJS).build;
const data = JSON.parse(fs.readFileSync(0, 'utf8'));
build({ ...data, generatedAt: new Date(data.generatedAt) })
  .then(buffer => fs.writeFileSync(process.argv[2], Buffer.from(buffer)))
  .catch(err => { console.error(err); process.exit(1); });
