// ===== App state & rendering =====

const STORAGE_KEY = "ags_course_state_v1";

const API = {
  async request(path, options = {}) {
    const res = await fetch(path, { credentials: "include", ...options });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      throw new Error((data && data.detail) || "Có lỗi xảy ra, thử lại nhé");
    }
    return data;
  },
  me: () => API.request("/api/me"),
  larkStatus: () => API.request("/api/auth/lark/status"),
  register: (fd) => API.request("/api/register", { method: "POST", body: fd }),
  login: (fd) => API.request("/api/login", { method: "POST", body: fd }),
  logout: () => API.request("/api/logout", { method: "POST" }),
  progress: () => API.request("/api/progress"),
  submitCriterion: (fd) => API.request("/api/submit-criterion", { method: "POST", body: fd }),
  submitQuestion: (fd) => API.request("/api/submit-question", { method: "POST", body: fd }),
  gradeReflect: (fd) => API.request("/api/grade-reflect", { method: "POST", body: fd }),
  verifyTokenScope: (fd) => API.request("/api/pi-lab/token/verify-scope", { method: "POST", body: fd }),
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.expandedQuestions) parsed.expandedQuestions = {};
      if (!parsed.currentUser) parsed.currentUser = null;
      if (!parsed.lettersRead) parsed.lettersRead = {};
      if (parsed.openLetterKey === undefined) parsed.openLetterKey = null;
      parsed.showCourseContent = false;
      parsed.userMenuOpen = false;
      delete parsed.lettersExpanded;
      return parsed;
    }
  } catch (e) {}
  return {
    loggedIn: false,
    view: "login", // login | home | course
    currentUser: null, // { id, username, display_name } từ server
    activeModule: "nguyen-ly",
    lettersCollapsed: false,
    lettersRead: {},
    openLetterKey: null,
    showCourseContent: false,
    userMenuOpen: false,
    expandedLesson: null,
    expandedQuestions: {}, // code -> true nếu đang mở (cho phép mở nhiều câu cùng lúc)
    answers: {}, // code -> { selected:[idx], text:"", status: "pending"|"correct"|"wrong"|"done" }
  };
}

let state = loadState();

function saveState() {
  // strip large image dataUrls before persisting (avoid localStorage quota issues)
  const replacer = (key, value) => (key === "dataUrl" ? undefined : value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state, replacer));
}

// ===== Chiều rộng trang học (kéo để tăng/giảm) =====
const SHELL_WIDTH_KEY = "ags_shell_width";
const SHELL_WIDTH_MIN = 360;
const SHELL_WIDTH_MAX = 1000;

function getShellWidth() {
  const saved = parseInt(localStorage.getItem(SHELL_WIDTH_KEY), 10);
  if (isNaN(saved)) return 560;
  return Math.min(SHELL_WIDTH_MAX, Math.max(SHELL_WIDTH_MIN, saved));
}

function setShellWidth(px) {
  const clamped = Math.min(SHELL_WIDTH_MAX, Math.max(SHELL_WIDTH_MIN, px));
  document.documentElement.style.setProperty("--shell-width", clamped + "px");
  localStorage.setItem(SHELL_WIDTH_KEY, String(clamped));
}

let currentResizeHandleEl = null;

function positionResizeHandle() {
  if (!currentResizeHandleEl) return;
  const width = getShellWidth();
  currentResizeHandleEl.style.left = window.innerWidth / 2 + width / 2 + "px";
}

window.addEventListener("resize", positionResizeHandle);

function renderResizeHandle() {
  const handle = el("div", { class: "shell-resize-handle", title: "Kéo để tăng/giảm chiều rộng trang" });
  handle.innerHTML =
    '<svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden="true">' +
    '<rect x="0" y="0" width="2.5" height="16" rx="1.25" fill="#007aff"/>' +
    '<rect x="5.75" y="0" width="2.5" height="16" rx="1.25" fill="#007aff"/>' +
    '<rect x="11.5" y="0" width="2.5" height="16" rx="1.25" fill="#007aff"/>' +
    "</svg>";

  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startWidth = getShellWidth();
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    setShellWidth(startWidth + dx * 2);
    positionResizeHandle();
  });
  handle.addEventListener("pointerup", (e) => {
    dragging = false;
    handle.releasePointerCapture(e.pointerId);
  });

  currentResizeHandleEl = handle;
  positionResizeHandle();
  return handle;
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (state.expandedLesson) { state.expandedLesson = null; render(); }
  if (state.openLetterKey) { state.openLetterKey = null; render(); }
});

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue; // bỏ qua thuộc tính null/undefined/false (ví dụ disabled: cond ? "true" : null)
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null || c === false) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

function renderBrandLogo(className, src) {
  const wrap = el("div", { class: "brand-logo " + (className || "") });
  wrap.appendChild(el("img", { class: "brand-logo-img", src: src || "assets/logo.png", alt: "Life Group" }));
  return wrap;
}

function renderUserAvatar(user, className) {
  const cls = "user-avatar " + (className || "");
  if (user && user.avatar_url) {
    return el("img", { class: cls, src: user.avatar_url, alt: user.display_name || "", referrerpolicy: "no-referrer" });
  }
  const initial = ((user && user.display_name) || "?").trim().charAt(0).toUpperCase() || "?";
  return el("div", { class: cls + " user-avatar-fallback" }, initial);
}

function renderUserMenu(className) {
  const u = state.currentUser;
  if (!u) return el("span", {});
  const wrap = el("div", { class: "user-menu " + (className || "") });
  const chip = el(
    "div",
    {
      class: "user-menu-chip",
      onclick: (e) => { e.stopPropagation(); state.userMenuOpen = !state.userMenuOpen; render(); },
    },
    [
      el("span", { class: "user-menu-name" }, u.display_name || "học viên"),
      renderUserAvatar(u, "user-menu-avatar"),
    ]
  );
  wrap.appendChild(chip);
  if (state.userMenuOpen) {
    wrap.appendChild(
      el("div", { class: "user-menu-backdrop", onclick: () => { state.userMenuOpen = false; render(); } })
    );
    wrap.appendChild(
      el("div", { class: "user-menu-pop" }, [
        el("button", { class: "user-menu-logout", onclick: handleLogout }, "⎋ Đăng xuất"),
      ])
    );
  }
  return wrap;
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 1800);
}

