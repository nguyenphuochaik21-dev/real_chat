# Kết quả cập nhật Chatly — 13/09/2026

## Đã áp dụng trực tiếp trên Supabase

Dự án: `hhfbswakqgluklhvuvda`.

- Các migration `20260912010000`, `20260912020000`, `20260913010000` và `20260913020000` đã được áp dụng bằng kết nối PostgreSQL của dự án.
- Cuộc gọi hết thời gian chờ sau 45 giây. Máy chủ kiểm tra mỗi 5 giây, nên khi cả hai trình duyệt đóng, trạng thái được chốt trong khoảng 45–50 giây.
- Kết thúc cuộc gọi, ghi lịch sử và ghi tin nhắn là một giao dịch; khóa hàng và chỉ mục duy nhất ngăn lịch sử trùng.
- Đã khôi phục 19 cuộc gọi kết thúc nhưng thiếu lịch sử, đồng thời bổ sung mục cuộc gọi vào luồng tin nhắn cũ.
- Bổ sung chỉ mục phân trang `(conversation_id, created_at DESC, id DESC)`; danh bạ có RPC tổng hợp một lượt.
- Chặn ghi trực tiếp trạng thái/lịch sử cuộc gọi từ tài khoản trình duyệt; bảo vệ metadata cuộc gọi; giữ RLS và kiểm tra thành viên/người bị chặn.
- Thêm Realtime cho lịch sử cuộc gọi, dọn SDP/ICE của phiên đã kết thúc và giới hạn nhật ký cron cuộc gọi ở 7 ngày.
- Phiên đã trả lời nhưng bị bỏ lại có giới hạn dọn dẹp 12 giờ; đây không phải cơ chế khôi phục cuộc gọi đa thiết bị đầy đủ.
- Sửa lỗi xóa tài khoản/tin nhắn có sẵn: trigger không còn xóa trực tiếp `storage.objects` (Supabase chặn thao tác này). Thay bằng hàng đợi bảo trì, giữ nguyên bảo vệ Storage. Công cụ `npm run storage:cleanup` xử lý tối đa 50 tệp/lượt qua Storage API, kiểm tra tệp còn được tham chiếu và ID đối tượng trước khi xóa. Cần cấu hình service-role và lên lịch công cụ này để dọn tệp tự động; hiện chưa chạy vì thiếu khóa, hàng đợi kiểm tra đang rỗng.

## Đã sửa trong mã nguồn, chưa triển khai lên Vercel

- Danh bạ và mở chat trả về lỗi dự kiến có nội dung rõ ràng; không đưa chuỗi lỗi React production cho người dùng. Không có server log để khẳng định nguyên nhân duy nhất của lỗi 500 trong ảnh.
- Link Facebook không được gửi đến dịch vụ preview vốn chỉ hỗ trợ YouTube/Vimeo/GitHub. Preview tùy chọn thất bại không làm hỏng tin nhắn; giới hạn kích thước tải về và cache phía trình duyệt.
- Favicon ICO/PNG, Apple icon và icon PWA lấy từ logo SVG hiện có. Version URL mới và cập nhật service worker giúp làm mới logo.
- Bỏ tải trước phông Inter không sử dụng; giữ phông hệ thống của ứng dụng.
- Giao diện cuộc gọi nhỡ/từ chối/thất bại/hủy/hoàn tất và số giây trong tin nhắn. Thời lượng lưu máy chủ tính từ lúc chấp nhận; đồng hồ trên màn hình tính từ lúc WebRTC kết nối.
- Thông báo cuộc gọi qua service worker trên thiết bị hỗ trợ; click thông báo ưu tiên lấy lại cửa sổ hiện tại, không tải lại cuộc gọi đang chạy.
- Chặn push cuộc gọi trùng, giới hạn TTL theo thời gian đổ chuông; kiểm tra cấu hình push trước khi gửi.
- Xử lý nhận cuộc gọi trễ, cuộc gọi đồng thời, lỗi microphone/signaling, timeout kết nối; giải phóng media khi hủy và đối soát khi nối mạng lại.
- Phân trang tin nhắn bằng cặp thời gian/ID, loại trùng optimistic/realtime và giải phóng tham chiếu DOM. Không tạo lại subscription profile theo từng tin nhắn.

## Kiểm chứng

