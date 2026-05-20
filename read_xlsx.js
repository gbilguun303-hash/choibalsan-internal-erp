const XLSX = require('./node_modules/xlsx');
const wb = XLSX.readFile(process.argv[1]);
console.log('Sheets:', JSON.stringify(wb.SheetNames));
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  console.log('SHEET:' + name + ':ROWS:' + data.length);
  data.slice(0, 20).forEach((row, i) => console.log('R' + i + ':' + JSON.stringify(row)));
});
