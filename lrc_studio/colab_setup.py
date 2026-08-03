# ============================================================
# 🚀 GOOGLE COLAB FREE GPU BACKEND FOR ENHANCED LRC STUDIO
# ============================================================
# HƯỚNG DẪN 1-CLICK CHẠY TRÊN GOOGLE COLAB (GPU MIỄN PHÍ 100%):
#
# 1. Truy cập: https://colab.research.google.com/
# 2. Chọn menu: Runtime -> Change runtime type -> Chọn T4 GPU -> Save.
# 3. Copy toàn bộ đoạn code bên dưới, dán vào 1 ô Code và bấm nút Run (▶)!
# 4. Copy đường link HTTPS do Cloudflare cấp (ví dụ: https://xxx.trycloudflare.com)
#    và dán vào ô "Server API URL" trên Web Vercel của bạn!
# ============================================================

import os
import sys
import time
import subprocess
import threading

print("⚡ Đang cài đặt thư viện AI & GPU...")
subprocess.run(["pip", "install", "-q", "torch", "torchaudio", "soundfile", "numpy"], check=True)
subprocess.run(["apt-get", "update", "-qq"], check=True)
subprocess.run(["apt-get", "install", "-y", "-qq", "ffmpeg"], check=True)

# Tải Cloudflare Tunnel (Miễn phí 100%)
if not os.path.exists("/usr/local/bin/cloudflared"):
    subprocess.run(["wget", "-q", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"], check=True)
    subprocess.run(["dpkg", "-i", "cloudflared-linux-amd64.deb"], check=True)

print("🚀 Đang khởi động Meta AI MMS-300M Engine trên GPU...")

# Import & Chạy Server
sys.path.append(".")
import server

server_thread = threading.Thread(target=server.main, daemon=True)
server_thread.start()
time.sleep(3)

print("\n" + "=" * 60)
print("  🚀 BACKEND GOOGLE COLAB GPU ĐÃ SẴN SÀNG!")
print("  Copy đường link bên dưới dán vào ô Server API URL trên Web:")
print("=" * 60 + "\n")

subprocess.run(["cloudflared", "tunnel", "--url", "http://localhost:8888"])
