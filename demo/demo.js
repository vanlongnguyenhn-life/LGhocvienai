// Widget Chatbot Demo V1-V4 của Bài 11 (bot tên Bé Ailai). Trang này chỉ vẽ và gửi tin; toàn bộ phần chấm bài tập nằm
// ở máy chủ (bảng demo_progress) — cố tình KHÔNG cho trình duyệt tự khai đã làm được gì.

const VER = new URLSearchParams(location.search).get("ver") || "v1";
const MA_CAU = { v1: "11.9", v2: "11.11", v3: "11.15", v4: "11.18" }[VER] || "";

const $ = (id) => document.getElementById(id);
let hoiThoaiHienTai = null;
let dangGui = false;
// Cặp khoá do TRANG CHA chuyển sang khi widget chạy trong khung nhúng — dùng khi trình duyệt
// không gửi cookie phiên vào trong khung (nhiều trình duyệt chặn theo mặc định).
let khoaTuTrangCha = null;

function xinKhoaTuTrangCha() {
  if (window.parent === window) return Promise.resolve(null); // mở ở tab riêng thì dùng cookie
  return new Promise((xong) => {
    let da = false;
    const nghe = (e) => {
      if (e.origin !== location.origin) return;
      const d = e.data || {};
      if (d.loai !== "ags-demo-khoa") return;
      da = true;
      window.removeEventListener("message", nghe);
      xong(d.uid && d.token ? { uid: String(d.uid), token: String(d.token) } : null);
    };
    window.addEventListener("message", nghe);
    window.parent.postMessage({ loai: "ags-demo-xin-khoa" }, location.origin);
    setTimeout(() => {
      if (da) return;
      window.removeEventListener("message", nghe);
      xong(null);
    }, 1500);
  });
}

async function goi(duongDan, tuyChon = {}, thuLai = true) {
  let r;
  const dau = { ...(tuyChon.headers || {}) };
  if (khoaTuTrangCha) {
    dau["X-User-Id"] = khoaTuTrangCha.uid;
    dau["X-Auth-Token"] = khoaTuTrangCha.token;
  }
  try {
    r = await fetch(duongDan, { credentials: "same-origin", ...tuyChon, headers: dau });
  } catch (e) {
    // Máy chủ đang khởi động lại thì thử thêm một lần trước khi kêu lỗi.
    if (!thuLai) throw e;
    await new Promise((ok) => setTimeout(ok, 500));
    return goi(duongDan, tuyChon, false);
  }
  if (r.status === 401 || r.status === 403) {
    // Thử lại 1 lần: phiên đăng nhập vừa được làm mới ở trang cha thì lần 2 là qua.
    if (thuLai && !tuyChon.method) {
      await new Promise((ok) => setTimeout(ok, 400));
      return goi(duongDan, tuyChon, false);
    }
    const chiTiet = await r.text().catch(() => "");
    hienChan(
      `Máy chủ trả về ${r.status} khi kiểm tra đăng nhập` +
        (chiTiet ? ` (${chiTiet.slice(0, 120)})` : "") +
        ". Hãy đăng nhập lại ở trang lớp học rồi mở lại widget."
    );
    throw new Error("chưa đăng nhập");
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.detail || "Có lỗi xảy ra");
  return d;
}

function hienChan(loi) {
  $("chan-loi").textContent = loi;
  $("chan").hidden = false;
  $("ung-dung").hidden = true;
}

// ---------- Vẽ tin nhắn ----------

function theTin(vaiTro, noiDung, kemTheo) {
  const luot = document.createElement("div");
  luot.className = "luot " + (vaiTro === "user" ? "nguoi" : "may");

  const ai = document.createElement("div");
  ai.className = "ai-noi";
  ai.textContent = vaiTro === "user" ? "Bạn" : "Bé Ailai";
  luot.appendChild(ai);

  const bong = document.createElement("div");
  bong.className = "bong";
  bong.textContent = noiDung;
  luot.appendChild(bong);

  (kemTheo || []).forEach((k) => {
    const khoi = veKemTheo(k);
    if (khoi) luot.appendChild(khoi);
  });
  return luot;
}

