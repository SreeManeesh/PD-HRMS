import fs from "node:fs";
import { transformWithOxc } from "vite";

const file = process.argv[2];
const code = fs.readFileSync(file, "utf8");
try {
  await transformWithOxc(code, file);
  console.log("PARSE OK:", file);
} catch (error) {
  console.log("PARSE FAILED:", file);
  console.log(error.message);
}
