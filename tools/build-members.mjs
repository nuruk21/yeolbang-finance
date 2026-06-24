import fs from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error("input and output paths are required");

const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
let source = raw.state ?? raw;
if (typeof source === "string") source = JSON.parse(source);
if (!source?.nets) throw new Error("attendance member structure not found");

const people = [];
const stableId = (value) => {
  let hash = 2166136261;
  for (const ch of value) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `mem_att_${(hash >>> 0).toString(36)}`;
};
const add = (members, path, affiliation) => {
  for (const person of members || []) {
    const name = String(person?.name || "").trim();
    if (!name) continue;
    const group = path.filter(Boolean).join(" › ");
    people.push({
      id: stableId(`${name}|${group}`),
      name,
      phone: "",
      address: "",
      taxId: "",
      group,
      status: person.absent ? "기타" : "재적",
      affiliation,
      source: "출석부 2026-06-14",
    });
  }
};

for (const [net, netData] of Object.entries(source.nets)) {
  add(netData?.members, [`${net}네트`], { net });
  for (const [g12, g12Data] of Object.entries(netData?.g12 || {})) {
    add(g12Data?.members, [`${net}네트`, g12], { net, g12 });
    for (const [cell144, data144] of Object.entries(g12Data?.c144 || {})) {
      add(data144?.members, [`${net}네트`, g12, cell144], { net, g12, cell144 });
      for (const [cell1728, data1728] of Object.entries(data144?.c1728 || {})) {
        add(data1728?.members, [`${net}네트`, g12, cell144, cell1728], { net, g12, cell144, cell1728 });
      }
    }
  }
}

const unique = [...new Map(people.map((person) => [`${person.name}|${person.group}`, person])).values()]
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));
const output = `// Generated from the user-provided attendance backup. Attendance history is intentionally excluded.\nwindow.YOLBANG_MEMBERS = ${JSON.stringify(unique, null, 2)};\n`;
await fs.writeFile(outputPath, output, "utf8");
console.log(JSON.stringify({ extracted: people.length, unique: unique.length }));