function renderCopyPromptBox(text) {
  const box = el("div", { class: "copy-prompt-box" });
  const textEl = el("div", { class: "copy-prompt-text" }, text);
  const isLong = text.length > 120;
  if (isLong) textEl.classList.add("clamped");
  box.appendChild(textEl);

  const actions = el("div", { class: "copy-prompt-actions" });
  actions.appendChild(
    el(
      "button",
      {
        class: "copy-btn",
        onclick: () => {
          navigator.clipboard
            .writeText(text)
            .then(() => showToast("Đã copy"))
            .catch(() => showToast("Không copy được, hãy tự bôi đen và copy"));
        },
      },
      "📋 Copy"
    )
  );
  if (isLong) {
    const toggleBtn = el("button", { class: "see-more-btn" }, "Xem thêm");
    toggleBtn.addEventListener("click", () => {
      const stillClamped = textEl.classList.toggle("clamped");
      toggleBtn.textContent = stillClamped ? "Xem thêm" : "Thu gọn";
    });
    actions.appendChild(toggleBtn);
  }
  box.appendChild(actions);
  return box;
}

function totalPoints() {
  let sum = 0;
  Object.values(state.answers).forEach((a) => {
    if (a.status === "correct" || a.status === "done") sum += a.awardedPoints || 0;
  });
  return sum;
}

function countAnswered() {
  return Object.values(state.answers).filter((a) => a.status === "correct" || a.status === "done").length;
}

function totalQuestions() {
  return LESSONS.reduce((s, l) => s + l.questions.length, 0);
}

// ===================== RENDER ROOT =====================
function render() {
  const scrollY = window.scrollY;
  const prevSheetBody = document.querySelector(".sheet-body");
  const sheetScrollTop = prevSheetBody ? prevSheetBody.scrollTop : 0;

  const root = document.getElementById("app");
  root.innerHTML = "";
  if (!state.loggedIn || state.view === "login") {
    root.appendChild(renderLogin());
  } else if (state.currentUser && !state.currentUser.approved) {
    root.appendChild(renderPending());
  } else if (state.view === "home") {
    root.appendChild(renderShell(renderHome()));
  } else {
    root.appendChild(renderShell(renderCourse()));
  }
  saveState();
  window.scrollTo(0, scrollY);

  const nextSheetBody = document.querySelector(".sheet-body");
  if (nextSheetBody) nextSheetBody.scrollTop = sheetScrollTop;
}

function renderShell(innerNode) {
  const shell = el("div", { class: "app-shell" });
  shell.appendChild(renderResizeHandle());
  shell.appendChild(innerNode);
  return shell;
}

// ===================== LOGIN VIEW =====================
let loginMode = "login"; // "login" | "register" — UI-only, không cần lưu persist
let authError = "";
let authBusy = false;
let larkConfigured = false;

function renderLogin() {
  const view = el("div", { class: "login-view" });
  view.appendChild(renderBrandLogo("login-brand-logo"));
  view.appendChild(
    el("h2", { class: "login-title" }, "Học Viện AI Life Group")
  );
  view.appendChild(
    el("p", { class: "login-tagline" }, [
      el("span", {}, "Học từ nguyên lý"),
      el("span", { class: "login-tagline-dot" }, "•"),
      el("em", {}, "Hiểu từ gốc rễ"),
    ])
  );

  const card = el("div", { class: "login-card" });
  card.appendChild(el("h2", {}, "Đăng nhập"));
  card.appendChild(
    el("p", { class: "login-sub" }, "Dùng tài khoản Lark của bạn để vào lớp học.")
  );

  if (authError) {
    card.appendChild(el("div", { class: "auth-error" }, authError));
  }

  if (larkConfigured) {
    card.appendChild(
      el(
        "a",
        { class: "google-btn lark-btn", href: "/api/auth/lark/login" },
        [el("span", { class: "g-text" }, [el("div", { class: "g-name" }, "Đăng nhập bằng Lark")])]
      )
    );
  } else {
    card.appendChild(
      el("p", { class: "auth-error" }, "Đăng nhập Lark chưa được cấu hình trên server. Vui lòng liên hệ giáo viên.")
    );
  }

  view.appendChild(card);
  return view;
}

async function handleAuthSubmit(mode, usernameRaw, displayNameRaw, password) {
  const username = (usernameRaw || "").trim();
  if (!username || !password) {
    authError = "Nhập đầy đủ tên đăng nhập và mật khẩu.";
    render();
    return;
  }
  authBusy = true;
  authError = "";
  render();

  const fd = new FormData();
  fd.append("username", username);
  fd.append("password", password);

  try {
    let user;
    if (mode === "register") {
      fd.append("display_name", (displayNameRaw || username).trim());
      user = await API.register(fd);
    } else {
      user = await API.login(fd);
    }
    state.currentUser = user;
    state.loggedIn = true;
    state.view = "home";
    authBusy = false;
    await hydrateProgress();
    render();
    showToast("Đăng nhập thành công");
  } catch (err) {
    authBusy = false;
    authError = err.message;
    render();
  }
}

async function hydrateProgress() {
  try {
    const data = await API.progress();
    Object.entries(data.answers).forEach(([code, info]) => {
      const a = getAnswer(code);
      a.status = info.status;
      a.awardedPoints = info.awardedPoints;
      if (info.answerData) {
        try {
          Object.assign(a, JSON.parse(info.answerData));
        } catch (e) {}
      }
    });
    Object.entries(data.submissions).forEach(([code, criteria]) => {
      const a = getAnswer(code);
      Object.entries(criteria).forEach(([key, sub]) => {
        if (sub.valueType === "image") {
          a.proof.image = { name: sub.valueText };
        } else {
          a.proof[key] = sub.valueText || "";
        }
        a.proofMeta[key] = { valid: sub.valid, reason: sub.reason };
      });
    });
  } catch (e) {
    // chưa đăng nhập hoặc lỗi mạng — giữ nguyên state cục bộ
  }
}

async function handleLogout() {
  try {
    await API.logout();
  } catch (e) {}
  state.currentUser = null;
  state.loggedIn = false;
  state.view = "login";
  state.answers = {};
  render();
  showToast("Đã đăng xuất");
}

// ===================== PENDING (chờ duyệt) VIEW =====================
function renderPending() {
  const view = el("div", { class: "login-view" });
  view.appendChild(renderBrandLogo("login-brand-logo"));
  view.appendChild(el("h2", { class: "login-title" }, "Học Viện AI Life Group"));

  const u = state.currentUser;
  const card = el("div", { class: "login-card" });
  card.appendChild(renderUserAvatar(u, "pending-avatar"));
  card.appendChild(el("h3", { class: "pending-name" }, (u && u.display_name) || "Học viên"));
  card.appendChild(
    el("p", { class: "pending-msg" }, "Tài khoản của bạn đang chờ giáo viên duyệt. Vui lòng quay lại sau khi được duyệt nhé.")
  );
  card.appendChild(
    el(
      "button",
      { class: "google-btn lark-btn", onclick: handleLogout },
      [el("span", { class: "g-text" }, [el("div", { class: "g-name" }, "Đăng xuất")])]
    )
  );
  view.appendChild(card);
  return view;
}

