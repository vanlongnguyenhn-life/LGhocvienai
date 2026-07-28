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
  });
});

function studentLearningState(s) {
  const doneCodes = new Set((s.done_codes || "").split(",").filter(Boolean));
  if (doneCodes.size === 0) {
    return { status: "not_started", currentCode: ALL_QUESTIONS_ORDERED[0] || null };
  }
  if (doneCodes.size >= TOTAL_QUESTIONS) {
    return { status: "completed", currentCode: null };
  }
  const currentCode = ALL_QUESTIONS_ORDERED.find((code) => !doneCodes.has(code));
  return { status: "in_progress", currentCode: currentCode || null };
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
};

function fmtDate(s) {
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 16);
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
  } catch (e) {
    state.admin = null;
  }
  state.loading = false;
  render();
}

async function loadStudents() {
  state.students = await ADMIN_API.students();
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

async function handleRegrade() {
  state.regrading = true; state.regradeMsg = "Đang chấm bằng AI..."; render();
  try {
    let guard = 0, totalDone = 0;
    while (guard++ < 200) {
      const r = await ADMIN_API.regrade(15);
      totalDone += r.regraded;
      state.regradeMsg = `Đã chấm ${totalDone} câu, còn lại ${r.remaining}...`;
      render();
      if (r.remaining <= 0 || r.regraded === 0) break;
    }
    state.gradingStats = await ADMIN_API.gradingStats();
    state.regradeMsg = "✓ Xong. Đã chấm lại " + totalDone + " câu bằng AI.";
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
  return TOTAL_QUESTIONS ? Math.round((s.done_count / TOTAL_QUESTIONS) * 100) : 0;
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
  wrap.appendChild(renderGradingPanel());

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

  box.appendChild(
    el("div", { class: "admin-student-cell admin-detail-head" }, [
      renderAdminAvatar(user, "admin-detail-avatar"),
      el("div", {}, [
        el("h2", {}, [
          user.display_name,
          user.approved ? null : el("span", { class: "admin-pending-badge" }, ["Chờ duyệt"]),
          user.is_teacher ? el("span", { class: "admin-teacher-badge" }, ["Giáo viên"]) : null,
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
      const qItem = el("li", { class: "admin-question-item" }, [
        el("span", { class: done ? "admin-q-icon done" : "admin-q-icon" }, [done ? "✔" : "○"]),
        el("span", { class: "admin-q-title" }, [q.title]),
        el("span", { class: "admin-q-points" }, [done ? `+${st.awarded_points}đ` : `${q.points}đ`]),
      ]);
      list.appendChild(qItem);

      if (q.type === "assignment" && q.criteria) {
        const critList = el("ul", { class: "admin-criteria-list" });
        q.criteria.forEach((c) => {
          const sub = subsByCode[q.code] && subsByCode[q.code][c.key];
          const cls = criterionStateClass(sub);
          const row = el("li", { class: "admin-criterion-row " + cls }, [
            el("span", { class: "admin-criterion-label" }, [c.label + ":"]),
            renderCriterionValue(user.id, sub),
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
