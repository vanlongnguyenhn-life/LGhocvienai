// Generates server/assignment_manifest.json from data.js — a single source of
// truth for which criteria each assignment-type question requires, so the
// Python backend can verify a question is only marked "done" once every
// criterion has been validated server-side.
const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data.js");
const code = fs.readFileSync(dataPath, "utf8");

// data.js khai báo nhiều hằng số cấp cao nhất (COURSE, MODULES, LETTER_*, LESSONS...) và không
// export gì cả; chạy trong một hàm bọc để lấy chúng ra mà không cần module system.
// LẤY TỰ ĐỘNG theo tên khai báo trong file — KHÔNG liệt kê tay: bản data.public.js trước đây chỉ
// ghi mỗi LESSONS, thiếu COURSE khiến trang sập ngay khi học viên đăng nhập.
const TOP_LEVEL_NAMES = [...code.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
const fn = new Function(code + `\nreturn { ${TOP_LEVEL_NAMES.join(", ")} };`);
const exported = fn();
const { LESSONS } = exported;

const manifest = {};
const reflectManifest = {};
const answerManifest = {};

// Xáo thứ tự lựa chọn cho TOÀN KHOÁ. Trước đây chỉ dám xáo từ Bài 9 vì bài đã nộp lưu lựa chọn
// theo CHỈ SỐ ô, xáo lại là mở bài cũ ra tô nhầm. Nay server đã dịch mọi bài đã nộp sang lưu theo
// NỘI DUNG (_migrate_selected_to_texts) nên xáo toàn bộ không còn gây hại.
const shouldShuffle = () => true;

// Chọn vị trí đích cho đáp án đúng sao cho VỪA CÂN BẰNG VỪA KHÔNG THÀNH QUY LUẬT.
// - Xáo ngẫu nhiên thuần: hay dồn cụm, câu 2 lựa chọn có 50% rơi vào ô đầu -> nhìn vào vẫn thấy
//   "toàn đáp án đầu tiên".
// - Đếm tăng dần (ô 1, ô 2, ô 3...): rải đều nhưng lộ quy luật, học viên đoán được ô kế tiếp.
// Cách dùng ở đây: trong nhóm các câu CÙNG SỐ LỰA CHỌN, luôn chọn ô đang được dùng ÍT NHẤT;
// nếu nhiều ô hoà nhau thì bốc theo mã câu. Vừa đều, vừa không đoán được thứ tự.
const _posUsage = {};

function _pickAnswerPosition(n, code) {
  if (!_posUsage[n]) _posUsage[n] = new Array(n).fill(0);
  const usage = _posUsage[n];
  const min = Math.min(...usage);
  const candidates = usage.map((c, i) => (c === min ? i : -1)).filter((i) => i >= 0);
  const pick = candidates[Math.floor(seededRandom(code + "::pos")() * candidates.length)];
  usage[pick]++;
  return pick;
}
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
        entry.anyValid = !!q.anyValid;
        // Đáp án theo NỘI DUNG, không theo số thứ tự ô: giao diện gửi lên chuỗi học viên đã
        // chọn nên xáo thứ tự thoải mái, và bảng đáp án rò rỉ theo chỉ số ô trở thành vô dụng.
        entry.correctTexts = (q.correct || []).map((i) => (q.options || [])[i]).filter((v) => v != null);
        // Thứ tự lựa chọn thực sự gửi ra trình duyệt — chỉ số `correct` phải tính theo thứ tự
        // NÀY, để trình duyệt nào còn giữ bản app.js cũ (gửi chỉ số) vẫn được chấm đúng.
        // Chỉ số `correct` được tính LẠI sau khi dựng xong bản public (xem cuối file) để chắc
        // chắn khớp đúng thứ tự thật gửi ra trình duyệt.
        // Thứ tự GỐC (chỉ nằm phía server) — dùng để chuyển đổi các bài đã nộp trước khi xáo:
        // chúng lưu lựa chọn theo CHỈ SỐ của thứ tự cũ, không chuyển thì mở lại sẽ tô nhầm ô.
        entry.optionsOriginal = q.options || [];
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
        // Câu nhập mã KHÔNG khai `answer` là loại đáp án riêng từng học viên (ví dụ 9.23 —
        // mật thư sinh riêng, máy chủ tự chấm ở nhánh khác). Đưa vào bảng đáp án tĩnh thì nó
        // sẽ bị chấm sai với đáp án rỗng, nên bỏ qua hẳn.
        if (q.answer === undefined) continue;
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

function stripQuestion(q, shuffleOptions) {
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
  // Xáo thứ tự lựa chọn của câu trắc nghiệm. Trong data.js đáp án đúng bị dồn về đầu danh sách
  // (55% nằm ô 1, 89% nằm ô 1-2) — học viên cứ chọn ô đầu là qua quá nửa. Xáo bằng bộ sinh số
  // CỐ ĐỊNH THEO MÃ CÂU nên mỗi lần sinh lại vẫn ra đúng thứ tự đó (không đổi lung tung, và
  // lựa chọn cũ của học viên đã lưu vẫn tô sáng đúng nhờ đối chiếu theo nội dung).
  if (Array.isArray(out.options) && shuffleOptions) {
    const shuffled = seededShuffle(out.options, q.code);
    // Câu 1 đáp án đúng: đưa nó về đúng ô đã định để cả khoá rải đều mọi vị trí.
    if (q.type === "single" && !q.anyValid && Array.isArray(q.correct) && q.correct.length === 1) {
      const answer = q.options[q.correct[0]];
      const target = _pickAnswerPosition(shuffled.length, q.code);
      const cur = shuffled.indexOf(answer);
      if (cur >= 0 && cur !== target) {
        [shuffled[cur], shuffled[target]] = [shuffled[target], shuffled[cur]];
      }
    }
    out.options = shuffled;
  }
  return out;
}

// Bộ sinh số ngẫu nhiên có hạt giống (mulberry32) — cùng mã câu thì luôn ra cùng thứ tự.
function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seedStr) {
  const rnd = seededRandom(seedStr);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const publicLessons = LESSONS.map((l) => ({
  ...l,
  questions: l.questions.map((q) => stripQuestion(q, shouldShuffle(l))),
}));
const banner =
  "// SINH TU DONG bang server/gen_manifest.js — DUNG SUA TAY.\n" +
  "// Ban nay da BOC SACH dap an de gui ve trinh duyet. Sua noi dung o data.js roi chay lai:\n" +
  "//   node server/gen_manifest.js\n";

// Ghi LẠI TẤT CẢ hằng số của data.js, chỉ riêng LESSONS là bản đã bóc đáp án. Thiếu bất kỳ cái
// nào (COURSE, MODULES, LETTER_*...) là trang sập ngay khi học viên đăng nhập.
const publicBody = TOP_LEVEL_NAMES.map((name) => {
  const value = name === "LESSONS" ? publicLessons : exported[name];
  return `const ${name} = ${JSON.stringify(value, null, 2)};`;
}).join("\n\n");
// Chốt lại chỉ số `correct` theo ĐÚNG thứ tự trong bản public (để trình duyệt còn giữ bản app.js
// cũ — vốn gửi chỉ số ô — vẫn được chấm đúng).
publicLessons.forEach((l) =>
  l.questions.forEach((q) => {
    const e = answerManifest[q.code];
    if (e && e.correctTexts && Array.isArray(q.options)) {
      e.correct = e.correctTexts.map((t) => q.options.indexOf(t)).filter((i) => i >= 0);
    }
  })
);
fs.writeFileSync(path.join(__dirname, "answer_manifest.json"), JSON.stringify(answerManifest, null, 2));

const outPath = path.join(__dirname, "..", "data.public.js");
fs.writeFileSync(outPath, banner + publicBody + "\n");

// Thứ tự câu — server cần để biết một học viên "đang ở câu nào" (câu 9.20 báo cáo tiến độ
// của các bạn cùng lớp). Trước đây thứ tự chỉ tồn tại phía trình duyệt (ALL_QUESTIONS_ORDERED
// trong admin.js), server không có cách nào tự suy ra.
const order = LESSONS.flatMap((l) =>
  l.questions.map((q) => ({ code: q.code, title: q.title, lesson: l.title }))
);
fs.writeFileSync(
  path.join(__dirname, "question_order.json"),
  JSON.stringify(order, null, 1) + "\n"
);
console.log(`Wrote question_order.json (${order.length} questions in order)`);

// Kiểm tra ngay tại chỗ: đủ hằng số, không sót đáp án, và mỗi câu giữ đúng kiểu dữ liệu.
const publicNames = [...fs.readFileSync(outPath, "utf8").matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
const missing = TOP_LEVEL_NAMES.filter((n) => !publicNames.includes(n));
const leaked = JSON.stringify(publicLessons).match(/"correct"|"answer"|"correctMap"/g);
const typeErrors = [];
LESSONS.forEach((l, li) =>
  l.questions.forEach((q, qi) => {
    const p = publicLessons[li].questions[qi];
    (q.items || []).forEach((it, i) => {
      if (typeof it !== typeof (p.items || [])[i]) typeErrors.push(`${q.code}.items[${i}]`);
    });
  })
);
console.log(
  `Wrote data.public.js (${publicLessons.reduce((n, l) => n + l.questions.length, 0)} questions, ` +
    `${TOP_LEVEL_NAMES.length} consts: ${TOP_LEVEL_NAMES.join(", ")})`
);
if (missing.length) console.error(`  !!! THIEU HANG SO: ${missing.join(", ")} — trang se sap khi dang nhap!`);
if (leaked) console.error(`  !!! CON ${leaked.length} TRUONG DAP AN trong ban public!`);
if (typeErrors.length) console.error(`  !!! LECH KIEU DU LIEU: ${typeErrors.slice(0, 5).join(", ")}`);
if (missing.length || leaked || typeErrors.length) process.exit(1);
console.log("  Kiem tra: du hang so, khong sot dap an, khong lech kieu du lieu.");