// ===================== HOME VIEW =====================
function renderHome() {
  const wrap = el("div", {});
  wrap.appendChild(
    el("div", { class: "home-header" }, [
      renderUserMenu("home-user-menu"),
      renderBrandLogo("home-brand-logo"),
      el("h2", { class: "home-title" }, "Học Viện AI Life Group"),
    ])
  );

  wrap.appendChild(el("div", { class: "section-title" }, "Khoá học của bạn"));

  const card = el("div", { class: "course-card" });
  card.appendChild(
    el("div", { class: "title-row" }, [
      el("h3", {}, COURSE.name),
      el(
        "button",
        {
          class: "cta-link cta-link-btn",
          onclick: () => { state.showCourseContent = true; render(); },
        },
        "Nội dung khóa học"
      ),
    ])
  );
  card.appendChild(el("p", { class: "desc" }, COURSE.tagline));
  card.appendChild(
    el("button", { class: "enter-btn", onclick: () => { state.view = "course"; render(); } }, "Vào học")
  );
  wrap.appendChild(card);

  if (state.showCourseContent) {
    wrap.appendChild(renderCourseContentSheet());
  }

  return wrap;
}

function closeCourseContent() {
  state.showCourseContent = false;
  render();
}

function renderCourseContentSheet() {
  const header = el("div", { class: "sheet-header" }, [
    el("img", { class: "letter-avatar", src: "assets/logo.png", alt: "Life Group" }),
    el("h4", {}, COURSE_CONTENT.title),
  ]);
  const body = el("div", { class: "sheet-body" });
  COURSE_CONTENT.body.forEach((p) => body.appendChild(renderLetterBody(p)));
  return renderSheet(header, body, closeCourseContent);
}

// ===================== COURSE / WEEK VIEW =====================
function renderCourse() {
  const wrap = el("div", {});
  wrap.appendChild(
    el("div", { class: "topbar" }, [
      el("button", { class: "icon-btn", onclick: () => { state.view = "home"; render(); } }, "‹"),
      renderBrandLogo("topbar-brand-logo"),
      renderUserMenu("topbar-user-menu"),
    ])
  );

  // module tabs
  const tabsWrap = el("div", { class: "module-tabs" });
  MODULES.forEach((m) => {
    const active = state.activeModule === m.id;
    const tab = el(
      "div",
      {
        class: "module-tab" + (active ? " active" : "") + (!m.unlocked ? " locked" : ""),
        onclick: () => {
          if (!m.unlocked) {
            showToast("Module này sẽ mở khoá sau khi hoàn thành Nguyên lý Agent");
            return;
          }
          state.activeModule = m.id;
          render();
        },
      },
      [el("img", { class: "sprout", src: "assets/logo-icon.png", alt: "" }), m.label]
    );
    tabsWrap.appendChild(tab);
  });
  wrap.appendChild(tabsWrap);

  const hasContent = LESSONS.some((l) => (l.module || "nguyen-ly") === state.activeModule);
  if (!hasContent) {
    wrap.appendChild(
      el("div", { class: "letter-card" }, [
        el("h4", {}, "Sắp mở khoá"),
        el("p", {}, "Nội dung phần này chưa được công bố. Quay lại sau nhé."),
      ])
    );
    return wrap;
  }

  const moduleLessons = LESSONS.filter((l) => (l.module || "nguyen-ly") === state.activeModule);

  // collapse toggle
  wrap.appendChild(
    el(
      "button",
      {
        class: "collapse-toggle",
        onclick: () => { state.lettersCollapsed = !state.lettersCollapsed; render(); },
      },
      (state.lettersCollapsed ? `▸ Xem ${moduleLessons.length} bài đã học` : `▾ Thu gọn ${moduleLessons.length} bài đã học`)
    )
  );

  if (!state.lettersCollapsed) {
    // opening letter (chỉ hiện ở tab Nguyên lý Agent)
    if (state.activeModule === "nguyen-ly") {
      wrap.appendChild(renderLetterCard(OPENING_LETTER));
    }

    // lessons
    moduleLessons.forEach((lesson, idx) => {
      let lessonLocked = idx > 0 && !isLessonDone(moduleLessons[idx - 1]);
      let lockMessage = null;
      if (idx === 0 && state.activeModule === "nguyen-ly" && !isLetterRead(OPENING_LETTER)) {
        lessonLocked = true;
        lockMessage = "Đọc lá thư ở trên và bấm \"ĐÃ ĐỌC\" để mở khoá bài này";
      }
      if (lesson.letterBefore) {
        const prevLesson = lessonById(lesson.id - 1);
        if (!prevLesson || isLessonDone(prevLesson)) {
          wrap.appendChild(renderLetterCard(lesson.letterBefore));
          if (!isLetterRead(lesson.letterBefore)) {
            lessonLocked = true;
            lockMessage = "Đọc lá thư ở trên và bấm \"ĐÃ ĐỌC\" để mở khoá bài này";
          }
        } else {
          lessonLocked = true;
        }
      }
      wrap.appendChild(renderLessonRow(lesson, lessonLocked, lockMessage));
    });
  }

  if (state.expandedLesson) {
    const openLesson = moduleLessons.find((l) => l.id === state.expandedLesson);
    if (openLesson) wrap.appendChild(renderLessonSheet(openLesson));
  }
  if (state.openLetterKey) {
    const openLetter = findLetterByKey(state.openLetterKey);
    if (openLetter) wrap.appendChild(renderLetterSheet(openLetter));
  }

  return wrap;
}

function isLetterRead(letter) {
  return !!(letter && state.lettersRead[letter.key]);
}

function markLetterRead(key) {
  state.lettersRead[key] = true;
  render();
}

function renderLetterBody(p) {
  return typeof p === "string" ? el("p", {}, p) : el("p", { class: p.emphasis ? "letter-emphasis" : "" }, p.text);
}

function renderLetterCard(letter) {
  const card = el("div", { class: "letter-card" }, [
    el("div", { class: "letter-header" }, [
      el("img", { class: "letter-avatar", src: "assets/logo.png", alt: "Life Group" }),
      el("h4", {}, letter.title),
    ]),
  ]);
  card.appendChild(el("p", { class: "letter-preview" }, renderLetterBody(letter.body[0]).textContent));
  card.appendChild(
    el(
      "button",
      {
        class: "see-more",
        onclick: () => { state.openLetterKey = letter.key; render(); },
      },
      "Xem thêm"
    )
  );
  return card;
}

