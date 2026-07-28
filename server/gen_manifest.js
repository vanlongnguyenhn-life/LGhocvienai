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
const answerManifest = {};
const ANSWER_TYPES = new Set([
  "single", "multi", "match", "order", "order-tag", "tag-mark", "code", "token_scope_check", "gate",
]);
for (const lesson of LESSONS) {
  for (const q of lesson.questions) {
    if (q.type === "assignment") {
      manifest[q.code] = {
        // prompt + instructions = bối cảnh đề bài để AI chấm đúng ngữ cảnh câu hỏi.
        prompt: [q.prompt, q.instructions].filter(Boolean).join("\n"),
        criteria: q.criteria.map((c) => ({
          key: c.key,
          optional: !!c.optional,
          minLength: c.minLength || null,
          // label + desc = "đề bài chuẩn" (rubric mặc định) để AI đối chiếu khi chấm tiêu chí này.
          label: c.label || "",
          desc: c.desc || "",
        })),
        points: q.points,
      };
    } else if (q.type === "reflect") {
      reflectManifest[q.code] = {
        prompt: [q.prompt, q.copyPrompt].filter(Boolean).join("\n"),
        minLength: q.minLength || 20,
        points: q.points,
      };
    } else if (ANSWER_TYPES.has(q.type)) {
      // Các loại câu có đáp án cố định (trắc nghiệm/nối/sắp xếp/nhập mã/token scope/gate chưa
      // mở) — server phải tự tính lại đúng/sai từ answer_data, không tin status client gửi.
      const entry = { type: q.type, points: q.points };
      if (q.type === "single" || q.type === "multi") {
        entry.correct = q.correct || [];
        entry.anyValid = !!q.anyValid;
      } else if (q.type === "match") {
        entry.correctMap = q.correctMap || [];
      } else if (q.type === "order") {
        entry.count = q.items.length;
      } else if (q.type === "order-tag") {
        entry.count = q.items.length;
        entry.tags = q.items.map((it) => it.tag);
      } else if (q.type === "tag-mark") {
        entry.icons = q.items.map((it) => it.icon);
      } else if (q.type === "code") {
        entry.answer = q.answer;
      } else if (q.type === "token_scope_check") {
        entry.requiredScopes = q.requiredScopes || [];
      }
      answerManifest[q.code] = entry;
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

fs.writeFileSync(
  path.join(__dirname, "answer_manifest.json"),
  JSON.stringify(answerManifest, null, 2)
);
console.log(`Wrote ${Object.keys(answerManifest).length} fixed-answer questions to answer_manifest.json`);