- `npm run lint`, `npm run typecheck`, `npm run build`.
- 26 kiểm thử Playwright: giao diện công khai, PWA, bảo mật header, trạng thái cuộc gọi, preview và hành vi service worker; chạy trên desktop và mobile Chromium với build production.
- Thêm 1 kiểm thử tích hợp đã qua trên build production với hai tài khoản Supabase tạm, hai phiên Chromium và media giả lập: đăng nhập, danh bạ, WebRTC thoại/video có luồng media, từ chối, tự hết thời gian chờ 45 giây và lịch sử có thời lượng. Các tài khoản và dữ liệu thử đã được xóa sau mỗi lượt; không có tệp Storage của người dùng bị xóa.
- `npm run test:db:calls`: 17 kiểm tra SQL, bao gồm RLS, giả mạo lịch sử, cuộc gọi bận, kết thúc lặp, trả lời trễ và cron trước/sau mốc 45 giây. Toàn bộ dữ liệu thử được rollback.
- Thử phân trang trên 10.000 tin nhắn tạm: dùng `Index Only Scan`; lần đo đầu khoảng 0,683 ms trong PostgreSQL, không bao gồm mạng hay render. Không phải thử tải nhiều người dùng đồng thời.
- Kiểm tra toàn vẹn: 0 phiên kết thúc thiếu lịch sử, 0 lịch sử thiếu tin nhắn, 0 cuộc gọi đổ chuông quá 50 giây. Supabase DB lint không phát hiện lỗi schema.

Script DB dùng `DIRECT_URL` trong `.env.local`, xác thực TLS với CA của Supabase. Có thể chỉ định CA tải từ dashboard bằng `DATABASE_CA_CERT_PATH`. Kiểm thử tích hợp hai tài khoản chỉ chạy khi đặt `E2E_DATABASE_CALLS=true`; không dùng tài khoản thật, không gửi email và xác minh ID/nhãn của fixture trước khi xóa. Thông thường nên chạy kiểm thử có ghi dữ liệu trên dự án thử nghiệm; lượt kiểm tra trực tiếp ở phiên này nằm trong phạm vi quyền thay đổi DB đã được cấp.

## Việc còn cần để đưa lên website thật

1. Triển khai mã mới lên dự án Vercel hiện tại. Phiên làm việc chưa có đăng nhập/token Vercel nên chưa deploy; thay đổi DB đã có hiệu lực độc lập.
2. Cấu hình `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` và `SUPABASE_SERVICE_ROLE_KEY` trên máy chủ rồi redeploy. Không đưa private key/service-role key vào biến `NEXT_PUBLIC_*` hoặc mã frontend. Các giá trị này hiện chưa có trong `.env.local`; endpoint production trước cập nhật trả 503 vì push chưa được cấu hình.
3. Kiểm tra `/api/push/config` có `configured: true`, cấp quyền thông báo trên từng thiết bị, kiểm tra bảng `push_subscriptions` có đăng ký.
4. iPhone/iPad cần mở ứng dụng đã thêm vào Màn hình chính và cấp quyền Web Push. Xem [hướng dẫn WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Hệ điều hành/trình duyệt có thể giới hạn âm thanh, rung hoặc thông báo nền; không tương đương cuộc gọi native CallKit.
5. Kiểm thử thật hai tài khoản trên hai thiết bị/mạng khác nhau: thoại/video, khóa màn hình, bỏ lỡ 45 giây, từ chối, ngắt mạng, TURN. Chưa có kiểm chứng âm thanh/video hay push trên điện thoại thật trong phiên này.
6. Với PWA đã cài trước đó, hệ điều hành có thể chậm cập nhật logo; nếu vẫn hiện logo cũ, gỡ shortcut/PWA rồi cài lại sau deploy.

Không cam kết “không bao giờ lag” ở quy mô Messenger: cần theo dõi CPU/IO, giới hạn Realtime, p95 truy vấn, dung lượng, backup và kiểm thử khôi phục. Danh sách hội thoại và toàn bộ quan hệ bạn bè vẫn được tổng hợp theo tài khoản; cần bổ sung phân trang máy chủ cho các danh sách này trước khi phục vụ tài khoản có hàng chục nghìn quan hệ/hội thoại. Chưa thay đổi gói dịch vụ, chính sách backup hoặc cấu hình hạ tầng trả phí.
