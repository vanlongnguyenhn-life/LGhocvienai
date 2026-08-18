// ===== Trang quản trị — theo dõi tiến độ học viên =====

const ADMIN_API = {
  async _send(url, opts) {
    const res = await fetch(url, { credentials: "same-origin", ...opts });
    if (!res.ok) {
      let detail = "Có lỗi xảy ra.";
      try {
        detail = (await res.json()).detail || detail;
      } catch (e) {}
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },
  me() {
    return this._send("/api/admin/me");
  },
  login(username, password) {
    const fd = new FormData();
    fd.append("username", username);
    fd.append("password", password);
    return this._send("/api/admin/login", { method: "POST", body: fd });
  },
  logout() {
    return this._send("/api/admin/logout", { method: "POST" });
  },
  students() {
    return this._send("/api/admin/students");
  },
  studentDetail(id) {
    return this._send(`/api/admin/students/${id}`);
  },
  activityTimeline() {
    return this._send("/api/admin/activity-timeline");
  },
  storage() {
    return this._send("/api/admin/diag/storage");
  },
  aiHealth() {
    return this._send("/api/admin/diag/ai-health");
  },
  setApproved(id, approved) {
    const fd = new FormData();
    fd.append("approved", approved ? "1" : "0");
    return this._send(`/api/admin/students/${id}/approve`, { method: "POST", body: fd });
  },
  setTeacher(id, isTeacher) {
    const fd = new FormData();
    fd.append("is_teacher", isTeacher ? "1" : "0");
    return this._send(`/api/admin/students/${id}/teacher`, { method: "POST", body: fd });
  },
  setTaiKhoanTest(id, laTest) {
    const fd = new FormData();
    fd.append("tai_khoan_test", laTest ? "1" : "0");
    return this._send(`/api/admin/students/${id}/tai-khoan-test`, { method: "POST", body: fd });
  },
  resetFromCode(id, codes) {
    const fd = new FormData();
    fd.append("codes", codes.join(","));
    return this._send(`/api/admin/students/${id}/reset-codes`, { method: "POST", body: fd });
  },
  grantCodes(id, codes) {
    const fd = new FormData();
    fd.append("codes", codes.join(","));
    return this._send(`/api/admin/students/${id}/grant-codes`, { method: "POST", body: fd });
  },
  setGwsEmail(id, email) {
    const fd = new FormData();
    fd.append("gws_email", email);
    return this._send(`/api/admin/students/${id}/gws-email`, { method: "POST", body: fd });
  },
  importGwsEmails(text) {
    const fd = new FormData();
    fd.append("text", text);
    return this._send("/api/admin/gws-emails/import", { method: "POST", body: fd });
  },
  larkChats() {
    return this._send("/api/admin/lark/chats");
  },
  larkBroadcast(chatId, text) {
    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("text", text);
    return this._send("/api/admin/lark/broadcast", { method: "POST", body: fd });
  },
  digestGet() {
    return this._send("/api/admin/digest");
  },
  digestSave(patch) {
    return this._send("/api/admin/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },
  digestSendNow(chatId) {
    const fd = new FormData();
    if (chatId) fd.append("chat_id", chatId);
    return this._send("/api/admin/digest/send-now", { method: "POST", body: fd });
  },
  gradingStats() {
    return this._send("/api/admin/diag/grading");
  },
  regrade(limit) {
    const fd = new FormData();
    fd.append("limit", String(limit || 15));
    return this._send("/api/admin/regrade", { method: "POST", body: fd });
  },
  flagged() {
    return this._send("/api/admin/flagged");
  },
  notifyStudent(userId, text) {
    const fd = new FormData();
    fd.append("text", text);
    return this._send(`/api/admin/students/${userId}/notify`, { method: "POST", body: fd });
  },
};

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (children || []).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

function renderAdminAvatar(user, className) {
  const cls = "user-avatar " + (className || "");
  if (user && user.avatar_url) {
    return el("img", { class: cls, src: user.avatar_url, alt: user.display_name || "", referrerpolicy: "no-referrer" });
  }
  const initial = ((user && user.display_name) || "?").trim().charAt(0).toUpperCase() || "?";
  return el("div", { class: cls + " user-avatar-fallback" }, [initial]);
}

function renderAdminLogo(className) {
  const wrap = el("div", { class: "brand-logo " + (className || "") });
  wrap.appendChild(el("img", { class: "brand-logo-img", src: "assets/logo.png", alt: "Life Group" }));
  return wrap;
}

// code -> { title, points, type, lessonCode, lessonTitle }
const QUESTION_INDEX = {};
const ALL_QUESTIONS_ORDERED = [];
let TOTAL_QUESTIONS = 0;
let TOTAL_POINTS = 0;
// Câu "gate" (nội dung thật chưa mở) không tính vào tiến độ/lỗ hổng — chúng không bao giờ
// "done" được, nếu tính thì mọi học viên đều hiện cảnh báo lỗ hổng giả và không ai "hoàn thành".
let NON_GATE_TOTAL = 0;
(LESSONS || []).forEach((lesson) => {
  lesson.questions.forEach((q) => {
    QUESTION_INDEX[q.code] = {
      title: q.title,
      points: q.points,
      type: q.type,
      criteria: q.criteria || null,
      lessonCode: lesson.code,
      lessonTitle: lesson.title,
      position: TOTAL_QUESTIONS + 1, // số thứ tự câu trong toàn khóa (1-based)
    };
    ALL_QUESTIONS_ORDERED.push(q.code);
    TOTAL_QUESTIONS += 1;
    TOTAL_POINTS += q.points;
    if (q.type !== "gate") NON_GATE_TOTAL += 1;
  });
});

function studentLearningState(s) {
  const doneCodes = new Set((s.done_codes || "").split(",").filter(Boolean));
  if (doneCodes.size === 0) {
    return { status: "not_started", currentCode: ALL_QUESTIONS_ORDERED[0] || null, furthestCode: null, gaps: 0, gapCodes: [] };
  }
  const isGate = (code) => QUESTION_INDEX[code] && QUESTION_INDEX[code].type === "gate";
  const doneReal = ALL_QUESTIONS_ORDERED.filter((c) => !isGate(c) && doneCodes.has(c)).length;
  if (doneReal >= NON_GATE_TOTAL) {
    return { status: "completed", currentCode: null, furthestCode: null, gaps: 0, gapCodes: [] };
  }
  // "Đang ở câu" = câu chưa làm ĐẦU TIÊN (bỏ qua câu gate — chúng chưa mở nội dung).
  const firstGapCode = ALL_QUESTIONS_ORDERED.find((code) => !isGate(code) && !doneCodes.has(code)) || null;
  const firstGapIdx = ALL_QUESTIONS_ORDERED.indexOf(firstGapCode);
  // Câu XA NHẤT đã chạm tới (để biết học viên từng đi tới đâu).
  let furthestIdx = -1;
  ALL_QUESTIONS_ORDERED.forEach((code, i) => {
    if (doneCodes.has(code)) furthestIdx = i;
  });
  // Lỗ hổng = các câu chưa ghi nhận nằm TRƯỚC câu xa nhất (bỏ qua gate — không phải lỗi lưu hụt).
  const gapCodes = [];
  for (let i = 0; i <= furthestIdx; i++) {
    if (!isGate(ALL_QUESTIONS_ORDERED[i]) && !doneCodes.has(ALL_QUESTIONS_ORDERED[i])) gapCodes.push(ALL_QUESTIONS_ORDERED[i]);
  }
  const furthestCode = furthestIdx > firstGapIdx ? ALL_QUESTIONS_ORDERED[furthestIdx] : null;
  return { status: "in_progress", currentCode: firstGapCode, furthestCode, gaps: gapCodes.length, gapCodes };
}

const STATUS_LABEL = {
  not_started: "Chưa bắt đầu",
  in_progress: "Đang học",
  completed: "Đã hoàn thành",
};

const INACTIVE_DAYS = 7;

const state = {
  admin: null,
  loading: true,
  error: "",
  students: [],
  selectedId: null,
  detail: null,
  detailLoading: false,
  filter: "all",
  onlyInactive: false,
  search: "",
  sortKey: "points",
  sortDir: "desc",
  timeline: [],
  larkChats: [],
  larkChatId: "",
  larkText: "",
  larkSending: false,
  larkMsg: "",
  digest: null,
  digestSaving: false,
  digestSending: false,
  digestMsg: "",
  gradingStats: null,
  regrading: false,
  regradeMsg: "",
  flagged: null,
  flaggedLoading: false,
  storage: null,
  aiHealth: null,
};

function fmtDate(s) {
  if (!s) return "—";
  // Server lưu mốc thời gian theo UTC → hiển thị theo giờ Việt Nam (UTC+7).
  const iso = (s.includes("T") ? s : s.replace(" ", "T")) + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s.replace("T", " ").slice(0, 16);
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return vn.toISOString().replace("T", " ").slice(0, 16);
}

function daysSince(tsString) {
  if (!tsString) return Infinity;
  const iso = tsString.includes("T") ? tsString : tsString.replace(" ", "T");
  const d = new Date(iso + "Z");
  if (isNaN(d.getTime())) return Infinity;
  return (Date.now() - d.getTime()) / 86400000;
}

async function boot() {
  try {
    state.admin = await ADMIN_API.me();
    await loadStudents();
    await loadTimeline();
    await loadLarkChats();
    await loadDigest();
    await loadGradingStats();
    await loadFlagged();
  } catch (e) {
    state.admin = null;
  }
  state.loading = false;
  render();
}

async function loadStudents() {
  state.students = await ADMIN_API.students();
  // Ổ đĩa dùng chung cho CSDL và ảnh minh chứng — đầy là cả lớp mất khả năng lưu bài.
  try {
    state.storage = await ADMIN_API.storage();
  } catch (e) {
    state.storage = null;
  }
  // AI hong = MOI cau tu luan deu khong the qua -> hoc vien bi chan cung, phai bao ngay.
  try {
    state.aiHealth = await ADMIN_API.aiHealth();
  } catch (e) {
    state.aiHealth = null;
  }
}

function renderAiHealthPanel() {
  const h = state.aiHealth;
  if (!h || h.level === "ok") return null;
  const critical = h.level === "critical";
  return el("div", { class: "admin-broadcast-panel" }, [
    el("h3", {}, [critical ? "🔴 AI chấm bài đang hỏng — học viên bị chặn" : "🟠 AI chấm bài có trục trặc"]),
    el("p", {}, [h.message || ""]),
    el("p", {}, [
      `24h qua: ${h.cham_duoc_24h} lượt chấm được, ${h.chua_cham_duoc_24h} lượt KHÔNG chấm được.` +
        (h.key_present ? "" : " Server chưa có API key."),
    ]),
  ]);
}

function renderStoragePanel() {
  const s = state.storage;
  if (!s || s.level === "ok") return null;
  const critical = s.level === "critical";
  const box = el("div", { class: "admin-broadcast-panel" }, [
    el("h3", {}, [
      critical ? "🔴 Ổ đĩa máy chủ sắp đầy — CẦN XỬ LÝ NGAY" : "🟠 Ổ đĩa máy chủ đang đầy dần",
    ]),
    el("p", {}, [
      `Đã dùng ${s.used_mb}MB / ${s.total_mb}MB (${s.used_pct}%). Còn trống ${s.free_mb}MB. ` +
        `Trong đó ảnh minh chứng ${s.uploads_mb ?? "?"}MB, cơ sở dữ liệu ${s.db_mb ?? "?"}MB.`,
    ]),
    el("p", {}, [
      critical
        ? "Khi đĩa đầy, hệ thống KHÔNG ghi được tiến độ nữa và toàn bộ học viên sẽ mất bài. Hãy nâng dung lượng đĩa trên Render ngay."
        : "Nên nâng dung lượng đĩa trên Render trước khi đầy — lúc đầy thì học viên mất khả năng lưu bài.",
    ]),
  ]);
  return box;
}

async function loadTimeline() {
  state.timeline = await ADMIN_API.activityTimeline();
}

async function loadLarkChats() {
  try {
    state.larkChats = await ADMIN_API.larkChats();
    if (!state.larkChatId && state.larkChats.length) {
      state.larkChatId = state.larkChats[0].chat_id;
    }
  } catch (e) {
    state.larkChats = [];
  }
}

async function loadDigest() {
  try {
    state.digest = await ADMIN_API.digestGet();
    // Đồng bộ tổng số câu thật từ dữ liệu khoá (frontend biết chính xác).
    if (state.digest && TOTAL_QUESTIONS && state.digest.total_questions !== TOTAL_QUESTIONS) {
      state.digest.total_questions = TOTAL_QUESTIONS;
    }
    if (state.digest && !state.digest.chat_id && state.larkChatId) {
      state.digest.chat_id = state.larkChatId;
    }
  } catch (e) {
    state.digest = null;
  }
}

function digestPatchFromState() {
  const d = state.digest || {};
  return {
    enabled: !!d.enabled,
    send_time: d.send_time || "20:00",
    chat_id: d.chat_id || "",
    intro_message: d.intro_message || "",
    show_overview: !!d.show_overview,
    show_leaderboard: !!d.show_leaderboard,
    show_inactive: !!d.show_inactive,
    top_n: Number(d.top_n) || 5,
    inactive_days: Number(d.inactive_days) || 3,
    total_questions: Number(d.total_questions) || TOTAL_QUESTIONS || 210,
  };
}

async function handleDigestSave() {
  state.digestSaving = true; state.digestMsg = ""; render();
  try {
    state.digest = await ADMIN_API.digestSave(digestPatchFromState());
    if (state.digest && TOTAL_QUESTIONS) state.digest.total_questions = TOTAL_QUESTIONS;
    state.digestMsg = "✓ Đã lưu cài đặt.";
  } catch (err) {
    state.digestMsg = "Lưu thất bại: " + (err.message || "lỗi không rõ");
  }
  state.digestSaving = false; render();
}

async function handleDigestSendNow() {
  const d = state.digest || {};
  if (!d.chat_id) { state.digestMsg = "Chưa chọn nhóm — hãy @Bé Ailai một câu trong nhóm rồi bấm Làm mới."; render(); return; }
  // Lưu cài đặt hiện tại trước để gửi thử đúng nội dung đang chỉnh.
  state.digestSending = true; state.digestMsg = ""; render();
  try {
    await ADMIN_API.digestSave(digestPatchFromState());
    await ADMIN_API.digestSendNow(d.chat_id);
    state.digestMsg = "✓ Đã gửi thử bản tổng hợp vào nhóm.";
  } catch (err) {
    state.digestMsg = "Gửi thất bại: " + (err.message || "lỗi không rõ");
  }
  state.digestSending = false; render();
}

async function loadGradingStats() {
  try {
    state.gradingStats = await ADMIN_API.gradingStats();
  } catch (e) {
    state.gradingStats = null;
  }
}

async function loadFlagged() {
  state.flaggedLoading = true; render();
  try {
    state.flagged = await ADMIN_API.flagged();
  } catch (e) {
    state.flagged = null;
  }
  state.flaggedLoading = false; render();
}

async function handleRegrade() {
  state.regrading = true; state.regradeMsg = "Đang chấm bằng AI..."; render();
  try {
    let guard = 0, totalDone = 0, lastResult = null;
    while (guard++ < 200) {
      const r = await ADMIN_API.regrade(15);
      lastResult = r;
      totalDone += r.regraded;
      state.regradeMsg = `Đã chấm ${totalDone} câu, còn lại ${r.remaining}...`;
      render();
      if (r.remaining <= 0 || r.regraded === 0) break;
    }
    state.gradingStats = await ADMIN_API.gradingStats();
    await loadFlagged();
    let msg = "✓ Xong. Đã chấm lại " + totalDone + " câu bằng AI.";
    if (lastResult && lastResult.remaining > 0) {
      const bits = [];
      if (lastResult.skipped_no_manifest && lastResult.skipped_no_manifest.length) {
        bits.push(`Bỏ qua vì thiếu cấu hình câu hỏi (chưa có trong manifest): ${lastResult.skipped_no_manifest.join(", ")}`);
      }
      if (lastResult.error_samples && lastResult.error_samples.length) {
        bits.push(`Mẫu lỗi gọi AI: ${lastResult.error_samples.join(" | ")}`);
      }
      if (bits.length) msg += " Còn " + lastResult.remaining + " câu chưa chấm được — " + bits.join(" — ");
    }
    state.regradeMsg = msg;
  } catch (err) {
    state.regradeMsg = "Lỗi: " + (err.message || "không rõ");
  }
  state.regrading = false; render();
}

function renderGradingPanel() {
  const box = el("div", { class: "admin-broadcast admin-grading" });
  box.appendChild(el("div", { class: "admin-broadcast-title" }, ["Chấm bài bằng AI (tự luận · ảnh · link)"]));
  const g = state.gradingStats;
  if (!g) {
    box.appendChild(el("div", { class: "admin-broadcast-hint" }, ["Đang tải..."]));
    return box;
  }
  const r = g.cau_tu_luan_reflect || {};
  const s = g.cau_minh_chung_anh_link_chu || {};
  const pending = (r.chua_AI_cham || 0) + (s.chua_AI_cham || 0);
  box.appendChild(el("div", { class: "admin-broadcast-hint" }, [
    el("div", {}, [`Tự luận: ${r.da_AI_cham || 0}/${r.tong_luot_nop || 0} đã AI chấm.`]),
    el("div", {}, [`Minh chứng (ảnh/link/chữ): ${(s.tong_tieu_chi_nop || 0) - (s.chua_AI_cham || 0)}/${s.tong_tieu_chi_nop || 0} đã AI chấm.`]),
    el("div", { style: pending ? "color:#b8630a;font-weight:600;margin-top:4px" : "color:#1d7a34;margin-top:4px" },
      [pending ? `Còn ${pending} bài chưa AI chấm.` : "✓ Tất cả đã được AI chấm."]),
  ]));
  box.appendChild(el("div", { class: "admin-broadcast-row" }, [
    el("button", { class: "admin-broadcast-send", disabled: (state.regrading || !pending) ? "true" : null, onclick: handleRegrade },
      [state.regrading ? "Đang chấm..." : "Chấm lại bằng AI"]),
    state.regradeMsg ? el("span", { class: "admin-broadcast-msg" }, [state.regradeMsg]) : null,
  ]));
  return box;
}

function renderFlaggedPanel() {
  const box = el("div", { class: "admin-broadcast admin-grading" });
  box.appendChild(el("div", { class: "admin-broadcast-title" }, ["Câu bị AI đánh KHÔNG đạt (cần xem xét)"]));

  if (state.flaggedLoading || !state.flagged) {
    box.appendChild(el("div", { class: "admin-broadcast-hint" }, ["Đang tải..."]));
    return box;
  }

  const reflects = state.flagged.reflects || [];
  const criteria = state.flagged.criteria || [];
  const isStillPassing = (row) => row.current_status === "done" || row.current_status === "correct";
  const urgent = reflects.filter(isStillPassing).length + criteria.filter(isStillPassing).length;
  const total = reflects.length + criteria.length;

  if (total === 0) {
    box.appendChild(el("div", { style: "color:#1d7a34" }, ["✓ Không có câu nào đang bị AI đánh rớt."]));
    return box;
  }

  box.appendChild(el("div", { class: "admin-broadcast-hint" }, [
    el("div", { style: urgent ? "color:#b8630a;font-weight:600" : "" }, [
      `${total} câu bị AI đánh không đạt` + (urgent ? ` — trong đó ${urgent} câu học viên VẪN đang hiện đã qua bài (cần xem xét trước).` : "."),
    ]),
  ]));

  const renderRow = (row, extraLabel) => {
    const stillPass = isStillPassing(row);
    return el("div", { class: "admin-flagged-row" + (stillPass ? " urgent" : "") }, [
      el("button", { class: "help-link", onclick: () => openStudent(row.user_id) }, [row.display_name || row.username]),
      el("span", {}, [" — câu " + row.question_code + (extraLabel ? " (" + extraLabel + ")" : "") + " — "]),
      el("span", { style: stillPass ? "color:#b8630a;font-weight:600" : "color:#666" }, [
        stillPass ? "vẫn đang hiện ĐÃ QUA BÀI" : "đã đúng là chưa qua",
      ]),
      row.reason ? el("div", { class: "admin-criterion-reason" }, ["Lý do AI: " + row.reason]) : null,
    ]);
  };

  if (reflects.length) {
    box.appendChild(el("div", { class: "admin-flagged-group-title" }, ["Tự luận:"]));
    reflects.forEach((r) => box.appendChild(renderRow(r)));
  }
  if (criteria.length) {
    box.appendChild(el("div", { class: "admin-flagged-group-title" }, ["Minh chứng ảnh/link/chữ:"]));
    criteria.forEach((c) => box.appendChild(renderRow(c, c.criterion_key)));
  }

  // Gom theo học viên (chỉ những ai vẫn đang hiện đã qua bài dù AI nói rớt — nhóm cần xử lý
  // gấp) để chuẩn bị sẵn nội dung tin nhắn + phạm vi khoá tiến độ cho từng người.
  const byStudent = {};
  [...reflects, ...criteria].forEach((row) => {
    if (!isStillPassing(row)) return;
    if (!byStudent[row.user_id]) byStudent[row.user_id] = { user_id: row.user_id, display_name: row.display_name || row.username, items: [] };
    byStudent[row.user_id].items.push(row);
  });
  const students = Object.values(byStudent);
  if (students.length) {
    box.appendChild(el("div", { class: "admin-flagged-group-title" }, ["Xem trước tin nhắn theo từng học viên (chưa gửi gì cả):"]));
    students.forEach((s) => box.appendChild(renderRemediatePreview(s)));
  }

  return box;
}

function buildRemediateMessage(displayName, items) {
  const lines = items.map((it) => {
    const info = QUESTION_INDEX[it.question_code];
    const title = info ? info.title : it.question_code;
    return `- ${it.question_code} — "${title}" (lý do: ${it.reason || "chưa rõ"})`;
  });
  return (
    `Chào ${displayName}! Em là Bé Ailai.\n\n` +
    `Hệ thống chấm bài bằng AI vừa gặp một sự cố kỹ thuật: khi AI chấm bị lỗi kết nối, hệ thống đã tạm thời cho một số câu tự luận/minh chứng qua chỉ dựa theo hình thức, chưa kiểm tra đúng nội dung.\n\n` +
    `Em đã khắc phục xong — từ bây giờ mọi câu đều được AI chấm ngay lúc nộp bài, không còn xảy ra tình trạng này nữa.\n\n` +
    `Sau khi chấm lại, các câu sau của anh/chị chưa đạt yêu cầu:\n` +
    lines.join("\n") +
    `\n\nAnh/chị vào lại bài học làm lại các câu này nhé — cần hoàn thành xong mới tiếp tục được các bài sau. Cảm ơn anh/chị!`
  );
}

function renderRemediatePreview(student) {
  const message = buildRemediateMessage(student.display_name, student.items);
  // CHỈ xoá đúng các câu bị AI đánh rớt — KHÔNG đụng vào câu nào khác, kể cả những câu đứng
  // SAU câu bị rớt mà học viên đã làm đúng thật (giữ nguyên toàn bộ điểm/tiến độ hợp lệ đó).
  const resetCodes = student.items.map((it) => it.question_code);

  const box = el("div", { class: "admin-flagged-row" });
  box.appendChild(el("div", {}, [
    el("button", { class: "help-link", onclick: () => openStudent(student.user_id) }, [student.display_name]),
    el("span", {}, [` — sẽ xoá đúng ${resetCodes.length} câu: ${resetCodes.join(", ")} (giữ nguyên mọi câu khác).`]),
  ]));
  box.appendChild(el("pre", { class: "admin-remediate-preview" }, [message]));
  box.appendChild(
    el(
      "button",
      { class: "admin-broadcast-send", onclick: () => handleRemediateStudent(student.user_id, message, resetCodes) },
      ["Duyệt: gửi tin nhắn này + xoá đúng các câu rớt"]
    )
  );
  return box;
}

async function handleRemediateStudent(userId, message, resetCodes) {
  if (!confirm(`Xác nhận GỬI tin nhắn Lark riêng cho học viên này VÀ xoá đúng ${resetCodes.length} câu (${resetCodes.join(", ")}) — các câu khác giữ nguyên?\nKhông thể hoàn tác.`)) {
    return;
  }
  try {
    await ADMIN_API.notifyStudent(userId, message);
    const r = await ADMIN_API.resetFromCode(userId, resetCodes);
    await loadFlagged();
    await loadStudents();
    alert(`Đã gửi tin nhắn và xoá tiến độ: ${r.deleted_status} trạng thái, ${r.deleted_reflect} bài tự luận, ${r.deleted_submissions} minh chứng.`);
  } catch (err) {
    alert("Thất bại: " + (err.message || "lỗi không rõ"));
  }
}

async function handleBroadcast() {
  const text = (state.larkText || "").trim();
  if (!state.larkChatId) { state.larkMsg = "Chưa có nhóm — hãy @Bé Ailai một câu trong nhóm rồi bấm Làm mới."; render(); return; }
  if (!text) { state.larkMsg = "Nội dung đang trống."; render(); return; }
  state.larkSending = true; state.larkMsg = ""; render();
  try {
    await ADMIN_API.larkBroadcast(state.larkChatId, text);
    state.larkText = "";
    state.larkMsg = "✓ Đã gửi vào nhóm.";
  } catch (err) {
    state.larkMsg = "Gửi thất bại: " + (err.message || "lỗi không rõ");
  }
  state.larkSending = false; render();
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const username = form.username.value.trim();
  const password = form.password.value;
  state.error = "";
  try {
    state.admin = await ADMIN_API.login(username, password);
    await loadStudents();
    await loadTimeline();
  } catch (err) {
    state.error = err.message || "Đăng nhập thất bại.";
  }
  render();
}

async function handleLogout() {
  await ADMIN_API.logout();
  state.admin = null;
  state.students = [];
  state.selectedId = null;
  state.detail = null;
  render();
}

async function handleApprove(id, approved) {
  try {
    await ADMIN_API.setApproved(id, approved);
    await loadStudents();
    if (state.detail && state.detail.user && state.detail.user.id === id) {
      state.detail.user.approved = approved ? 1 : 0;
    }
  } catch (err) {
    alert(err.message || "Không cập nhật được trạng thái duyệt.");
  }
  render();
}

async function handleTeacher(id, isTeacher) {
  try {
    await ADMIN_API.setTeacher(id, isTeacher);
    if (state.detail && state.detail.user && state.detail.user.id === id) {
      state.detail.user.is_teacher = isTeacher ? 1 : 0;
    }
  } catch (err) {
    alert(err.message || "Không cập nhật được quyền giáo viên.");
  }
  render();
}

async function handleTaiKhoanTest(id, laTest) {
  if (
    laTest &&
    !confirm(
      "Đánh dấu đây là TÀI KHOẢN KIỂM THỬ?\n\n" +
        "Tài khoản này vẫn học bình thường, nhưng sẽ không còn được tính là bạn cùng lớp ở câu " +
        "9.20 / 9.21 / 9.22 — các bạn khác không phải chờ nó vào chấm bài nữa."
    )
  ) {
    return;
  }
  try {
    await ADMIN_API.setTaiKhoanTest(id, laTest);
    const u = state.students.find((s) => s.id === id);
    if (u) u.tai_khoan_test = laTest ? 1 : 0;
    if (state.detail && state.detail.user && state.detail.user.id === id) {
      state.detail.user.tai_khoan_test = laTest ? 1 : 0;
    }
  } catch (err) {
    alert(err.message || "Không cập nhật được nhãn tài khoản kiểm thử.");
  }
  render();
}

async function handleGrantGaps(userId, displayName, gapCodes) {
  if (!gapCodes || gapCodes.length === 0) return;
  const preview = gapCodes.slice(0, 12).join(", ") + (gapCodes.length > 12 ? `, … (+${gapCodes.length - 12})` : "");
  if (
    !confirm(
      `Công nhận các câu bị hổng của ${displayName} là ĐÃ HOÀN THÀNH?\n\nĐang xét: ${preview}\n\n` +
        "Chỉ công nhận những câu CHƯA TỪNG được ghi nhận (do hệ thống lưu hụt). Câu nào học viên " +
        "đã trả lời và bị sai sẽ được giữ nguyên để học viên tự làm lại.\nKhông thể hoàn tác."
    )
  ) {
    return;
  }
  try {
    const r = await ADMIN_API.grantCodes(userId, gapCodes);
    await loadStudents();
    render();
    let msg = `Đã công nhận ${r.granted.length} câu bị lưu hụt.`;
    if ((r.skipped_answered_wrong || []).length) {
      msg +=
        `\n\nGiữ nguyên ${r.skipped_answered_wrong.length} câu vì học viên ĐÃ trả lời và bị sai ` +
        `(không phải lỗi lưu hụt) — để học viên tự làm lại:\n${r.skipped_answered_wrong.join(", ")}`;
    }
    if ((r.skipped_done || []).length) msg += `\n\nBỏ qua ${r.skipped_done.length} câu đã đạt sẵn.`;
    alert(msg);
  } catch (err) {
    alert("Thất bại: " + (err.message || "lỗi không rõ"));
  }
}

async function handleResetFromCode(userId) {
  const input = document.getElementById("admin-reset-code-input");
  const fromCode = (input && input.value || "").trim();
  const idx = ALL_QUESTIONS_ORDERED.indexOf(fromCode);
  if (idx < 0) {
    alert("Không tìm thấy câu '" + fromCode + "'. Nhập đúng mã câu, ví dụ 6.5");
    return;
  }
  const codes = ALL_QUESTIONS_ORDERED.slice(idx);
  if (!confirm(`Xoá tiến độ ${codes.length} câu (TỪ câu ${fromCode} trở đi) của học viên này?\nHọc viên sẽ quay về ngay trước câu ${fromCode}. Không thể hoàn tác.`)) {
    return;
  }
  try {
    const r = await ADMIN_API.resetFromCode(userId, codes);
    await loadStudents();
    await openStudent(userId);
    alert(`Đã xoá: ${r.deleted_status} tiến độ, ${r.deleted_reflect} bài tự luận, ${r.deleted_submissions} minh chứng.`);
  } catch (err) {
    alert("Xoá thất bại: " + (err.message || "lỗi không rõ"));
  }
}

async function handleSetGwsEmail(userId) {
  const input = document.getElementById("admin-gws-email-input");
  const value = ((input && input.value) || "").trim();
  if (value && !/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(value)) {
    alert("Email không hợp lệ: " + value);
    return;
  }
  if (!value && !confirm("Gỡ khoá tài khoản Google của học viên này?\nLần chạy 9.16 tiếp theo sẽ khoá lại theo tài khoản mới.")) {
    return;
  }
  try {
    await ADMIN_API.setGwsEmail(userId, value);
    await openStudent(userId);
    alert(value ? "Đã đăng ký tài khoản Google: " + value : "Đã gỡ khoá tài khoản Google.");
  } catch (err) {
    alert("Lưu thất bại: " + (err.message || "lỗi không rõ"));
  }
}

async function handleImportGwsEmails() {
  const box = document.getElementById("admin-gws-import-text");
  const text = ((box && box.value) || "").trim();
  if (!text) {
    alert("Dán danh sách vào ô trước đã.");
    return;
  }
  try {
    const r = await ADMIN_API.importGwsEmails(text);
    await loadStudents();
    const warn = (r.canh_bao || []).length ? "\n\nCần xem lại:\n" + r.canh_bao.join("\n") : "";
    alert(`Đã gán tài khoản Google cho ${r.so_dong_ap_dung} học viên.` + warn);
  } catch (err) {
    alert("Nhập thất bại: " + (err.message || "lỗi không rõ"));
  }
}

async function openStudent(id) {
  state.selectedId = id;
  state.detail = null;
  state.detailLoading = true;
  render();
  state.detail = await ADMIN_API.studentDetail(id);
  state.detailLoading = false;
  render();
}

function closeStudent() {
  state.selectedId = null;
  state.detail = null;
  render();
}

function renderLogin() {
  const view = el("div", { class: "login-view" });
  view.appendChild(renderAdminLogo("login-brand-logo"));
  view.appendChild(el("h1", {}, ["Trang ", el("em", {}, ["quản trị"])]));
  view.appendChild(el("p", { class: "login-tagline" }, ["Theo dõi tiến độ học viên."]));

  const card = el("div", { class: "login-card" });
  card.appendChild(el("h2", {}, ["Đăng nhập quản trị"]));

  const form = el("form", { class: "auth-form", onsubmit: handleLogin }, [
    el("input", { class: "reflect-input", name: "username", placeholder: "Tên đăng nhập admin", autocomplete: "username" }),
    el("input", { class: "reflect-input", name: "password", type: "password", placeholder: "Mật khẩu", autocomplete: "current-password" }),
    el("button", { class: "submit-btn", type: "submit", style: "width:100%" }, ["Đăng nhập"]),
  ]);
  card.appendChild(form);
  if (state.error) card.appendChild(el("p", { class: "auth-error" }, [state.error]));
  view.appendChild(card);
  return view;
}

function studentProgressPct(s) {
  return NON_GATE_TOTAL ? Math.min(100, Math.round((s.done_count / NON_GATE_TOTAL) * 100)) : 0;
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportCSV(rows) {
  const headers = [
    "Tên đăng nhập", "Tên hiển thị", "Ngày tham gia", "Trạng thái", "Đang ở câu",
    "Số câu hoàn thành", "Tổng số câu", "Điểm đạt", "Tổng điểm", "Hoạt động gần nhất",
  ];
  const lines = [headers.join(",")];
  rows.forEach((s) => {
    const currentQ = s.currentCode ? QUESTION_INDEX[s.currentCode] : null;
    const cur = s.status === "completed"
      ? "Đã hoàn thành"
      : currentQ
      ? `Câu ${currentQ.position}/${TOTAL_QUESTIONS} - ${currentQ.title}`
      : "";
    lines.push(
      [
        s.username, s.display_name, s.created_at, STATUS_LABEL[s.status], cur,
        s.done_count, TOTAL_QUESTIONS, s.total_points, TOTAL_POINTS, s.last_activity || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hoc-vien-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function computeStuckQuestions(enriched) {
  const counts = {};
  enriched.forEach((s) => {
    if (s.status === "in_progress" && s.currentCode) {
      counts[s.currentCode] = (counts[s.currentCode] || 0) + 1;
    }
  });
  return Object.entries(counts)
    .map(([code, count]) => ({ code, count, title: QUESTION_INDEX[code] ? QUESTION_INDEX[code].title : code }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function renderStuckQuestions(enriched) {
  const stuck = computeStuckQuestions(enriched);
  if (stuck.length === 0) return null;
  const box = el("div", { class: "admin-lesson-card" });
  box.appendChild(el("div", { class: "admin-lesson-title" }, ["Câu hỏi hay bị kẹt nhất"]));
  const list = el("ul", { class: "admin-question-list" });
  stuck.forEach((q) => {
    list.appendChild(
      el("li", { class: "admin-question-item" }, [
        el("span", { class: "admin-q-title" }, [q.title]),
        el("span", { class: "admin-q-points" }, [`${q.count} học viên đang dừng ở đây`]),
      ])
    );
  });
  box.appendChild(list);
  return box;
}

function renderTimelineChart() {
  const data = state.timeline || [];
  const box = el("div", { class: "admin-lesson-card" });
  box.appendChild(el("div", { class: "admin-lesson-title" }, ["Số câu hoàn thành theo ngày (30 ngày gần nhất)"]));
  if (data.length === 0) {
    box.appendChild(el("p", { class: "admin-empty" }, ["Chưa có dữ liệu hoạt động."]));
    return box;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  const w = 600, h = 110, gap = 3;
  const barW = Math.max(3, w / data.length - gap);
  let bars = "";
  data.forEach((d, i) => {
    const barH = Math.max(1, (d.count / max) * h);
    const x = i * (barW + gap);
    bars += `<rect x="${x}" y="${h - barH}" width="${barW}" height="${barH}" rx="2" style="fill:var(--gold)"><title>${d.day}: ${d.count} câu</title></rect>`;
  });
  const chartWrap = el("div", { class: "admin-chart-wrap" });
  chartWrap.innerHTML = `<svg viewBox="0 0 ${w} ${h}" class="admin-chart" preserveAspectRatio="none">${bars}</svg>`;
  box.appendChild(chartWrap);
  return box;
}

const SORT_ACCESSORS = {
  name: (s) => (s.display_name || "").toLowerCase(),
  created_at: (s) => s.created_at || "",
  progress: (s) => s.done_count,
  points: (s) => s.total_points,
  last_activity: (s) => s.last_activity || s.created_at || "",
};

function sortStudents(list) {
  const acc = SORT_ACCESSORS[state.sortKey] || SORT_ACCESSORS.points;
  return [...list].sort((a, b) => {
    const av = acc(a), bv = acc(b);
    let cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return state.sortDir === "asc" ? cmp : -cmp;
  });
}

function toggleSort(key) {
  if (state.sortKey === key) {
    state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
  } else {
    state.sortKey = key;
    state.sortDir = "desc";
  }
  render();
}

function sortableTh(label, key) {
  const active = state.sortKey === key;
  const arrow = active ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
  return el("th", { class: "admin-th-sort", onclick: () => toggleSort(key) }, [label + arrow]);
}

function renderBackupPanel() {
  const box = el("div", { class: "admin-broadcast" });
  box.appendChild(el("div", { class: "admin-broadcast-title" }, ["Sao lưu tiến độ học viên"]));
  box.appendChild(
    el("div", { class: "admin-broadcast-hint" }, [
      "Toàn bộ tiến độ cả lớp nằm trên đúng một ổ đĩa của máy chủ. Nếu ổ đó hỏng thì không có ",
      "cách nào lấy lại. Hãy bấm nút dưới mỗi tuần và lưu file về máy bạn (hoặc Google Drive) — ",
      "đó mới là bản sao thật sự an toàn vì nó nằm ở nơi khác.",
    ])
  );
  box.appendChild(
    el("a", { class: "admin-broadcast-send", href: "/api/admin/backup", download: "" }, ["⬇ Tải bản sao lưu ngay"])
  );
  box.appendChild(
    el("div", { class: "admin-broadcast-hint" }, [
      "⚠️ File này chứa dữ liệu cá nhân của học viên — giữ riêng tư, đừng chia sẻ công khai.",
    ])
  );
  return box;
}

function renderBroadcastPanel() {
  const box = el("div", { class: "admin-broadcast" });
  box.appendChild(el("div", { class: "admin-broadcast-title" }, ["Gửi thông báo qua Bé Ailai"]));

  if (!state.larkChats.length) {
    box.appendChild(
      el("div", { class: "admin-broadcast-hint" }, [
        "Chưa ghi nhận nhóm nào. Hãy vào nhóm Lark, @Bé Ailai một câu bất kỳ, rồi bấm ",
        el("a", { class: "help-link", onclick: async () => { await loadLarkChats(); render(); } }, ["Làm mới"]),
        " nhé.",
      ])
    );
    return box;
  }

  if (state.larkChats.length > 1) {
    const sel = el("select", { class: "reflect-input", onchange: (e) => { state.larkChatId = e.target.value; } });
    state.larkChats.forEach((c) => {
      const opt = el("option", { value: c.chat_id }, [c.chat_id]);
      if (c.chat_id === state.larkChatId) opt.setAttribute("selected", "selected");
      sel.appendChild(opt);
    });
    box.appendChild(sel);
  }

  const ta = el("textarea", {
    class: "reflect-input admin-broadcast-text",
    rows: "6",
    placeholder: "Nhập nội dung Bé Ailai sẽ gửi vào nhóm...",
  });
  ta.value = state.larkText || "";
  ta.addEventListener("input", (e) => { state.larkText = e.target.value; });
  box.appendChild(ta);

  box.appendChild(
    el("div", { class: "admin-broadcast-row" }, [
      el(
        "button",
        { class: "admin-broadcast-send", disabled: state.larkSending ? "true" : null, onclick: handleBroadcast },
        [state.larkSending ? "Đang gửi..." : "Gửi vào nhóm"]
      ),
      state.larkMsg ? el("span", { class: "admin-broadcast-msg" }, [state.larkMsg]) : null,
    ])
  );
  return box;
}

function renderDigestPanel() {
  const box = el("div", { class: "admin-broadcast admin-digest" });
  box.appendChild(el("div", { class: "admin-broadcast-title" }, ["Tổng hợp học tập hằng ngày (Bé Ailai tự gửi)"]));

  const d = state.digest;
  if (!d) {
    box.appendChild(el("div", { class: "admin-broadcast-hint" }, ["Đang tải cài đặt..."]));
    return box;
  }

  // Bật/tắt + giờ gửi
  const enableWrap = el("label", { class: "admin-digest-toggle" }, []);
  const enableCb = el("input", { type: "checkbox" });
  enableCb.checked = !!d.enabled;
  enableCb.addEventListener("change", (e) => { d.enabled = e.target.checked; render(); });
  enableWrap.appendChild(enableCb);
  enableWrap.appendChild(document.createTextNode(" Tự động gửi mỗi ngày"));

  const timeInput = el("input", { type: "time", class: "reflect-input admin-digest-time" });
  timeInput.value = d.send_time || "20:00";
  timeInput.addEventListener("change", (e) => { d.send_time = e.target.value || "20:00"; });

  box.appendChild(el("div", { class: "admin-digest-row" }, [
    enableWrap,
    el("span", { class: "admin-digest-label" }, ["lúc"]),
    timeInput,
    el("span", { class: "admin-digest-label" }, ["giờ (giờ Việt Nam)"]),
  ]));

  // Chọn nhóm
  if (!state.larkChats.length) {
    box.appendChild(el("div", { class: "admin-broadcast-hint" }, [
      "Chưa ghi nhận nhóm nào. Hãy vào nhóm Lark, @Bé Ailai một câu, rồi bấm ",
      el("a", { class: "help-link", onclick: async () => { await loadLarkChats(); if (state.digest && !state.digest.chat_id && state.larkChatId) state.digest.chat_id = state.larkChatId; render(); } }, ["Làm mới"]),
      " nhé.",
    ]));
  } else if (state.larkChats.length === 1) {
    d.chat_id = d.chat_id || state.larkChats[0].chat_id;
    box.appendChild(el("div", { class: "admin-digest-label" }, ["Nhóm nhận: " + d.chat_id]));
  } else {
    const sel = el("select", { class: "reflect-input", onchange: (e) => { d.chat_id = e.target.value; } });
    state.larkChats.forEach((c) => {
      const opt = el("option", { value: c.chat_id }, [c.chat_id]);
      if (c.chat_id === d.chat_id) opt.setAttribute("selected", "selected");
      sel.appendChild(opt);
    });
    box.appendChild(el("div", { class: "admin-digest-row" }, [el("span", { class: "admin-digest-label" }, ["Nhóm nhận:"]), sel]));
  }

  // Các phần hiển thị
  function sectionCb(key, label) {
    const w = el("label", { class: "admin-digest-toggle" }, []);
    const cb = el("input", { type: "checkbox" });
    cb.checked = !!d[key];
    cb.addEventListener("change", (e) => { d[key] = e.target.checked; });
    w.appendChild(cb);
    w.appendChild(document.createTextNode(" " + label));
    return w;
  }
  box.appendChild(el("div", { class: "admin-digest-row admin-digest-sections" }, [
    sectionCb("show_overview", "Tổng quan lớp"),
    sectionCb("show_leaderboard", "Bảng xếp hạng"),
    sectionCb("show_inactive", "Chưa hoạt động"),
  ]));

  // Tham số
  const topN = el("input", { type: "number", min: "1", max: "20", class: "reflect-input admin-digest-num" });
  topN.value = d.top_n || 5;
  topN.addEventListener("change", (e) => { d.top_n = Number(e.target.value) || 5; });
  const inDays = el("input", { type: "number", min: "1", max: "30", class: "reflect-input admin-digest-num" });
  inDays.value = d.inactive_days || 3;
  inDays.addEventListener("change", (e) => { d.inactive_days = Number(e.target.value) || 3; });
  box.appendChild(el("div", { class: "admin-digest-row" }, [
    el("span", { class: "admin-digest-label" }, ["Top"]), topN,
    el("span", { class: "admin-digest-label" }, ["học viên · Nhắc bạn nghỉ từ"]), inDays,
    el("span", { class: "admin-digest-label" }, ["ngày"]),
  ]));

  // Lời nhắn theo đợt
  box.appendChild(el("div", { class: "admin-digest-label" }, ["Lời nhắn đầu bản tin (chỉnh theo từng đợt):"]));
  const ta = el("textarea", { class: "reflect-input admin-broadcast-text", rows: "3", placeholder: "Lời nhắn mở đầu bản tổng hợp..." });
  ta.value = d.intro_message || "";
  ta.addEventListener("input", (e) => { d.intro_message = e.target.value; });
  box.appendChild(ta);

  // Nút
  box.appendChild(el("div", { class: "admin-broadcast-row" }, [
    el("button", { class: "admin-broadcast-send", disabled: state.digestSaving ? "true" : null, onclick: handleDigestSave },
      [state.digestSaving ? "Đang lưu..." : "Lưu cài đặt"]),
    el("button", { class: "help-link", disabled: state.digestSending ? "true" : null, onclick: handleDigestSendNow },
      [state.digestSending ? "Đang gửi..." : "Gửi thử ngay"]),
    state.digestMsg ? el("span", { class: "admin-broadcast-msg" }, [state.digestMsg]) : null,
  ]));

  const info = d.enabled
    ? `Đang bật — Bé Ailai sẽ tự gửi mỗi ngày lúc ${d.send_time || "20:00"} (giờ VN).` + (d.last_sent_date ? ` Lần gửi tự động gần nhất: ${d.last_sent_date}.` : "")
    : "Đang tắt — bật công tắc phía trên rồi Lưu để Bé tự gửi hằng ngày.";
  box.appendChild(el("div", { class: "admin-broadcast-hint" }, [info]));

  return box;
}

function renderDashboard() {
  const wrap = el("div", { class: "admin-shell" });

  const topbar = el("div", { class: "topbar" }, [
    renderAdminLogo("topbar-brand-logo"),
    el("button", { class: "help-link", onclick: handleLogout }, ["Đăng xuất"]),
  ]);
  wrap.appendChild(topbar);
  wrap.appendChild(renderBroadcastPanel());
  wrap.appendChild(renderDigestPanel());
  wrap.appendChild(renderBackupPanel());
  const storagePanel = renderStoragePanel();
  if (storagePanel) wrap.appendChild(storagePanel);
  const aiPanel = renderAiHealthPanel();
  if (aiPanel) wrap.appendChild(aiPanel);
  wrap.appendChild(renderGradingPanel());
  wrap.appendChild(renderFlaggedPanel());

  const enriched = state.students.map((s) => {
    const learning = studentLearningState(s);
    const refTs = s.last_activity || s.created_at;
    const inactiveDays = daysSince(refTs);
    const isInactive = learning.status !== "completed" && inactiveDays >= INACTIVE_DAYS;
    return { ...s, ...learning, inactiveDays, isInactive };
  });
  const totalStudents = enriched.length;
  const counts = { not_started: 0, in_progress: 0, completed: 0 };
  let inactiveCount = 0;
  enriched.forEach((s) => {
    counts[s.status]++;
    if (s.isInactive) inactiveCount++;
  });

  function statCard(label, num, filterKey) {
    const active = state.filter === filterKey;
    return el(
      "div",
      { class: "admin-stat-card" + (active ? " active" : ""), onclick: () => { state.filter = filterKey; render(); } },
      [el("div", { class: "admin-stat-num" }, [String(num)]), el("div", { class: "admin-stat-label" }, [label])]
    );
  }

  const inactiveCard = el(
    "div",
    {
      class: "admin-stat-card warn" + (state.onlyInactive ? " active" : ""),
      onclick: () => { state.onlyInactive = !state.onlyInactive; render(); },
    },
    [
      el("div", { class: "admin-stat-num" }, [String(inactiveCount)]),
      el("div", { class: "admin-stat-label" }, [`Không hoạt động >${INACTIVE_DAYS} ngày`]),
    ]
  );

  const summary = el("div", { class: "admin-summary" }, [
    statCard("Tất cả học viên", totalStudents, "all"),
    statCard("Chưa bắt đầu", counts.not_started, "not_started"),
    statCard("Đang học", counts.in_progress, "in_progress"),
    statCard("Đã hoàn thành", counts.completed, "completed"),
    inactiveCard,
  ]);
  wrap.appendChild(summary);

  if (state.selectedId != null) {
    wrap.appendChild(renderStudentDetail());
    return wrap;
  }

  wrap.appendChild(renderTimelineChart());
  const stuckPanel = renderStuckQuestions(enriched);
  if (stuckPanel) wrap.appendChild(stuckPanel);

  let list = state.filter === "all" ? enriched : enriched.filter((s) => s.status === state.filter);
  if (state.onlyInactive) list = list.filter((s) => s.isInactive);
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter((s) => s.display_name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q));
  }
  const sorted = sortStudents(list);

  const controls = el("div", { class: "admin-controls" }, [
    el("input", {
      id: "admin-search-input",
      class: "reflect-input admin-search-input",
      type: "text",
      placeholder: "Tìm theo tên hoặc tên đăng nhập...",
      value: state.search,
      oninput: (e) => { state.search = e.target.value; render(); },
    }),
    el("button", { class: "help-link", onclick: () => exportCSV(sorted) }, [`⬇ Xuất CSV (${sorted.length})`]),
  ]);
  wrap.appendChild(controls);

  // Đăng ký hàng loạt tài khoản Google cho Bài 9. Học viên nào đã đăng ký thì câu 9.16 bắt buộc
  // đăng nhập GWS CLI đúng email đó — chống việc mượn máy/mượn tài khoản của bạn khác.
  const gwsDone = enriched.filter((s) => s.gws_email).length;
  const importPanel = el("details", { class: "admin-import-panel" }, [
    el("summary", {}, [`🔐 Tài khoản Google cho Bài 9 — đã đăng ký ${gwsDone}/${enriched.length} học viên`]),
    el("p", { class: "admin-student-username" }, [
      "Mỗi dòng một học viên: tên đăng nhập (hoặc tên hiển thị / email Lark), rồi dấu phẩy và Gmail. Ví dụ: nguyenvana, a.nguyen@gmail.com",
    ]),
    el("textarea", {
      id: "admin-gws-import-text", class: "reflect-input", rows: "6",
      placeholder: "nguyenvana, a.nguyen@gmail.com\nTrần Thị B; b.tran@gmail.com",
    }),
    el("button", { class: "admin-reset-btn", onclick: () => handleImportGwsEmails() }, ["Nhập danh sách"]),
  ]);
  wrap.appendChild(importPanel);

  const table = el("table", { class: "admin-table" });
  const thead = el("thead", {}, [
    el("tr", {}, [
      sortableTh("Học viên", "name"),
      sortableTh("Ngày tham gia", "created_at"),
      el("th", {}, ["Trạng thái"]),
      el("th", {}, ["Đang ở câu"]),
      sortableTh("Tiến độ", "progress"),
      sortableTh("Điểm", "points"),
      sortableTh("Hoạt động gần nhất", "last_activity"),
      el("th", {}, [""]),
    ]),
  ]);
  table.appendChild(thead);

  const tbody = el("tbody");
  sorted.forEach((s) => {
    const pct = studentProgressPct(s);
    const currentQ = s.currentCode ? QUESTION_INDEX[s.currentCode] : null;
    const row = el("tr", {}, [
      el("td", {}, [
        el("div", { class: "admin-student-cell" }, [
          renderAdminAvatar(s),
          el("div", {}, [
            el("div", { class: "admin-student-name" }, [
              s.display_name,
              s.approved ? null : el("span", { class: "admin-pending-badge" }, ["Chờ duyệt"]),
              s.tai_khoan_test ? el("span", { class: "admin-test-badge" }, ["Kiểm thử"]) : null,
            ]),
            el("div", { class: "admin-student-username" }, ["@" + s.username]),
          ]),
        ]),
      ]),
      el("td", {}, [fmtDate(s.created_at)]),
      el("td", {}, [el("span", { class: "admin-status-badge " + s.status }, [STATUS_LABEL[s.status]])]),
      el("td", {}, [
        s.status === "completed"
          ? el("span", { class: "admin-current-q-done" }, ["🎉 Đã hoàn thành"])
          : currentQ
          ? el("div", { class: "admin-current-q" }, [
              el("div", { class: "admin-current-q-pos" }, [`Câu ${currentQ.position}/${TOTAL_QUESTIONS}`]),
              el("div", { class: "admin-current-q-title" }, [currentQ.title]),
              s.furthestCode && QUESTION_INDEX[s.furthestCode]
                ? el("div", { class: "admin-current-q-gap" }, [
                    `⚠ đã tới câu ${QUESTION_INDEX[s.furthestCode].position} · còn ${s.gaps} câu chưa ghi nhận`,
                  ])
                : null,
              s.gaps > 0
                ? el(
                    "button",
                    { class: "help-link", onclick: () => handleGrantGaps(s.id, s.display_name, s.gapCodes) },
                    [`✓ Công nhận ${s.gaps} câu bị hổng`]
                  )
                : null,
            ])
          : "—",
      ]),
      el("td", {}, [
        el("div", { class: "admin-progress-bar" }, [el("div", { class: "admin-progress-fill", style: `width:${pct}%` })]),
        el("div", { class: "admin-progress-text" }, [`${s.done_count}/${TOTAL_QUESTIONS} câu (${pct}%)`]),
      ]),
      el("td", {}, [String(s.total_points) + " / " + TOTAL_POINTS]),
      el("td", {}, [
        fmtDate(s.last_activity),
        s.isInactive ? el("span", { class: "admin-inactive-flag" }, [" ⚠"]) : null,
      ]),
      el("td", {}, [
        s.approved
          ? el("button", { class: "admin-approve-btn unapprove", onclick: () => handleApprove(s.id, 0) }, ["Bỏ duyệt"])
          : el("button", { class: "admin-approve-btn", onclick: () => handleApprove(s.id, 1) }, ["✓ Duyệt"]),
        el("button", { class: "help-link", onclick: () => openStudent(s.id) }, ["Xem chi tiết →"]),
      ]),
    ]);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  if (sorted.length === 0) {
    wrap.appendChild(el("p", { class: "admin-empty" }, ["Không có học viên nào khớp bộ lọc hiện tại."]));
  } else {
    wrap.appendChild(el("div", { class: "admin-table-wrap" }, [table]));
  }

  return wrap;
}

function criterionStateClass(sub) {
  if (!sub) return "wait";
  return sub.is_valid ? "pass" : "fail";
}

function reflectStateClass(refl) {
  if (!refl || !refl.ai_graded) return "wait";
  return refl.is_valid ? "pass" : "fail";
}

function renderCriterionValue(userId, sub) {
  if (!sub) return el("span", { class: "text-faint" }, ["Chưa nộp"]);
  if (sub.value_type === "image" && sub.file_path) {
    return el("a", { href: `/api/admin/uploads/${sub.file_path}`, target: "_blank" }, [
      el("img", { src: `/api/admin/uploads/${sub.file_path}`, class: "admin-thumb" }),
    ]);
  }
  if (sub.value_type === "url" && sub.value_text) {
    return el("a", { href: sub.value_text, target: "_blank", class: "admin-link" }, [sub.value_text]);
  }
  return el("span", {}, [sub.value_text || "—"]);
}

function renderStudentDetail() {
  const box = el("div", { class: "admin-detail" });
  box.appendChild(el("button", { class: "help-link", onclick: closeStudent }, ["← Quay lại danh sách"]));

  if (state.detailLoading || !state.detail) {
    box.appendChild(el("p", {}, ["Đang tải..."]));
    return box;
  }

  const { user, statuses, submissions } = state.detail;
  const statusByCode = {};
  statuses.forEach((s) => (statusByCode[s.question_code] = s));
  const subsByCode = {};
  submissions.forEach((s) => {
    subsByCode[s.question_code] = subsByCode[s.question_code] || {};
    subsByCode[s.question_code][s.criterion_key] = s;
  });
  const reflectByCode = {};
  (state.detail.reflects || []).forEach((r) => (reflectByCode[r.question_code] = r));
  const aiBadge = (aiGraded) =>
    el("span", { class: "admin-ai-badge " + (aiGraded ? "on" : "off") }, [aiGraded ? "AI đã chấm" : "chưa AI chấm"]);

  box.appendChild(
    el("div", { class: "admin-student-cell admin-detail-head" }, [
      renderAdminAvatar(user, "admin-detail-avatar"),
      el("div", {}, [
        el("h2", {}, [
          user.display_name,
          user.approved ? null : el("span", { class: "admin-pending-badge" }, ["Chờ duyệt"]),
          user.is_teacher ? el("span", { class: "admin-teacher-badge" }, ["Giáo viên"]) : null,
          user.tai_khoan_test ? el("span", { class: "admin-test-badge" }, ["Tài khoản kiểm thử"]) : null,
        ]),
        el("p", { class: "admin-student-username" }, ["@" + user.username + " · Tham gia " + fmtDate(user.created_at)]),
        user.tenant_key ? el("p", { class: "admin-tenant-key" }, ["Mã tổ chức (tenant_key): " + user.tenant_key]) : null,
        el("div", { class: "admin-detail-actions" }, [
          user.approved
            ? el("button", { class: "admin-approve-btn unapprove", onclick: () => handleApprove(user.id, 0) }, ["Bỏ duyệt"])
            : el("button", { class: "admin-approve-btn", onclick: () => handleApprove(user.id, 1) }, ["✓ Duyệt học viên này"]),
          user.is_teacher
            ? el("button", { class: "admin-teacher-btn unteacher", onclick: () => handleTeacher(user.id, 0) }, ["Bỏ quyền giáo viên"])
            : el("button", { class: "admin-teacher-btn", onclick: () => handleTeacher(user.id, 1) }, ["★ Đặt làm giáo viên"]),
          // Loại khỏi danh sách bạn cùng lớp của câu 9.20/9.21/9.22 mà vẫn giữ nguyên quyền học.
          user.tai_khoan_test
            ? el("button", { class: "admin-teacher-btn unteacher", onclick: () => handleTaiKhoanTest(user.id, 0) }, ["Bỏ nhãn kiểm thử"])
            : el("button", { class: "admin-teacher-btn", onclick: () => handleTaiKhoanTest(user.id, 1) }, ["🧪 Đánh dấu tài khoản kiểm thử"]),
        ]),
        el("div", { class: "admin-reset-row" }, [
          el("span", { class: "admin-reset-label" }, ["Tài khoản Google (Bài 9)"]),
          el("input", {
            id: "admin-gws-email-input", class: "reflect-input admin-reset-input", type: "text",
            placeholder: "chua-dang-ky@gmail.com", value: user.gws_email || "",
          }),
          el("button", { class: "admin-reset-btn", onclick: () => handleSetGwsEmail(user.id) }, ["Lưu"]),
          el("span", { class: "admin-reset-label" }, [
            user.gws_email ? "Đã khoá — câu 9.16 bắt buộc đúng email này." : "Chưa khoá — 9.16 sẽ tự khoá tài khoản đăng nhập đầu tiên.",
          ]),
        ]),
        el("div", { class: "admin-reset-row" }, [
          el("span", { class: "admin-reset-label" }, ["Xoá tiến độ từ câu"]),
          el("input", { id: "admin-reset-code-input", class: "reflect-input admin-reset-input", type: "text", placeholder: "6.5" }),
          el("button", { class: "admin-reset-btn", onclick: () => handleResetFromCode(user.id) }, ["Xoá về trước câu này"]),
        ]),
      ]),
    ])
  );

  const isQuestionDone = (st) => st && (st.status === "done" || st.status === "correct");

  (LESSONS || []).forEach((lesson) => {
    const doneInLesson = lesson.questions.filter((q) => isQuestionDone(statusByCode[q.code])).length;
    const lessonCard = el("div", { class: "admin-lesson-card" });
    lessonCard.appendChild(
      el("div", { class: "admin-lesson-title" }, [`${lesson.title} — ${doneInLesson}/${lesson.questions.length} câu`])
    );

    const list = el("ul", { class: "admin-question-list" });
    lesson.questions.forEach((q) => {
      const st = statusByCode[q.code];
      const done = isQuestionDone(st);
      const refl = reflectByCode[q.code];
      const qItem = el("li", { class: "admin-question-item" }, [
        el("span", { class: done ? "admin-q-icon done" : "admin-q-icon" }, [done ? "✔" : "○"]),
        el("span", { class: "admin-q-title" }, [q.title]),
        q.type === "reflect" && refl ? aiBadge(refl.ai_graded) : null,
        el("span", { class: "admin-q-points" }, [done ? `+${st.awarded_points}đ` : `${q.points}đ`]),
      ]);
      list.appendChild(qItem);

      if (q.type === "reflect" && refl) {
        const cls = reflectStateClass(refl);
        const verdictLabel = !refl.ai_graded ? "Chờ AI chấm" : refl.is_valid ? "AI: Đạt" : "AI: Không đạt";
        const row = el("li", { class: "admin-criterion-row " + cls }, [
          el("span", { class: "admin-criterion-label" }, [verdictLabel]),
        ]);
        if (refl.ai_graded && !refl.is_valid && refl.reason) {
          row.appendChild(el("span", { class: "admin-criterion-reason" }, [" (" + refl.reason + ")"]));
        }
        list.appendChild(row);
      }

      if (q.type === "assignment" && q.criteria) {
        const critList = el("ul", { class: "admin-criteria-list" });
        q.criteria.forEach((c) => {
          const sub = subsByCode[q.code] && subsByCode[q.code][c.key];
          const cls = criterionStateClass(sub);
          const row = el("li", { class: "admin-criterion-row " + cls }, [
            el("span", { class: "admin-criterion-label" }, [c.label + ":"]),
            renderCriterionValue(user.id, sub),
            sub ? aiBadge(sub.ai_graded) : null,
          ]);
          if (sub && !sub.is_valid && sub.reason) {
            row.appendChild(el("span", { class: "admin-criterion-reason" }, [" (" + sub.reason + ")"]));
          }
          critList.appendChild(row);
        });
        list.appendChild(el("li", {}, [critList]));
      }
    });
    lessonCard.appendChild(list);
    box.appendChild(lessonCard);
  });

  return box;
}

function render() {
  const root = document.getElementById("admin-app");
  const active = document.activeElement;
  const wasSearchFocused = active && active.id === "admin-search-input";
  const selStart = wasSearchFocused ? active.selectionStart : null;
  const selEnd = wasSearchFocused ? active.selectionEnd : null;

  root.innerHTML = "";
  if (state.loading) {
    root.appendChild(el("p", { style: "padding:40px;text-align:center" }, ["Đang tải..."]));
    return;
  }
  root.appendChild(state.admin ? renderDashboard() : renderLogin());

  if (wasSearchFocused) {
    const input = document.getElementById("admin-search-input");
    if (input) {
      input.focus();
      input.setSelectionRange(selStart, selEnd);
    }
  }
}

document.addEventListener("DOMContentLoaded", boot);
