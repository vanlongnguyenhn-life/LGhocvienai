"""Sinh kho hình + kho văn bản cho chatbot demo "Mầm Fake" (Bài 11).

Bốn tool chạy được của V3/V4 (count_images / show_images / count_docs / show_docs) đọc thật hai
thư mục này, nên chúng phải có file thật. Tự vẽ / tự sinh bằng Pillow + openpyxl, KHÔNG lấy tệp
của ai khác. Chạy lại lúc nào cũng ra kết quả như cũ (ghi đè), an toàn để chạy nhiều lần:

    python tao_kho_demo.py
"""

from pathlib import Path

from PIL import Image, ImageDraw
from openpyxl import Workbook

GOC = Path(__file__).resolve().parent
KHO_HINH = GOC / "assets" / "kho-hinh"
KHO_VANBAN = GOC / "assets" / "kho-vanban"

# Mỗi hình một tông màu riêng để nhìn vào gallery thấy ngay là nhiều tệp khác nhau.
HINH = [
    ("avatar-mam-01.png", (32, 122, 74), (214, 240, 226)),
    ("avatar-mam-02.png", (176, 58, 46), (250, 224, 220)),
    ("avatar-mam-03.png", (33, 82, 145), (216, 231, 249)),
    ("avatar-mam-04.png", (128, 74, 160), (236, 222, 246)),
    ("logo-lop-alg.png", (24, 24, 24), (240, 240, 240)),
    ("so-do-agent.png", (191, 129, 24), (252, 238, 209)),
]

VAN_BAN_PDF = [
    ("noi-quy-lop-alg.pdf", "NOI QUY LOP ALG"),
    ("lich-hoc-tuan-1.pdf", "LICH HOC TUAN 1"),
    ("huong-dan-nop-bai.pdf", "HUONG DAN NOP BAI"),
]

VAN_BAN_XLSX = [
    ("danh-sach-hoc-vien.xlsx", ["Ho ten", "Lop", "Trang thai"],
     [["Hoc vien A", "ALG", "Dang hoc"], ["Hoc vien B", "ALG", "Dang hoc"], ["Hoc vien C", "ALG", "Bao luu"]]),
    ("tien-do-bai-tap.xlsx", ["Bai", "So cau", "Da xong"],
     [["Bai 10", 27, 27], ["Bai 11", 26, 0], ["Bai 12", 17, 0]]),
]


def ve_hinh():
    KHO_HINH.mkdir(parents=True, exist_ok=True)
    for ten, dam, nhat in HINH:
        anh = Image.new("RGB", (420, 420), nhat)
        but = ImageDraw.Draw(anh)
        but.ellipse((60, 50, 360, 350), fill=dam)
        but.rectangle((90, 250, 330, 400), fill=dam)
        but.rectangle((0, 396, 420, 420), fill=dam)
        anh.save(KHO_HINH / ten)
    return len(HINH)


def _pdf_toi_thieu(tieu_de: str) -> bytes:
    """PDF một trang viết tay ở mức byte — đủ chuẩn để trình duyệt/thư viện đọc được,
    khỏi kéo thêm thư viện chỉ để tạo vài tệp mẫu."""
    noi_dung = f"BT /F1 24 Tf 60 700 Td ({tieu_de}) Tj ET"
    doi_tuong = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(noi_dung)} >>\nstream\n{noi_dung}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    ra = bytearray(b"%PDF-1.4\n")
    moc = []
    for i, obj in enumerate(doi_tuong, start=1):
        moc.append(len(ra))
        ra += f"{i} 0 obj\n{obj}\nendobj\n".encode("latin-1")
    xref = len(ra)
    ra += f"xref\n0 {len(doi_tuong) + 1}\n0000000000 65535 f \n".encode("latin-1")
    for m in moc:
        ra += f"{m:010d} 00000 n \n".encode("latin-1")
    ra += (
        f"trailer\n<< /Size {len(doi_tuong) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ).encode("latin-1")
    return bytes(ra)


def tao_van_ban():
    KHO_VANBAN.mkdir(parents=True, exist_ok=True)
    for ten, tieu_de in VAN_BAN_PDF:
        (KHO_VANBAN / ten).write_bytes(_pdf_toi_thieu(tieu_de))
    for ten, dau_cot, cac_dong in VAN_BAN_XLSX:
        wb = Workbook()
        ws = wb.active
        ws.append(dau_cot)
        for dong in cac_dong:
            ws.append(dong)
        wb.save(KHO_VANBAN / ten)
    return len(VAN_BAN_PDF) + len(VAN_BAN_XLSX)


if __name__ == "__main__":
    print(f"Đã tạo {ve_hinh()} hình trong {KHO_HINH}")
    print(f"Đã tạo {tao_van_ban()} văn bản trong {KHO_VANBAN}")
