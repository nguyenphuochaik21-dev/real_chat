# Báo cáo rà soát bảo mật, hiệu năng và kiểm thử Chatly

Ngày rà soát: 02/09/2026

## Kết luận

Ứng dụng đã được gia cố để có thể triển khai production ở quy mô nhỏ và vừa. Luồng tải tin nhắn
không còn lấy toàn bộ lịch sử nên một cuộc trò chuyện có hàng trăm nghìn tin sẽ không làm trình
duyệt render toàn bộ dữ liệu. Các thay đổi phụ thuộc cơ sở dữ liệu chỉ có hiệu lực sau khi chạy hai
migration mới.

## Bảo mật đã xử lý

- Kiểm tra đăng nhập và validate UUID/nội dung/giới hạn độ dài tại server action.
- Ràng buộc RLS và trigger để không thể giả mạo người gửi, sửa khóa ngoại của tin nhắn, khôi phục
  tin đã xóa, trả lời tin thuộc cuộc trò chuyện khác hoặc tự nâng quyền quản trị.
- RPC tạo chat trực tiếp được khóa đồng thời, chỉ cho bạn bè và ngăn tạo trùng cuộc trò chuyện.
- Số điện thoại mặc định là dữ liệu riêng tư; hồ sơ công khai chỉ trả về trường được người dùng cho
  phép.
- File chat chỉ được đọc bởi thành viên và chỉ được tải lên thư mục của chính người dùng trong cuộc
  trò chuyện hợp lệ.
- CSP, chống iframe, MIME sniffing, rò referrer và header nhận diện Next.js đã được gia cố.
- Chặn open redirect ở callback đăng nhập; GitHub OAuth bị từ chối ngay cả khi provider chưa được
  tắt trong Supabase Dashboard.
- Link mạng xã hội chỉ chấp nhận HTTP/HTTPS. Endpoint Web Push có allowlist để tránh SSRF.
- Khóa service-role và VAPID private chỉ được dùng trong route server, không đưa vào bundle client.

## Hiệu năng và khả năng mở rộng

| Tình huống                       | Trạng thái sau tối ưu                                                         | Lưu ý                                                              |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cuộc trò chuyện có rất nhiều tin | Chỉ tải 50 tin mới nhất, có nút tải trang cũ                                  | Chi phí render ban đầu gần như cố định                             |
| Nhiều sự kiện realtime           | Cache tin nhắn/trạng thái có giới hạn; query reaction được gom theo lô        | Không giữ toàn bộ lịch sử trong RAM                                |
| Danh sách chat                   | Dùng một RPC summary thay cho N+1 query                                       | Có index theo conversation và thời gian                            |
| Tìm kiếm                         | Chống kết quả cũ ghi đè kết quả mới; fallback `ILIKE` khi FTS không khớp      | UI mobile dùng chiều cao động và vùng cuộn riêng                   |
| Nhiều ảnh                        | Tối đa 12 file/lần, ảnh cùng lượt hiển thị lưới 3 cột                         | Chỉ phát một push cho cả lượt tải                                  |
| Nhóm chat                        | Tối đa 100 thành viên; avatar lấy ổn định tối đa 4 người bằng một RPC theo lô | Không tạo N+1 query cho avatar                                     |
| Push nhiều thiết bị              | Mỗi endpoint là một subscription; endpoint hết hạn được dọn tự động           | Web Push là best-effort, không thay thế hàng đợi đảm bảo giao nhận |

Hai giới hạn cần theo dõi khi quy mô rất lớn:

1. RPC danh sách chat hiện trả toàn bộ cuộc trò chuyện của một user. Nếu một tài khoản có hàng nghìn
   cuộc trò chuyện, nên bổ sung cursor pagination cho danh sách này.
2. Số chưa đọc được tính từ index theo thời gian. Nếu một user có hàng triệu tin chưa đọc, nên chuyển
   sang bảng counter được cập nhật transactionally.

Đây không phải điểm nghẽn đối với mức sử dụng thông thường, nhưng cần đo lại bằng dữ liệu production
trước khi tăng lên quy mô rất lớn.

## Kiểm thử đã chạy

- `npm run typecheck`: đạt.
- `npm run lint`: đạt, không có warning.
- `npm run build`: production build thành công với Next.js 16.3.2.
- Playwright desktop và Pixel 7: 10/10 bài test đạt, gồm responsive login, accessibility nghiêm
  trọng, PWA manifest/icon, offline page, security headers và redirect route được bảo vệ.
- `npm audit` và `npm audit --omit=dev`: 0 lỗ hổng dependency đã biết.

Chưa chạy load test lên Supabase production và chưa chạy E2E có đăng nhập vì việc đó cần tài khoản
test/dữ liệu riêng và có thể làm thay đổi dữ liệu thật.

## Dọn dẹp

Đã bỏ trang/hook tin nhắn đánh dấu, notification provider và push hook cũ, processor lịch gửi ở
client, mock data, auth/presence action không sử dụng, info panel cũ và các hook message/reaction bị
trùng. Các mục cài đặt màu nhấn và hình nền không có chức năng thật cũng đã bị loại bỏ. Schema bảng
`starred_messages` cũ chưa bị DROP để tránh tự động xóa dữ liệu khi deploy.

## Việc bắt buộc khi triển khai

1. Chạy `npx supabase db push` trên đúng project để áp dụng migration bảo mật và tính năng hồ sơ.
2. Tạo VAPID bằng `npx web-push generate-vapid-keys`, sau đó cấu hình các biến trong
   `chatly/.env.example` tại môi trường deploy.
3. Tắt GitHub provider trong Supabase Dashboard. Ứng dụng đã chặn provider này ở code nhưng tắt tại
   nguồn vẫn là cấu hình sạch nhất.
4. Xác nhận `pg_cron` đang bật để tin nhắn hẹn giờ được xử lý.
5. Kiểm tra push trên HTTPS bằng app đã cài; đăng xuất sẽ xóa subscription của thiết bị để tránh rò
   thông báo sang người đăng nhập tiếp theo.
