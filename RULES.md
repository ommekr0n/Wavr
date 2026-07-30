# Wavr Project Rules

## Architecture: Modular File Structure & Strict Anti-Monolith Rule

**LUÔN LUÔN tách code thành các file nhỏ theo chức năng. KHÔNG ĐƯỢC nhồi nhét logic mới vào các file lớn hiện có (main.js, edit-library.js) hoặc viết gộp nhiều tính năng vào cùng một file. BẤT KỲ TÍNH NĂNG HOẶC NÂNG CẤP MỚI NÀO BẮT BUỘC PHẢI ĐƯỢC TẠO THÀNH FILE MODULE .JS RIÊNG BIỆT.**

### Quy tắc cụ thể:

1. **Strict No-Monolith Rule (Bắt buộc tách module riêng cho mọi chức năng mới):**
   - Bất kỳ tính năng mới hoặc hệ thống xử lý mới nào (ví dụ: Moshpit Engine, Audio Frequency Bands, Laser Renderer, Laser FX, Elastic Lyrics Sizer...) BẮT BUỘC phải tạo file `.js` mới riêng biệt trong `js/core/` hoặc `js/features/`.
   - TUYỆT ĐỐI KHÔNG viết gộp logic mới vào các file hiện có. File hiện có chỉ import và gọi hàm của module mới.
   - Mỗi file module mới chỉ đảm nhận 1 trách nhiệm duy nhất (Single Responsibility Principle).

2. **Mỗi tính năng = một file riêng:**
   - Nếu code là một tính năng độc lập (ví dụ: drag & drop, context menu, box expansion, laser rays), tạo file mới trong thư mục phù hợp.
   - Không thêm quá 50 dòng logic mới vào một file đã có sẵn mà không tách ra module mới.

3. **Cấu trúc thư mục chuẩn:**
   ```
   js/
   ├── core/         — Hạ tầng lõi (audio engine, rendering, frequency analysis)
   ├── features/     — Tính năng người dùng (library, lyrics, player, visualizer, eq)
   │   ├── library/
   │   ├── lyrics/
   │   ├── player/
   │   ├── visualizer/
   │   └── eq/
   ├── modules/      — Các module tiện ích dùng chung
   └── shared/       — Hằng số, state store, utilities dùng xuyên suốt
   ```

4. **main.js & edit-library.js chỉ là điều phối viên (Orchestrators):**
   - `main.js` và `edit-library.js` chỉ được phép: import các module, gọi hàm khởi tạo, và gán event listeners cấp cao nhất.
   - Mọi logic xử lý cụ thể phải nằm trong các module riêng.

5. **CSS: một file chính + partial nếu cần:**
   - `css/main.css` là file chính, giữ lại.
   - Nếu một tính năng có >100 dòng CSS đặc thù, cân nhắc tách ra `css/features/<feature>.css`.

6. **Không để code debug trong production:**
   - Xóa toàn bộ `console.log` debug trước khi build.
   - Chỉ giữ `console.warn/error` cho runtime errors thực sự.
