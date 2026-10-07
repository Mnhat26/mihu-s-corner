# Điều chỉnh dropdown và căn ảnh — 02/10/2026
- Bỏ ảnh bìa dashboard khỏi Personalize và phần hiển thị dashboard. Giữ trường cover cũ trong schema để không phá dữ liệu đã lưu, không còn dùng trong UI.
- SoftSelect dùng popover listbox neo dưới trigger; tự lật lên khi thiếu chỗ, không modal/backdrop mờ; giữ bo góc, theme, focus/keyboard, hidden input FormData.
- Crop dùng pointer capture: kéo chuột/một ngón để pan, wheel và pinch hai ngón để zoom 1–5x; nút Đặt lại, bỏ các slider. Crop geometry chung cho preview/output, clamp không để vùng trắng.
- TypeScript đạt; check-crop.mjs đạt kiểm tra tâm zoom, hướng pan, biên crop với ảnh ngang/dọc/vuông.
- QA trực tiếp bằng trình duyệt: wheel từ100% lên206%, drag thay đổi vị trí; dropdown settings + trong task modal chọn được; không console errors. iPhone pinch thật chưa kiểm tra.
- Screenshot dropdown-preview.jpg. Preview server đã khởi động với bản mới, localhost5173.

# Cá nhân hóa / giao diện — 02/10/2026
- User duyệt sửa sáng/tối/điểm nhấn, chọn ảnh + căn/cắt, mọi select/confirm bo góc, nhật ký clear sau lưu và hỏi trước ghi đè.
- ĐÃ làm preview theme/accent ngay, system theo matchMedia, sticky Lưu/Hủy, xác nhận bỏ thay đổi khi chuyển trang.
- SoftSelect cho tất cả select ở corner.tsx, dialog đồng bộ theme và font, hỗ trợ bàn phím. ConfirmationHost thay window.confirm.
- PhotoPicker nút cộng, image/* chọn thư viện thiết bị, thumbnail thay/bỏ, crop vuông/avatar/decor và 16:9 cover, zoom/căn, JPEG giới hạn kích thước. Không ép được hộp hệ điều hành; HEIC tùy trình duyệt hỗ trợ.
- Dashboard chỉ 2 khung. Tối đa6 ảnh; đổi ngẫu nhiên mỗi60s khi tab hiện, không trùng trong lượt, tránh cặp trước khi đủ ảnh, có nút đổi/vuốt. Dưới2 ảnh giữ placeholder.
- Nhật ký lưu thành công clear text, lỗi giữ nguyên; hỏi trước thay thế bản cùng ngày; lịch sử mở lại được. Không tự ghi đè khi bấm lưu rỗng sau khi đã lưu.
- QA browser preview không ghi dữ liệu thật: dark + yellow hoạt động, Hủy trả lại light/pink, crop ảnh fixture mở được, custom reminder chọn đúng trong modal. Screenshot personalize-dark.jpg.
- TypeScript và bài kiểm tra chọn ảnh đạt. Chưa kiểm tra iPhone thật. Production deployment vẫn bị Windows spawn EPERM như trước.

# Sửa mapping UID theo xác nhận mới nhất của người dùng
- Mnhat: caLbravpcYT5SMay4RLJbP2NNfl1
- Mihu: Q8MbbftXbOYLvV2FlJmUzoLm6Sd2
- Hai UID trước bị gán ngược. Đã sửa .env.local, giữ nguyên email. Không thay đổi dữ liệu hoặc nới quyền truy cập.

# Cập nhật mới nhất — 02/10/2026
- User đã nói bắt đầu code để chuyển sang email link. ĐÃ chuyển API và giao diện, bỏ tất cả action mật khẩu cũ.
- Đã nhận hai email/UID và VAPID, lưu .env.local ignored. Không cần hỏi lại. Chưa cập nhật cấu hình máy chủ Site.
- Auth POST: send-link/email-link/logout; allowlist email + UID, generic response ngoài danh sách, rate limits, HttpOnly sessions. Không đưa email cố định vào bundle client.
- UI yêu cầu email rõ ràng khi hoàn tất; hỗ trợ dán link trong PWA, không tự tiêu thụ link, xóa code khỏi URL sau khi đọc, no-referrer.
- 12 kiểm tra email-link đạt + 12 API hiện có đạt; TypeScript đạt. Firebase transport mô phỏng, chưa gửi email thật.
- Đã xem UI login desktop 1440 và mobile390, không tràn ngang. Ảnh email-login-preview.jpg.
- HUONG-DAN-FIREBASE.md và README-MIHU.md đã cập nhật. Hướng dẫn cũ bên dưới chỉ là lịch sử; email link thay thế mật khẩu.
- Còn cần Firebase Console bật provider/domain, thử đăng nhập thật; service account/lịch gửi FCM; production build/xuất bản/Safari thật.

---
# Tiến độ Mihu’s Corner

## Quyết định mới nhất — 01/10/2026
- Người dùng đã nói **bắt đầu code**. Cho phép code từ thông tin thiết kế đã lưu, không chỉnh Figma nữa.
- Đăng nhập bằng hai số cố định + mật khẩu; quên mật khẩu qua email.
- Mnhat: 0966772337; Mihu: 0987842746. Cả hai hiển thị tên Mihu, dữ liệu tách riêng, cùng quyền.
- Đã nhận cấu hình Firebase project mihu-s-corner, lưu trong .env.local (ignored) và cấu hình Site. Chưa có email khôi phục và UID của hai tài khoản.
- Tạo mật khẩu và quên mật khẩu dùng liên kết Firebase gửi vào email đã đăng ký, không cho đăng ký tự do.
- Không seed dữ liệu task/tiền/nhật ký/mục tiêu. Mọi số liệu phải tính từ dữ liệu thật.

## Đang làm
- Đã viết frontend toàn bộ trang và API auth/state/assets/push/reminders, domain, schema/migration.
- Thiết kế: sidebar 224px, Be Vietnam Pro, dashboard trắng/vàng; các trang khác trắng/hồng nhạt; hướng dương.
- TypeScript đã kiểm tra đạt ở mốc hiện tại; 14 kiểm tra domain + 12 API đạt, gồm tài khoản bị vô hiệu hóa và phiên bị thu hồi. API tests dùng SQLite thật và mô phỏng Firebase, không chứng minh dịch vụ Firebase thật.
- Đã kiểm tra dashboard/lịch tháng/tài chính ở 1440 và 390px; kiểm tra mục tiêu, nhật ký, tài khoản, hộp đổi mật khẩu và tạo mật khẩu. Nhật ký/tài khoản ở 320px không tràn ngang. Console không báo lỗi. Công cụ chụp ảnh cuối lượt không hoạt động; chưa có ảnh bàn giao mới.
- Preview chạy bằng `node scripts/preview-ui.mjs --backend` tại http://127.0.0.1:5173. API thật qua adapter SQLite/R2 local, Firebase chưa đủ cấu hình tài khoản. ?preview=1 chỉ xem UI, không lưu.
- Chạy Vinext/Drizzle CLI lỗi Windows spawn EPERM. Migrations đã tạo qua API chính thức Drizzle; preview UI qua Rolldown. Chưa có production build.
- Site đã tạo đúng một lần: appgprj_6abe4fa0bf2c819196e7fdaaf37ee41e. Chưa xuất bản. Reuse .openai/hosting.json, tuyệt đối không tạo Site khác.
- Bước đưa credential vào workflow bị sandbox approval từ chối trong lượt trước; hạn mức cũng đã ngắt nhiều lần. Không tuyên bố đã xuất bản.
- WebMCP đọc task bị auto-review từ chối vì thêm quyền đọc dữ liệu riêng chưa được yêu cầu. ĐÃ BỎ, không thử lách/triển khai lại.

## Phần cần hoàn thiện
- Đã hoàn thiện HUONG-DAN-FIREBASE.md và README-MIHU.md. Preview hiện chạy với backend local. Nhắc việc đọc lại task và đăng ký thiết bị trước khi gửi để loại trạng thái đã thay đổi.
- Kiểm chứng Firebase/email thật khi có hai email/UID. FCM cần VAPID, service-account secret, lịch chạy; REMINDERS_ENABLED vẫn false.
- Production build và xuất bản đang cần giải quyết môi trường. Hai iPhone thực tế chưa kiểm tra.
- Ghi lại chính xác mọi phần chưa được kiểm tra với dịch vụ thật khi bàn giao.

Nếu phiên bị gián đoạn: đọc file này và kiểm tra code hiện có trước khi tiếp tục. Không làm lại từ đầu.
