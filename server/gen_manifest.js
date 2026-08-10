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
        // Rubric riêng, chỉ đưa cho AI khi chấm — không hiện cho học viên — để chấm NGHIÊM hơn
        // mức mặc định (mặc định chấp nhận mọi câu trả lời hợp lý đúng chủ đề, khá rộng) cho
        // những câu có 1 khái niệm/từ khoá đúng cụ thể cần nêu ra.
        gradingNote: q.gradingNote || null,
      };
    } else if (ANSWER_TYPES.has(q.type)) {
      // Các loại câu có đáp án cố định (trắc nghiệm/nối/sắp xếp/nhập mã/token scope/gate chưa
      // mở) — server phải tự tính lại đúng/sai từ answer_data, không tin status client gửi.
      const entry = { type: q.type, points: q.points };
      if (q.type === "single" || q.type === "multi") {
        entry.correct = q.correct || [];
        entry.anyValid = !!q.anyValid;
        // Đáp án theo NỘI DUNG, không theo số thứ tự ô: giao diện gửi lên chuỗi học viên đã
        // chọn nên có thể xáo thứ tự thoải mái, và một bảng đáp án bị rò rỉ theo chỉ số ô
        // (correct: [0,2,3]) trở thành vô dụng.
        entry.correctTexts = (q.correct || []).map((i) => (q.options || [])[i]).filter((v) => v != null);
      } else if (q.type === "match") {
        entry.correctMap = q.correctMap || [];
        entry.correctPairs = (q.leftItems || []).map((left, i) => [left, (q.rightOptions || [])[q.correctMap[i]]]);
      } else if (q.type === "order") {
        entry.count = q.items.length;
        entry.orderTexts = q.items.map((it) => (typeof it === "string" ? it : it.text));
      } else if (q.type === "order-tag") {
        entry.count = q.items.length;
        entry.tags = q.items.map((it) => it.tag);
        entry.orderTexts = q.items.map((it) => it.text);
        entry.tagByText = Object.fromEntries(q.items.map((it) => [it.text, it.tag]));
      } else if (q.type === "tag-mark") {
        entry.icons = q.items.map((it) => it.icon);
        entry.iconByText = Object.fromEntries(q.items.map((it) => [it.text, it.icon]));
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

// ===================== data.public.js — bản KHÔNG có đáp án cho trình duyệt =====================
// data.js là file tĩnh gửi thẳng về máy học viên, nên MỌI thứ trong đó đều công khai. Trước đây
// nó chứa cả đáp án (correct/answer/correctMap/tag/icon) — Agent của học viên đọc file là biết
// hết. Bản public này bóc sạch các trường đó; server vẫn giữ bản đầy đủ để chấm.
const STRIP_KEYS = new Set(["correct", "anyValid", "correctMap", "answer", "gradingNote"]);

function stripQuestion(q) {
  const out = {};
  for (const [k, v] of Object.entries(q)) {
    if (STRIP_KEYS.has(k)) continue;
    if (k === "items" && Array.isArray(v)) {
      // items có thể mang sẵn đáp án: tag đúng (order-tag), icon đúng (tag-mark) — bóc đi.
      // PHẢI GIỮ NGUYÊN KIỂU DỮ LIỆU: câu dạng "order" lưu các mục là CHUỖI, đổi thành đối
      // tượng sẽ làm phần hiển thị nhận sai kiểu và sập cả trang (đã xảy ra thật với 4 câu
      // 7.11 / 10.17 / 10.24 / 11.2).
      out.items = v.map((it) => (typeof it === "string" ? it : { text: it.text }));
      continue;
    }
    out[k] = v;
  }
  // CỐ Ý GIỮ NGUYÊN thứ tự các lựa chọn.
  // Từng thử xáo lại để vô hiệu hoá bảng đáp án đã rò rỉ (đáp án cũ ghi theo chỉ số ô), nhưng
  // đo ra thì 98% câu học viên ĐÃ LÀM sẽ tô sáng nhầm ô khi mở lại — vì lựa chọn cũ cũng được
  // lưu theo chỉ số. Tức là để chặn vài người có file rò rỉ thì làm hỏng trải nghiệm của TẤT CẢ
  // học viên trung thực. Không đáng. Việc bóc đáp án khỏi file mới là biện pháp chính.
  return out;
}

const publicLessons = LESSONS.map((l) => ({ ...l, questions: l.questions.map(stripQuestion) }));
const banner =
  "// SINH TU DONG bang server/gen_manifest.js — DUNG SUA TAY.\n" +
  "// Ban nay da BOC SACH dap an de gui ve trinh duyet. Sua noi dung o data.js roi chay lai:\n" +
  "//   node server/gen_manifest.js\n";
fs.writeFileSync(
  path.join(__dirname, "..", "data.public.js"),
  banner + "const LESSONS = " + JSON.stringify(publicLessons, null, 2) + ";\n"
);
const leaked = JSON.stringify(publicLessons).match(/"correct"|"answer"|"correctMap"/g);
console.log(
  `Wrote data.public.js (${publicLessons.reduce((n, l) => n + l.questions.length, 0)} questions, ` +
    `${leaked ? leaked.length + " ANSWER FIELDS STILL PRESENT!" : "no answer fields"})`
);
