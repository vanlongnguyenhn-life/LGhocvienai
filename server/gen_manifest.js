// Generates server/assignment_manifest.json from data.js — a single source of
// truth for which criteria each assignment-type question requires, so the
// Python backend can verify a question is only marked "done" once every
// criterion has been validated server-side.
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data.js");
const code = fs.readFileSync(dataPath, "utf8");

// data.js declares top-level consts and doesn't export; eval in a scoped
// function so we can grab LESSONS without polluting/needing a module system.
const sandbox = {};
const fn = new Function(
  code + "\nreturn { LESSONS };"
);
const { LESSONS } = fn();

const manifest = {};
const reflectManifest = {};
for (const lesson of LESSONS) {
  for (const q of lesson.questions) {
    if (q.type === "assignment") {
      manifest[q.code] = {
        criteria: q.criteria.map((c) => ({ key: c.key, optional: !!c.optional, minLength: c.minLength || null })),
        points: q.points,
      };
    } else if (q.type === "reflect") {
      reflectManifest[q.code] = {
        prompt: [q.prompt, q.copyPrompt].filter(Boolean).join("\n"),
        minLength: q.minLength || 20,
        points: q.points,
      };
    }
  }
}

fs.writeFileSync(
  path.join(__dirname, "assignment_manifest.json"),
  JSON.stringify(manifest, null, 2)
);
console.log(`Wrote ${Object.keys(manifest).length} assignment questions to assignment_manifest.json`);

fs.writeFileSync(
  path.join(__dirname, "reflect_manifest.json"),
  JSON.stringify(reflectManifest, null, 2)
);
console.log(`Wrote ${Object.keys(reflectManifest).length} reflect questions to reflect_manifest.json`);
