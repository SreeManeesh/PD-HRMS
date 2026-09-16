const fs = require("fs");
const path = require("path");
const report = JSON.parse(fs.readFileSync(path.join(__dirname, "eslint-report.json"), "utf8"));
const hit = report.find((f) => f.filePath.endsWith(path.join("Leave", "Leave.jsx")));
if (!hit) {
  console.log("Leave.jsx not present in eslint-report.json");
  process.exit(1);
}
console.log("messages:", JSON.stringify(hit.messages.map((m) => ({ line: m.line, col: m.column, rule: m.ruleId, msg: m.message.split("\n")[0].slice(0, 90) })), null, 1));
fs.writeFileSync(path.join(__dirname, "_report_leave.jsx.txt"), hit.source, "utf8");
console.log("source lines:", hit.source.split("\n").length);
