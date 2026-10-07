# Kiểm tra Mihu’s Corner — 07/10/2026

## Thay đổi
- Form lịch gọn: tên, ngày, mức ưu tiên, giờ, lời nhắc. Nhóm việc/lặp lại/ghi chú nằm trong mục mở rộng.
- Ưu tiên thấp xanh nhạt, vừa vàng, cao hồng; áp dụng cho thẻ lịch và danh sách công việc. Màu hoàn thành của ngày vẫn độc lập.
- Kiểm tra dữ liệu ngay trước khi gửi; nhắc nhập giờ khi chọn lời nhắc. API trả thông điệp kiểm tra cụ thể.
- SoftSelect hỗ trợ option không có value như select HTML.
- Cloudflare keep_vars giữ cấu hình runtime nhập trên Dashboard khi deploy lại. Cron mỗi phút gọi scheduled handler sẵn có.
- Push chỉ nhận action enable/disable và kiểm tra đủ các cấu hình cơ bản.

## Kết quả đã kiểm chứng
- TypeScript: đạt. git diff --check: đạt.
- 14 kiểm tra domain: lịch lặp, tick riêng mỗi ngày, sửa một lần/tương lai, tiến độ, chi tiêu, kết chuyển, mục tiêu, D1 schema.
- 18 kiểm tra API: xác thực, tách tài khoản, chống ghi đè, retry, lịch thêm/sửa/tick/xóa, tiền thêm/chi/xóa, nhật ký, mục tiêu, cá nhân hóa, thông điệp thiếu giờ.
- 12 kiểm tra email-link: gửi, giới hạn, hoàn tất, hết hạn, UID, tách tài khoản. Firebase được giả lập; không gửi email thật.
- Kiểm tra cắt ảnh và luân phiên 0–6 ảnh: đạt.
- Xem form trực tiếp trên trình duyệt desktop và viewport 390 x 844: đạt; đã thấy cảnh báo thiếu giờ.
- Các kiểm tra API dùng SQLite cục bộ và Firebase giả lập, không ghi dữ liệu vào tài khoản thật.

## Chưa xác nhận trên production
- npm run build trên Windows bị chặn spawn EPERM ở trình nạp cấu hình Vite. Cần kiểm tra build Linux của Cloudflare sau khi push.
- Chưa push/deploy thay đổi này; website online chưa có giao diện và bản sửa mới.
- Chưa kiểm tra tải ảnh thật lên R2, nhận push trên iPhone và lưu dữ liệu bằng phiên đăng nhập production.
- Push cần FIREBASE_SERVICE_ACCOUNT (Secret JSON, chỉ nhập trực tiếp ở Cloudflare), FIREBASE_VAPID_KEY, FIREBASE_PROJECT_ID, FIREBASE_API_KEY, FIREBASE_APP_ID, FIREBASE_SENDER_ID, FIREBASE_AUTH_DOMAIN và REMINDERS_ENABLED=true. Không gửi private key qua chat/GitHub. Cron đã được khai báo trong vite.config.ts; chỉ hoạt động sau deploy. Khi REMINDERS_ENABLED chưa true, handler không gửi thông báo.

## Đưa bản sửa lên online
Trong thư mục dự án, kiểm tra git diff rồi commit/push các file sửa. Cloudflare chạy npm run build và npx wrangler deploy --config dist/server/wrangler.json như hiện tại. Không chạy lại migration khởi tạo (các bảng đã có).
Sau deploy: thử lịch không giờ/không nhắc; lịch có giờ/nhắc 5 phút; đổi ưu tiên; lặp tuần; tải lại để kiểm tra lưu; chi tiêu; nhật ký; ảnh. Không coi preview=1 là kiểm tra lưu vì preview không ghi dữ liệu.
