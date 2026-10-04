# Wavr: kiểm tra register / login ngày 04-10-2026

## Kết quả xác minh

Dự án: `stbzeroodquuevmrwfyi`. Đã đọc mã nguồn, đọc `/auth/v1/settings` bằng publishable key của ứng dụng và chạy Supabase security advisor. Không tạo tài khoản thử, gửi email, dò mật khẩu hay đổi cấu hình production.

| Phát hiện | Bằng chứng | Trạng thái |
| --- | --- | --- |
| Đăng ký không xác minh quyền sở hữu email | Settings trả về `disable_signup: false`, `mailer_autoconfirm: true`, email provider bật | **Chưa sửa trên máy chủ**: bật Confirm email và kiểm tra SMTP |
| Mật khẩu đã rò rỉ chưa bị chặn | Advisor hiện tại: `auth_leaked_password_protection`, mức WARN | **Chưa sửa trên máy chủ**: bật tính năng nếu gói hỗ trợ |
| Chưa có chính sách độ dài mật khẩu trong code đăng ký | Form chỉ có `required`; service gửi nguyên thông tin lên Auth | Đã bổ sung tối thiểu 12 ký tự khi đăng ký; **chưa xác minh/chỉnh chính sách server** |
| Thông báo có thể tiết lộ trạng thái tài khoản | UI hiển thị trực tiếp `err.message`, gồm lỗi email đã tồn tại/chưa xác nhận | Đã giới hạn thông báo UI, xử lý signup trùng bằng thông báo chung. Không thể che phản hồi trực tiếp của Auth API bằng frontend |
| Có đường nhận phiên từ URL không cần thiết | Client bật `detectSessionInUrl: true` với flow mặc định implicit, trong khi ứng dụng chỉ đăng nhập bằng password | Đã tắt nhận phiên từ URL; kiểm thử với SDK thật xác nhận token trong fragment không được nhập |
| Rủi ro treo luồng Auth | `onAuthStateChange` gọi UI, UI gọi `getUser`/SDK trong vòng đời callback | Đã chuyển callback ra khỏi khóa SDK, hỗ trợ hủy các callback đang chờ |
| Phiên cũ để lại thư viện đang mở | Sign out chỉ cập nhật modal; playlist/audio, links và cache thứ tự thư viện vẫn còn | Đã dừng audio, dọn cache thư viện và reload khi identity thay đổi |
| Form không khóa logic gửi yêu cầu | Chỉ disable nút; handler không kiểm tra trạng thái pending, tab vẫn đổi được | Đã chặn submit trùng, khóa tab trong yêu cầu, xóa password khi hoàn tất/đóng modal |
| Không có tích hợp CAPTCHA trong form | Signup/login không truyền `options.captchaToken` | Đã tích hợp Turnstile, chủ dự án thêm site key/hostname và cấu hình Supabase; đã xác minh server từ chối login thiếu token |

Email auto-confirm và mật khẩu rò rỉ là thiếu biện pháp phòng vệ đã được xác minh, không phải bằng chứng tài khoản đã bị chiếm. Các lỗi callback/form là lỗi xử lý luồng, không phải tự thân một cách bypass password hay RLS.

## Những việc cần cấu hình phía máy chủ

Thực hiện theo mục Password authentication trong [SECURITY.md](../../SECURITY.md): Confirm email, SMTP, min length 12, leaked-password protection, CAPTCHA và Auth rate limits. Các công cụ Supabase đang kết nối không cung cấp thao tác cập nhật Auth settings; những thiết lập này chưa được thay đổi trong lần sửa mã nguồn này.

Sau đó chủ dự án đã cấu hình Turnstile và CAPTCHA trên Supabase. Một yêu cầu login thử, dùng email giả `captcha-check@example.invalid` và không có CAPTCHA token, nhận HTTP 400 với `error_code: captcha_failed`, `captcha protection: request disallowed (no captcha_token found)`. Điều này xác nhận CAPTCHA đã bắt buộc ở Auth server; chưa kiểm thử đăng nhập thành công bằng tài khoản thật. Các thiết lập email/password/rate limits còn lại vẫn chưa được xác minh lại. Khi deploy, thêm `VITE_TURNSTILE_SITE_KEY` vào môi trường build của hosting vì `.env` chỉ ở máy local.

Với auto-confirm hiện tại, API signup có thể cấp session ngay; phản hồi giữa email mới và email đã tồn tại vẫn có thể khác nhau ở API và ở chuyển trạng thái đăng nhập. Thông báo chung trên form không giải quyết được việc này ở backend. Khi bật Confirm email, cần kiểm tra thêm cài đặt che dấu người dùng hiện hữu của Supabase và kiểm thử signup mới/trùng bằng tài khoản được phép.

Chính sách mật khẩu, rate limits và CAPTCHA phải được thi hành bởi Supabase vì người gửi có thể bỏ qua hoàn toàn UI. Chưa khẳng định rate limits mặc định bị tắt hoặc không tồn tại. Publishable key ở frontend là thiết kế bình thường, không phải service-role secret.

## Kiểm chứng phần sửa

- `tools/verify-vault-auth.mjs`: SDK thật không nhận session từ URL; credentials và password whitespace; CAPTCHA bắt buộc/truyền token/hết hạn/reset; đăng ký trùng; lỗi không tiết lộ xác nhận tài khoản; callback ngoài khóa SDK; chống submit trùng; không báo thành công giả khi chưa có session; xóa password; dọn dữ liệu và reload khi đổi identity.
- Chạy toàn bộ `npm test` và `npm run build`.
- Kiểm tra preview trong trình duyệt: modal mở bình thường, tab signup hiển thị hướng dẫn 12 ký tự và dùng `autocomplete="new-password"`, login dùng `current-password`. Không gửi form tới Auth production.
- Không đổi file schema SQL hoặc kết quả kiểm toán trước đó đang có thay đổi trong workspace.

Phiên Supabase vẫn nằm trong localStorage; code cùng origin có thể đọc được nếu có XSS. Cần một backend riêng để dùng cookie HttpOnly. Các access token và signed media URLs đã cấp có thể còn dùng được tới khi hết hạn sau logout. Lần sửa này không bổ sung MFA, recovery flow hoặc cơ chế thu hồi tức thì ở backend.

## Tài liệu đối chiếu

- [Password security và leaked passwords](https://supabase.com/docs/guides/auth/password-security)
- [CAPTCHA cho signup/login](https://supabase.com/docs/guides/auth/auth-captcha)
- [Rate limits của Supabase Auth](https://supabase.com/docs/guides/auth/rate-limits)
- [onAuthStateChange và async callbacks](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
- [Giới hạn và cách hoạt động PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Turnstile client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
