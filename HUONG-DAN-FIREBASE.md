# Kết nối Mihu’s Corner — cập nhật 02/10/2026

Đã nhận và lưu cấu hình Web App, hai email/UID, Sender ID và VAPID vào `.env.local` (không đưa lên Git). Phương án mới là **đăng nhập bằng link email**. Không còn đăng nhập, tạo, đổi hoặc khôi phục mật khẩu trong web. Bản trên mạng chưa được xuất bản; cấu hình local chưa tự chuyển lên máy chủ.

## 1. Bật đăng nhập bằng link

1. Firebase Console → Authentication → Sign-in method (Connection method) → Email/Password.
2. Bật **Email/Password** và **Email link (passwordless sign-in)**, lưu lại. Firebase yêu cầu mục Email/Password được bật dù web chỉ dùng link.
3. Authentication → Settings → Authorized domains: thêm tên miền web sau khi xuất bản. Để thử local, thêm `127.0.0.1` cho địa chỉ đang chạy. Chỉ nhập hostname, không nhập giao thức/cổng.
4. Trong Authentication → Templates, kiểm tra mẫu email đăng nhập và URL xử lý. Nếu trước đây đã đặt URL xử lý riêng, phải trỏ tới web đang chạy, nơi đọc `mode=signIn` và `oobCode`. Không để URL của bản cũ hoặc tên miền chưa xuất bản.

Tài liệu: [Đăng nhập email link](https://firebase.google.com/docs/auth/web/email-link-auth).

## 2. Hai tài khoản đã được cấu hình

- Mnhat và Mihu đã có email + UID cố định trong cấu hình máy chủ local; không cần tạo lại tài khoản.
- UID và email phải đồng thời khớp để nhận phiên. Không cấp quyền cho tài khoản mới tự đăng ký.
- Hai giao diện cùng hiển thị tên **Mihu**, dữ liệu vẫn tách theo UID. Số điện thoại chỉ là thông tin tài khoản.
- Không cần gửi mật khẩu cũ. Không xóa rồi tạo lại Firebase user vì UID mới sẽ khác.

## 3. Thử đăng nhập thật

1. Mở `http://127.0.0.1:5173/` trên máy đang chạy web.
2. Nhập một trong hai email đã đăng ký và bấm **Gửi liên kết đăng nhập** đúng một lần.
3. Kiểm tra email và Spam. Mở liên kết trên máy này, nhập lại đúng email rồi bấm **Đăng nhập vào góc nhỏ**.
4. Hoặc sao chép địa chỉ liên kết trong email, trở về web → **Đã có liên kết? Dán để đăng nhập**, nhập email và dán link.
5. Liên kết chỉ dùng một lần. Không gửi liên kết vào chat. Nếu đã dùng hoặc hết hạn, yêu cầu link mới.

Chưa có email thật nào được gửi trong bước kiểm tra tự động. Firebase Spark hiện giới hạn 5 email đăng nhập/ngày cho cả project; không bấm gửi liên tục. Nút gửi có khoảng chờ và máy chủ giới hạn tần suất.

Bản local chỉ chạy trên máy tính này. Mở link chứa 127.0.0.1 trên iPhone sẽ không kết nối được; phải đợi bản HTTPS trên mạng.

Tài liệu: [Hạn mức Firebase](https://firebase.google.com/docs/auth/limits).

## 4. Nhắc việc khi đã đóng web

Phần nhận và xử lý gửi thông báo đã có mã, nhưng cần cấu hình và kiểm tra thật trước khi bật:

1. Sender ID và VAPID Key đã được nhận và đặt vào cấu hình local. Không cần tạo cặp khóa mới.
2. Bật **Firebase Cloud Messaging API (V1)** nếu project yêu cầu.
3. Lưu thông tin xác thực máy chủ có quyền gửi FCM trong bí mật `FIREBASE_SERVICE_ACCOUNT`. Không gửi file service account/private key vào chat, không đặt trong thư mục public hoặc Git.
4. Cấu hình lịch chạy mỗi phút: Cron Trigger gọi hàm `scheduled` của Worker, hoặc bộ lập lịch gọi `POST /api/reminders` với header `Authorization: Bearer <CRON_SECRET>`.
5. `CRON_SECRET` cần chuỗi ngẫu nhiên dài ít nhất 32 ký tự. Nếu site có cổng truy cập riêng của nền tảng, bộ lập lịch cũng cần quyền của cổng đó; CRON_SECRET không thay thế quyền này.
6. Chỉ đặt `REMINDERS_ENABLED=true` sau khi lịch chạy đã được thiết lập. Thử một task thật khi iPhone khóa màn hình.

Không có dịch vụ SMS hoặc Cloud Functions trong cách triển khai này. Máy chủ và bộ lập lịch phải được chọn/cấu hình trước khi gửi nền hoạt động; không tự bật dịch vụ có phí.

Tài liệu: [FCM cho web](https://firebase.google.com/docs/cloud-messaging/web/get-started), [gửi FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

## 5. Cài lên màn hình chính iPhone

Sau khi web đã chạy bằng HTTPS:

1. Mở bằng Safari → Chia sẻ → **Thêm vào Màn hình chính**.
2. Giữ tên **Mihu’s Corner**, bật mở như ứng dụng nếu iOS hiển thị tùy chọn này.
3. Mở bằng biểu tượng mới rồi đăng nhập.
4. Nếu email mở sang Safari, sao chép liên kết chưa sử dụng rồi dán tại màn hình đăng nhập của ứng dụng trên màn hình chính.
5. Vào **Tài khoản → Cài đặt nhắc việc → Bật nhắc việc**, đồng ý quyền thông báo.

Máy tính vẫn dùng bằng trình duyệt, không yêu cầu cài đặt. Phiên đăng nhập dùng cookie HttpOnly và token tự làm mới. Xóa dữ liệu trình duyệt, đăng xuất, thu hồi phiên hoặc vô hiệu hóa tài khoản có thể yêu cầu đăng nhập lại.

Thông báo phụ thuộc mạng, quyền thông báo và chế độ Tập trung; không phải báo thức bảo đảm giờ tuyệt đối. Hai iPhone thực tế chưa được kiểm tra trong phiên phát triển này.

## 6. Dữ liệu được lưu ở đâu?

- Firebase Authentication: quản lý đăng nhập bằng liên kết email.
- D1 của máy chủ web: task, tiền, nhật ký, mục tiêu, cài đặt theo UID.
- R2 của máy chủ web: ảnh riêng. Không dùng Firebase Storage trong mã hiện tại.
- Trên máy phát triển: SQLite và thư mục ảnh trong `.sites-runtime/local-data`; chạy cùng API và kiểm tra quyền. Dữ liệu local không tự chuyển lên bản trên mạng.
- Không lưu mật khẩu hoặc nội dung cá nhân vào localStorage; service worker không cache phản hồi dữ liệu riêng.
- Tài khoản mới trống hoàn toàn. Các kiểm tra chạy với dữ liệu giả ở vùng thử riêng.

## Phần còn chờ

- Xác nhận bật Email link và Authorized domains; thử nhận email/đăng nhập thật.
- Hoàn tất xuất bản và quyền truy cập để cả hai người mở được site.
- Khóa FCM, bí mật máy chủ, lịch gửi nền và kiểm tra hai iPhone nếu muốn nhắc việc ngay.