function findLetterByKey(key) {
  if (OPENING_LETTER.key === key) return OPENING_LETTER;
  if (LETTER_2.key === key) return LETTER_2;
  if (LETTER_3.key === key) return LETTER_3;
  return null;
}

function closeLetterSheet() {
  state.openLetterKey = null;
  render();
}

function renderLetterSheet(letter) {
  const read = isLetterRead(letter);
  const header = el("div", { class: "sheet-header" }, [
    el("img", { class: "letter-avatar", src: "assets/logo.png", alt: "Life Group" }),
    el("h4", {}, letter.title),
  ]);
  const body = el("div", { class: "sheet-body" });
  letter.body.forEach((p) => body.appendChild(renderLetterBody(p)));
  body.appendChild(
    el(
      "button",
      {
        class: "letter-read-btn" + (read ? " done" : ""),
        disabled: read ? "true" : null,
        onclick: () => markLetterRead(letter.key),
      },
      read ? "✓ ĐÃ ĐỌC" : "ĐÃ ĐỌC"
    )
  );
  return renderSheet(header, body, closeLetterSheet);
}

function renderSheet(headerNode, bodyNode, onClose) {
  const backdrop = el("div", { class: "sheet-backdrop", onclick: onClose });
  const panel = el("div", { class: "sheet-panel", onclick: (e) => e.stopPropagation() }, [
    el("div", { class: "sheet-handle-row" }, [
      el("div", { class: "sheet-handle" }),
      el("button", { class: "sheet-close-btn", onclick: onClose }, "Đóng"),
    ]),
    headerNode,
    bodyNode,
  ]);
  return el("div", { class: "sheet-overlay" }, [backdrop, panel]);
}

function lessonProgress(lesson) {
  const done = lesson.questions.filter((q) => isQuestionDone(q.code)).length;
  return { done, total: lesson.questions.length };
}

function lessonById(id) {
  return LESSONS.find((l) => l.id === id);
}

function renderLessonRow(lesson, locked, lockMessage) {
  const msg = lockMessage || "Hoàn thành bài trước để mở khoá bài này";
  const progress = lessonProgress(lesson);

  if (locked) {
    const row = el("div", { class: "lesson-row locked" });
    row.appendChild(
      el(
        "div",
        { class: "lesson-row-header", onclick: () => showToast(msg) },
        [
          el("div", { class: "lesson-icon" }, "🔒"),
          el("div", { class: "lesson-info" }, [
            el("h4", {}, lesson.title),
            el("div", { class: "lesson-meta" }, [el("span", {}, msg)]),
          ]),
          el("span", { class: "chevron" }, "›"),
        ]
      )
    );
    return row;
  }

  const openLesson = () => { state.expandedLesson = lesson.id; render(); };

  if (lesson.id === 6) {
    const card = el("div", { class: "lesson-card" });
    card.appendChild(
      el("div", { class: "lesson-card-header", onclick: openLesson }, [
        el("div", { class: "lesson-icon" }, "📄"),
        el("h4", {}, lesson.title),
        el("span", { class: "lesson-count-badge" }, `${progress.done}/${progress.total}`),
      ])
    );

    const carousel = el("div", { class: "lesson-carousel" });
    lesson.questions.forEach((q) => {
      const done = isQuestionDone(q.code);
      const parts = q.title.split(" - ");
      const label = parts[0] || q.code;
      const preview = parts.slice(1).join(" - ") || q.prompt || "";
      carousel.appendChild(
        el(
          "div",
          { class: "lesson-mini-card" + (done ? " done" : ""), onclick: openLesson },
          [
            el("img", { class: "lesson-mini-icon", src: "assets/logo-icon.png", alt: "" }),
            el("div", { class: "lesson-mini-code" }, label),
            el("div", { class: "lesson-mini-text" }, preview),
          ]
        )
      );
    });
    card.appendChild(carousel);
    return card;
  }

  const row = el("div", { class: "lesson-row" });
  row.appendChild(
    el(
      "div",
      { class: "lesson-row-header", onclick: openLesson },
      [
        el("div", { class: "lesson-icon" }, "📄"),
        el("div", { class: "lesson-info" }, [
          el("h4", {}, lesson.title),
          el("div", { class: "lesson-meta" }, [
            el("span", { class: "trophy" }, "🏆 Top 3"),
            el("span", { class: "xp-badge" }, `+${lesson.points}`),
            el("span", {}, `${progress.done}/${progress.total}`),
          ]),
        ]),
        el("span", { class: "chevron" }, "›"),
      ]
    )
  );
  return row;
}

function closeLessonSheet() {
  state.expandedLesson = null;
  render();
}

function renderLessonSheet(lesson) {
  const header = el("div", { class: "sheet-header" }, [
    el("div", { class: "lesson-icon" }, "📄"),
    el("h4", {}, lesson.title),
  ]);
  const body = el("div", { class: "sheet-body" });
  body.appendChild(el("h3", { class: "sheet-body-title" }, lesson.title));
  if (lesson.intro) body.appendChild(el("p", { class: "lesson-intro" }, lesson.intro));
  lesson.questions.forEach((q, qIdx) => {
    const qLocked = qIdx > 0 && !isQuestionDone(lesson.questions[qIdx - 1].code);
    body.appendChild(renderQuestionCard(lesson, q, qLocked));
  });
  return renderSheet(header, body, closeLessonSheet);
}

function getAnswer(code) {
  if (!state.answers[code]) {
    state.answers[code] = { selected: [], text: "", status: "pending", awardedPoints: 0, proof: {}, proofMeta: {}, matchSelected: [] };
  }
  if (!state.answers[code].proof) state.answers[code].proof = {};
  if (!state.answers[code].proofMeta) state.answers[code].proofMeta = {};
  if (!state.answers[code].matchSelected) state.answers[code].matchSelected = [];
  return state.answers[code];
}

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // đảm bảo không vô tình xáo ra đúng thứ tự gốc (cho câu hỏi có nghĩa)
  if (n > 1 && arr.every((v, i) => v === i)) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }
  return arr;
}

function isQuestionDone(code) {
  const a = state.answers[code];
  return !!a && (a.status === "correct" || a.status === "done");
}

function isLessonDone(lesson) {
  return lesson.questions.every((q) => isQuestionDone(q.code));
}

function openQuestion(code) {
  // Mỗi bài chỉ mở 1 câu 1 lúc: đóng hết các câu khác rồi mở câu này.
  state.expandedQuestions = {};
  if (code) state.expandedQuestions[code] = true;
}

