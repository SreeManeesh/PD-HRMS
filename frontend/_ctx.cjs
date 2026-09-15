/* Print context around every ESLint issue so fixes can be applied accurately. */
const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");

const RULE_FILTER = process.argv[2] || null; // e.g. "react-hooks"
const CONTEXT = Number(process.argv[3] || 8);

(async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(["."]);
  for (const r of results) {
    const relevant = r.messages.filter((m) => !RULE_FILTER || (m.ruleId || "").includes(RULE_FILTER));
    if (!relevant.length) continue;
    const rel = path.relative(__dirname, r.filePath).replace(/\\/g, "/");
    const lines = fs.readFileSync(r.filePath, "utf8").split(/\r?\n/);
    console.log(`\n########## ${rel} (${relevant.length}) ##########`);
    for (const m of relevant) {
      const start = Math.max(1, m.line - CONTEXT);
      const end = Math.min(lines.length, m.line + (m.endLine ? m.endLine - m.line : 0) + CONTEXT);
      console.log(`\n--- L${m.line}:${m.column} [${m.severity === 2 ? "E" : "W"}] ${m.ruleId} :: ${m.message.split("\n")[0]}`);
      for (let i = start; i <= end; i += 1) {
        console.log(`${i === m.line ? ">>" : "  "}${String(i).padStart(5)} | ${lines[i - 1]}`);
      }
    }
  }
})().catch((e) => {
  console.log("FAILED:", e && e.stack ? e.stack : String(e));
  process.exitCode = 1;
});