// Kết quả của tool được vẽ thành hình/danh sách/danh thiếp thật, để học viên thấy rõ "Agent có
// tay chân" khác "Agent chỉ biết nói" ở chỗ nào.
function veKemTheo(k) {
  if (!k) return null;
  if (k.loai === "gallery") {
    const g = document.createElement("div");
    g.className = "gallery";
    (k.hinh || []).forEach((h) => {
      const f = document.createElement("figure");
      const img = document.createElement("img");
      img.src = h.url;
      img.alt = h.ten;
      img.loading = "lazy";
      const cap = document.createElement("figcaption");
      cap.textContent = h.ten;
      f.append(img, cap);
      g.appendChild(f);
    });
    return g;
  }
  if (k.loai === "danh_sach_file") {
    const ul = document.createElement("ul");
    ul.className = "ds-file";
    (k.file || []).forEach((ten) => {
      const li = document.createElement("li");
      li.textContent = ten;
      ul.appendChild(li);
    });
    return ul;
  }
  if (k.loai === "danh_thiep") {
    const the = document.createElement("div");
    the.className = "danh-thiep";
    const tren = document.createElement("div");
    tren.className = "dt-tren";
    const ten = document.createElement("div");
    ten.className = "dt-ten";
    ten.textContent = k.ho_ten || "";
    tren.appendChild(ten);
    if (k.chuc_danh) {
      const cd = document.createElement("div");
      cd.className = "dt-chuc";
      cd.textContent = k.chuc_danh;
      tren.appendChild(cd);
    }
    const duoi = document.createElement("div");
    duoi.className = "dt-duoi";
    [k.email && "✉ " + k.email, k.lop && "🎓 " + k.lop].filter(Boolean).forEach((d) => {
      const dong = document.createElement("div");
      dong.textContent = d;
      duoi.appendChild(dong);
    });
    the.append(tren, duoi);
    return the;
  }
  return null;
}

function xuongCuoi() {
  const k = $("khung-chat");
  k.scrollTop = k.scrollHeight;
}

// ---------- Bảng tiêu chí bài tập ----------

function veBaiTap(trangThai) {
  const hop = $("bang-bai-tap");
  if (!trangThai || !trangThai.criteria || !trangThai.criteria.length) {
    hop.hidden = true;
    return;
  }
  hop.hidden = false;
  hop.innerHTML = "";
  const dau = document.createElement("div");
  dau.className = "bt-dau";
  dau.textContent = "🎯 Bài tập " + (MA_CAU || "");
  hop.appendChild(dau);

  trangThai.criteria.forEach((c) => {
    const dong = document.createElement("div");
    dong.className = "bt-dong";
    const icon = document.createElement("span");
    icon.textContent = c.ok ? "✅" : "⬜";
    const nhan = document.createElement("span");
    nhan.textContent = c.title;
    const ct = document.createElement("span");
    ct.className = "bt-chi-tiet";
    ct.textContent = c.detail ? "(" + c.detail + ")" : "";
    dong.append(icon, nhan, ct);
    hop.appendChild(dong);
  });

  const ket = document.createElement("div");
  ket.className = "bt-ket " + (trangThai.is_correct ? "dat" : "chua");
  ket.textContent = trangThai.is_correct
    ? "Đạt! Quay lại trang lớp học, bấm Kiểm tra rồi Nộp bài."
    : "Chưa đủ — chat tiếp cho đủ các mục trên nhé.";
  hop.appendChild(ket);
}

// ---------- Hội thoại ----------

async function napDanhSach() {
  const d = await goi(`/api/agent-demo/conversations?ver=${VER}`);
  const ds = $("ds-hoi-thoai");
  ds.innerHTML = "";
  (d.conversations || []).forEach((c) => {
    const dong = document.createElement("div");
    dong.className = "ht-dong";
    const nut = document.createElement("button");
    nut.className = "ht-nut" + (c.id === hoiThoaiHienTai ? " dang-mo" : "");
    nut.textContent = c.title;
    nut.title = c.title;
    nut.onclick = () => moHoiThoai(c.id, c.title);
    const xoa = document.createElement("button");
    xoa.className = "ht-xoa";
    xoa.textContent = "✕";
    xoa.title = "Xoá cuộc trò chuyện";
    xoa.onclick = async () => {
      await goi(`/api/agent-demo/conversations/${c.id}?ver=${VER}`, { method: "DELETE" });
      if (hoiThoaiHienTai === c.id) hoiThoaiMoi();
      napDanhSach();
    };
    dong.append(nut, xoa);
    ds.appendChild(dong);
  });
}

