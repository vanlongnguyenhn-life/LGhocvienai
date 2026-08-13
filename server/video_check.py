"""Đọc và đo video bằng ffmpeg — dùng cho câu 10.26.

Bốn việc chính:
  1. Đo thời lượng, xem có luồng hình/tiếng không          -> ffprobe
  2. Trích một khung hình tại đúng mốc giây                -> ffmpeg (để AI đọc chữ trong đó)
  3. Trích một đoạn âm thanh                               -> ffmpeg (để so vân tay, để nhận giọng)
  4. So hai đoạn âm thanh có phải cùng một bản nhạc không  -> MFCC tự tính bằng numpy

Vì sao tự tính MFCC thay vì dùng librosa: librosa kéo theo scipy, numba, soundfile — nặng cả
trăm MB cho một image Docker mà ta chỉ cần đúng một phép so. Toàn bộ phép tính dưới đây chỉ
cần numpy, đã có sẵn.
"""
import json
import math
import os
import shutil
import subprocess
import tempfile

import numpy as np

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"

SR = 16000          # tần số lấy mẫu khi trích âm thanh
N_MFCC = 13
N_MELS = 26
FRAME_MS = 25
HOP_MS = 10


def san_sang() -> bool:
    return bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def _chay(cmd: list, timeout: int = 120) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, timeout=timeout)


def thong_tin(duong_dan: str) -> dict:
    """Thời lượng (giây) + các loại luồng có trong file. {} nếu không đọc được."""
    r = _chay([FFPROBE, "-v", "error", "-print_format", "json",
               "-show_format", "-show_streams", duong_dan])
    if r.returncode != 0:
        return {}
    try:
        d = json.loads(r.stdout.decode("utf-8", "replace"))
    except json.JSONDecodeError:
        return {}
    loai = [s.get("codec_type") for s in d.get("streams", [])]
    try:
        thoi_luong = float(d.get("format", {}).get("duration") or 0)
    except (TypeError, ValueError):
        thoi_luong = 0.0
    return {
        "thoi_luong": thoi_luong,
        "co_hinh": "video" in loai,
        "co_tieng": "audio" in loai,
        "kich_thuoc": int(d.get("format", {}).get("size") or 0),
    }


def khung_hinh(duong_dan: str, giay: float, rong: int = 1280) -> bytes:
    """Trích một khung hình tại mốc giây, trả về PNG. b"" nếu hụt."""
    with tempfile.TemporaryDirectory() as tmp:
        ra = os.path.join(tmp, "f.png")
        # -ss trước -i để nhảy nhanh; -update 1 vì chỉ ghi đúng một ảnh.
        r = _chay([FFMPEG, "-y", "-ss", "%.3f" % giay, "-i", duong_dan,
                   "-frames:v", "1", "-update", "1",
                   "-vf", "scale=%d:-2" % rong, ra])
        if r.returncode != 0 or not os.path.exists(ra):
            return b""
        with open(ra, "rb") as f:
            return f.read()


