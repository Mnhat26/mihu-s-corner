# Mihu’s Corner

React/TypeScript, Tailwind CSS và CSS riêng; API tương thích Cloudflare Workers, Firebase Authentication, D1 và R2. Không có dữ liệu cá nhân mẫu trong ứng dụng.

## Chạy trên máy

Yêu cầu Node.js 24 và các thư viện trong package-lock.json. Chạy từ thư mục dự án:

```powershell
npm install
node scripts/preview-ui.mjs --backend
```

Mở `http://127.0.0.1:5173`. Thêm `?preview=1` để xem các trang khi chưa kết nối tài khoản; chế độ này chỉ xem, mọi thao tác lưu bị từ chối rõ ràng. Không có tài khoản thử hoặc đường tắt xác thực.

File `.env.local` chứa cấu hình Firebase đã nhận. Email/UID và VAPID đã được bổ sung. Xem `HUONG-DAN-FIREBASE.md`. Sau khi đổi cấu hình, khởi động lại tiến trình web.

Bộ chạy local dùng cùng các route API, với adapter SQLite và lưu ảnh trên ổ đĩa. Adapter chỉ dùng để phát triển; không được gói vào máy chủ production. Nó không mở cổng ra mạng ngoài: chỉ lắng nghe 127.0.0.1.

## Kiểm tra

```powershell
node scripts/check-domain.mjs
node scripts/check-api.mjs
node scripts/check-email-link.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Kiểm tra API dùng SQLite thật và mô phỏng phản hồi Firebase. Đây không phải kiểm thử đăng nhập/email với dịch vụ thật. Dữ liệu kiểm tra riêng trong `.sites-runtime/test-data`, không đụng dữ liệu người dùng.

## Build production

```powershell
npm run build
```

Giữ `vite.config.ts`, plugin Sites và `build/sites-worker.ts`. Build thành Worker có `fetch` và static assets. `.openai/hosting.json` giữ ID Site đã đăng ký; không tạo lại Site.

Migrations nằm trong `drizzle/`. Migration đầu được tạo bằng API chính thức Drizzle do CLI bị lỗi tạo tiến trình con trên máy hiện tại. Nếu schema đổi tiếp, tạo migration mới; không sửa migration đã áp dụng trên production.

Trong môi trường phiên làm việc hiện tại, Vinext và quy trình xuất bản bị chặn bởi `spawn EPERM`/quyền chạy bước xác thực. Bản local đã có thể chạy bằng trình biên dịch trong cùng tiến trình; không được xem đó là bằng chứng build production đã thành công.

## Những phần đã viết

- Đăng nhập bằng link email cho hai UID cố định, dán link trong PWA, phiên đăng nhập dài hạn và logout.
- Dashboard trắng/vàng; lịch tuần/tháng, task lặp, tiến độ ngày và tổng kết tuần.
- Tiền đầu tháng, thêm tiền, khoản chi, biểu đồ, cảnh báo và kết chuyển có xác nhận.
- Mục tiêu có mốc nhỏ hoặc liên kết task; nhật ký theo ngày.
- Ảnh riêng, màu sắc, sáng/tối, bật/tắt khung dashboard.
- Manifest/biểu tượng/service worker; nhận FCM và xử lý nhắc việc theo lịch ở máy chủ.

## Giới hạn cần kiểm chứng trước khi dùng thật

- Đã có email/UID trong cấu hình local; gửi email và đăng nhập với Firebase thật chưa kiểm chứng.
- Chưa có bản production đã build và xuất bản thành công.
- FCM đã có Sender ID/VAPID, còn thiếu service account và lịch chạy nền; mặc định tắt.
- Chưa kiểm tra Safari/iPhone thật. Kiểm tra responsive trên trình duyệt không thay thế bước này.
- Bản Site đang riêng tư cho chủ sở hữu nền tảng. Quyền truy cập của người thứ hai cần cấu hình sau khi xuất bản, độc lập với hai tài khoản bên trong ứng dụng.

Tiến độ cập nhật ở `PROGRESS.md`. Khi gián đoạn, đọc file này và tiếp tục trên mã hiện có.
