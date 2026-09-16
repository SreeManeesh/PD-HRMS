const fs = require("fs");
const path = require("path");
const file = process.argv[2] || "_leave_lint.json";
const buf = fs.readFileSync(path.join(__dirname, file));
let raw = buf.includes(0) ? buf.toString("utf16le") : buf.toString("utf8");
raw = raw.replace(/^\uFEFF/, "");
const start = raw.indexOf("[");
const report = JSON.parse(raw.slice(start));
let total = 0;
for (const f of report) {
  console.log("FILE:", f.filePath);
  for (const m of f.messages) {
    total += 1;
    console.log(`  L${m.line}:${m.column} [${m.ruleId}] ${m.message.split("\n")[0]}`);
  }
}
console.log("TOTAL:", total);