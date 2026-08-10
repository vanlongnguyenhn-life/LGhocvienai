// ===== App state & rendering =====

const STORAGE_KEY = "ags_course_state_v1";

const API = {
  async request(path, options = {}) {
    let res;
    try {
      res = await fetch(path, { credentials: "include", ...options });
    } catch (netErr) {
      // Mất mạng / máy chủ đang khởi động lại: KHÔNG được nhầm với "chưa đăng nhập".
      const err = new Error("Không kết nối được máy chủ — kiểm tra mạng giúp mình nhé.");
      err.isNetwork = true;
      throw err;
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      const err = new Error((data && data.detail) || "Có lỗi xảy ra, thử lại nhé");
      err.status = res.status; // để nơi gọi phân biệt 401 (hết phiên) với 5xx (server trục trặc)
      throw err;
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
  agentToken: () => API.request("/api/me/agent-token"),
};

let agentTokenInfo = null;

function resolveAgentPlaceholders(text, code) {
  if (!text || !text.includes("{{")) return text;
  if (!agentTokenInfo) return text;
  return text
    .replace(/\{\{uid\}\}/g, agentTokenInfo.uid)
    .replace(/\{\{token\}\}/g, agentTokenInfo.token)
    .replace(/\{\{media_upload_url\}\}/g, `${location.origin}/api/media/upload`)
    .replace(/\{\{attempt_answers_url\}\}/g, `${location.origin}/api/attempt-answers`)
    .replace(/\{\{electron_verify_url\}\}/g, `${location.origin}/api/electron/verify`)
    .replace(/\{\{electron_cmd_queue_url\}\}/g, `${location.origin}/api/electron/cmd-queue`)
    .replace(/\{\{electron_cmd_ack_url\}\}/g, `${location.origin}/api/electron/cmd-ack`)
    .replace(/\{\{agent_task_url\}\}/g, `${location.origin}/api/agent-task/${code || ""}`)
    // Link đã nhúng sẵn uid+token: ô copy chỉ còn MỘT dòng, Agent dán vào là đọc được ngay,
    // không phải dặn nó gắn header (giống hệt cách web tham khảo làm).
    .replace(
      /\{\{agent_task_link\}\}/g,
      `${location.origin}/api/agent-task/${agentTokenInfo.uid}/${agentTokenInfo.token}/${code || ""}`
    )
    .replace(/\{\{pi_lab_my_profile_url\}\}/g, `${location.origin}/api/pi-lab/my-profile`)
    .replace(/\{\{npc_profile_url\}\}/g, `${location.origin}/api/pi-lab/npc-profile`);
}

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
      // Trạng thái "loading" của các fetch-on-render (agent_media/agent_electron/
      // agent_secret_code) bị lỡ persist qua saveState() khi render() chạy giữa lúc đang
      // chờ fetch — nếu trang bị tải lại đúng lúc đó, "loading" tồn tại mãi vì code chỉ tự
      // fetch lại khi giá trị là undefined. Reset về undefined mỗi lần tải trang để không
      // bao giờ bị kẹt.
      if (parsed.answers) {
        Object.values(parsed.answers).forEach((a) => {
          if (a.mediaStatus === "loading") delete a.mediaStatus;
          if (a.hintStatus === "loading") delete a.hintStatus;
          if (a.letterStatus === "loading") delete a.letterStatus;
          if (a.gwsStatus === "loading") delete a.gwsStatus;
          // Cờ "đang nộp" chỉ có nghĩa trong phiên đang chạy. Nếu trang bị tải lại đúng lúc
          // đang nộp mà không xoá, nút Nộp bài sẽ bị khoá VĨNH VIỄN ở lần mở sau.
          delete a.submitting;
        });
      }
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state, replacer));
  } catch (e) {
    // Hết quota / trình duyệt chặn localStorage (chế độ riêng tư, webview trong app chat...).
    // KHÔNG để lỗi ném ra ngoài: saveState() nằm ngay đầu persistQuestionStatus(), nếu ném thì
    // lệnh gửi tiến độ lên server phía sau sẽ không bao giờ chạy — mất bài mà không ai biết.
    console.warn("Không ghi được tiến độ xuống localStorage:", e);
  }
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
  if (state.connectionLost) {
    root.appendChild(
      el("div", { class: "conn-lost-banner" }, [
        "⚠️ Đang mất kết nối tới hệ thống. Bài bạn đã làm KHÔNG mất — hệ thống đang tự kết nối lại. " +
          "Bạn cứ để trang này mở nhé.",
      ])
    );
  }
  try {
    if (!state.loggedIn || state.view === "login") {
      root.appendChild(renderLogin());
    } else if (state.currentUser && !state.currentUser.approved) {
      root.appendChild(renderPending());
    } else if (state.view === "home") {
      root.appendChild(renderShell(renderHome()));
    } else {
      root.appendChild(renderShell(renderCourse()));
    }
  } catch (err) {
    // Lưới an toàn cuối cùng: nếu bất kỳ nhánh render nào ở trên throw lỗi (ví dụ do dữ
    // liệu localStorage cũ/hỏng không đúng shape), root đã bị innerHTML="" ở trên và sẽ
    // trắng màn hình vĩnh viễn nếu không bắt lỗi ở đây. Hiện màn hình lỗi kèm nút xoá dữ
    // liệu cục bộ để học viên tự khôi phục được, thay vì phải nhờ hỗ trợ kỹ thuật.
    console.error("render() lỗi:", err);
    root.innerHTML = "";
    root.appendChild(
      el("div", { class: "login-view" }, [
        el("h2", { class: "login-title" }, "Đã có lỗi hiển thị"),
        el(
          "p",
          { class: "login-tagline" },
          "Dữ liệu lưu trên trình duyệt của bạn có thể đã bị lỗi. Bấm nút bên dưới để khôi phục (bạn sẽ cần đăng nhập lại, tiến độ bài học đã lưu trên máy chủ vẫn giữ nguyên)."
        ),
        el(
          "button",
          {
            class: "submit-btn",
            onclick: () => {
              localStorage.removeItem(STORAGE_KEY);
              location.reload();
            },
          },
          "🔄 Xoá dữ liệu cục bộ và tải lại"
        ),
      ])
    );
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
    // Server là nguồn sự thật duy nhất: nếu state cục bộ (localStorage) đang nhớ một câu là
    // "done"/"correct" nhưng server KHÔNG còn ghi nhận nữa (vd: giáo viên đã xoá tiến độ để
    // bắt làm lại), phải reset về "pending" ngay — nếu không học viên sẽ mãi thấy "đã hoàn
    // thành" theo cache cũ trong trình duyệt của họ, dù server đã yêu cầu làm lại.
    const serverDoneCodes = new Set(Object.keys(data.answers));
    Object.keys(state.answers).forEach((code) => {
      const a = state.answers[code];
      if ((a.status === "done" || a.status === "correct") && !serverDoneCodes.has(code)) {
        if (a.saved === false) {
          // Đã làm nhưng CHƯA lưu được lên server (mất mạng / server đang deploy) →
          // GIỮ NGUYÊN và đẩy bù ở cuối. KHÔNG xoá (đây chính là chỗ gây tụt tiến độ trước đây).
        } else {
          // saved === true hoặc cache cũ (undefined): từng lưu mà server không còn →
          // giáo viên đã chủ động reset → đưa về "chưa làm".
          a.status = "pending";
          a.awardedPoints = 0;
        }
      }
    });
    Object.entries(data.answers).forEach(([code, info]) => {
      const a = getAnswer(code);
      a.status = info.status;
      a.awardedPoints = info.awardedPoints;
      a.saved = true; // server đã có → xác nhận đã lưu
      if (info.answerData) {
        try {
          Object.assign(a, JSON.parse(info.answerData));
        } catch (e) {}
      }
    });
    // Đẩy bù ngay các câu đã làm nhưng lưu hụt (server thiếu, saved=false).
    flushUnsavedProgress();
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
  // Đẩy nốt các câu đã làm nhưng chưa kịp lưu lên server, TRƯỚC khi xoá dữ liệu máy —
  // nếu không, đăng xuất sẽ làm mất tiến độ chưa lưu (không còn gì để heal-forward).
  try {
    await flushUnsavedProgress();
  } catch (e) {}
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
  // Không đếm câu "gate" (chưa mở nội dung) — nếu đếm, bài hiện mãi kiểu "19/24" dù học viên
  // đã làm hết mọi câu có thể làm.
  const real = lesson.questions.filter((q) => q.type !== "gate");
  const done = real.filter((q) => isQuestionDone(q.code)).length;
  return { done, total: real.length };
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
    let seqLocked = false;
    // Câu "gate" (nội dung thật chưa mở) KHÔNG tham gia chuỗi khoá tuần tự: nó không bao giờ
    // "xong" được, nếu tính vào chuỗi thì mọi câu phía sau (và cả bài kế tiếp) bị khoá vĩnh
    // viễn. Câu kế tiếp chỉ cần câu KHÔNG-gate gần nhất phía trước đã xong.
    let prevIdx = qIdx - 1;
    while (prevIdx >= 0 && lesson.questions[prevIdx].type === "gate") prevIdx--;
    if (prevIdx >= 0) {
      const prevCode = lesson.questions[prevIdx].code;
      if (!isQuestionDone(prevCode)) {
        seqLocked = true;
      } else if (!isQuestionSynced(prevCode)) {
        // Câu trước đã trả lời đúng nhưng chưa lưu được lên server — chặn tạm thay vì cho qua
        // rồi mất tiến độ âm thầm (đây chính là nguyên nhân gây lỗ hổng tiến độ trước đây).
        seqLocked = "Câu trước đang được lưu lên hệ thống — chờ vài giây rồi thử lại nhé.";
      }
    }
    // Khoá tạm thời (admin) ưu tiên hiển thị thông báo riêng — giáo viên (is_teacher) luôn
    // được bỏ qua khoá tạm này để xem/kiểm tra nội dung không bị chặn.
    const isTeacher = !!(state.currentUser && state.currentUser.is_teacher);
    const locked = LOCKED_CODES.has(q.code) && !isTeacher ? ADMIN_LOCK_MSG : seqLocked;
    body.appendChild(renderQuestionCard(lesson, q, locked));
  });
  return renderSheet(header, body, closeLessonSheet);
}

