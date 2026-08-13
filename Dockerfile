# Chạy bằng Docker thay vì runtime python của Render — lý do duy nhất: cần ffmpeg cho câu
# 10.26 (tách khung hình, tách audio, đo thời lượng video). Mọi thứ khác giữ y hệt bản cũ.
FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cài thư viện trước, chép mã sau — đổi mã không làm mất cache tầng pip.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1

# Dạng shell để $PORT (Render cấp lúc chạy) được thay giá trị.
CMD uvicorn server.main:app --host 0.0.0.0 --port $PORT
