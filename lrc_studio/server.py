#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Standalone Enhanced LRC Studio Server
Provides Web GUI and local REST API for auto-aligning lyrics to audio.
Compatible with Python 3.14+.
"""

import sys
import os
import re
import json
import tempfile
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler

STUDIO_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, STUDIO_DIR)
import aligner_engine

PORT = 8888

def parse_multipart_data(rfile, content_type, content_length):
    boundary = None
    for item in content_type.split(';'):
        item = item.strip()
        if item.startswith('boundary='):
            boundary = item.split('=', 1)[1].strip('"')
            break
    if not boundary:
        raise ValueError("Could not find boundary in Content-Type header")

    boundary_bytes = boundary.encode('utf-8')
    raw_bytes = rfile.read(content_length)

    parts = raw_bytes.split(b'--' + boundary_bytes)
    fields = {}

    for part in parts:
        if not part or part == b'--\r\n' or part.startswith(b'--'):
            continue
        if b'\r\n\r\n' in part:
            header_bytes, body_bytes = part.split(b'\r\n\r\n', 1)
            if body_bytes.endswith(b'\r\n'):
                body_bytes = body_bytes[:-2]
            header_str = header_bytes.decode('utf-8', errors='ignore')

            match = re.search(r'name="([^"]+)"', header_str)
            if match:
                field_name = match.group(1)
                fields[field_name] = body_bytes

    return fields

class LRCStudioHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STUDIO_DIR, **kwargs)

    def log_message(self, format, *args):
        if len(args) > 0 and ('favicon.ico' in str(args[0]) or '.well-known' in str(args[0])):
            return
        super().log_message(format, *args)

    def do_GET(self):
        if self.path == '/favicon.ico' or self.path.startswith('/.well-known'):
            self.send_response(204)
            self.end_headers()
            return
        if self.path == '/' or self.path == '/index.html':
            self.path = '/studio.html'
        return super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/align':
            try:
                content_type = self.headers.get('content-type', '')
                content_length = int(self.headers.get('content-length', 0))

                if 'multipart/form-data' not in content_type:
                    self.send_json_response({"error": "Content-type phải là multipart/form-data"}, status=400)
                    return

                fields = parse_multipart_data(self.rfile, content_type, content_length)

                audio_data = fields.get('audio')
                lyrics_bytes = fields.get('lyrics', b'')
                lyrics_text = lyrics_bytes.decode('utf-8', errors='ignore').strip()

                try:
                    decimals = int(fields.get('decimals', b'3').decode('utf-8', errors='ignore').strip())
                except Exception:
                    decimals = 3

                if not audio_data or not lyrics_text:
                    self.send_json_response({"error": "Thiếu file âm thanh hoặc văn bản lời bài hát."}, status=400)
                    return

                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_audio:
                    temp_audio.write(audio_data)
                    temp_audio_path = temp_audio.name

                try:
                    import importlib
                    importlib.reload(aligner_engine)
                    aligned = aligner_engine.align_lyrics(
                        audio_path=temp_audio_path,
                        lyrics_text=lyrics_text,
                        language="vi",
                        decimals=decimals
                    )
                    enhanced_lrc = aligner_engine.generate_enhanced_lrc(aligned, decimals=decimals)

                    self.send_json_response({
                        "success": True,
                        "lines": aligned,
                        "lrc": enhanced_lrc
                    })
                finally:
                    if os.path.exists(temp_audio_path):
                        os.remove(temp_audio_path)

            except Exception as e:
                print(f"[Error] API Error: {e}", file=sys.stderr)
                self.send_json_response({"error": str(e)}, status=500)
        else:
            self.send_error(404, "Endpoint không tồn tại")

    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

def main():
    server_address = ('', PORT)
    HTTPServer.allow_reuse_address = True
    httpd = HTTPServer(server_address, LRCStudioHandler)
    url = f"http://localhost:{PORT}/studio.html"
    print("=" * 60)
    print(f" 🚀 Enhanced LRC Studio đang chạy tại: {url}")
    print("=" * 60)
    
    # Pre-warm AI models in background
    import threading
    threading.Thread(target=aligner_engine.warmup_models, daemon=True).start()

    try:
        webbrowser.open(url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng server.")

if __name__ == '__main__':
    main()
