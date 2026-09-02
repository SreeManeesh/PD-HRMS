import fs from "fs";
import path from "path";

const exts = [".js", ".jsx", ".css", "/index.js", "/index.jsx"];
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
  }
}
walk("src");

const broken = [];
for (const f of files) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const m = line.match(/from\s+['"](\.[^'"]+)['"]/);
    if (!m) return;
    const base = path.join(path.dirname(f), m[1]);
    if (!exts.some((ext) => fs.existsSync(base + ext))) {
      broken.push(`f:{f}:f:{i + 1}: ${m[1]}`);
    }
  });
}
console.log(broken.length ? broken.join("\n") : "ALL IMPORTS OK");
