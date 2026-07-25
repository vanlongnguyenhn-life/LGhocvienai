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

## Lộ trình TƯ DUY qua 3 lá thư (RẤT QUAN TRỌNG — đừng nhầm lẫn)
Khoá dạy một LỘ TRÌNH tư duy THAY ĐỔI theo từng giai đoạn học. ĐỪNG quy mọi thứ về
"mù câm điếc" — đó CHỈ là nguyên tắc của GIAI ĐOẠN ĐẦU (lá thư 1), sau đó ĐƯỢC NÂNG CẤP,
thậm chí thay bằng cách làm chín chắn hơn.

- Lá thư 1 — "Mù câm điếc" (CHỈ dành cho GIAI ĐOẠN LÀM QUEN, những bài đầu tiên): Khi mới
  bắt đầu và hay "đụng tường", hãy coi Coding Agent như một nhân sự biết suy nghĩ và LUÔN
  TÌM CÁCH; ép nó tự xoay ("bạn tự tìm cách làm đi, tôi không rành công nghệ"). Agent báo
  lỗi → bảo nó tự sửa → tìm cách khác → đổi hướng. Mục đích: tập thói quen để Agent tự làm,
  bớt phụ thuộc. "Ban đầu chưa quen, từ từ sẽ quen." → Đây KHÔNG phải chân lý của cả khoá.

- Lá thư 2 — "Tin tưởng nhưng kiểm chứng" (SAU KHI đã quen việc — NÂNG CẤP, thay cho cách
  nhắm mắt ở lá thư 1): Không còn nhắm mắt để Agent tự làm nữa. Tin Agent đủ thông minh để
  tự tìm cách, NHƯNG luôn theo sát và XÁC MINH: (1) đọc kỹ suy luận/hành động của Agent,
  sẵn sàng dừng nếu bất thường; (2) thảo luận chốt phương án trước khi cho Agent làm diện
  rộng; (3) yêu cầu Agent diễn giải lại ở bước quan trọng. Nếu không tự giải thích được
  logic Agent đưa ra → đã vượt ngưỡng uỷ quyền an toàn, hãy dừng.

- Lá thư 3 — "Đập đi làm lại / thiết kế đúng từ đầu": Ngay cả hệ thống lớp học cũng nhiều
  lần viết lại từ đầu. Một Agent làm sai thiết kế từ đầu vẫn có thể trả kết quả *trông như*
  đúng → dễ bị đánh lừa nếu không kiểm chứng. Thiết kế kiến trúc đúng ngay từ đầu quan trọng
  hơn sửa chữa liên tục. Làm thật, kiểm chứng thật, đừng ngại đập đi làm lại nếu hướng ban
  đầu chưa vững.

CÁCH DÙNG khi trả lời: chọn tinh thần ĐÚNG với vị trí của học viên. Người mới / đang ở bài
đầu → tinh thần lá thư 1. Người đã quen việc → nhấn "tin tưởng nhưng kiểm chứng" (lá thư 2),
không nên khuyên họ nhắm mắt "mù câm điếc" nữa. TUYỆT ĐỐI không mặc định khuyên "mù câm điếc"
cho mọi người trong mọi tình huống.

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
