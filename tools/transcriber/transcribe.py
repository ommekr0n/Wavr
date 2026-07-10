"""
╔══════════════════════════════════════════════════════════════╗
║         WAVR — Audio Transcription Tool                      ║
║         Powered by OpenAI Whisper                            ║
║         Supports: Vietnamese + English (mixed)               ║
╚══════════════════════════════════════════════════════════════╝

Folder structure:
    transcriber/
    ├── transcribe.py      ← this script
    ├── input/             ← drop your audio files here
    │   └── song.mp3
    └── output/            ← .lrc, .srt, .txt saved here (auto-created)

Usage:
    # Transcribe all files in input/ folder:
    python transcribe.py

    # Transcribe a specific file:
    python transcribe.py input/song.mp3

    # Use a better model:
    python transcribe.py input/song.mp3 --model large-v3

Models (speed vs accuracy):
    tiny     → Fastest, lowest accuracy
    base     → Fast, decent
    small    → Good balance
    medium   → Better Vietnamese support  ← default (recommended)
    large-v3 → Best quality, slowest      ← best for mixed Vi/En
"""

import sys
import os
import subprocess
import argparse
import glob

# Force UTF-8 output so emojis work on Windows (cp1252 terminals)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ─────────────────────────────────────────────
# Paths relative to this script
# ─────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR   = os.path.join(SCRIPT_DIR, "input")
OUTPUT_DIR  = os.path.join(SCRIPT_DIR, "output")
AUDIO_EXTS  = (".mp3", ".m4a", ".wav", ".flac", ".ogg", ".aac", ".wma", ".opus")

