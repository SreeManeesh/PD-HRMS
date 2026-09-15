/* Run ESLint across the frontend and print a fresh grouped breakdown. */
const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");

(async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(["."]);
  fs.writeFileSync(path.join(__dirname, "_eslint_fresh.json"), JSON.stringify(results), "utf8");

  const byRule = {};
  const byFile = {};
  let errors = 0;
  let warnings = 0;
  for (const r of results) {
    if (!r.messages.length) continue;
    const rel = path.relative(__dirname, r.filePath).replace(/\\/g, "/");
    byFile[rel] = [];
    for (const m of r.messages) {
      if (m.severity === 2) errors += 1;
      else warnings += 1;
      byRule[m.ruleId || "(parse)"] = (byRule[m.ruleId || "(parse)"] || 0) + 1;
      byFile[rel].push(`${m.line}:${m.column}${m.severity === 2 ? "E" : "W"} ${m.ruleId} :: ${m.message.split("\n")[0]}`);
    }
  }
  console.log(`TOTAL ${errors + warnings} (errors ${errors}, warnings ${warnings})`);
  console.log("\n== BY RULE ==");
  Object.entries(byRule).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v} ${k}`));
  console.log("\n== BY FILE ==");
  Object.entries(byFile).sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => {
    console.log(`  ${v.length} ${k}`);
    console.log(`      ${v.join("\n      ")}`);
  });
})().catch((e) => {
  console.log("FAILED:", e && e.stack ? e.stack : String(e));
  process.exitCode = 1;
});
