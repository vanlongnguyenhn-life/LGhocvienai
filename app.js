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
  cau921Data: (uid) => API.request(`/api/cau921/data/${uid}`),
  cau921MyStatus: () => API.request("/api/cau921/my-status"),
  cau921Invite: () => API.request("/api/cau921/invite", { method: "POST" }),
  cau921Grade: (uid, sc) => {
    const fd = new FormData();
    fd.append("info_score", String(sc.info));
    fd.append("avatars_score", String(sc.avatars));
    fd.append("design_score", String(sc.design));
    fd.append("comment", sc.comment || "");
    return API.request(`/api/cau921/grade/${uid}`, { method: "POST", body: fd });
  },
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
    .replace(/\{\{base_url\}\}/g, location.origin)
    // Mã cá nhân của câu 11.6 — Bé Ailai dựa vào đây để biết lệnh /help là của ai.
    .replace(/\{\{help_code\}\}/g, `${agentTokenInfo.uid}-${String(agentTokenInfo.token).slice(0, 8)}`)
    // Email Google giáo viên đã đăng ký cho học viên này (câu 9.16). Chưa đăng ký thì nói rõ
    // là tài khoản đăng nhập lần đầu sẽ bị khoá, thay vì để trống gây hoang mang.
    .replace(
      /\{\{gws_email\}\}/g,
      agentTokenInfo.gws_email || "(giáo viên chưa đăng ký — tài khoản bạn đăng nhập LẦN ĐẦU sẽ được khoá)"
    )
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
          delete a.mediaStatus;
          if (a.helpStatus === "loading") delete a.helpStatus;
          if (a.thaoLuanStatus === "loading") delete a.thaoLuanStatus;
          if (a.hintStatus === "loading") delete a.hintStatus;
          if (a.letterStatus === "loading") delete a.letterStatus;
          if (a.gwsStatus === "loading") delete a.gwsStatus;
          if (a.npcFriend === "loading") delete a.npcFriend;
          if (a.npcAvatar === "loading") delete a.npcAvatar;
          // Câu 9.21: XOÁ HẲN chứ không chỉ xoá lúc "loading". Bảng "ai đã chấm cho mình" là
          // ảnh chụp tại một thời điểm, mà nó chỉ tự gọi lại khi giá trị là undefined — giữ bản
          // cũ trong localStorage nghĩa là học viên tải lại trang vẫn thấy số cũ (bạn vừa chấm
          // xong mà không hiện), phải bấm "Kiểm tra lại" mới thấy. Bỏ đi để mở trang là số mới.
          delete a.peer;
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

// Đề bài trước đây là chữ trơn nên không nhấn mạnh được chỗ nào quan trọng. Cho phép ba dấu
// gọn nhẹ ngay trong chuỗi: **đậm**, _nghiêng_, `mã`. Luôn thoát HTML TRƯỚC rồi mới đổi dấu,
// nên nội dung không thể chèn thẻ lạ vào trang.
const SO_THU_TU = /^\s*\d+[.)]\s+/;
const GACH_DAU = /^\s*[-•]\s+/;
// Đề bài dài (Bài 12/13) có tiêu đề nhiều cấp như bản in: "## " là mục lớn, "### " là mục nhỏ.
const TIEU_DE_LON = /^##\s+(.+)$/;
const TIEU_DE_NHO = /^###\s+(.+)$/;

function dinhDangChu(s) {
  const thoat = (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const trongDong = (t) =>
    t
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(“"])_([^_\n]+)_(?=$|[\s)„".,;:!?])/g, "$1<em>$2</em>")
      .replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Đề bài gốc hay liệt kê thành danh sách đánh số / gạch đầu dòng. Gom các dòng liền nhau
  // cùng kiểu thành <ol>/<ul> thật, thay vì để mỗi dòng trôi tự do sau một <br>.
  const dong = thoat.split("\n");
  const khoi = [];
  let i = 0;
  while (i < dong.length) {
    const mau = SO_THU_TU.test(dong[i]) ? SO_THU_TU : GACH_DAU.test(dong[i]) ? GACH_DAU : null;
    if (mau) {
      const the = mau === SO_THU_TU ? "ol" : "ul";
      const muc = [];
      while (i < dong.length && mau.test(dong[i])) {
        muc.push("<li>" + trongDong(dong[i].replace(mau, "")) + "</li>");
        i++;
      }
      khoi.push(`<${the} class="q-danh-sach">${muc.join("")}</${the}>`);
    } else if (TIEU_DE_NHO.test(dong[i])) {
      khoi.push(`<h5 class="q-de-muc-nho">${trongDong(dong[i].replace(TIEU_DE_NHO, "$1"))}</h5>`);
      i++;
    } else if (TIEU_DE_LON.test(dong[i])) {
      khoi.push(`<h4 class="q-de-muc">${trongDong(dong[i].replace(TIEU_DE_LON, "$1"))}</h4>`);
      i++;
    } else {
      khoi.push(trongDong(dong[i]));
      i++;
    }
  }
  // Dòng trống quanh khối danh sách đã thành khoảng cách của chính khối đó, bỏ <br> thừa đi.
  return khoi
    .join("<br>")
    .replace(/(?:<br>)+(<(?:ol|ul) )/g, "$1")
    .replace(/(<\/(?:ol|ul)>)(?:<br>)+/g, "$1")
    .replace(/(?:<br>)+(<h[45] )/g, "$1")
    .replace(/(<\/h[45]>)(?:<br>)+/g, "$1");
}