function getAnswer(code) {
  if (!state.answers[code]) state.answers[code] = {};
  const a = state.answers[code];
  // Vá đầy đủ mọi field còn thiếu (không chỉ tạo mới): dữ liệu cũ trong localStorage có
  // thể chỉ có 1 phần field (ví dụ từ phiên bản trước, hoặc bị ghi dở dang) — nếu thiếu
  // "selected"/"matchSelected" thì các hàm renderChoiceGrid/renderMatchGrid gọi .includes()
  // trên undefined sẽ crash giữa lúc render(), làm trắng trắng toàn bộ trang vĩnh viễn.
  if (!Array.isArray(a.selected)) a.selected = [];
  if (typeof a.text !== "string") a.text = "";
  if (typeof a.status !== "string") a.status = "pending";
  if (typeof a.awardedPoints !== "number") a.awardedPoints = 0;
  if (!a.proof) a.proof = {};
  if (!a.proofMeta) a.proofMeta = {};
  if (!Array.isArray(a.matchSelected)) a.matchSelected = [];
  return a;
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

// Đã trả lời đúng NHƯNG server chưa xác nhận lưu (a.saved === false) — dùng để CHẶN đi tiếp,
// tránh tạo lỗ hổng tiến độ vĩnh viễn nếu mất mạng/server redeploy đúng lúc học viên nộp bài.
function isQuestionSynced(code) {
  const a = state.answers[code];
  return isQuestionDone(code) && a.saved !== false;
}

function isLessonDone(lesson) {
  // Câu "gate" không tính vào điều kiện hoàn thành bài — nếu tính, bài chứa gate sẽ không
  // bao giờ "xong" và mọi bài phía sau bị khoá vĩnh viễn với tất cả học viên.
  return lesson.questions.every((q) => q.type === "gate" || isQuestionSynced(q.code));
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

// ===== TẠM KHOÁ theo mã câu: khoá mọi câu TỪ mã này trở đi (theo thứ tự khoá học). =====
// Đặt "" hoặc null để MỞ HẾT trở lại.
const LOCKED_FROM_CODE = "9.1";
const ALL_CODES_ORDERED = [];
const QUESTION_BY_CODE = {};
(typeof LESSONS !== "undefined" ? LESSONS : []).forEach((l) =>
  l.questions.forEach((q) => {
    ALL_CODES_ORDERED.push(q.code);
    QUESTION_BY_CODE[q.code] = q;
  })
);
const LOCKED_CODES = (() => {
  if (!LOCKED_FROM_CODE) return new Set();
  const idx = ALL_CODES_ORDERED.indexOf(LOCKED_FROM_CODE);
  return idx < 0 ? new Set() : new Set(ALL_CODES_ORDERED.slice(idx));
})();
const ADMIN_LOCK_MSG = "Phần này đang tạm khoá — thầy/cô sẽ mở lại sau nhé.";

function renderQuestionCard(lesson, q, locked) {
  // locked có thể là false, true (khoá tuần tự), hoặc chuỗi thông báo (khoá tạm thời).
  const lockMsg = typeof locked === "string" ? locked : locked ? "Hoàn thành câu trước để mở khoá" : null;
  locked = !!locked;
  const a = getAnswer(q.code);
  const expanded = !locked && !!state.expandedQuestions[q.code];
  const done = a.status === "correct" || a.status === "done";
  const syncing = done && a.saved === false;
  const statusClass = locked ? "locked" : syncing ? "pending" : done ? "" : a.status === "wrong" ? "wrong" : "pending";
  const card = el("div", { class: "q-card " + statusClass });

  const isGate = q.type === "gate";
  const statusText = locked
    ? lockMsg
    : isGate
    ? "Sắp mở — bấm để xem trước có gì đang chờ"
    : syncing
    ? "Đã xong — đang lưu lên hệ thống..."
    : done
    ? "Đã xong — trả lời đúng"
    : a.status === "wrong"
    ? "Chưa đúng — thử lại nhé"
    : "Chưa làm";
  const statusTextClass = locked ? "locked" : isGate ? "pending" : syncing ? "pending" : done ? "done" : a.status === "wrong" ? "wrong" : "pending";
  const dot = locked ? "🔒" : isGate ? "🔜" : syncing ? "🔄" : done ? "✓" : a.status === "wrong" ? "!" : "";

  const header = el(
    "div",
    {
      class: "q-card-header",
      onclick: () => {
        if (locked) {
          showToast(lockMsg);
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
    if (q.image) body.appendChild(el("img", { class: "q-image", src: q.image, alt: "" }));
    if (q.chatLog) body.appendChild(renderChatLog(q.chatLog));
    if (q.copyPrompt) body.appendChild(renderCopyPromptBox(resolveAgentPlaceholders(q.copyPrompt, q.code)));
    if (q.copyPromptTrailing) body.appendChild(el("p", { class: "q-prompt" }, q.copyPromptTrailing));
    if (q.copyPrompt && q.copyPrompt.includes("{{") && !agentTokenInfo) {
      body.appendChild(
        el("div", { class: "secret-note" }, "Đang tải thông tin xác thực Agent... nếu prompt trên vẫn còn {{uid}}/{{token}}, tải lại trang.")
      );
    }

    if (q.type === "single" || q.type === "multi") {
      body.appendChild(renderChoiceGrid(q, a));
    } else if (q.type === "match") {
      body.appendChild(renderMatchGrid(q, a));
    } else if (q.type === "assignment") {
      body.appendChild(renderAssignment(q, a));
    } else if (q.type === "code" || q.type === "my_token_check") {
      body.appendChild(renderCodeInput(q, a));
    } else if (q.type === "agent_secret_code" || q.type === "pi_lab_code") {
      body.appendChild(renderAgentSecretCode(q, a));
    } else if (q.type === "agent_media" || q.type === "agent_electron") {
      body.appendChild(renderAgentMediaStatus(q, a));
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
    } else if (q.type === "pi_lab_letter") {
      body.appendChild(renderPiLabLetter(q, a));
      if (a.letterStatus === undefined) {
        a.letterStatus = "loading";
        refreshLetterStatus(q, a);
      }
    } else if (q.type === "gws_task") {
      body.appendChild(renderGwsTask(q, a));
      if (a.gwsStatus === undefined) {
        a.gwsStatus = "loading";
        refreshGwsStatus(q, a);
      }
    }

    // Câu "gate" (nội dung thật chưa mở): chỉ hiển thị lời giới thiệu, không có nút nộp.
    if (q.type === "gate") {
      card.appendChild(body);
      return card;
    }

    const actions = el("div", { class: "q-actions" }, [
      el(
        "button",
        {
          class: "submit-btn",
          // Khoá ngay khi đang gửi: bấm 2 lần sẽ gửi 2 lượt — với câu tự luận là gọi AI chấm
          // 2 lần (tốn tiền gấp đôi) và 2 kết quả có thể ghi đè lẫn nhau.
          disabled: a.submitting ? "" : null,
          onclick: (e) => {
            if (a.submitting) return;
            a.submitting = true;
            e.currentTarget.disabled = true;
            submitAnswer(lesson, q).finally(() => {
              a.submitting = false;
              render();
              openQuestion(q.code);
            });
          },
        },
        a.submitting ? ["⏳ Đang nộp..."] : ["➤ ", a.status === "correct" || a.status === "done" ? "Nộp lại" : "Nộp bài"]
      ),
      el(
        "button",
        {
          class: "help-link",
          onclick: () => {
            if (q.type === "agent_secret_code" || q.type === "pi_lab_code") {
              a.hintPanelOpen = !a.hintPanelOpen;
              render();
              openQuestion(q.code);
            } else {
              showToast("Liên hệ trợ giảng qua kênh hỗ trợ trong lớp học");
            }
          },
        },
        ["🛟 Giúp"]
      ),
    ]);
    body.appendChild(actions);

    if (a.status === "correct" || a.status === "done") {
      if (syncing) {
        body.appendChild(
          el("div", { class: "q-note" }, [
            "⚠️ Câu này chưa lưu được lên hệ thống (mất mạng hoặc server đang bận) — sẽ tự thử lại, hoặc bấm nút bên dưới để thử ngay.",
          ])
        );
        body.appendChild(
          el(
            "button",
            {
              class: "help-link",
              onclick: async () => {
                await persistQuestionStatus(q, a);
                render();
                openQuestion(q.code);
              },
            },
            ["🔄 Thử lưu lại ngay"]
          )
        );
      } else {
        body.appendChild(
          el("div", { class: "q-note" }, "Câu này đã hoàn thành. Nộp lại sẽ chấm theo logic hiện tại.")
        );
      }
      body.appendChild(
        el("div", { class: "q-footer-xp" }, [el("span", { class: "trophy" }, `🏆 +${a.awardedPoints}`)])
      );
    }

    card.appendChild(body);
  }

  return card;
}

function renderChatLog(chatLog) {
  const wrap = el("div", { class: "chat-log" });
  chatLog.forEach((turn) => {
    const isAgent = turn.who === "agent";
    const bubbleWrap = el("div", { class: "chat-turn " + (isAgent ? "agent" : "user") });
    bubbleWrap.appendChild(el("div", { class: "chat-speaker" }, isAgent ? "Bé Ailai" : "Tôi"));
    bubbleWrap.appendChild(el("div", { class: "chat-bubble" }, turn.text));
    wrap.appendChild(bubbleWrap);
  });
  return wrap;
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

// ===== Câu GWS (9.16-9.22): Agent nộp URL sản phẩm Google, web hiển thị kết quả chấm =====
async function refreshGwsStatus(q, a) {
  try {
    a.gwsStatus = await API.request(`/api/gws/task/${encodeURIComponent(q.code)}/status`);
  } catch (e) {
    a.gwsStatus = null;
  }
  saveState();
  render();
  openQuestion(q.code);
}

function renderGwsTask(q, a) {
  const wrap = el("div", {});
  const st = a.gwsStatus;
  if (st === "loading" || st === undefined) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang tải kết quả chấm..."));
  } else if (!st || !st.attempted) {
    wrap.appendChild(
      el("div", { class: "secret-note" },
        "Chưa có lần nộp nào — copy đề bài phía trên cho Agent chạy. Khi chương trình nộp xong, quay lại đây bấm Kiểm tra.")
    );
  } else {
    const list = el("div", { class: "gws-criteria" });
    (st.criteria || []).forEach((c) => {
      list.appendChild(
        el("div", { class: "gws-criterion " + (c.ok ? "ok" : "fail") }, [
          el("span", {}, (c.ok ? "✅ " : "❌ ") + c.label),
          c.note ? el("div", { class: "gws-criterion-note" }, c.note) : null,
        ])
      );
    });
    wrap.appendChild(list);
    wrap.appendChild(
      el("div", { class: "secret-note" },
        st.ok ? "🎉 Lần nộp gần nhất ĐẠT mọi tiêu chí — bấm Nộp bài để chốt điểm." : "Lần nộp gần nhất chưa đạt — sửa theo tiêu chí rớt rồi cho Agent nộp lại.")
    );
  }
  wrap.appendChild(
    el("button", { class: "help-link", onclick: () => refreshGwsStatus(q, a) }, ["🔄 Kiểm tra kết quả chấm"])
  );
  return wrap;
}

// ===== Câu 9.24 "Định mệnh": gửi mật thư cho bạn Mít, chờ Mít đọc rồi nhận mã hồi âm =====
async function refreshLetterStatus(q, a) {
  try {
    a.letterStatus = await API.request("/api/pi-lab/letter-status");
  } catch (e) {
    a.letterStatus = null;
  }
  saveState();
  render();
  openQuestion(q.code);
}

function renderPiLabLetter(q, a) {
  const wrap = el("div", {});
  const st = a.letterStatus;

  if (!st || !st.sent) {
    // Bước 1: dán nguyên văn mật thư và gửi.
    const ta = el("textarea", {
      class: "reflect-input",
      rows: "3",
      placeholder: "Dán NGUYÊN VĂN mật thư của cô vào đây...",
    });
    ta.value = a.letterText || "";
    ta.addEventListener("input", (e) => {
      a.letterText = e.target.value;
    });
    wrap.appendChild(ta);
    wrap.appendChild(
      el(
        "button",
        {
          class: "submit-btn",
          onclick: async (e) => {
            const text = (a.letterText || "").trim();
            if (!text) {
              showToast("Dán mật thư vào ô trên trước đã nhé");
              return;
            }
            e.currentTarget.disabled = true;
            const fd = new FormData();
            fd.append("text", text);
            try {
              const r = await API.request("/api/pi-lab/send-letter", { method: "POST", body: fd });
              showToast(r.message || "Đã gửi 💌");
            } catch (err) {
              showToast(err.message);
              render();
              openQuestion(q.code);
              return;
            }
            await refreshLetterStatus(q, a);
          },
        },
        ["💌 Gửi cho bạn Mít"]
      )
    );
    if (st === "loading") wrap.appendChild(el("div", { class: "secret-note" }, "Đang kiểm tra trạng thái thư..."));
    return wrap;
  }

  if (!st.read) {
    // Bước 2: đã gửi, chờ Mít đọc.
    wrap.appendChild(
      el("div", { class: "secret-note" }, "💌 Thư đã gửi — bạn Mít sẽ đọc trong ít phút. Uống ngụm nước rồi bấm kiểm tra nhé.")
    );
    wrap.appendChild(
      el(
        "button",
        { class: "help-link", onclick: () => refreshLetterStatus(q, a) },
        ["🔄 Bạn Mít đọc chưa?"]
      )
    );
    return wrap;
  }

  // Bước 3: Mít đã đọc — hiện hồi âm + ô nhập mã hoàn thành.
  wrap.appendChild(el("div", { class: "chat-log" }, [
    el("div", { class: "chat-turn agent" }, [
      el("div", { class: "chat-speaker" }, "Bạn Mít"),
      el("div", { class: "chat-bubble" }, st.reply || "Tớ đọc thư rồi nhé!"),
    ]),
  ]));
  wrap.appendChild(renderCodeInput(q, a));
  return wrap;
}

async function fetchSecretHintStatus(q, a) {
  a.hintStatus = "loading";
  try {
    a.hintStatus = await API.request(`/api/secret-hint-status?question_code=${encodeURIComponent(q.code)}`);
  } catch (err) {
    a.hintStatus = { error: err.message };
  }
  render();
  openQuestion(q.code);
}

function renderAgentSecretCode(q, a) {
  const wrap = el("div", {});

  if (a.hintPanelOpen) {
    if (a.hintStatus === undefined || a.hintStatus === "loading") {
      // Không gọi fetchSecretHintStatus()/render() ngay ở đây: đang ở giữa một lượt
      // render() khác (render() đang dựng cây DOM), gọi render() lồng vào lúc này sẽ phá
      // cây DOM đang dựng dở (gây trắng màn hình). Hoãn sang tick sau bằng setTimeout(0).
      if (a.hintStatus === undefined) {
        a.hintStatus = "loading";
        setTimeout(() => fetchSecretHintStatus(q, a), 0);
      }
      wrap.appendChild(el("div", { class: "secret-note" }, "Đang tải trạng thái gợi ý..."));
      wrap.appendChild(
        el("button", { class: "help-link", onclick: () => fetchSecretHintStatus(q, a) }, "🔄 Thử tải lại")
      );
    } else if (a.hintStatus.error) {
      wrap.appendChild(el("div", { class: "secret-note" }, "Lỗi tải gợi ý: " + a.hintStatus.error));
    } else {
      const hs = a.hintStatus;
      wrap.appendChild(
        el(
          "div",
          { class: "secret-note" },
          `Trong 24 giờ hiện tại bạn đã thử ${hs.today_attempts} lần` +
            (hs.attempts_needed_today > 0
              ? ` (cần thêm ${hs.attempts_needed_today} lần nữa trong 24 giờ này mới tính là 1 ngày đạt).`
              : ` — đã đủ, 24 giờ này tính là 1 ngày đạt rồi!`) +
            ` Số ngày đạt: ${hs.qualifying_days}/${hs.hints_total}.`
        )
      );
      if (!a.hintCardsOpen) a.hintCardsOpen = {};
      hs.hints.forEach((hint) => {
        const isOpen = !!a.hintCardsOpen[hint.level];
        const box = el("div", { class: "assignment-box" });
        const header = el(
          "div",
          {
            class: "label",
            style: "cursor:pointer;display:flex;justify-content:space-between;",
            onclick: () => {
              a.hintCardsOpen[hint.level] = !a.hintCardsOpen[hint.level];
              render();
              openQuestion(q.code);
            },
          },
          [`Gợi ý cấp ${hint.level}`, el("span", {}, hint.unlocked ? "✓" : "🔒")]
        );
        box.appendChild(header);
        if (isOpen) {
          box.appendChild(
            el(
              "div",
              { class: "req-text" },
              hint.unlocked
                ? hint.text
                : `Cần đủ ${hint.days_needed} ngày đạt (mỗi ngày ≥3 lượt thử). Hiện tại: ${hs.qualifying_days}/${hint.days_needed} ngày.`
            )
          );
          if (hint.unlocked && hint.copyText) {
            box.appendChild(renderCopyPromptBox(hint.copyText));
          }
        }
        wrap.appendChild(box);
      });
      wrap.appendChild(
        el("button", { class: "help-link", onclick: () => fetchSecretHintStatus(q, a) }, "🔄 Kiểm tra lại gợi ý")
      );
    }
  }

  const input = el("input", {
    class: "reflect-input",
    type: "text",
    placeholder: "Nhập mã bí mật...",
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

const AGENT_TASK_STATUS_ENDPOINT = {
  agent_media: "/api/media-status",
  agent_electron: "/api/electron-status",
};

async function fetchMediaStatus(q, a) {
  a.mediaStatus = "loading";
  try {
    const endpoint = AGENT_TASK_STATUS_ENDPOINT[q.type] || "/api/media-status";
    a.mediaStatus = await API.request(`${endpoint}?question_code=${encodeURIComponent(q.code)}`);
  } catch (err) {
    a.mediaStatus = { error: err.message };
  }
  render();
  openQuestion(q.code);
}

function renderAgentMediaStatus(q, a) {
  const wrap = el("div", { class: "media-status" });

  if (a.mediaStatus === undefined) {
    // Hoãn sang tick sau (setTimeout 0): renderAgentMediaStatus() đang chạy giữa lượt
    // render() hiện tại, gọi render() lồng ngay tại đây sẽ phá cây DOM đang dựng dở.
    a.mediaStatus = "loading";
    setTimeout(() => fetchMediaStatus(q, a), 0);
  }

  if (a.mediaStatus === "loading") {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang tải trạng thái nộp bài của Agent..."));
    wrap.appendChild(
      el("button", { class: "help-link", onclick: () => fetchMediaStatus(q, a) }, "🔄 Thử tải lại")
    );
    return wrap;
  }
  if (a.mediaStatus && a.mediaStatus.error) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Lỗi tải trạng thái: " + a.mediaStatus.error));
  } else if (!a.mediaStatus.has_attempt) {
    wrap.appendChild(
      el(
        "div",
        { class: "secret-note" },
        "Agent chưa nộp bài lần nào cho câu này. Dán prompt phía trên cho Agent thực hiện, sau đó bấm Kiểm tra lại."
      )
    );
  } else {
    wrap.appendChild(el("div", { class: "label" }, "Tiêu chí chấm"));
    a.mediaStatus.criteria.forEach((c) => {
      const box = el("div", { class: "assignment-box" });
      box.appendChild(el("div", { class: "label" }, c.title));
      if (c.desc) box.appendChild(el("div", { class: "req-text" }, c.desc));
      if (c.image_url) {
        box.appendChild(el("div", { class: "req-text" }, "Ảnh học viên nộp:"));
        box.appendChild(el("img", { class: "image-preview", src: c.image_url }));
      } else if (c.detail) {
        box.appendChild(el("div", { class: "req-text" }, c.detail));
      }
      box.appendChild(
        el("div", { class: "criteria-list" }, [
          el("li", { class: c.ok ? "pass" : "fail" }, [
            el("span", { class: "c-icon" }, c.ok ? "✓" : "✗"),
            el("span", {}, c.ok ? "Kết quả: Đạt" : "Kết quả: Chưa đạt"),
          ]),
        ])
      );
      wrap.appendChild(box);
    });
    if (a.mediaStatus.checked_at) {
      wrap.appendChild(el("div", { class: "file-chosen" }, `Kiểm tra lần cuối lúc: ${a.mediaStatus.checked_at}`));
    }
  }

  wrap.appendChild(
    el("button", { class: "help-link", onclick: () => fetchMediaStatus(q, a) }, "🔄 Kiểm tra lại")
  );
  return wrap;
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

// Gửi lên server NỘI DUNG học viên đã chọn, không phải số thứ tự ô. Nhờ vậy giao diện xáo được
// thứ tự hiển thị, và một bảng đáp án bị rò rỉ theo chỉ số ("chọn ô 0, 2, 3") thành vô nghĩa.
// Vẫn gửi kèm dạng chỉ số cũ để hiển thị lại lựa chọn khi học viên mở lại câu.
function buildAnswerData(q, a) {
  const itemText = (it) => (typeof it === "string" ? it : it.text);
  switch (q.type) {
    case "single":
    case "multi":
      return {
        selected: a.selected,
        selectedTexts: (a.selected || []).map((i) => (q.options || [])[i]).filter((v) => v != null),
      };
    case "match":
      return {
        matchSelected: a.matchSelected,
        pairs: (q.leftItems || []).map((left, i) => [left, (q.rightOptions || [])[a.matchSelected[i]]]),
      };
    case "order":
      return {
        orderState: a.orderState,
        orderedTexts: (a.orderState || []).map((i) => itemText((q.items || [])[i])).filter((v) => v != null),
      };
    case "order-tag":
      return {
        orderState: a.orderState,
        tagState: a.tagState,
        orderedTexts: (a.orderState || []).map((i) => itemText((q.items || [])[i])).filter((v) => v != null),
        tagByText: Object.fromEntries((q.items || []).map((it, i) => [itemText(it), (a.tagState || [])[i]])),
      };
    case "tag-mark":
      return {
        tagState: a.tagState,
        iconByText: Object.fromEntries((q.items || []).map((it, i) => [itemText(it), (a.tagState || [])[i]])),
      };
    case "code":
    case "agent_secret_code":
    case "reflect":
    // Các loại dưới cũng gửi mã/token trong answer_data và bị server kiểm tra lại khi nộp —
    // thiếu chúng ở đây thì lượt đẩy bù (flushUnsavedProgress) gửi lên rỗng và bị server từ
    // chối, khiến câu đã làm đúng không bao giờ lưu được.
    case "pi_lab_code":
    case "my_token_check":
    case "pi_lab_letter":
      return { text: a.text };
    case "token_scope_check":
      return { text: a.text, tokenScopes: a.tokenScopes };
    default:
      return null;
  }
}

async function persistQuestionStatus(q, a) {
  // Hầu hết chỗ gọi hàm này đều không await/bắt lỗi, nên nó TUYỆT ĐỐI không được ném ra ngoài:
  // một lỗi ngầm ở đây sẽ nuốt mất lệnh gửi tiến độ mà không hiện gì cho học viên.
  try {
    return await persistQuestionStatusInner(q, a);
  } catch (err) {
    console.warn("Lỗi ngoài dự kiến khi lưu tiến độ:", q.code, err);
    a.saved = false;
    showToast("⚠️ Chưa lưu được câu này — hệ thống sẽ tự thử lại, đừng tắt trang nhé.");
    render();
  }
}

async function persistQuestionStatusInner(q, a) {
  // Đánh dấu "chưa xác nhận lưu" — nếu tải lại giữa chừng, hydrateProgress sẽ đẩy bù thay vì xoá.
  a.saved = false;
  saveState();
  const fd = new FormData();
  fd.append("question_code", q.code);
  fd.append("status", a.status);
  fd.append("awarded_points", String(a.awardedPoints || 0));
  const answerData = buildAnswerData(q, a);
  if (answerData) fd.append("answer_data", JSON.stringify(answerData));
  // Thử lại nhiều lần để tránh MẤT TIẾN ĐỘ ÂM THẦM khi mạng/server chập chờn.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await API.submitQuestion(fd);
      a.saved = true; // server đã xác nhận
      saveState();
      render(); // mở khoá câu tiếp theo ngay khi vừa lưu xong (xem isQuestionSynced)
      return res; // kèm phán quyết đúng/sai do SERVER tính
    } catch (err) {
      if (attempt === 4) {
        console.warn("Lưu tiến độ thất bại sau nhiều lần thử:", q.code, err);
        // KHÔNG mất: giữ cờ saved=false, flushUnsavedProgress() sẽ tự đẩy bù khi server sống lại.
        // Không cho đi tiếp câu sau cho tới khi lưu xong (seqLocked kiểm tra a.saved) — tránh
        // đúng nguyên nhân gây mất tiến độ trước đây (lưu hụt rồi vẫn cho học tiếp).
        showToast("⚠️ Mạng/hệ thống đang chập chờn — câu này sẽ tự lưu lại khi ổn định, đừng tắt trang nhé.");
        render();
        return;
      }
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

// Đẩy bù mọi câu đã làm mà CHƯA lưu được lên server (saved === false). Gọi khi tải xong + định kỳ.
async function flushUnsavedProgress() {
  const pending = Object.keys(state.answers).filter((code) => {
    const a = state.answers[code];
    return (a.status === "done" || a.status === "correct") && a.saved === false && QUESTION_BY_CODE[code];
  });
  for (const code of pending) {
    const a = state.answers[code];
    const q = QUESTION_BY_CODE[code];
    const fd = new FormData();
    fd.append("question_code", code);
    fd.append("status", a.status);
    fd.append("awarded_points", String(a.awardedPoints || 0));
    const answerData = buildAnswerData(q, a);
    if (answerData) fd.append("answer_data", JSON.stringify(answerData));
    try {
      await API.submitQuestion(fd);
      a.saved = true;
      saveState();
      render(); // mở khoá ngay các câu đang bị chặn chờ đồng bộ (xem isQuestionSynced)
    } catch (e) {
      /* để lần sau đẩy tiếp */
    }
  }
}

// Định kỳ đẩy bù tiến độ chưa lưu (phòng trường hợp server vừa gián đoạn xong sống lại).
setInterval(() => {
  if (state.loggedIn) flushUnsavedProgress();
}, 20000);

function hasUnsavedProgress() {
  return Object.keys(state.answers).some((code) => {
    const a = state.answers[code];
    return (a.status === "done" || a.status === "correct") && a.saved === false && QUESTION_BY_CODE[code];
  });
}

// Đẩy bù ngay khi máy có mạng lại / khi học viên quay lại tab — không phải đợi hết 20 giây.
window.addEventListener("online", () => {
  if (state.loggedIn) flushUnsavedProgress();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.loggedIn) flushUnsavedProgress();
});

// Cảnh báo trước khi đóng tab nếu còn bài chưa lưu được — nếu học viên đóng rồi mở lại bằng
// máy/trình duyệt khác, phần chưa lưu sẽ không còn cơ hội đẩy bù.
window.addEventListener("beforeunload", (e) => {
  if (state.loggedIn && hasUnsavedProgress()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// Nộp bài và lấy PHÁN QUYẾT TỪ SERVER cho các loại câu có đáp án cố định.
// Trước đây giao diện tự chấm bằng đáp án nằm sẵn trong data.js — chính vì vậy mà đáp án phải
// gửi về máy học viên và Agent đọc được hết. Nay data.js công khai không còn đáp án; server
// chấm và trả kết quả về đây.
async function submitForServerVerdict(q, a, wrongMsg) {
  a.status = "pending";
  a.awardedPoints = 0;
  const res = await persistQuestionStatus(q, a);
  if (!res || !res.status) {
    // Không lưu được (mạng/server) — persistQuestionStatus đã báo và giữ cờ chưa đồng bộ.
    return;
  }
  a.status = res.status;
  a.awardedPoints = res.awardedPoints || 0;
  saveState();
  showToast(
    res.status === "correct" || res.status === "done"
      ? `Chính xác! +${a.awardedPoints} điểm`
      : wrongMsg || "Chưa đúng, Bạn xem lại nhé"
  );
}

async function submitAnswer(lesson, q) {
  const a = getAnswer(q.code);

  if (q.type === "single" || q.type === "multi") {
    if (a.selected.length === 0) {
      showToast("Em hãy chọn ít nhất 1 đáp án trước khi nộp bài");
      return;
    }
    await submitForServerVerdict(q, a);
  } else if (q.type === "match") {
    if (a.matchSelected.length < q.leftItems.length || a.matchSelected.some((v) => v == null || v < 0)) {
      showToast("Em hãy nối đủ tất cả các mục trước khi nộp bài");
      return;
    }
    await submitForServerVerdict(q, a);
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
      // Server đã xác nhận -> đánh dấu đã đồng bộ. Thiếu dòng này thì hydrateProgress() coi câu
      // như "từng lưu mà server không còn" và đưa về chưa làm, gây mất bài oan.
      a.saved = true;
      saveState();
      showToast(`Bài tập đã được chấm Đạt! +${q.points} điểm`);
    } catch (err) {
      showToast(err.message);
      return;
    }
  } else if (q.type === "agent_secret_code") {
    if (!a.text || a.text.trim().length === 0) {
      // Để trống mà nộp thì hiển thị như sai bình thường (không lộ gợi ý qua toast), nhưng
      // KHÔNG gọi /api/verify-secret-code nên không bị tính là 1 lần thử để mở gợi ý.
      a.status = "wrong";
      a.awardedPoints = 0;
      showToast("Chưa đúng, Bạn xem lại nhé");
      persistQuestionStatus(q, a);
      return;
    }
    const fd = new FormData();
    fd.append("question_code", q.code);
    fd.append("code", a.text.trim());
    let result;
    try {
      result = await API.request("/api/verify-secret-code", { method: "POST", body: fd });
    } catch (err) {
      showToast(err.message);
      return;
    }
    if (!result.valid) {
      a.status = "wrong";
      a.awardedPoints = 0;
      showToast(result.reason || "Mã chưa đúng, Bạn xem lại nhé");
      persistQuestionStatus(q, a);
      return;
    }
    // Server tự re-verify độc lập ở /api/submit-question trước khi cộng điểm.
    const fd2 = new FormData();
    fd2.append("question_code", q.code);
    fd2.append("status", "done");
    fd2.append("awarded_points", String(q.points));
    fd2.append("answer_data", JSON.stringify({ text: a.text.trim() }));
    try {
      await API.submitQuestion(fd2);
      a.status = "done";
      a.awardedPoints = q.points;
      // Server đã xác nhận -> đánh dấu đã đồng bộ. Thiếu dòng này thì hydrateProgress() coi câu
      // như "từng lưu mà server không còn" và đưa về chưa làm, gây mất bài oan.
      a.saved = true;
      saveState();
      showToast(`Chính xác! +${q.points} điểm`);
    } catch (err) {
      showToast(err.message);
      return;
    }
  } else if (q.type === "code") {
    if (!a.text || a.text.trim().length === 0) {
      showToast("Em hãy nhập mã xác nhận trước khi nộp bài");
      return;
    }
    await submitForServerVerdict(q, a, "Mã chưa đúng, em đọc lại mật thư nhé");
  } else if (q.type === "pi_lab_code") {
    if (!a.text || a.text.trim().length === 0) {
      showToast("Em hãy nhập mã xác nhận trước khi nộp bài");
      return;
    }
    const fd = new FormData();
    fd.append("code", a.text.trim());
    let result;
    try {
      result = await API.request("/api/pi-lab/verify-friendship-code", { method: "POST", body: fd });
    } catch (err) {
      showToast(err.message);
      return;
    }
    if (!result.valid) {
      a.status = "wrong";
      a.awardedPoints = 0;
      showToast(result.reason || "Mã chưa đúng, Bạn xem lại nhé");
      persistQuestionStatus(q, a);
      return;
    }
    // Server tự re-verify độc lập ở /api/submit-question trước khi cộng điểm.
    const fd2 = new FormData();
    fd2.append("question_code", q.code);
    fd2.append("status", "done");
    fd2.append("awarded_points", String(q.points));
    fd2.append("answer_data", JSON.stringify({ text: a.text.trim() }));
    try {
      await API.submitQuestion(fd2);
      a.status = "done";
      a.awardedPoints = q.points;
      // Server đã xác nhận -> đánh dấu đã đồng bộ. Thiếu dòng này thì hydrateProgress() coi câu
      // như "từng lưu mà server không còn" và đưa về chưa làm, gây mất bài oan.
      a.saved = true;
      saveState();
      showToast(`Chính xác! +${q.points} điểm`);
    } catch (err) {
      showToast(err.message);
      return;
    }
  } else if (q.type === "my_token_check") {
    if (!a.text || a.text.trim().length === 0) {
      showToast("Em hãy dán token của bạn trước khi nộp bài");
      return;
    }
    const fd = new FormData();
    fd.append("code", a.text.trim());
    let result;
    try {
      result = await API.request("/api/verify-my-token", { method: "POST", body: fd });
    } catch (err) {
      showToast(err.message);
      return;
    }
    if (!result.valid) {
      a.status = "wrong";
      a.awardedPoints = 0;
      showToast(result.reason || "Chưa đúng token của bạn, xem lại nhé");
      persistQuestionStatus(q, a);
      return;
    }
    // Server tự re-verify độc lập ở /api/submit-question trước khi cộng điểm.
    const fd2 = new FormData();
    fd2.append("question_code", q.code);
    fd2.append("status", "done");
    fd2.append("awarded_points", String(q.points));
    fd2.append("answer_data", JSON.stringify({ text: a.text.trim() }));
    try {
      await API.submitQuestion(fd2);
      a.status = "done";
      a.awardedPoints = q.points;
      // Server đã xác nhận -> đánh dấu đã đồng bộ. Thiếu dòng này thì hydrateProgress() coi câu
      // như "từng lưu mà server không còn" và đưa về chưa làm, gây mất bài oan.
      a.saved = true;
      saveState();
      showToast(`Chính xác! +${q.points} điểm`);
    } catch (err) {
      showToast(err.message);
      return;
    }
  } else if (q.type === "pi_lab_letter") {
    if (!a.text || a.text.trim().length === 0) {
      showToast("Chờ bạn Mít đọc thư rồi dán mã hồi âm của Mít vào ô dưới nhé");
      return;
    }
    // Server tự re-verify: mật thư đã gửi + Mít đã đọc + mã hồi âm đúng.
    const fd = new FormData();
    fd.append("question_code", q.code);
    fd.append("status", "done");
    fd.append("awarded_points", String(q.points));
    fd.append("answer_data", JSON.stringify({ text: a.text.trim() }));
    try {
      await API.submitQuestion(fd);
      a.status = "done";
      a.awardedPoints = q.points;
      a.saved = true;
      saveState();
      showToast(`💌 Trọn vẹn! +${q.points} điểm — bạn đã hoàn thành Bài 9`);
    } catch (err) {
      showToast(err.message);
      return;
    }
  } else if (q.type === "gws_task") {
    if (!a.gwsStatus || a.gwsStatus === "loading" || !a.gwsStatus.ok) {
      showToast("Chưa có lần nộp ĐẠT — cho Agent chạy chương trình nộp bài, đạt hết tiêu chí rồi bấm Kiểm tra + Nộp.");
      return;
    }
    // Server tự re-verify từ nhật ký lần nộp gần nhất (không tin client).
    const fd = new FormData();
    fd.append("question_code", q.code);
    fd.append("status", "done");
    fd.append("awarded_points", String(q.points));
    try {
      await API.submitQuestion(fd);
      a.status = "done";
      a.awardedPoints = q.points;
      a.saved = true;
      saveState();
      showToast(`Chính xác! +${q.points} điểm`);
    } catch (err) {
      showToast(err.message);
      return;
    }
  } else if (q.type === "agent_media" || q.type === "agent_electron") {
    if (!a.mediaStatus || a.mediaStatus === "loading" || !a.mediaStatus.is_correct) {
      showToast("Chưa thấy Agent nộp bài đạt đủ tiêu chí — bấm Kiểm tra lại sau khi Agent đã chạy xong.");
      return;
    }
    // Server tự re-verify độc lập (không tin client) ở /api/submit-question trước khi cộng điểm.
    const fd = new FormData();
    fd.append("question_code", q.code);
    fd.append("status", "done");
    fd.append("awarded_points", String(q.points));
    try {
      await API.submitQuestion(fd);
      a.status = "done";
      a.awardedPoints = q.points;
      // Server đã xác nhận -> đánh dấu đã đồng bộ. Thiếu dòng này thì hydrateProgress() coi câu
      // như "từng lưu mà server không còn" và đưa về chưa làm, gây mất bài oan.
      a.saved = true;
      saveState();
      showToast(`Chính xác! +${q.points} điểm`);
    } catch (err) {
      showToast(err.message);
      return;
    }
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
    await submitForServerVerdict(q, a, "Chưa đúng thứ tự, Bạn xem lại nhé");
  } else if (q.type === "order-tag") {
    await submitForServerVerdict(q, a, "Chưa đúng thứ tự hoặc nhãn, Bạn xem lại nhé");
  } else if (q.type === "tag-mark") {
    await submitForServerVerdict(q, a);
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
    state.connectionLost = false;
    if (state.view === "login") state.view = "home";
    await hydrateProgress();
    try {
      agentTokenInfo = await API.agentToken();
    } catch (e) {
      agentTokenInfo = null;
    }
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      // Thật sự chưa đăng nhập / hết phiên → đưa về màn hình đăng nhập.
      state.currentUser = null;
      state.loggedIn = false;
      state.view = "login";
    } else {
      // Mạng chớp hoặc máy chủ đang khởi động lại. TUYỆT ĐỐI không đá học viên về màn hình
      // đăng nhập: họ sẽ tưởng mất sạch bài dù dữ liệu vẫn nguyên trên máy chủ. Giữ nguyên
      // phiên đã lưu, chỉ báo mất kết nối và tự thử lại.
      state.connectionLost = true;
      scheduleReconnect();
    }
  }
  render();
});

// Tự kết nối lại khi máy chủ sống lại, rồi nạp lại tiến độ và gỡ banner.
let reconnectTimer = null;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(async () => {
    try {
      const user = await API.me();
      state.currentUser = user;
      state.loggedIn = true;
      state.connectionLost = false;
      if (state.view === "login") state.view = "home";
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      await hydrateProgress();
      flushUnsavedProgress();
      render();
      showToast("Đã kết nối lại — tiến độ của bạn vẫn nguyên vẹn.");
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
        state.connectionLost = false;
        state.currentUser = null;
        state.loggedIn = false;
        state.view = "login";
        render();
      }
    }
  }, 5000);
}
