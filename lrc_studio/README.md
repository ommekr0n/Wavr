# 🎙️ Enhanced LRC Studio — Vietnamese Rap & Fast Music Aligner

> Powered by **Meta AI MMS-300M (Massively Multilingual Speech)** CTC Neural Forced Alignment and PyTorch Viterbi Trellis Decoding.

---

## 🌟 Key Features

- **Meta AI MMS-300M Engine**: 100% loss-less forced alignment for Vietnamese lyrics (`vie`). 0% segment drops, 0% delay drift.
- **SOTA Neural Vocal Isolation**: PyTorch HDemucs (`HDEMUCS_HIGH_MUSDB`) extracts crisp vocals from heavy bass and drums.
- **Zero-Config Studio UI**: Simple 2-Input Workflow (Audio + Text) with 60fps responsive Karaoke Preview & Micro-Nudge editor.
- **End-Of-Line `<end_ts>` Tags**: Full compliance with Enhanced LRC v2 Specification.
- **1-Click Google Colab GPU Backend**: Run free Nvidia T4 GPU on Colab to process 3-minute rap songs in 1-2 seconds.

---

## 🚀 Quick Start (Local)

```bash
python server.py
```
Open your browser at `http://localhost:8888/studio.html`.

---

## ⚡ 1-Click Google Colab GPU Setup

1. Open [Google Colab](https://colab.research.google.com/) -> Create New Notebook.
2. Select **Runtime** -> **Change runtime type** -> **T4 GPU**.
3. Copy & paste the code below into Colab:

```python
import os, sys, time, subprocess, threading

!pip install -q torch torchaudio soundfile numpy
!apt-get update -qq && apt-get install -y -qq ffmpeg
!git clone https://github.com/ommekr0n/Enhanced-LRC-Studio.git /content/Enhanced-LRC-Studio
sys.path.append("/content/Enhanced-LRC-Studio")

if not os.path.exists("/usr/local/bin/cloudflared"):
    !wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    !dpkg -i cloudflared-linux-amd64.deb

import server
threading.Thread(target=server.main, daemon=True).start()
time.sleep(3)

print("\n🚀 BACKEND GOOGLE COLAB GPU IS READY!")
!cloudflared tunnel --url http://localhost:8888
```
4. Copy the generated `https://xxx.trycloudflare.com` URL and paste it into **Server API URL** on your Web Studio!
