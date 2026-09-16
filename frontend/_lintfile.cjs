/* Lint one file (or several) via the ESLint API and print a short report. */
const { ESLint } = require("eslint");

(async () => {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(process.argv.slice(2));
  let total = 0;
  for (const r of results) {
    if (!r.messages.length) continue;
    console.log("FILE:", r.filePath.replace(process.cwd() + "\\", ""));
    for (const m of r.messages) {
      total += 1;
      console.log(`  L${m.line}:${m.column} [${m.severity === 2 ? "E" : "W"}] ${m.ruleId} :: ${m.message.split("\n")[0]}`);
    }
  }
  console.log("TOTAL:", total);
})().catch((e) => {
  console.log("LINT RUN FAILED:", e && e.stack ? e.stack : String(e));
  process.exitCode = 1;
});