const fs = require("fs");
const report = JSON.parse(fs.readFileSync("eslint-report.json", "utf8"));
const lines = [];
let total = 0;
for (const f of report) {
  const msgs = f.messages.filter((m) => m.ruleId === "no-undef");
  if (!msgs.length) continue;
  lines.push("FILE: " + f.filePath);
  for (const m of msgs) {
    total++;
    lines.push(`  L${m.line}:${m.column} '${m.message}'`);
  }
}
lines.unshift("TOTAL no-undef ERRORS: " + total);
fs.writeFileSync("eslint-undef.txt", lines.join("\n"), "utf8");
console.log("TOTAL no-undef ERRORS: " + total);