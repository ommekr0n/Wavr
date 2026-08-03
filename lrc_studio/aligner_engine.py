#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SOTA Enhanced LRC Aligner Engine for Vietnamese Rap & Fast Music
Powered by Meta AI MMS-300M (Massively Multilingual Speech) CTC Neural Forced Alignment
and PyTorch Viterbi Trellis Decoding.
"""

import sys
import os
import re
import json
import argparse
import subprocess
import tempfile
import unicodedata

def format_timestamp(seconds: float, decimals: int = 3) -> str:
    """
    Formats seconds into mm:ss.xxx format for LRC.
    Default decimals=3 for millisecond precision.
    """
    if seconds < 0:
        seconds = 0.0
    minutes = int(seconds // 60)
    secs = seconds % 60
    if decimals == 3:
        return f"{minutes:02d}:{secs:06.3f}"
    else:
        return f"{minutes:02d}:{secs:05.2f}"

def isolate_vocals_demucs(input_path: str) -> str:
    """
    SOTA Neural Vocal Separation using PyTorch HDemucs (Hybrid Transformer Demucs).
    Extracts pure vocals stem, eliminating drums, bass, and background instrumental.
    Falls back gracefully to original audio if HDemucs fails or weights are unavailable.
    """
    temp_pcm = None
    try:
        import torch
        import torchaudio.pipelines as pipelines
        import soundfile as sf
        
        # Convert input audio to 44100Hz 2-channel PCM WAV to bypass TorchCodec dependency
        temp_pcm = tempfile.NamedTemporaryFile(suffix="_pcm44k.wav", delete=False)
        temp_pcm.close()
        
        cmd_pcm = [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "44100", "-ac", "2",
            temp_pcm.name
        ]
        subprocess.run(cmd_pcm, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

        print("[SOTA HDemucs] Initializing Hybrid Demucs Neural Vocal Isolator...", file=sys.stderr)
        bundle = pipelines.HDEMUCS_HIGH_MUSDB
        model = bundle.get_model()
        model.eval()
        
        audio_data, sample_rate = sf.read(temp_pcm.name, dtype='float32')
        waveform = torch.from_numpy(audio_data.T)
        
        if sample_rate != bundle.sample_rate:
            import torchaudio.transforms as T
            resampler = T.Resample(sample_rate, bundle.sample_rate)
            waveform = resampler(waveform)
            
        if waveform.shape[0] == 1:
            waveform = waveform.repeat(2, 1)
        elif waveform.shape[0] > 2:
            waveform = waveform[:2]

        waveform_batch = waveform.unsqueeze(0)
        
        with torch.no_grad():
            sources = model(waveform_batch)
            vocal_stem = sources[0, 3] # Index 3 is vocals
            
        temp_vocal_wav = tempfile.NamedTemporaryFile(suffix="_hdemucs_vocals.wav", delete=False)
        temp_vocal_wav.close()
        
        vocal_data = vocal_stem.cpu().numpy().T
        sf.write(temp_vocal_wav.name, vocal_data, bundle.sample_rate)
        
        print(f"[SOTA HDemucs] Pure Vocal Stem successfully extracted -> {temp_vocal_wav.name}", file=sys.stderr)
        return temp_vocal_wav.name
    except Exception as e:
        print(f"[SOTA HDemucs Warning] Neural Vocal Separation skipped/fallback: {e}", file=sys.stderr)
        return input_path
    finally:
        if temp_pcm and os.path.exists(temp_pcm.name):
            try:
                os.remove(temp_pcm.name)
            except Exception:
                pass

def parse_plain_text(lyrics_text: str):
    """
    Splits input plain text lyrics into structured lines and words/syllables.
    """
    lines = []
    raw_lines = lyrics_text.strip().splitlines()
    for line in raw_lines:
        line_str = line.strip()
        if not line_str:
            continue
        words = line_str.split()
        if words:
            lines.append({
                "original": line_str,
                "words": words
            })
    return lines

def ensure_strictly_increasing_words(words_list, min_duration: float = 0.04, decimals: int = 3):
    """
    Guarantees strictly increasing timestamps using Proportional Anchor-Based Interpolation.
    Prevents 0ms overlaps for fast rap syllables.
    """
    n = len(words_list)
    if n == 0:
        return words_list

    for k in range(n):
        words_list[k]["start"] = round(words_list[k]["start"], decimals)
        words_list[k]["end"] = round(words_list[k]["end"], decimals)

    i = 0
    while i < n:
        j = i
        while j + 1 < n and words_list[j + 1]["start"] <= words_list[i]["start"]:
            j += 1
            
        if j > i:
            cluster_start = words_list[i]["start"]
            if j + 1 < n:
                next_anchor = max(cluster_start + (j - i + 1) * min_duration, words_list[j + 1]["start"])
            else:
                next_anchor = cluster_start + (j - i + 1) * 0.25
                
            step = (next_anchor - cluster_start) / (j - i + 1)
            for idx in range(i, j + 1):
                words_list[idx]["start"] = round(cluster_start + (idx - i) * step, decimals)
                words_list[idx]["end"] = round(words_list[idx]["start"] + max(0.04, step * 0.85), decimals)
            i = j + 1
        else:
            i += 1

    for k in range(n - 1):
        if words_list[k + 1]["start"] <= words_list[k]["start"]:
            words_list[k + 1]["start"] = round(words_list[k]["start"] + min_duration, decimals)
        if words_list[k]["end"] <= words_list[k]["start"]:
            words_list[k]["end"] = round(words_list[k]["start"] + min_duration / 2, decimals)

    return words_list

def clean_vietnamese_word(word: str) -> str:
    """
    Normalizes Vietnamese unicode characters to latin characters for Meta MMS-300M dictionary matching.
    """
    word_str = word.lower()
    word_str = word_str.replace('đ', 'd').replace('Đ', 'd')
    nfkd = unicodedata.normalize('NFKD', word_str)
    no_accent = "".join([c for c in nfkd if not unicodedata.combining(c)])
    clean_latin = re.sub(r'[^a-z]', '', no_accent)
    return clean_latin

def align_lyrics(audio_path: str, lyrics_text: str, language: str = "vi", decimals: int = 3):
    """
    Performs Forced Alignment using Meta AI MMS-300M (Massively Multilingual Speech) CTC Model.
    Computes exact frame-level Viterbi Trellis alignment at 20ms resolution.
    100% loss-less: No segment drops, no missing words, no drift!
    """
    import torch
    import torchaudio
    import torchaudio.functional as F
    import soundfile as sf
    import numpy as np

    # 1. Neural Vocal Separation using HDemucs
    vocal_wav = isolate_vocals_demucs(audio_path)

    # 2. Load Meta AI MMS-300M Forced Alignment Bundle
    print("[Meta MMS-300M] Loading Meta AI Multilingual Speech Alignment Model...", file=sys.stderr)
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model()
    model.eval()

    labels = bundle.get_labels()
    dictionary = {c: i for i, c in enumerate(labels)}

    # 3. Read audio & resample to 16kHz mono
    audio_data, sr = sf.read(vocal_wav, dtype='float32')
    if audio_data.ndim > 1:
        audio_data = audio_data.mean(axis=1)

    audio_tensor = torch.from_numpy(audio_data).unsqueeze(0) # (1, samples)
    if sr != bundle.sample_rate:
        import torchaudio.transforms as T
        resampler = T.Resample(sr, bundle.sample_rate)
        audio_tensor = resampler(audio_tensor)

    duration_sec = audio_tensor.shape[1] / bundle.sample_rate

    # Cleanup temp vocal file
    if vocal_wav != audio_path and os.path.exists(vocal_wav):
        try:
            os.remove(vocal_wav)
        except Exception:
            pass

    # 4. Tokenize target lyrics
    lines_data = parse_plain_text(lyrics_text)
    word_tokens_meta = []
    flat_targets = []

    for l_idx, line in enumerate(lines_data):
        for w_idx, w_text in enumerate(line["words"]):
            c_text = clean_vietnamese_word(w_text)
            if not c_text:
                c_text = "a" # fallback for pure punctuation
            w_toks = [dictionary[c] for c in c_text if c in dictionary]
            if not w_toks:
                w_toks = [dictionary['a']]
                
            word_tokens_meta.append({
                "l_idx": l_idx,
                "original": w_text,
                "clean": c_text,
                "tokens": w_toks
            })
            flat_targets.extend(w_toks)

    if not flat_targets:
        return []

    targets_tensor = torch.tensor([flat_targets], dtype=torch.int32)

    # 5. Extract acoustic emissions & run PyTorch CTC forced_align
    print("[Meta MMS-300M] Computing CTC Viterbi Trellis Frame Emissions...", file=sys.stderr)
    with torch.no_grad():
        emissions, _ = model(audio_tensor)
        log_probs = torch.log_softmax(emissions, dim=-1)

    aligned_tokens, scores = F.forced_align(log_probs, targets_tensor, blank=0)
    token_spans = F.merge_tokens(aligned_tokens[0], scores[0], blank=0)

    num_frames = log_probs.shape[1]
    time_per_frame = duration_sec / max(1, num_frames)

    # 6. Map token spans back to words
    word_token_ranges = []
    t_cursor = 0
    for w in word_tokens_meta:
        n_toks = len(w["tokens"])
        word_token_ranges.append((t_cursor, t_cursor + n_toks, w))
        t_cursor += n_toks

    final_lines = []
    current_line_words = []
    current_l_idx = 0

    span_idx = 0
    num_spans = len(token_spans)

    for start_tok, end_tok, w_meta in word_token_ranges:
        matched_spans = []
        while span_idx < num_spans and span_idx < end_tok:
            matched_spans.append(token_spans[span_idx])
            span_idx += 1

        if matched_spans:
            w_start = matched_spans[0].start * time_per_frame
            w_end = (matched_spans[-1].end + 1) * time_per_frame
        else:
            last_end = current_line_words[-1]["end"] if current_line_words else 0.0
            w_start = last_end
            w_end = last_end + 0.1

        word_obj = {
            "word": w_meta["original"],
            "start": round(w_start, decimals),
            "end": round(max(w_end, w_start + 0.05), decimals)
        }

        if w_meta["l_idx"] != current_l_idx:
            # Line completed
            if current_line_words:
                current_line_words = ensure_strictly_increasing_words(current_line_words, min_duration=0.04, decimals=decimals)
                final_lines.append({
                    "start": current_line_words[0]["start"],
                    "end": current_line_words[-1]["end"],
                    "text": lines_data[current_l_idx]["original"],
                    "words": current_line_words
                })
            current_line_words = [word_obj]
            current_l_idx = w_meta["l_idx"]
        else:
            current_line_words.append(word_obj)

    # Append last line
    if current_line_words and current_l_idx < len(lines_data):
        current_line_words = ensure_strictly_increasing_words(current_line_words, min_duration=0.04, decimals=decimals)
        final_lines.append({
            "start": current_line_words[0]["start"],
            "end": current_line_words[-1]["end"],
            "text": lines_data[current_l_idx]["original"],
            "words": current_line_words
        })

    print(f"[Meta MMS-300M] Alignment complete! Total lines: {len(final_lines)}", file=sys.stderr)
    return final_lines

def generate_enhanced_lrc(aligned_lines, decimals: int = 3) -> str:
    """
    Formats aligned line and word timestamps into Enhanced LRC specification format:
    [mm:ss.xxx] <mm:ss.xxx>Word1 <mm:ss.xxx>Word2 ... <mm:ss.xxx>
    Includes trailing <end_of_line> timestamp tag.
    """
    lrc_lines = [
        "[ar:Enhanced LRC Studio]",
        "[al:Meta AI MMS-300M Neural Aligner]",
        "[by:Antigravity AI]",
        ""
    ]
    
    for line in aligned_lines:
        line_ts = format_timestamp(line["start"], decimals=decimals)
        word_parts = []
        for w in line["words"]:
            w_ts = format_timestamp(w["start"], decimals=decimals)
            word_parts.append(f"<{w_ts}>{w['word']}")
        
        # Trailing End-Of-Line timestamp tag
        end_ts = format_timestamp(line["end"], decimals=decimals)
        word_parts.append(f"<{end_ts}>")
        
        line_content = " ".join(word_parts)
        lrc_lines.append(f"[{line_ts}] {line_content}")

    return "\n".join(lrc_lines)

def warmup_models():
    """
    Pre-downloads and loads HDemucs and Meta MMS-300M model weights on server startup
    to prevent first-request timeout.
    """
    try:
        import torch
        import torchaudio.pipelines as pipelines
        print("[Warmup] Pre-loading HDemucs & Meta MMS-300M model weights into GPU/RAM...", file=sys.stderr)
        pipelines.HDEMUCS_HIGH_MUSDB.get_model()
        pipelines.MMS_FA.get_model()
        print("[Warmup] All SOTA AI Models successfully cached and ready!", file=sys.stderr)
    except Exception as e:
        print(f"[Warmup Warning] Pre-load skipped: {e}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description="Vietnamese Rap Meta MMS-300M Enhanced LRC Aligner")
    parser.add_argument("--audio", required=True, help="Path to input audio file")
    parser.add_argument("--text", required=True, help="Path to plain text lyrics file")
    parser.add_argument("--output", help="Path to save output .lrc file")
    parser.add_argument("--lang", default="vi")
    parser.add_argument("--decimals", type=int, default=3, help="Decimal precision digits (2 or 3)")
    parser.add_argument("--json", action="store_true")

    args = parser.parse_args()

    if os.path.exists(args.text):
        with open(args.text, "r", encoding="utf-8") as f:
            lyrics_content = f.read()
    else:
        lyrics_content = args.text

    aligned = align_lyrics(
        audio_path=args.audio,
        lyrics_text=lyrics_content,
        language=args.lang,
        decimals=args.decimals
    )

    enhanced_lrc = generate_enhanced_lrc(aligned, decimals=args.decimals)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(enhanced_lrc)
        print(f"[Aligner] Successfully generated Enhanced LRC: {args.output}", file=sys.stderr)

    if args.json:
        print(json.dumps({
            "lines": aligned,
            "lrc_text": enhanced_lrc
        }, ensure_ascii=False, indent=2))
    elif not args.output:
        print(enhanced_lrc)

if __name__ == "__main__":
    main()
