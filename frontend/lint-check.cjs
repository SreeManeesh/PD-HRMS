/* Runs ESLint in-process and writes a flat report to lint-check.txt.
   Avoids shell-redirection / output-capture issues. */
const { ESLint } = require("eslint");
const fs = require("fs");

(async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(["src"]);

  // Keep the repo's existing summary tooling (eslint-summary.cjs) fed with fresh data.
  fs.writeFileSync("eslint-report.json", JSON.stringify(results, null, 2), "utf8");

  const lines = [];
  let total = 0;
  let undef = 0;

  for (const r of results) {
    if (!r.messages.length) continue;
    lines.push("FILE: " + r.filePath);
    for (const m of r.messages) {
      total++;
      if (m.ruleId === "no-undef") undef++;
      lines.push(`  L${m.line}:${m.column} [${m.ruleId}] ${m.message}`);
    }
  }

  lines.unshift(`TOTAL PROBLEMS: ${total} | no-undef: ${undef} | files scanned: ${results.length}`);
  fs.writeFileSync("lint-check.txt", lines.join("\n"), "utf8");
  console.log("lint-check.txt written");
})().catch((e) => {
  fs.writeFileSync("lint-check.txt", "ESLINT RUN FAILED: " + (e && e.stack ? e.stack : String(e)), "utf8");
  console.log("failed");
});