# Wavr Project Rules

## Architecture: Modular File Structure

**LUÔN LUÔN tách code thành các file nhỏ theo chức năng. KHÔNG được nhồi nhét logic mới vào các file lớn hiện có (main.js, edit-library.js) nếu tính năng đó có thể đứng độc lập thành một module riêng.**

### Quy tắc cụ thể:

1. **Mỗi tính năng = một file riêng**
   - Nếu code là một tính năng độc lập (ví dụ: drag & drop, context menu, box expansion), tạo file mới trong thư mục phù hợp.
   - Không thêm quá 100 dòng logic mới vào một file đã có sẵn mà không cân nhắc tách ra.

2. **Cấu trúc thư mục chuẩn:**
   ```
   js/
   ├── core/         — Hạ tầng lõi (audio engine, rendering)
   ├── features/     — Tính năng người dùng (library, lyrics, player, visualizer)
   │   ├── library/
   │   ├── lyrics/
   │   ├── player/
   │   └── visualizer/
   ├── modules/      — Các module tiện ích dùng chung
   └── shared/       — Hằng số, utilities dùng xuyên suốt
   ```

3. **main.js chỉ là điều phối viên (orchestrator)**
   - `main.js` chỉ được phép: import các module, gọi hàm khởi tạo, và gán event listeners cấp cao nhất.
   - Mọi logic xử lý cụ thể phải nằm trong các module riêng.

4. **edit-library.js — ưu tiên tách dần:**
   - Drag & Drop Engine → `js/features/library/DragDropEngine.js`
   - Context Menu → `js/features/library/SongContextMenu.js`
   - Box Expansion → `js/features/library/BoxExpansion.js`
   - Grid Renderer → `js/features/library/EditGridRenderer.js`

5. **CSS: một file chính + partial nếu cần**
   - `css/main.css` là file chính, giữ lại.
   - Nếu một tính năng có >100 dòng CSS đặc thù, cân nhắc tách ra `css/features/<feature>.css`.

6. **Không để code debug trong production**
   - Xóa toàn bộ `console.log` debug trước khi build.
   - Chỉ giữ `console.warn/error` cho runtime errors thực sự.
