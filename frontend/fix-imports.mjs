import fs from "fs";
import path from "path";

// Build a lowercase map of every real file in src
const realFiles = new Map(); // lowercase relative path -> real relative path
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else realFiles.set(p.toLowerCase(), p);
  }
}
walk("src");

const exts = [".js", ".jsx", ".css", "/index.js", "/index.jsx", ""];
function resolveCase(base) {
  for (const ext of exts) {
    const hit = realFiles.get((base + ext).toLowerCase());
    if (hit) return hit;
  }
  return null;
}

let fixedCount = 0;
const files = [];
function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
  }
}
collect("src");

for (const f of files) {
  let content = fs.readFileSync(f, "utf8");
  let changed = false;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/(from\s+|import\s+)(['"])(\.[^'"]+)\2/);
    if (!m) continue;
    const spec = m[3];
    const base = path.join(path.dirname(f), spec);
    const resolved = resolveCase(base);
    if (resolved && resolved !== base) {
      const newSpec = "." + resolved.slice(2 === 0 ? 0 : 0).replace(/\\/g, "/");
      const rel = path.relative(path.dirname(f), resolved).replace(/\\/g, "/");
      const newRel = rel.startsWith(".") ? rel : "./" + rel;
      lines[i] = lines[i].replace(spec, newRel);
      changed = true;
      fixedCount++;
      console.log("FIXED in " + f + " line " + (i + 1) + ": " + spec + " -> " + newRel);
    }
  }
  if (changed) fs.writeFileSync(f, lines.join("\n"));
}
console.log("Total imports fixed: " + fixedCount);