function parseYouTubeId(url) {
  const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

function renderQuestionVideo(src) {
  const wrap = el("div", { class: "q-video" });
  const ytId = parseYouTubeId(src);
  if (ytId) {
    wrap.appendChild(
      el("iframe", {
        src: `https://www.youtube.com/embed/${ytId}`,
        allow: "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
        allowfullscreen: "true",
        loading: "lazy",
      })
    );
  } else {
    const v = el("video", { class: "q-video-el", controls: "", preload: "metadata", playsinline: "" });
    v.appendChild(el("source", { src }));
    wrap.appendChild(v);
  }
  return wrap;
}

function renderQuestionCard(lesson, q, locked) {
  const a = getAnswer(q.code);
  const expanded = !locked && !!state.expandedQuestions[q.code];
  const statusClass = locked ? "locked" : a.status === "correct" || a.status === "done" ? "" : a.status === "wrong" ? "wrong" : "pending";
  const card = el("div", { class: "q-card " + statusClass });

  const statusText = locked
    ? "Hoàn thành câu trước để mở khoá"
    : a.status === "correct" || a.status === "done"
    ? "Đã xong — trả lời đúng"
    : a.status === "wrong"
    ? "Chưa đúng — thử lại nhé"
    : "Chưa làm";
  const statusTextClass = locked ? "locked" : a.status === "correct" || a.status === "done" ? "done" : a.status === "wrong" ? "wrong" : "pending";
  const dot = locked ? "🔒" : a.status === "correct" || a.status === "done" ? "✓" : a.status === "wrong" ? "!" : "";

  const header = el(
    "div",
    {
      class: "q-card-header",
      onclick: () => {
        if (locked) {
          showToast("Em hãy hoàn thành câu trước đó để mở khoá câu này");
          return;
        }
        if (expanded) delete state.expandedQuestions[q.code];
        else openQuestion(q.code);
        render();
      },
    },
    [
      el("div", { class: "q-status-dot" }, dot),
      el("div", { class: "q-title" }, [
        el("h5", {}, q.title),
        el("div", { class: "q-status-text " + statusTextClass }, statusText),
      ]),
      el("span", { class: "chevron" }, expanded ? "⌄" : "›"),
    ]
  );
  card.appendChild(header);

  if (expanded) {
    const body = el("div", { class: "q-card-body" });
    if (q.video) body.appendChild(renderQuestionVideo(q.video));
    body.appendChild(el("p", { class: "q-prompt" }, q.prompt));
    if (q.copyPrompt) body.appendChild(renderCopyPromptBox(q.copyPrompt));
    if (q.copyPromptTrailing) body.appendChild(el("p", { class: "q-prompt" }, q.copyPromptTrailing));

    if (q.type === "single" || q.type === "multi") {
      body.appendChild(renderChoiceGrid(q, a));
    } else if (q.type === "match") {
      body.appendChild(renderMatchGrid(q, a));
    } else if (q.type === "assignment") {
      body.appendChild(renderAssignment(q, a));
    } else if (q.type === "code") {
      body.appendChild(renderCodeInput(q, a));
    } else if (q.type === "token_scope_check") {
      body.appendChild(renderTokenScopeCheck(q, a));
    } else if (q.type === "order") {
      body.appendChild(renderOrder(q, a));
    } else if (q.type === "order-tag") {
      body.appendChild(renderOrderTag(q, a));
    } else if (q.type === "tag-mark") {
      body.appendChild(renderTagMark(q, a));
    } else if (q.type === "reflect") {
      body.appendChild(renderReflectInput(q, a));
    }

    const actions = el("div", { class: "q-actions" }, [
      el(
        "button",
        {
          class: "submit-btn",
          onclick: () => submitAnswer(lesson, q),
        },
        ["➤ ", a.status === "correct" || a.status === "done" ? "Nộp lại" : "Nộp bài"]
      ),
      el(
        "button",
        { class: "help-link", onclick: () => showToast("Liên hệ trợ giảng qua kênh hỗ trợ trong lớp học") },
        ["🛟 Giúp"]
      ),
    ]);
    body.appendChild(actions);

    if (a.status === "correct" || a.status === "done") {
      body.appendChild(
        el("div", { class: "q-note" }, "Câu này đã hoàn thành. Nộp lại sẽ chấm theo logic hiện tại.")
      );
      body.appendChild(
        el("div", { class: "q-footer-xp" }, [el("span", { class: "trophy" }, `🏆 +${a.awardedPoints}`)])
      );
    }

    card.appendChild(body);
  }

  return card;
}

function renderChoiceGrid(q, a) {
  const pick = (idx, selected) => {
    if (q.type === "single") {
      a.selected = [idx];
    } else {
      a.selected = selected ? a.selected.filter((i) => i !== idx) : [...a.selected, idx];
    }
    render();
    // giữ câu này đang mở sau khi re-render
    openQuestion(q.code);
  };

  if (q.type === "single") {
    // dạng danh sách dọc + nút tròn — giống web tham khảo
    const list = el("div", { class: "opt-list" });
    q.options.forEach((opt, idx) => {
      const selected = a.selected.includes(idx);
      list.appendChild(
        el(
          "div",
          { class: "opt-row" + (selected ? " selected" : ""), onclick: () => pick(idx, selected) },
          [el("span", { class: "opt-radio" }, selected ? "✓" : ""), el("span", { class: "opt-row-text" }, opt)]
        )
      );
    });
    return list;
  }

  const grid = el("div", { class: "opt-grid" });
  q.options.forEach((opt, idx) => {
    const selected = a.selected.includes(idx);
    const chip = el(
      "div",
      { class: "opt-chip" + (selected ? " selected" : ""), onclick: () => pick(idx, selected) },
      opt
    );
    grid.appendChild(chip);
  });
  return grid;
}

function renderMatchGrid(q, a) {
  const wrap = el("div", { class: "match-grid" });
  q.leftItems.forEach((left, i) => {
    const row = el("div", { class: "match-row" });
    row.appendChild(el("div", { class: "match-left" }, left));
    const select = el("select", { class: "match-select" });
    select.appendChild(el("option", { value: "-1" }, "— Chọn —"));
    q.rightOptions.forEach((opt, ri) => {
      const optionEl = el("option", { value: String(ri) }, opt);
      select.appendChild(optionEl);
    });
    select.value = a.matchSelected[i] != null ? String(a.matchSelected[i]) : "-1";
    select.addEventListener("change", (e) => {
      a.matchSelected[i] = Number(e.target.value);
      saveState();
    });
    row.appendChild(select);
    wrap.appendChild(row);
  });
  return wrap;
}

function renderOrder(q, a) {
  if (!a.orderState || a.orderState.length !== q.items.length) {
    a.orderState = shuffledIndices(q.items.length);
    saveState();
  }
  const wrap = el("div", { class: "order-list" });
  a.orderState.forEach((itemIdx, pos) => {
    const row = el("div", { class: "order-row" }, [
      el("span", { class: "order-num" }, String(pos + 1)),
      el("span", { class: "order-text" }, q.items[itemIdx]),
      el("div", { class: "order-arrows" }, [
        el(
          "button",
          {
            class: "order-arrow-btn",
            disabled: pos === 0 ? "true" : null,
            onclick: () => {
              if (pos === 0) return;
              [a.orderState[pos - 1], a.orderState[pos]] = [a.orderState[pos], a.orderState[pos - 1]];
              saveState();
              render();
              openQuestion(q.code);
            },
          },
          "↑"
        ),
        el(
          "button",
          {
            class: "order-arrow-btn",
            disabled: pos === a.orderState.length - 1 ? "true" : null,
            onclick: () => {
              if (pos === a.orderState.length - 1) return;
              [a.orderState[pos], a.orderState[pos + 1]] = [a.orderState[pos + 1], a.orderState[pos]];
              saveState();
              render();
              openQuestion(q.code);
            },
          },
          "↓"
        ),
      ]),
    ]);
    wrap.appendChild(row);
  });
  return wrap;
}

function renderOrderTag(q, a) {
  if (!a.orderState || a.orderState.length !== q.items.length) {
    a.orderState = shuffledIndices(q.items.length);
    saveState();
  }
  if (!a.tagState) a.tagState = {};
  const wrap = el("div", { class: "order-list" });
  a.orderState.forEach((itemIdx, pos) => {
    const currentTag = a.tagState[itemIdx] != null ? a.tagState[itemIdx] : 0;
    const row = el("div", { class: "order-row order-row-tag" });
    row.appendChild(el("span", { class: "order-num" }, String(pos + 1)));
    row.appendChild(el("span", { class: "order-text" }, q.items[itemIdx].text));
    const tagBtn = el(
      "button",
      {
        class: "order-tag-btn",
        onclick: () => {
          a.tagState[itemIdx] = (currentTag + 1) % q.tagOptions.length;
          saveState();
          render();
          openQuestion(q.code);
        },
      },
      q.tagOptions[currentTag]
    );
    row.appendChild(tagBtn);
    row.appendChild(
      el("div", { class: "order-arrows" }, [
        el(
          "button",
          {
            class: "order-arrow-btn",
            disabled: pos === 0 ? "true" : null,
            onclick: () => {
              if (pos === 0) return;
              [a.orderState[pos - 1], a.orderState[pos]] = [a.orderState[pos], a.orderState[pos - 1]];
              saveState();
              render();
              openQuestion(q.code);
            },
          },
          "↑"
        ),
        el(
          "button",
          {
            class: "order-arrow-btn",
            disabled: pos === a.orderState.length - 1 ? "true" : null,
            onclick: () => {
              if (pos === a.orderState.length - 1) return;
              [a.orderState[pos], a.orderState[pos + 1]] = [a.orderState[pos + 1], a.orderState[pos]];
              saveState();
              render();
              openQuestion(q.code);
            },
          },
          "↓"
        ),
      ])
    );
    wrap.appendChild(row);
  });
  return wrap;
}

function renderTagMark(q, a) {
  if (!a.tagState || a.tagState.length !== q.items.length) {
    a.tagState = q.items.map(() => 0);
    saveState();
  }
  const wrap = el("div", { class: "order-list" });
  q.items.forEach((item, i) => {
    const currentTag = a.tagState[i] != null ? a.tagState[i] : 0;
    const row = el("div", { class: "order-row order-row-tag" }, [
      el("span", { class: "order-text" }, item.text),
      el(
        "button",
        {
          class: "order-tag-btn",
          onclick: () => {
            a.tagState[i] = (currentTag + 1) % q.iconOptions.length;
            saveState();
            render();
            openQuestion(q.code);
          },
        },
        q.iconOptions[currentTag]
      ),
    ]);
    wrap.appendChild(row);
  });
  return wrap;
}

function renderCodeInput(q, a) {
  const wrap = el("div", {});
  wrap.appendChild(
    el("div", { class: "secret-note" }, q.secretNote)
  );
  const input = el("input", {
    class: "reflect-input",
    type: "text",
    placeholder: "Nhập mã xác nhận...",
  });
  input.value = a.text || "";
  input.addEventListener("input", (e) => {
    a.text = e.target.value;
    saveState();
  });
  wrap.appendChild(input);
  return wrap;
}

function normalizeCode(s) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const PI_LAB_ALL_SCOPES = [
  { key: "read_achievements", label: "read_achievements — đọc thành tích học tập" },
  { key: "edit_birthdate", label: "edit_birthdate — sửa ngày tháng năm sinh" },
  { key: "read_phone", label: "read_phone — đọc số điện thoại" },
  { key: "delete_phone", label: "delete_phone — xoá số điện thoại" },
  { key: "edit_phone", label: "edit_phone — sửa số điện thoại" },
];

function renderTokenScopeCheck(q, a) {
  const wrap = el("div", {});
  wrap.appendChild(el("div", { class: "secret-note" }, q.secretNote));
  if (!a.tokenScopes) a.tokenScopes = [];
  const boxes = el("div", { class: "scope-checkboxes" });
  PI_LAB_ALL_SCOPES.forEach((s) => {
    const id = `scope-${q.code}-${s.key}`;
    const row = el("label", { class: "scope-row", for: id });
    const cb = el("input", { type: "checkbox", id });
    cb.checked = a.tokenScopes.includes(s.key);
    cb.addEventListener("change", (e) => {
      if (e.target.checked) {
        if (!a.tokenScopes.includes(s.key)) a.tokenScopes.push(s.key);
      } else {
        a.tokenScopes = a.tokenScopes.filter((k) => k !== s.key);
      }
      saveState();
    });
    row.appendChild(cb);
    row.appendChild(el("span", {}, " " + s.label));
    boxes.appendChild(row);
  });
  wrap.appendChild(boxes);
  wrap.appendChild(
    el(
      "button",
      {
        class: "submit-btn",
        style: "margin: 8px 0;",
        onclick: async () => {
          if (a.tokenScopes.length === 0) {
            showToast("Chọn ít nhất một quyền trước khi tạo token");
            return;
          }
          const fd = new FormData();
          fd.append("scopes", a.tokenScopes.join(","));
          try {
            const result = await API.request("/api/pi-lab/token/create", { method: "POST", body: fd });
            a.text = result.token;
            saveState();
            render();
            showToast("Đã tạo token, kiểm tra kỹ scope trước khi nộp bài nhé");
          } catch (err) {
            showToast(err.message);
          }
        },
      },
      "🔑 Tạo Token"
    )
  );
  const input = el("input", {
    class: "reflect-input",
    type: "text",
    placeholder: "Token vừa tạo sẽ tự hiện ở đây (dạng tdmt_...)",
  });
  input.value = a.text || "";
  input.addEventListener("input", (e) => {
    a.text = e.target.value;
    saveState();
  });
  wrap.appendChild(input);
  return wrap;
}

function renderReflectInput(q, a) {
  const wrap = el("div", {});
  const minLength = q.minLength || 20;
  const ta = el("textarea", {
    class: "reflect-input",
    placeholder: "Dán nguyên văn câu trả lời của Agent...",
  });
  ta.value = a.text || "";
  ta.addEventListener("input", (e) => {
    a.text = e.target.value;
    saveState();
  });
  wrap.appendChild(ta);
  const len = (a.text || "").trim().length;
  wrap.appendChild(
    el("div", { class: "char-count" }, `${len}/${minLength} ký tự`)
  );
  return wrap;
}

function criterionFulfilled(c, a) {
  const meta = a.proofMeta[c.key];
  return !!(meta && meta.valid === true);
}

async function submitCriterionToServer(q, c, a, { file, value } = {}) {
  const fd = new FormData();
  fd.append("question_code", q.code);
  fd.append("criterion_key", c.key);
  fd.append("value_type", c.key === "image" ? "image" : c.key === "url" ? "url" : "text");
  if (file) fd.append("file", file);
  if (value != null) fd.append("value", value);

  a.proofMeta[c.key] = { valid: null, reason: "Đang kiểm tra ở server..." };
  openQuestion(q.code);
  render();

  try {
    const res = await API.submitCriterion(fd);
    a.proofMeta[c.key] = { valid: res.valid, reason: res.reason };
  } catch (err) {
    a.proofMeta[c.key] = { valid: false, reason: err.message };
  }
  openQuestion(q.code);
  render();
}

function renderAssignment(q, a) {
  const wrap = el("div", {});

  const reqBox = el("div", { class: "assignment-box" });
  reqBox.appendChild(el("div", { class: "label" }, "Yêu cầu"));
  reqBox.appendChild(el("div", { class: "req-text" }, q.instructions));
  wrap.appendChild(reqBox);

  q.criteria.forEach((c) => {
    const meta = a.proofMeta[c.key];
    const checking = !!meta && meta.valid === null;
    const fulfilled = !!meta && meta.valid === true;
    const box = el("div", { class: "assignment-box" });
    box.appendChild(el("div", { class: "label" }, c.label + (c.optional ? " (không bắt buộc)" : "")));
    if (c.desc) box.appendChild(el("div", { class: "req-text" }, c.desc));

    if (c.key === "image") {
      box.appendChild(renderImagePicker(q, c, a));
    } else if (c.key === "url") {
      const input = el("input", {
        class: "reflect-input",
        type: "text",
        placeholder: c.placeholder || "http://localhost:xxxx",
      });
      input.value = a.proof.url || "";
      input.addEventListener("input", (e) => {
        a.proof.url = e.target.value;
        saveState();
      });
      input.addEventListener("blur", (e) => {
        const v = e.target.value.trim();
        if (v) submitCriterionToServer(q, c, a, { value: v });
      });
      box.appendChild(input);
    } else {
      const ta = el("textarea", {
        class: "reflect-input",
        placeholder: c.placeholder || "Nhập nội dung...",
      });
      ta.value = a.proof[c.key] || "";
      ta.addEventListener("input", (e) => {
        a.proof[c.key] = e.target.value;
        saveState();
      });
      ta.addEventListener("blur", (e) => {
        const v = e.target.value.trim();
        if (v) submitCriterionToServer(q, c, a, { value: v });
      });
      box.appendChild(ta);
    }

    const resultLine = el("div", { class: "criteria-list" }, [
      el("li", { class: checking ? "wait" : fulfilled ? "pass" : meta ? "fail" : "wait" }, [
        el("span", { class: "c-icon" }, checking ? "…" : fulfilled ? "✓" : meta ? "✗" : "○"),
        el("span", {}, checking ? "Đang kiểm tra ở server..." : meta ? meta.reason : "Chưa nộp"),
      ]),
    ]);
    box.appendChild(resultLine);

    wrap.appendChild(box);
  });

  return wrap;
}

function renderImagePicker(q, c, a) {
  const box = el("div", {});
  const current = a.proof.image;

  if (current && current.dataUrl) {
    const img = el("img", { class: "image-preview" });
    img.addEventListener("error", () => img.remove());
    img.src = current.dataUrl;
    box.appendChild(img);
  }

  const fileNameLine = current
    ? el("div", { class: "file-chosen" }, "📎 " + current.name)
    : null;
  if (fileNameLine) box.appendChild(fileNameLine);

  const inputId = "file-" + q.code + "-" + c.key;
  const fileInput = el("input", { type: "file", accept: "image/*", class: "file-input-hidden", id: inputId });
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      a.proof.image = { name: file.name, dataUrl: reader.result };
      submitCriterionToServer(q, c, a, { file });
    };
    reader.readAsDataURL(file);
  });

  const label = el("label", { class: "upload-btn", for: inputId }, current ? "Chọn lại ảnh khác" : "📷 Chọn ảnh minh chứng");
  box.appendChild(fileInput);
  box.appendChild(label);
  return box;
}