// Chuỗi nhiều dòng cũng phải đi qua bộ định dạng: thẻ <p> gộp hết xuống dòng thành một mạch,
// đề bài mất sạch bố cục đoạn nếu chỉ đổ chữ trơn vào.
function coDinhDang(s) {
  return /\*\*|`|\n|(^|[\s(“"])_[^_\n]+_/.test(s || "");
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
    } else if (state.view === "grade") {
      root.appendChild(renderShell(renderGradePage()));
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
      // Khôi phục lựa chọn cũ theo NỘI DUNG, không theo vị trí ô. Thứ tự lựa chọn có thể đã đổi
      // kể từ lúc học viên trả lời (xem phần xáo thứ tự trong gen_manifest.js) — nếu cứ tô theo
      // chỉ số cũ thì mở lại bài sẽ sáng nhầm ô, trông như hệ thống chấm sai.
      const q = QUESTION_BY_CODE[code];
      if (q && Array.isArray(a.selectedTexts) && Array.isArray(q.options)) {
        const mapped = a.selectedTexts.map((t) => q.options.indexOf(t)).filter((i) => i >= 0);
        if (mapped.length === a.selectedTexts.length) a.selected = mapped;
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
// Chạy ở máy (localhost) thì KHÔNG khoá, để xem trước câu chưa mở mà không phải sửa mã rồi
// phải nhớ sửa lại — quên một lần là cả bài lộ ra web thật. Học viên chỉ vào qua tên miền
// thật nên không ảnh hưởng. Khoá này vốn cũng chỉ che giao diện: data.public.js đã chứa mọi
// câu từ đầu, phần chặn thật nằm ở máy chủ.
const CHAY_O_MAY = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const LOCKED_FROM_CODE = CHAY_O_MAY ? "" : "gate.1";
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
    if (q.videoLabel) body.appendChild(el("p", { class: "q-prompt" }, q.videoLabel));
    if (q.video) body.appendChild(renderQuestionVideo(q.video));
    const loiDe = resolveAgentPlaceholders(q.prompt, q.code);
    body.appendChild(
      coDinhDang(loiDe)
        ? el("p", { class: "q-prompt", html: dinhDangChu(loiDe) })
        : el("p", { class: "q-prompt" }, loiDe)
    );
    if (q.image) body.appendChild(el("img", { class: "q-image", src: q.image, alt: "" }));
    if (q.chatLog) body.appendChild(renderChatLog(q.chatLog));
    if (q.copyPrompt) body.appendChild(renderCopyPromptBox(resolveAgentPlaceholders(q.copyPrompt, q.code)));
    if (q.copyPromptTrailing) body.appendChild(el("p", { class: "q-prompt" }, q.copyPromptTrailing));
    if (q.helpPing) body.appendChild(renderHelpPing(q, a));
    // Khối đặc tả dài có đánh số và có liên kết bấm được (câu 10.26). Nội dung do mình soạn
    // trong data.js chứ không lấy từ người dùng, nên dựng thẳng bằng html là an toàn.
    if (q.requirementsHtml) {
      body.appendChild(el("div", { class: "q-yeucau", html: resolveAgentPlaceholders(q.requirementsHtml, q.code) }));
    }
    if (q.submitPrompt) {
      body.appendChild(el("p", { class: "q-prompt q-nhan-muc" }, q.submitLabel || "Cách nộp bài:"));
      if (q.submitIntro) body.appendChild(el("p", { class: "q-prompt" }, q.submitIntro));
      body.appendChild(renderCopyPromptBox(resolveAgentPlaceholders(q.submitPrompt, q.code)));
      if (q.submitNote) body.appendChild(el("p", { class: "q-prompt" }, q.submitNote));
    }
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
    } else if (q.type === "code" && q.hasHints) {
      // Câu nhập mã CÓ bảng gợi ý mở dần (9.23) — dùng chung khung với 6.11/7.9, bên trong
      // vẫn là renderCodeInput nên cách nộp bài không đổi.
      body.appendChild(renderAgentSecretCode(q, a));
    } else if (q.type === "code" || q.type === "my_token_check") {
      body.appendChild(renderCodeInput(q, a));
    } else if (q.type === "agent_secret_code" || q.type === "pi_lab_code") {
      body.appendChild(renderAgentSecretCode(q, a));
    } else if (q.type === "agent_demo") {
      body.appendChild(renderAgentDemo(q, a));
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
      body.appendChild(renderReflectInput(q, a, lesson));
      if (q.thaoLuan) body.appendChild(renderThaoLuan(q, a));
    } else if (q.type === "pi_lab_letter") {
      body.appendChild(renderPiLabLetter(q, a));
      if (a.letterStatus === undefined) {
        a.letterStatus = "loading";
        refreshLetterStatus(q, a);
      }
    } else if (q.type === "npc_avatar") {
      body.appendChild(renderNpcAvatar(q, a));
      if (a.npcAvatar === undefined) {
        a.npcAvatar = "loading";
        refreshNpcAvatar(q, a);
      }
    } else if (q.type === "npc_time") {
      body.appendChild(renderNpcTime(q, a));
      if (a.npcFriend === undefined) {
        a.npcFriend = "loading";
        refreshNpcFriend(q, a, false);
      }
    } else if (q.type === "peer_review") {
      body.appendChild(renderPeerReview(q, a));
      if (a.peer === undefined) {
        a.peer = "loading";
        refreshPeerReview(q, a);
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
      // Câu bình luận (11.17/11.26) KHÔNG có nút "Nộp bài" — giống web tham khảo, việc nộp do
      // nút "Gửi bình luận" ngay dưới ô nhập lo, và chỉ AI chấm đạt mới tính là qua bài.
      q.thaoLuan ? null : el(
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
            if (q.type === "agent_secret_code" || q.type === "pi_lab_code" || q.hasHints) {
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
    // Vài câu (11.25) vế trái là các khối prompt nhiều màu chứ không phải một dòng chữ. Nội
    // dung do mình soạn trong data.js nên dựng thẳng bằng html là an toàn; phần chấm điểm vẫn
    // dùng `leftItems` dạng chuỗi nên bảng đáp án không đổi.
    const nhanHtml = (q.leftItemsHtml || [])[i];
    row.appendChild(
      nhanHtml
        ? el("div", { class: "match-left", html: nhanHtml })
        : el("div", { class: "match-left" }, left)
    );
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

// ===== Câu 9.21: trang các bạn cùng lớp chấm chéo bộ slide =====
// Vào bằng link ?cham-bai=<uid>. Người chấm phải đang đăng nhập tài khoản của CHÍNH họ —
// server đối chiếu phiên đăng nhập với danh sách bạn cùng lớp, nên Agent không chấm hộ được.
let gradeState = { loading: true, data: null, error: "", form: { info: 7, avatars: 7, design: 7, comment: "" }, saving: false };

async function loadGradePage() {
  gradeState.loading = true;
  gradeState.error = "";
  render();
  try {
    const d = await API.cau921Data(state.gradeSubjectUid);
    gradeState.data = d;
    if (d.diem_cua_toi) {
      gradeState.form = {
        info: d.diem_cua_toi.info,
        avatars: d.diem_cua_toi.avatars,
        design: d.diem_cua_toi.design,
        comment: d.diem_cua_toi.comment || "",
      };
    }
  } catch (err) {
    gradeState.error = err.message || "Không tải được bài để chấm.";
  }
  gradeState.loading = false;
  render();
}

async function submitGrade() {
  if (gradeState.saving) return;
  gradeState.saving = true;
  render();
  try {
    const d = await API.cau921Grade(state.gradeSubjectUid, gradeState.form);
    gradeState.data = Object.assign({}, gradeState.data, d);
    showToast("Đã gửi điểm — cảm ơn bạn!");
  } catch (err) {
    showToast(err.message || "Chưa gửi được điểm.");
  }
  gradeState.saving = false;
  render();
}

function scoreRow(label, key) {
  // Thanh trượt 1-10 giống web tham khảo — kéo một cái là xong, chấm 9 bài không thấy mệt.
  // KHÔNG gọi render() khi kéo: render() dựng lại cả trang, thanh trượt sẽ mất focus giữa
  // chừng và nhảy giật. Chỉ cập nhật số hiển thị tại chỗ.
  const val = gradeState.form[key];
  const num = el("span", { class: "grade-score-value" }, [String(val)]);
  const slider = el("input", {
    class: "grade-slider",
    type: "range",
    min: "1",
    max: "10",
    step: "1",
    value: String(val),
  });
  slider.addEventListener("input", (e) => {
    gradeState.form[key] = Number(e.target.value);
    num.textContent = e.target.value;
  });
  return el("div", { class: "grade-score-row" }, [
    el("span", { class: "grade-score-label" }, label),
    slider,
    num,
  ]);
}

function renderGradePage() {
  const wrap = el("div", { class: "grade-page" });
  wrap.appendChild(
    el("button", { class: "help-link", onclick: () => { state.view = "home"; saveState(); render(); } }, ["← Về trang lớp học"])
  );
  if (gradeState.loading) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang tải bài để chấm..."));
    return wrap;
  }
  if (gradeState.error) {
    wrap.appendChild(el("div", { class: "secret-note" }, gradeState.error));
    return wrap;
  }
  const d = gradeState.data || {};
  wrap.appendChild(el("h2", {}, ["Chấm bài cho " + (d.hv_ten || "bạn học")]));
  wrap.appendChild(
    el("div", { class: "secret-note" }, [
      `Đã có ${d.num_graders || 0}/${d.so_ban_can_cham || 0} bạn chấm · điểm trung bình hiện tại ${d.avg_overall || "0.00"} (cần từ ${d.pass_threshold} trở lên)`,
    ])
  );

  if (d.slide_url) {
    const embed = d.slide_url.replace("/edit", "/embed").replace("/preview", "/embed").replace(/\?.*$/, "");
    const frame = el("iframe", { class: "grade-slide", src: embed, allowfullscreen: "true" });
    wrap.appendChild(frame);
    wrap.appendChild(
      el("a", { class: "help-link", href: d.slide_url, target: "_blank", rel: "noopener" }, ["Mở slide ở tab mới ↗"])
    );
  } else {
    wrap.appendChild(el("div", { class: "secret-note" }, "Bạn này chưa nộp bộ slide nào."));
  }

  if (d.ly_do_khong_cham_duoc) {
    wrap.appendChild(el("div", { class: "secret-note" }, d.ly_do_khong_cham_duoc));
    return wrap;
  }

  const form = el("div", { class: "assignment-box" }, [
    el("div", { class: "label" }, [d.diem_cua_toi ? "Bạn đã chấm bài này — có thể sửa lại điểm" : "Chấm 3 tiêu chí (thang 10)"]),
  ]);
  form.appendChild(scoreRow("Thông tin", "info"));
  form.appendChild(scoreRow("Ảnh đại diện", "avatars"));
  form.appendChild(scoreRow("Trình bày", "design"));
  form.appendChild(
    el("button", { class: "submit-btn", disabled: gradeState.saving ? "disabled" : null, onclick: () => submitGrade() },
      [gradeState.saving ? "Đang gửi..." : d.diem_cua_toi ? "Cập nhật điểm" : "Gửi điểm"])
  );
  wrap.appendChild(form);
  return wrap;
}

// ===== Câu 9.21 nhìn từ phía CHỦ BÀI: link đi nhờ + ai đã chấm, ai chưa =====
async function refreshPeerReview(q, a) {
  try {
    a.peer = await API.cau921MyStatus();
  } catch (e) {
    a.peer = null;
  }
  saveState();
  render();
  openQuestion(q.code);
}

async function invitePeers(q, a) {
  try {
    const r = await API.cau921Invite();
    showToast(r.message || `Đã nhắn Lark cho ${r.da_gui} bạn.` + ((r.that_bai || []).length ? ` Chưa nhắn được: ${r.that_bai.join(", ")}` : ""));
  } catch (err) {
    showToast(err.message || "Chưa gửi được lời nhờ.");
  }
}

function renderPeerReview(q, a) {
  const wrap = el("div", {});
  const st = a.peer;
  if (st === "loading" || st === undefined) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang tải tình hình chấm bài..."));
    return wrap;
  }
  if (!st) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Chưa tải được — bấm nút bên dưới để thử lại."));
    wrap.appendChild(el("button", { class: "help-link", onclick: () => refreshPeerReview(q, a) }, ["🔄 Thử lại"]));
    return wrap;
  }

  wrap.appendChild(
    el("div", { class: "secret-note" }, [
      `Đã có ${st.num_graders}/${st.so_ban_can_cham} bạn chấm · trung bình ${st.avg_overall} (cần từ ${st.pass_threshold})`,
    ])
  );

  const linkRow = el("div", { class: "assignment-box" }, [
    el("div", { class: "label" }, ["Link gửi cho các bạn chấm"]),
    el("div", { class: "peer-link" }, [st.link_cham || ""]),
  ]);
  linkRow.appendChild(
    el("button", {
      class: "help-link",
      onclick: () => {
        navigator.clipboard.writeText(st.link_cham || "").then(
          () => showToast("Đã sao chép link"),
          () => showToast("Không sao chép được — bạn bôi đen rồi copy tay nhé")
        );
      },
    }, ["📋 Sao chép link"])
  );
  linkRow.appendChild(
    el("button", { class: "help-link", onclick: () => invitePeers(q, a) }, ["💬 Nhắn Lark nhờ các bạn chưa chấm"])
  );
  wrap.appendChild(linkRow);

  const list = el("div", { class: "criteria-list" });
  (st.friends || []).forEach((f) => {
    const done = !!f.scores;
    list.appendChild(
      el("div", { class: "assignment-box" }, [
        el("div", { class: "label" }, [(done ? "✅ " : "⏳ ") + f.fullname + (done ? ` — ${f.scores.avg}/10` : " — chưa chấm")]),
        done && f.scores.comment ? el("div", { class: "secret-note" }, ["“" + f.scores.comment + "”"]) : null,
      ])
    );
  });
  wrap.appendChild(list);
  wrap.appendChild(el("button", { class: "help-link", onclick: () => refreshPeerReview(q, a) }, ["🔄 Kiểm tra lại"]));
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

// ===== Câu 9.11: hiện tranh ASCII của bạn Mít + nút nhận mốc giờ khác =====
async function refreshNpcFriend(q, a, reset) {
  try {
    a.npcFriend = reset
      ? await API.request("/api/pi-lab/npc-friend/reset", { method: "POST" })
      : await API.request("/api/pi-lab/npc-friend");
  } catch (e) {
    a.npcFriend = null;
  }
  saveState();
  render();
  openQuestion(q.code);
}

function renderNpcTime(q, a) {
  const wrap = el("div", {});
  const st = a.npcFriend;
  if (st === "loading" || st === undefined) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang tải chân dung bạn Mít..."));
  } else if (st && st.ascii) {
    wrap.appendChild(el("pre", { class: "ascii-avatar" }, st.ascii));
  } else {
    wrap.appendChild(el("div", { class: "secret-note" }, "Chưa tải được chân dung — bấm nút bên dưới để thử lại."));
  }
  wrap.appendChild(
    el(
      "button",
      {
        class: "help-link",
        onclick: () => {
          if (!confirm("Nhận một mốc giờ KHÁC của bạn Mít? Giờ cũ sẽ không còn đúng, bạn phải hỏi Agent lại từ đầu.")) return;
          refreshNpcFriend(q, a, true);
        },
      },
      ["🔀 Nhận mốc giờ khác"]
    )
  );
  wrap.appendChild(renderCodeInput(q, a));
  return wrap;
}

// ===== Câu 9.12: kiểm tra Agent đã thật sự đổi avatar cho người bạn hay chưa =====
async function refreshNpcAvatar(q, a) {
  try {
    a.npcAvatar = await API.request("/api/pi-lab/npc-avatar/status");
  } catch (e) {
    a.npcAvatar = null;
  }
  saveState();
  render();
  openQuestion(q.code);
}

function renderNpcAvatar(q, a) {
  const wrap = el("div", {});
  const st = a.npcAvatar;
  if (st === "loading" || st === undefined) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang kiểm tra..."));
  } else if (st && st.done) {
    wrap.appendChild(
      el("div", { class: "secret-note" }, `🎉 Bạn ${st.name} đã nhận avatar mới! Bấm Nộp bài để chốt điểm.`)
    );
    if (st.ascii) wrap.appendChild(el("pre", { class: "ascii-avatar" }, st.ascii));
  } else {
    wrap.appendChild(
      el("div", { class: "secret-note" },
        "Chưa thấy avatar được đổi. Copy đề bài phía trên cho Agent chạy, xong quay lại bấm Kiểm tra.")
    );
  }
  wrap.appendChild(el("button", { class: "help-link", onclick: () => refreshNpcAvatar(q, a) }, ["🔄 Kiểm tra lại"]));
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
    // Dựng theo đúng kiểu web tham khảo: cả bảng chấm nằm trong một thẻ có khung. Đầu thẻ là
    // tiêu đề bên trái và liên kết "mở video" nằm bên phải cùng dòng; giữa là từng tiêu chí
    // trong ô nền nhạt (xanh nếu đạt, đỏ nếu rớt) với dấu ✅/❌ ngay sau tên; cuối là dòng
    // "Kết quả: ...". Dòng "Video đã nộp" nằm NGOÀI thẻ, phía dưới.
    const the = el("div", { class: "gws-ket-qua" });
    the.appendChild(
      el("div", { class: "gws-ket-qua-dau" }, [
        el("span", { class: "gws-ket-qua-tieu-de" }, "📋 Kết quả lần nộp gần nhất"),
        st.url
          ? el("a", { href: st.url, target: "_blank", rel: "noopener", class: "gws-mo-video" }, "mở video")
          : null,
      ])
    );
    const list = el("div", { class: "gws-criteria" });
    (st.criteria || []).forEach((c) => {
      list.appendChild(
        el("div", { class: "gws-criterion " + (c.ok ? "ok" : "fail") }, [
          el("div", { class: "gws-criterion-head" }, [
            el("strong", {}, c.label),
            el("span", { class: "gws-criterion-badge" }, c.ok ? "✅" : "❌"),
          ]),
          c.note ? el("div", { class: "gws-criterion-note" }, c.note) : null,
        ])
      );
    });
    the.appendChild(list);
    const soDat = (st.criteria || []).filter((c) => c.ok).length;
    the.appendChild(
      el("div", { class: "gws-tong" }, [
        el("strong", {}, "Kết quả: " + (st.ok ? "ĐẠT" : "Chưa đạt")),
        el("span", { class: "gws-tong-phu" }, ` (${soDat}/${(st.criteria || []).length} tiêu chí)`),
      ])
    );
    the.appendChild(
      el("div", { class: "gws-loi-nhac" },
        st.ok
          ? "🎉 Đạt mọi tiêu chí — bấm Nộp bài ở dưới để chốt điểm."
          : "⚠️ Sửa theo tiêu chí còn rớt rồi cho Agent nộp lại.")
    );
    wrap.appendChild(the);
    if (st.url) {
      wrap.appendChild(
        el("p", { class: "q-prompt gws-da-nop" }, [
          "Video đã nộp: ",
          el("a", { href: st.url, target: "_blank", rel: "noopener", class: "gws-mo-video" }, "mở link"),
        ])
      );
    }
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
  agent_demo: "/api/demo-status",
};

// Mở widget chatbot demo ngay trong trang (khung nổi), không đá học viên sang tab khác giữa bài.
function moKhungDemo(ver, q, a) {
  const nen = el("div", { class: "demo-nen" });
  const hop = el("div", { class: "demo-hop" });
  const thanh = el("div", { class: "demo-thanh" }, [
    el("span", {}, `Chatbot Demo (${String(ver).toUpperCase()}) · Bé Ailai`),
    el("div", { class: "demo-nut-nhom" }, [
      el("a", { class: "help-link", href: `/demo?ver=${ver}`, target: "_blank", rel: "noopener" }, "Mở tab mới ↗"),
      el("button", { class: "help-link", onclick: () => dongKhung() }, "✕ Đóng"),
    ]),
  ]);
  hop.appendChild(thanh);
  const khung = el("iframe", { class: "demo-khung", src: `/demo?ver=${ver}` });
  // Khung nhúng hỏi xin khoá phiên: trình duyệt nào chặn cookie trong iframe thì widget vẫn vào
  // được bằng cặp header của chính học viên. Chỉ trả lời đúng khung này và đúng nguồn của mình.
  const dongKhung = () => {
    nen.remove();
    window.removeEventListener("message", traLoiKhoa);
    if (q && a) fetchMediaStatus(q, a); // vừa chat xong thì tiêu chí phải cập nhật ngay
  };
  const traLoiKhoa = (e) => {
    if (e.origin !== location.origin || e.source !== khung.contentWindow) return;
    if (!e.data || e.data.loai !== "ags-demo-xin-khoa") return;
    khung.contentWindow.postMessage(
      {
        loai: "ags-demo-khoa",
        uid: agentTokenInfo ? agentTokenInfo.uid : null,
        token: agentTokenInfo ? agentTokenInfo.token : null,
      },
      location.origin
    );
  };
  window.addEventListener("message", traLoiKhoa);
  hop.appendChild(khung);
  nen.appendChild(hop);
  nen.addEventListener("click", (e) => {
    if (e.target === nen) dongKhung();
  });
  document.body.appendChild(nen);
}

async function fetchThaoLuan(q, a) {
  a.thaoLuanStatus = "loading";
  try {
    a.thaoLuanStatus = await API.request(`/api/thao-luan?question_code=${encodeURIComponent(q.code)}`);
  } catch (err) {
    a.thaoLuanStatus = { error: err.message };
  }
  render();
  openQuestion(q.code);
}

// Luồng thảo luận của cả lớp (câu 11.17). Máy chủ chỉ trả bài của bạn khác SAU KHI mình đã nộp,
// nên phần này trống cho tới lúc đó — cố ý, để không ai chép bài sẵn.
function renderThaoLuan(q, a) {
  const wrap = el("div", { class: "thao-luan" });

  if (a.thaoLuanStatus === undefined) {
    a.thaoLuanStatus = "loading";
    setTimeout(() => fetchThaoLuan(q, a), 0);
  }

  if (a.thaoLuanStatus === "loading") {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang tải bình luận..."));
  } else if (a.thaoLuanStatus && a.thaoLuanStatus.error) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Lỗi tải bình luận: " + a.thaoLuanStatus.error));
  } else if (!a.thaoLuanStatus.da_nop) {
    wrap.appendChild(
      el(
        "div",
        { class: "secret-note" },
        "Bình luận của các bạn khác chỉ hiện ra khi bình luận của bạn được chấm ĐẠT — gửi xong chưa chắc đã qua bài, hãy viết cho đủ ý."
      )
    );
  } else if (!(a.thaoLuanStatus.comments || []).length) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Bạn là người đầu tiên của lớp chia sẻ ở câu này 🎉"));
  } else {
    a.thaoLuanStatus.comments.forEach((c) => {
      const the = el("div", { class: "binh-luan" });
      const dau = el("div", { class: "bl-dau" });
      dau.appendChild(
        el("img", { class: "bl-avatar", src: c.avatar_url || "assets/logo-icon.png", alt: "" })
      );
      const cot = el("div", { class: "bl-cot" }, [
        el("span", { class: "bl-ten" }, [c.ten, c.la_toi ? el("span", { class: "bl-toi" }, "Bạn") : null]),
      ]);
      if (c.luc) cot.appendChild(el("span", { class: "bl-luc" }, c.luc));
      cot.appendChild(el("div", { class: "bl-noi-dung" }, c.noi_dung));
      dau.appendChild(cot);
      the.appendChild(dau);
      wrap.appendChild(the);
    });
  }

  wrap.appendChild(el("button", { class: "help-link", onclick: () => fetchThaoLuan(q, a) }, "🔄 Tải lại"));
  return wrap;
}

async function fetchHelpStatus(q, a) {
  a.helpStatus = "loading";
  try {
    a.helpStatus = await API.request("/api/help-ping-status");
  } catch (err) {
    a.helpStatus = { error: err.message };
  }
  render();
  openQuestion(q.code);
}

// Câu 11.6: bảng theo dõi xem Bé Ailai đã nhận được lệnh /help của học viên chưa.
function renderHelpPing(q, a) {
  const wrap = el("div", { class: "media-status" });

  if (a.helpStatus === undefined) {
    a.helpStatus = "loading";
    setTimeout(() => fetchHelpStatus(q, a), 0);
  }

  if (a.helpStatus === "loading") {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang kiểm tra tin nhắn /help..."));
  } else if (a.helpStatus && a.helpStatus.error) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Lỗi kiểm tra: " + a.helpStatus.error));
  } else {
    const box = el("div", { class: "assignment-box" });
    box.appendChild(el("div", { class: "label" }, "Bé Ailai đã nhận lệnh /help của bạn chưa?"));
    box.appendChild(
      el(
        "div",
        { class: "req-text" },
        a.helpStatus.da_nhan
          ? `Đã nhận lúc ${a.helpStatus.luc} (còn hạn ${a.helpStatus.han_gio} giờ).`
          : `Chưa nhận được. Nhắn đúng mẫu ở trên cho Bé Ailai trong nhóm lớp, rồi bấm Kiểm tra lại.`
      )
    );
    box.appendChild(
      el("div", { class: "criteria-list" }, [
        el("li", { class: a.helpStatus.da_nhan ? "pass" : "fail" }, [
          el("span", { class: "c-icon" }, a.helpStatus.da_nhan ? "✓" : "✗"),
          el("span", {}, a.helpStatus.da_nhan ? "Kết quả: Đạt" : "Kết quả: Chưa đạt"),
        ]),
      ])
    );
    wrap.appendChild(box);
  }

  wrap.appendChild(
    el("button", { class: "help-link", onclick: () => fetchHelpStatus(q, a) }, "🔄 Kiểm tra lại")
  );
  return wrap;
}

function renderAgentDemo(q, a) {
  const wrap = el("div", { class: "media-status" });
  const ver = q.demoVer || "v1";

  wrap.appendChild(
    el("button", { class: "submit-btn demo-mo-nut", onclick: () => moKhungDemo(ver, q, a) }, q.demoLabel || "Mở Chatbot Demo (V1)")
  );

  if (a.mediaStatus === undefined) {
    // Hoãn sang tick sau: đang ở giữa một lượt render(), gọi render() lồng sẽ phá cây DOM dở.
    a.mediaStatus = "loading";
    setTimeout(() => fetchMediaStatus(q, a), 0);
  }

  if (a.mediaStatus === "loading") {
    wrap.appendChild(el("div", { class: "secret-note" }, "Đang tải tiến độ bài tập trong widget..."));
  } else if (a.mediaStatus && a.mediaStatus.error) {
    wrap.appendChild(el("div", { class: "secret-note" }, "Lỗi tải tiến độ: " + a.mediaStatus.error));
  } else {
    wrap.appendChild(el("div", { class: "label" }, "Tiêu chí chấm"));
    (a.mediaStatus.criteria || []).forEach((c) => {
      const box = el("div", { class: "assignment-box" });
      box.appendChild(el("div", { class: "label" }, c.title));
      if (c.detail) box.appendChild(el("div", { class: "req-text" }, c.detail));
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
  }

  wrap.appendChild(
    el("button", { class: "help-link", onclick: () => fetchMediaStatus(q, a) }, "🔄 Kiểm tra lại")
  );
  return wrap;
}

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

function renderReflectInput(q, a, lesson) {
  const wrap = el("div", {});
  const minLength = q.minLength || 20;

  // Câu bình luận: tiêu đề "N bình luận" nằm TRÊN ô nhập, đúng thứ tự của web tham khảo.
  if (q.thaoLuan) {
    const st = a.thaoLuanStatus;
    const soBl = st && st.comments ? st.comments.length : 0;
    wrap.appendChild(el("div", { class: "tl-dau" }, soBl ? `${soBl} bình luận` : "Bình luận"));
  }
  const ta = el("textarea", {
    class: "reflect-input",
    // Câu thảo luận là bình luận gửi cả lớp đọc, không phải chỗ dán lời Agent — lời nhắc trong
    // ô phải nói đúng việc đang làm.
    placeholder: q.thaoLuan ? "Viết bình luận..." : "Dán nguyên văn câu trả lời của Agent...",
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

  // Nút gửi của câu bình luận nằm ngay dưới ô nhập và mang dáng nút phụ — cố ý KHÔNG giống nút
  // "Nộp bài" của các câu khác: bấm gửi chỉ là đăng bình luận, chưa phải là qua bài.
  if (q.thaoLuan) {
    wrap.appendChild(
      el("div", { class: "tl-gui-hang" }, [
        el(
          "button",
          {
            class: "tl-gui",
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
          a.submitting ? "Đang gửi..." : "Gửi bình luận"
        ),
      ])
    );
  }
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
    case "npc_time":
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
      showToast("Bạn hãy chọn ít nhất 1 đáp án trước khi nộp bài");
      return;
    }
    await submitForServerVerdict(q, a);
  } else if (q.type === "match") {
    if (a.matchSelected.length < q.leftItems.length || a.matchSelected.some((v) => v == null || v < 0)) {
      showToast("Bạn hãy nối đủ tất cả các mục trước khi nộp bài");
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
      showToast("Bạn hãy nhập mã xác nhận trước khi nộp bài");
      return;
    }
    // Câu dạng gõ chữ không phải câu nào cũng là mật thư (10.0 gõ cam kết, 10.12 gõ một cụm
    // từ) — nói "đọc lại mật thư" ở những câu đó là sai chỗ. Câu nào cần lời nhắc riêng thì
    // khai wrongHint trong data.js.
    await submitForServerVerdict(q, a, q.wrongHint || "Chưa đúng, bạn kiểm tra lại rồi nộp lại nhé");
  } else if (q.type === "pi_lab_code") {
    if (!a.text || a.text.trim().length === 0) {
      showToast("Bạn hãy nhập mã xác nhận trước khi nộp bài");
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
      showToast("Bạn hãy dán token của bạn trước khi nộp bài");
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
  } else if (q.type === "npc_avatar") {
    if (!a.npcAvatar || a.npcAvatar === "loading" || !a.npcAvatar.done) {
      showToast("Chưa thấy avatar được đổi — nhờ Agent chạy xong rồi bấm Kiểm tra lại nhé.");
      return;
    }
    // Server tự kiểm tra lại: phải có avatar đã lưu cho chính học viên này.
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
  } else if (q.type === "peer_review") {
    // Server tự đếm lại số lượt chấm và điểm trung bình trong bảng peer_reviews — client
    // không tạo được phiếu chấm nào, nên ở đây chỉ cần gọi và để server phán quyết.
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
      showToast(`Hoàn thành! +${q.points} điểm`);
    } catch (err) {
      showToast(err.message);
      return;
    }
  } else if (q.type === "npc_time") {
    if (!a.text || a.text.trim().length === 0) {
      showToast("Bạn hãy nhập giờ hoàn thành (HH:MM:SS DD/MM/YYYY) trước khi nộp bài");
      return;
    }
    // Server tự chấm theo giờ của CHÍNH người bạn được ghép cho học viên này.
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
      showToast(`Chính xác! +${q.points} điểm`);
    } catch (err) {
      a.status = "wrong";
      a.awardedPoints = 0;
      saveState();
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
  } else if (q.type === "agent_media" || q.type === "agent_electron" || q.type === "agent_demo") {
    if (!a.mediaStatus || a.mediaStatus === "loading" || !a.mediaStatus.is_correct) {
      showToast(
        q.type === "agent_demo"
          ? "Chưa đủ tiêu chí trong widget — mở Chatbot Demo chat tiếp rồi bấm Kiểm tra lại."
          : "Chưa thấy Agent nộp bài đạt đủ tiêu chí — bấm Kiểm tra lại sau khi Agent đã chạy xong."
      );
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
      showToast("Bạn hãy dán token vừa tạo trước khi nộp bài");
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
      showToast(
        q.thaoLuan
          ? `Bình luận cần ít nhất ${minLength} ký tự`
          : `Cần dán câu trả lời của Agent, tối thiểu ${minLength} ký tự`
      );
      return;
    }
    showToast(q.thaoLuan ? "Đang gửi bình luận..." : "Đang chấm bài...");
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
    showToast(
      result.valid
        ? q.thaoLuan
          ? `Đã gửi bình luận! +${q.points} điểm — giờ bạn đọc được bài của cả lớp`
          : `Đã chấm đạt! +${q.points} điểm`
        : result.reason || "Câu trả lời chưa đạt, Bạn xem lại nhé"
    );
    persistQuestionStatus(q, a);
    // Gửi đạt rồi thì tải lại luồng bình luận — đây chính là lúc bài của cả lớp được mở ra.
    if (q.thaoLuan && result.valid) a.thaoLuanStatus = undefined;
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

  // Link các bạn nhận được để chấm bài câu 9.21. Đọc TRƯỚC khi gọi API.me() để dù chưa đăng
  // nhập, sau khi đăng nhập xong vẫn quay lại đúng bài cần chấm.
  const chamBai = new URLSearchParams(location.search).get("cham-bai");
  if (chamBai && /^\d+$/.test(chamBai)) {
    state.gradeSubjectUid = Number(chamBai);
    state.view = "grade";
    history.replaceState(null, "", location.pathname);
  }

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
    if (state.view === "grade" && state.gradeSubjectUid) loadGradePage();
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
