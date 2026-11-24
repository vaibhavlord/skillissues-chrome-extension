import { access, cp, mkdir, readdir } from "node:fs/promises";

const output = new URL("../dist/skill-issues-cp/", import.meta.url);
const extension = new URL("../extension/", import.meta.url);
const web = new URL("../web/", import.meta.url);

await access(new URL("runtime/v0.29.3/pyodide.asm.wasm", web));
await mkdir(output, { recursive: true });
await Promise.all([
  ...((await readdir(extension)).map((name) => cp(new URL(name, extension), new URL(name, output)))),
  cp(web, new URL("web/", output), { recursive: true }),
]);
console.log("Load dist/skill-issues-cp as an unpacked Chrome extension.");