function sameSet(a, b) {
  return [...a].sort().join(",") === [...b].sort().join(",");
}

function buildAnswerData(q, a) {
  switch (q.type) {
    case "single":
    case "multi":
      return { selected: a.selected };
    case "match":
      return { matchSelected: a.matchSelected };
    case "order":
      return { orderState: a.orderState };
    case "order-tag":
      return { orderState: a.orderState, tagState: a.tagState };
    case "tag-mark":
      return { tagState: a.tagState };
    case "code":
    case "reflect":
      return { text: a.text };
    case "token_scope_check":
      return { text: a.text, tokenScopes: a.tokenScopes };
    default:
      return null;
  }
}

function persistQuestionStatus(q, a) {
  const fd = new FormData();
  fd.append("question_code", q.code);
  fd.append("status", a.status);
  fd.append("awarded_points", String(a.awardedPoints || 0));
  const answerData = buildAnswerData(q, a);
  if (answerData) fd.append("answer_data", JSON.stringify(answerData));
  // fire-and-forget: state cục bộ đã cập nhật để UI phản hồi ngay, server chỉ cần đồng bộ theo
  API.submitQuestion(fd).catch(() => {});
}

async function submitAnswer(lesson, q) {
  const a = getAnswer(q.code);

  if (q.type === "single" || q.type === "multi") {
    if (a.selected.length === 0) {
      showToast("Em hãy chọn ít nhất 1 đáp án trước khi nộp bài");
      return;
    }
    const correct = q.anyValid || sameSet(a.selected, q.correct);
    a.status = correct ? "correct" : "wrong";
    a.awardedPoints = correct ? q.points : 0;
    showToast(correct ? `Chính xác! +${q.points} điểm` : "Chưa đúng, Bạn xem lại nhé");
    persistQuestionStatus(q, a);
  } else if (q.type === "match") {
    if (a.matchSelected.length < q.leftItems.length || a.matchSelected.some((v) => v == null || v < 0)) {
      showToast("Em hãy nối đủ tất cả các mục trước khi nộp bài");
      return;
    }
    const correct = q.leftItems.every((_, i) => a.matchSelected[i] === q.correctMap[i]);
    a.status = correct ? "correct" : "wrong";
    a.awardedPoints = correct ? q.points : 0;
    showToast(correct ? `Chính xác! +${q.points} điểm` : "Chưa đúng, Bạn xem lại nhé");
    persistQuestionStatus(q, a);
  } else if (q.type === "assignment") {
    const missing = q.criteria.filter((c) => !c.optional && !criterionFulfilled(c, a));
    if (missing.length > 0) {
      showToast(`Còn thiếu hoặc chưa hợp lệ: ${missing.map((c) => c.label).join(", ")}`);
      return;
    }
    const fd = new FormData();
    fd.append("question_code", q.code);
    fd.append("status", "done");
    fd.append("awarded_points", String(q.points));
    try {
      await API.submitQuestion(fd);
      a.status = "done";
      a.awardedPoints = q.points;
      showToast(`Bài tập đã được chấm Đạt! +${q.points} điểm`);
    } catch (err) {
      showToast(err.message);
      return;
    }
  } else if (q.type === "code") {
    if (!a.text || a.text.trim().length === 0) {
      showToast("Em hãy nhập mã xác nhận trước khi nộp bài");
      return;
    }
    const correct = normalizeCode(a.text) === normalizeCode(q.answer);
    a.status = correct ? "correct" : "wrong";
    a.awardedPoints = correct ? q.points : 0;
    showToast(correct ? `Chính xác! +${q.points} điểm` : "Mã chưa đúng, em đọc lại mật thư nhé");
    persistQuestionStatus(q, a);
  } else if (q.type === "token_scope_check") {
    if (!a.text || a.text.trim().length === 0) {
      showToast("Em hãy dán token vừa tạo trước khi nộp bài");
      return;
    }
    showToast("Đang kiểm tra scope của token...");
    const fd = new FormData();
    fd.append("token", a.text.trim());
    fd.append("required", q.requiredScopes.join(","));
    let result;
    try {
      result = await API.verifyTokenScope(fd);
    } catch (err) {
      showToast(err.message);
      return;
    }
    a.status = result.valid ? "correct" : "wrong";
    a.awardedPoints = result.valid ? q.points : 0;
    showToast(result.valid ? `Chính xác! +${q.points} điểm` : "Token chưa đúng scope yêu cầu (thừa hoặc thiếu quyền), Bạn xem lại nhé");
    persistQuestionStatus(q, a);
  } else if (q.type === "order") {
    const correct = !!a.orderState && a.orderState.every((v, i) => v === i);
    a.status = correct ? "correct" : "wrong";
    a.awardedPoints = correct ? q.points : 0;
    showToast(correct ? `Chính xác! +${q.points} điểm` : "Chưa đúng thứ tự, Bạn xem lại nhé");
    persistQuestionStatus(q, a);
  } else if (q.type === "order-tag") {
    const orderOk = !!a.orderState && a.orderState.every((v, i) => v === i);
    const tagOk = q.items.every((item, i) => a.tagState && a.tagState[i] === item.tag);
    const correct = orderOk && tagOk;
    a.status = correct ? "correct" : "wrong";
    a.awardedPoints = correct ? q.points : 0;
    showToast(correct ? `Chính xác! +${q.points} điểm` : "Chưa đúng thứ tự hoặc nhãn, Bạn xem lại nhé");
    persistQuestionStatus(q, a);
  } else if (q.type === "tag-mark") {
    const correct = !!a.tagState && q.items.every((item, i) => a.tagState[i] === item.icon);
    a.status = correct ? "correct" : "wrong";
    a.awardedPoints = correct ? q.points : 0;
    showToast(correct ? `Chính xác! +${q.points} điểm` : "Chưa đúng, Bạn xem lại nhé");
    persistQuestionStatus(q, a);
  } else if (q.type === "reflect") {
    const minLength = q.minLength || 20;
    const text = (a.text || "").trim();
    if (text.length < minLength) {
      showToast(`Cần dán câu trả lời của Agent, tối thiểu ${minLength} ký tự`);
      return;
    }
    showToast("Đang chấm bài...");
    const fd = new FormData();
    fd.append("question_code", q.code);
    fd.append("answer", text);
    let result;
    try {
      result = await API.gradeReflect(fd);
    } catch (err) {
      showToast(err.message);
      return;
    }
    a.status = result.valid ? "done" : "wrong";
    a.awardedPoints = result.valid ? q.points : 0;
    showToast(result.valid ? `Đã chấm đạt! +${q.points} điểm` : result.reason || "Câu trả lời chưa đạt, Bạn xem lại nhé");
    persistQuestionStatus(q, a);
  } else if (q.type === "gate") {
    // Câu chặn có chủ đích — trang gốc chưa công bố nội dung thật, không thể vượt qua
    showToast("Nội dung chưa được mở, team đang chuẩn bị bài tập — quay lại sau nhé!");
    return;
  }

  openQuestion(q.code);
  render();
}

// ===================== INIT =====================
document.addEventListener("DOMContentLoaded", async () => {
  setShellWidth(getShellWidth());

  try {
    const status = await API.larkStatus();
    larkConfigured = !!status.configured;
  } catch (e) {}

  const larkError = new URLSearchParams(location.search).get("lark_error");
  if (larkError) {
    authError = "Đăng nhập Lark thất bại (" + larkError + "), thử lại nhé.";
    history.replaceState(null, "", location.pathname);
  }

  try {
    const user = await API.me();
    state.currentUser = user;
    state.loggedIn = true;
    if (state.view === "login") state.view = "home";
    await hydrateProgress();
  } catch (e) {
    state.currentUser = null;
    state.loggedIn = false;
    state.view = "login";
  }
  render();
});
