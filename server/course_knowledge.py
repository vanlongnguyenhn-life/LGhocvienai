"""Bộ kiến thức về khoá học ALG để Bé Ailai (bot Lark) trả lời đúng về khoá học.

Đây là bản tóm tắt nội dung khoá tại thời điểm soạn. Khi nội dung khoá thay đổi
nhiều, cập nhật lại file này để bot luôn nắm đúng.
"""

COURSE_KNOWLEDGE = """
# BỘ KIẾN THỨC KHOÁ HỌC (để trả lời học viên)

## Khoá học là gì
- Tên khoá: "ALG - Biến AI thành nhân sự thật", thuộc Học Viện AI Life Group.
- Phương châm: "Học từ nguyên lý. Hiểu từ gốc rễ."
- Website học: https://ailg.onrender.com — đăng nhập bằng tài khoản Lark.
- Bản chất: đây là khoá học VỚI AI. Khoá KHÔNG có nội dung cố định, KHÔNG có lịch
  trình, KHÔNG có mục lục. Thứ duy nhất là MỤC TIÊU. Lý do: AI thay đổi cực nhanh,
  hôm nay học A ngày mai đã thành B; nên giáo trình đổi liên tục. Vì khoá dạy MINDSET
  (tư duy), nên việc đổi giáo trình không ảnh hưởng nhiều tới học viên.

## Cách vận hành / luật chơi
- Học theo từng Bài; mỗi Bài gồm nhiều câu hỏi/nhiệm vụ.
- Các câu mở khoá TUẦN TỰ: phải hoàn thành đúng câu trước mới mở được câu sau.
- Trong một Bài, tại một thời điểm chỉ mở xem 1 câu (mở câu này thì câu kia đóng lại).
- Rất nhiều câu thuộc dạng: học viên TỰ HỎI Agent (Coding Agent) của mình rồi thuật
  lại câu trả lời — nên KHÔNG có một đáp án cố định duy nhất. Chỉ cần câu trả lời cụ
  thể, hợp lý, đúng chủ đề, cho thấy học viên (hoặc Agent của họ) thực sự đã làm/hiểu.
- Mỗi câu có điểm; hoàn thành thì được cộng điểm.
- Học viên mới đăng nhập lần đầu cần GIÁO VIÊN DUYỆT trong trang quản trị mới vào học được.
- Một số câu tự luận được AI chấm tự động (chấp nhận mọi câu trả lời hợp lý, đúng chủ đề).

## Các module (phần) của khoá
- Nguyên lý Agent (đang mở) — phần nền tảng, đi từ Bài 1.
- Ứng dụng thực tế (đang mở).
- Kho ứng dụng AI (đang mở).
- Chưng cất kiến thức (đang mở).
- Năng lực Tư duy (đang mở).
- Điều phối Agent (sắp mở khoá).
- Tự động hoá và chi phí (sắp mở khoá).

## Bản đồ các Bài trong "Nguyên lý Agent"
- Bài 1 - Cài đặt Coding Agent và dùng thử
- Bài 2 - Coding Agent đã làm những gì?
- Bài 3 - Năng lực đặc biệt của Coding Agent
- Bài 4 - Giới hạn của Coding Agent
- Bài 5 - Ghép LEGO (ghép các "khối năng lực AND" để tạo ứng dụng)
- Bài 6 - Chúng sinh bình đẳng
- Bài 7 - Phần mềm và sự tin cậy
- Bài 8 - Để Agent "nói chuyện"
- Bài 9 - Connector ứng dụng Office (Docs, Sheet, Slide...)
- Bài 10 - Tự động hoá với AI Agent
- Bài 11 - Đại phẫu một Agent
- Bài 12 - Khung siêu ứng dụng tích hợp Zalo
- Các bài ứng dụng thực tế: ví dụ Bài 13 - Agent quản lý món ăn, Bài 14 - Module tạo
  curated content tự động...
(Bản đồ có thể được cập nhật/mở thêm theo thời gian.)

## Tinh thần 3 lá thư quan trọng (dùng để giải thích tư duy, KHÔNG phải đáp án)
- Lá thư 1 — Nguyên tắc "mù câm điếc": Coi Coding Agent như một NHÂN SỰ biết suy nghĩ,
  biết dùng công cụ và LUÔN TÌM CÁCH — không phải cái máy làm một việc. Hãy ép Agent tự
  tìm cách hoàn thành mục tiêu: "Bạn tự tìm cách làm tiếp đi, tôi không rành công nghệ,
  bạn phải tự làm ra kết quả". Agent báo lỗi → bảo nó tự sửa; không sửa được → tìm cách
  khác; hết cách → đổi hướng tiếp cận. Đừng hỏi giáo viên những lỗi mà Agent của mình
  thừa sức tự fix.
- Lá thư 2 — Tin tưởng nhưng kiểm chứng: Sau khi quen việc, nâng cấp cách làm — tin Agent
  đủ thông minh để tự tìm cách, NHƯNG luôn theo sát và XÁC MINH lại: đọc kỹ suy luận/hành
  động của Agent, thảo luận chốt phương án trước khi cho nó làm diện rộng, yêu cầu nó diễn
  giải lại ở các bước quan trọng. Nếu không tự giải thích được logic Agent đưa ra → đó là
  dấu hiệu vượt ngưỡng uỷ quyền an toàn, hãy dừng lại.
- Lá thư 3 — Đập đi làm lại: Chính hệ thống lớp học cũng nhiều lần viết lại từ đầu. Thiết
  kế kiến trúc đúng ngay từ đầu quan trọng hơn nhiều so với sửa chữa liên tục. Làm thật,
  kiểm chứng thật, đừng ngại đập đi làm lại nếu hướng ban đầu chưa vững.

## Câu hỏi thường gặp
- Đăng nhập: vào https://ailg.onrender.com, bấm "Đăng nhập bằng Lark".
- Chưa vào được / thấy "chờ duyệt": tài khoản mới cần giáo viên duyệt, chờ một chút hoặc nhắc giáo viên.
- Xem tiến độ/điểm: ngay trong app sau khi đăng nhập; hoặc hỏi Bé để Bé tra giúp.
- Không làm được một câu: áp dụng nguyên tắc "mù câm điếc" — hỏi chính Agent của mình để nó tự tìm cách.

## Hỗ trợ & cách liên hệ
- Thắc mắc về khoá / cách học / khái niệm → cứ hỏi Bé (tag Bé trong nhóm lớp).
- Duyệt tài khoản mới, lỗi đăng nhập, chấm điểm hoặc khiếu nại điểm, việc cần người thật → liên
  hệ giáo viên / trợ giảng ngay trong nhóm lớp.
- Web là ứng dụng MỘT TRANG: không có đường link riêng cho từng câu hỏi. Muốn tới một câu, học
  viên đăng nhập rồi vào đúng Bài → câu (ví dụ "Bài 5, câu 5.3"). Không tạo/bịa link cho từng câu.
""".strip()
