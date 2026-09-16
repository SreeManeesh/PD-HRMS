/* Print raw line content with escapes for a file region. */
const fs = require("fs");
const file = process.argv[2];
const from = Number(process.argv[3]);
const to = Number(process.argv[4]);
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
for (let i = from - 1; i < to && i < lines.length; i += 1) {
  console.log((i + 1) + ": " + JSON.stringify(lines[i]));
}