def doan_tieng(duong_dan: str, bat_dau: float, dai: float) -> np.ndarray:
    """Trích một đoạn âm thanh thành mảng float32 mono, đã chuẩn hoá biên độ."""
    r = _chay([FFMPEG, "-v", "error", "-ss", "%.3f" % bat_dau, "-t", "%.3f" % dai,
               "-i", duong_dan, "-ac", "1", "-ar", str(SR),
               "-f", "s16le", "-acodec", "pcm_s16le", "-"])
    if r.returncode != 0 or not r.stdout:
        return np.zeros(0, dtype=np.float32)
    x = np.frombuffer(r.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    dinh = float(np.max(np.abs(x))) if x.size else 0.0
    return x / dinh if dinh > 1e-6 else x


def tieng_ra_wav(duong_dan: str, bat_dau: float, dai: float, ra: str) -> bool:
    """Xuất một đoạn âm thanh ra file WAV (để gửi cho dịch vụ nhận giọng nói)."""
    r = _chay([FFMPEG, "-y", "-v", "error", "-ss", "%.3f" % bat_dau, "-t", "%.3f" % dai,
               "-i", duong_dan, "-ac", "1", "-ar", str(SR), ra], timeout=180)
    return r.returncode == 0 and os.path.exists(ra) and os.path.getsize(ra) > 44


# ---------- MFCC ----------

def _mel(f):      return 2595.0 * np.log10(1.0 + f / 700.0)
def _mel_nguoc(m): return 700.0 * (10.0 ** (m / 2595.0) - 1.0)


def _bo_loc_mel(n_fft: int) -> np.ndarray:
    thap, cao = _mel(0.0), _mel(SR / 2)
    diem = _mel_nguoc(np.linspace(thap, cao, N_MELS + 2))
    o = np.floor((n_fft + 1) * diem / SR).astype(int)
    loc = np.zeros((N_MELS, n_fft // 2 + 1), dtype=np.float32)
    for i in range(1, N_MELS + 1):
        trai, giua, phai = o[i - 1], o[i], o[i + 1]
        if giua == trai: giua = trai + 1
        if phai == giua: phai = giua + 1
        if phai >= loc.shape[1]: phai = loc.shape[1] - 1
        if giua >= phai: continue
        loc[i - 1, trai:giua] = (np.arange(trai, giua) - trai) / max(1, giua - trai)
        loc[i - 1, giua:phai] = (phai - np.arange(giua, phai)) / max(1, phai - giua)
    return loc


def mfcc(x: np.ndarray) -> np.ndarray:
    """Ma trận MFCC (số_khung × N_MFCC). Đã trừ trung bình từng hệ số (CMN) để bớt lệ thuộc
    vào âm lượng và chất lượng nén — hai bản cùng nhạc nhưng khác bitrate vẫn khớp."""
    if x.size < SR // 10:
        return np.zeros((0, N_MFCC), dtype=np.float32)
    n_fft = 512
    dai_khung = int(SR * FRAME_MS / 1000)
    buoc = int(SR * HOP_MS / 1000)
    so_khung = 1 + max(0, (len(x) - dai_khung) // buoc)
    if so_khung < 3:
        return np.zeros((0, N_MFCC), dtype=np.float32)
    cua_so = np.hamming(dai_khung).astype(np.float32)
    khung = np.stack([x[i * buoc:i * buoc + dai_khung] * cua_so for i in range(so_khung)])
    pho = np.abs(np.fft.rfft(khung, n=n_fft)) ** 2
    nang_luong = pho @ _bo_loc_mel(n_fft).T
    log_nl = np.log(nang_luong + 1e-10)
    # DCT-II, giữ N_MFCC hệ số đầu
    k = np.arange(N_MELS)
    dct = np.cos(np.pi / N_MELS * (k + 0.5)[None, :] * np.arange(N_MFCC)[:, None])
    c = log_nl @ dct.T
    return (c - c.mean(axis=0, keepdims=True)).astype(np.float32)


def khoang_cach_tieng(a: np.ndarray, b: np.ndarray, lech_toi_da: float = 0.6) -> float:
    """Khoảng cách giữa hai đoạn âm thanh: 0 = trùng khớp, càng lớn càng khác.

    Bỏ hệ số 0 (năng lượng tổng) vì yêu cầu đề bài bắt fade in/out — cùng một bản nhạc nhưng
    âm lượng khác nhau, so cả năng lượng sẽ báo sai.

    Phải dò lệch theo TỪNG KHUNG một (10ms), không được nhảy bước thưa: bộ mã hoá AAC chèn
    một khoảng đệm ở đầu file nên bản học viên xuất ra bị trễ khoảng 20ms so với bản gốc. Đo
    thật trên một bài nộp mô phỏng: ở mốc lệch 0 khoảng cách là 0.329 (trượt oan), ở đúng mốc
    20ms chỉ còn 0.040. Bước dò 50ms trước đây nhảy thẳng từ 0 sang 50 nên không bao giờ tìm ra.
    """
    A, B = mfcc(a), mfcc(b)
    if A.shape[0] < 3 or B.shape[0] < 3:
        return 9.9
    A, B = A[:, 1:], B[:, 1:]
    buoc_toi_da = int(lech_toi_da * 1000 / HOP_MS)
    tot_nhat = 9.9
    for lech in range(-buoc_toi_da, buoc_toi_da + 1):
        if lech >= 0:
            x, y = A[lech:], B[: len(A) - lech]
        else:
            x, y = A[: len(A) + lech], B[-lech:]
        n = min(len(x), len(y))
        if n < 3:
            continue
        x, y = x[:n], y[:n]
        tu = np.sum(x * y, axis=1)
        mau = np.linalg.norm(x, axis=1) * np.linalg.norm(y, axis=1) + 1e-9
        tot_nhat = min(tot_nhat, float(np.mean(1.0 - tu / mau)))
    return round(tot_nhat, 3)