async function moHoiThoai(id, tieuDe) {
  const d = await goi(`/api/agent-demo/conversations/${id}?ver=${VER}`);
  hoiThoaiHienTai = id;
  $("tieu-de-hoi-thoai").textContent = tieuDe || "Cuộc trò chuyện";
  const khung = $("khung-chat");
  khung.innerHTML = "";
  (d.messages || []).forEach((m) => khung.appendChild(theTin(m.role, m.content, m.extra)));
  xuongCuoi();
  napDanhSach();
  dongMenu();
}

function hoiThoaiMoi() {
  hoiThoaiHienTai = null;
  $("khung-chat").innerHTML = "";
  $("tieu-de-hoi-thoai").textContent = "Cuộc trò chuyện mới";
  napDanhSach();
  dongMenu();
}

async function gui(noiDung) {
  if (dangGui || !noiDung.trim()) return;
  dangGui = true;
  $("nut-gui").disabled = true;

  const khung = $("khung-chat");
  khung.appendChild(theTin("user", noiDung));
  const cho = theTin("assistant", "Bé Ailai đang trả lời…");
  cho.querySelector(".bong").classList.add("dang-go");
  khung.appendChild(cho);
  xuongCuoi();

  const bieuMau = new FormData();
  bieuMau.append("ver", VER);
  bieuMau.append("message", noiDung);
  if (hoiThoaiHienTai) bieuMau.append("conversation_id", String(hoiThoaiHienTai));

  try {
    const d = await goi("/api/agent-demo/send", { method: "POST", body: bieuMau });
    hoiThoaiHienTai = d.conversation_id;
    cho.replaceWith(theTin("assistant", d.reply, d.extra));
    veBaiTap(d.exercise);
    napDanhSach();
  } catch (e) {
    cho.querySelector(".bong").textContent = "Lỗi: " + e.message;
  } finally {
    dangGui = false;
    $("nut-gui").disabled = false;
    xuongCuoi();
  }
}

function dongMenu() {
  $("cot-trai").classList.remove("mo");
}

// ---------- Khởi động ----------

async function khoiDong() {
  khoaTuTrangCha = await xinKhoaTuTrangCha();
  // Cờ chẩn đoán (chỉ đúng/sai, không lộ khoá): mở console gõ __agsCoKhoa để biết widget đang
  // xác thực bằng cookie hay bằng khoá do trang cha chuyển sang.
  window.__agsCoKhoa = !!khoaTuTrangCha;
  let me;
  try {
    me = await goi(`/api/agent-demo/me?ver=${VER}`);
  } catch (e) {
    return; // hienChan đã lo phần thông báo
  }
  $("ung-dung").hidden = false;
  $("ten-ban").textContent = me.ten;
  $("ten-hoc-vien").textContent = me.ho_ten || "";
  $("ch-ver").textContent = me.ten;
  $("ch-mo-ta").textContent = me.mo_ta;
  $("ch-model").textContent = me.model || "(không dùng mô hình ngôn ngữ)";
  $("ch-tools").textContent = (me.tools || []).join(", ") || "(chưa được trang bị công cụ nào)";

  if (!me.san_sang) {
    $("khung-chat").appendChild(
      theTin("assistant", "Máy chủ chưa cắm khoá mô hình ngôn ngữ nên phiên bản này chưa trả lời được. Báo giáo viên giúp nhé.")
    );
  }

  try {
    veBaiTap(await goi(`/api/agent-demo/exercise-state?ver=${VER}`));
  } catch (e) {
    /* không có bài tập gắn với phiên bản này thì thôi */
  }

  await napDanhSach();

  document.querySelectorAll(".ver-nut").forEach((n) => {
    if (n.dataset.ver === VER) n.classList.add("dang-dung");
  });

  $("nut-moi").onclick = hoiThoaiMoi;
  $("nut-menu").onclick = () => $("cot-trai").classList.toggle("mo");
  $("nut-cau-hinh").onclick = () => {
    $("bang-cau-hinh").hidden = !$("bang-cau-hinh").hidden;
  };

  const o = $("tin-nhan");
  o.addEventListener("input", () => {
    o.style.height = "auto";
    o.style.height = Math.min(o.scrollHeight, 140) + "px";
  });
  o.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("o-nhap").requestSubmit();
    }
  });
  $("o-nhap").addEventListener("submit", (e) => {
    e.preventDefault();
    const noiDung = o.value;
    o.value = "";
    o.style.height = "auto";
    gui(noiDung);
  });
}

khoiDong();
