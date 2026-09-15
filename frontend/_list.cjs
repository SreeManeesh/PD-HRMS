/* Dump a fix-ready list of issues with the exact source line for each. */
const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");

const RULE_FILTER = process.argv[2] || null;

(async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(["."]);
  let n = 0;
  for (const r of results) {
    const relevant = r.messages.filter((m) => !RULE_FILTER || (m.ruleId || "").includes(RULE_FILTER));
    if (!relevant.length) continue;
    const rel = path.relative(__dirname, r.filePath).replace(/\\/g, "/");
    const lines = fs.readFileSync(r.filePath, "utf8").split(/\r?\n/);
    console.log(`\n### ${rel}`);
    for (const m of relevant) {
      n += 1;
      console.log(`  L${m.line}:${m.column} ${m.ruleId} :: ${m.message.split("\n")[0]}`);
      console.log(`      | ${(lines[m.line - 1] || "").trim()}`);
    }
  }
  console.log(`\nCOUNT ${n}`);
})().catch((e) => {
  console.log("FAILED:", e && e.stack ? e.stack : String(e));
  process.exitCode = 1;
});