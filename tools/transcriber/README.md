# Wavr — Transcription Tool

Nhận diện lời bài hát từ file audio, hỗ trợ **Tiếng Việt + Tiếng Anh** (kể cả đan xen).

## Cấu trúc thư mục

```
transcriber/
├── transcribe.py       ← script chính
├── input/              ← bỏ file nhạc vào đây
│   └── song.mp3
└── output/             ← kết quả lưu ở đây (tự tạo)
    ├── song.lrc        ← import vào Wavr
    ├── song.srt        ← phụ đề video
    └── song_lyrics.txt ← xem/sửa lời
```

## Yêu cầu

- **Python 3.8+** — tải tại [python.org](https://python.org)
- **ffmpeg** — tải tại [ffmpeg.org](https://ffmpeg.org/download.html), thêm vào PATH
- Các thư viện Python sẽ được **tự động cài** lần đầu chạy

## Cách dùng

### 1. Đơn giản nhất — xử lý tất cả file trong `input/`

```bash
# Bỏ file .mp3 / .m4a vào thư mục input/, rồi chạy:
python transcribe.py
```

### 2. Chỉ định file cụ thể

```bash
python transcribe.py input/song.mp3
```

### 3. Dùng model chất hơn (khuyên dùng cho nhạc Việt-Anh pha trộn)

```bash
python transcribe.py --model large-v3
```

### 4. Ép nhận diện ngôn ngữ

```bash
# Chủ yếu Tiếng Việt
python transcribe.py --lang vi

# Chủ yếu Tiếng Anh
python transcribe.py --lang en

# Tự detect (tốt nhất cho nhạc pha trộn) — để trống
python transcribe.py
```

## So sánh các Model

| Model | Kích thước | Tốc độ | Chất lượng |
|-------|-----------|--------|------------|
| `tiny` | 39 MB | ⚡⚡⚡⚡⚡ | ⭐ |
| `base` | 74 MB | ⚡⚡⚡⚡ | ⭐⭐ |
| `small` | 244 MB | ⚡⚡⚡ | ⭐⭐⭐ |
| `medium` | 769 MB | ⚡⚡ | ⭐⭐⭐⭐ ← **mặc định** |
| `large-v3` | 1.5 GB | ⚡ | ⭐⭐⭐⭐⭐ ← **tốt nhất cho Vi/En** |

> **Lưu ý**: Lần đầu chạy sẽ download model về máy (một lần duy nhất).  
> Chạy hoàn toàn **offline** sau đó — không cần API key hay internet.