# ─────────────────────────────────────────────
# 1. Auto-install dependencies if missing
# ─────────────────────────────────────────────
def install(package):
    print(f"  Installing {package}...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])

def ensure_deps():
    # Try openai-whisper first, fall back to faster-whisper
    global USE_FASTER_WHISPER
    USE_FASTER_WHISPER = False

    try:
        import whisper
        return  # openai-whisper already installed, good
    except ImportError:
        pass

    # Try installing openai-whisper
    try:
        install("openai-whisper")
        import whisper
        return
    except Exception:
        pass

    # Fall back to faster-whisper (better Python 3.14 compatibility)
    print("  ⚠️  openai-whisper not compatible — trying faster-whisper instead...")
    try:
        from faster_whisper import WhisperModel
        USE_FASTER_WHISPER = True
        return
    except ImportError:
        pass

    try:
        install("faster-whisper")
        from faster_whisper import WhisperModel
        USE_FASTER_WHISPER = True
        return
    except Exception as e:
        print(f"\n❌ Could not install Whisper: {e}")
        print("   Please install manually: pip install faster-whisper")
        sys.exit(1)

# ─────────────────────────────────────────────
# 2. Timestamp formatters
# ─────────────────────────────────────────────
def to_lrc_time(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs    = seconds % 60
    return f"[{minutes:02d}:{secs:05.2f}]"

def to_srt_time(seconds: float) -> str:
    h  = int(seconds // 3600)
    m  = int((seconds % 3600) // 60)
    s  = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

# ─────────────────────────────────────────────
# 3. Transcribe one file
# ─────────────────────────────────────────────
def transcribe_file(audio_path: str, model, model_name: str, language: str | None):
    base_name   = os.path.splitext(os.path.basename(audio_path))[0]
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"\n{'─'*60}")
    print(f"🎵  {os.path.basename(audio_path)}")
    print(f"{'─'*60}")
    print(f"🔍 Transcribing...")

    if USE_FASTER_WHISPER:
        # faster-whisper API
        segments_gen, info = model.transcribe(
            audio_path,
            language=language,
            task="transcribe",
            word_timestamps=False,
            condition_on_previous_text=True,
            temperature=0.0,
            compression_ratio_threshold=2.4,
            no_speech_threshold=0.6,
        )
        segments = [{"start": s.start, "end": s.end, "text": s.text} for s in segments_gen]
        detected_lang = info.language
    else:
        # openai-whisper API
        result = model.transcribe(
            audio_path,
            language=language,
            task="transcribe",
            word_timestamps=False,
            verbose=False,
            condition_on_previous_text=True,
            fp16=False,
            temperature=0.0,
            compression_ratio_threshold=2.4,
            no_speech_threshold=0.6,
        )
        segments = result["segments"]
        detected_lang = result.get("language", "unknown")

    print(f"✅ Detected language : {detected_lang.upper()}")
    print(f"✅ Segments found    : {len(segments)}")

    # ── .lrc ─────────────────────────────────
    lrc_path = os.path.join(OUTPUT_DIR, base_name + ".lrc")
    with open(lrc_path, "w", encoding="utf-8") as f:
        f.write(f"[ti:{base_name}]\n")
        f.write(f"[ar:Unknown Artist]\n")
        f.write(f"[al:Unknown Album]\n")
        f.write(f"[by:Wavr Transcription Tool — Whisper {model_name}]\n")
        f.write(f"[lang:{detected_lang}]\n\n")
        for seg in segments:
            text = seg["text"].strip()
            if text:
                f.write(f"{to_lrc_time(seg['start'])}{text}\n")

    # ── .srt ─────────────────────────────────
    srt_path = os.path.join(OUTPUT_DIR, base_name + ".srt")
    with open(srt_path, "w", encoding="utf-8") as f:
        idx = 1
        for seg in segments:
            text = seg["text"].strip()
            if not text:
                continue
            f.write(f"{idx}\n")
            f.write(f"{to_srt_time(seg['start'])} --> {to_srt_time(seg['end'])}\n")
            f.write(f"{text}\n\n")
            idx += 1

    # ── .txt ─────────────────────────────────
    txt_path = os.path.join(OUTPUT_DIR, base_name + "_lyrics.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        for seg in segments:
            text = seg["text"].strip()
            if text:
                f.write(text + "\n")

    print(f"💾 Saved → output/{base_name}.lrc  |  .srt  |  _lyrics.txt")

    # ── Preview ──────────────────────────────
    print(f"\n📋 Preview:")
    for seg in segments[:8]:
        text = seg["text"].strip()
        if text:
            print(f"   {to_lrc_time(seg['start'])}  {text}")
    if len(segments) > 8:
        print(f"   ... and {len(segments) - 8} more lines")


# ─────────────────────────────────────────────
# 4. CLI Entry Point
# ─────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Wavr Audio Transcription Tool")
    parser.add_argument("audio", nargs="?", default=None,
        help="Audio file path. Omit to process all files in input/ folder.")
    parser.add_argument("--model", default="medium",
        choices=["tiny","base","small","medium","large","large-v2","large-v3"],
        help="Whisper model (default: medium)")
    parser.add_argument("--lang", default=None,
        help="Language code e.g. 'vi' or 'en'. Leave blank for auto-detect.")
    args = parser.parse_args()

    ensure_deps()

    # Collect files
    if args.audio:
        files = [args.audio]
    else:
        os.makedirs(INPUT_DIR, exist_ok=True)
        files = [f for f in glob.glob(os.path.join(INPUT_DIR, "*"))
                 if os.path.splitext(f)[1].lower() in AUDIO_EXTS]
        if not files:
            print(f"\n⚠️  No audio files found in: {INPUT_DIR}")
            print(f"   Drop your .mp3 / .m4a / .flac / .wav files there and re-run.\n")
            sys.exit(0)

    backend = "faster-whisper" if USE_FASTER_WHISPER else "openai-whisper"
    print(f"\n🤖 Loading Whisper '{args.model}' via {backend}...")
    print("   (First run downloads the model — one-time only)\n")

    if USE_FASTER_WHISPER:
        from faster_whisper import WhisperModel
        model = WhisperModel(args.model, device="cpu", compute_type="int8")
    else:
        import whisper
        model = whisper.load_model(args.model)

    print(f"📂 Processing {len(files)} file(s)...\n")
    for audio_path in files:
        transcribe_file(audio_path, model, args.model, args.lang)

    print(f"\n{'═'*60}")
    print(f"🎉 All done!  Results saved in: transcriber/output/")
    print(f"   Import .lrc into Wavr to get synced lyrics.")
    print(f"{'═'*60}\n")
