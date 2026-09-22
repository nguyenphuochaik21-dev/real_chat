# Xóa hội thoại và vòng đời tệp

## Quy tắc

- Xóa chat riêng chỉ xóa lịch sử ở phía người thao tác. `cleared_at` được kiểm tra bằng RLS cho tin nhắn, tìm kiếm và thư viện; `hidden_at` ẩn cuộc chat khỏi danh sách của người đó. Mở lại không khôi phục lịch sử cũ; tin mới làm chat xuất hiện lại.
- Khi cả hai đã xóa một đoạn lịch sử, các hàng tin nhắn đó được xóa thật. Giữ bản ghi hội thoại/thành viên nhẹ để nhận tin mới, không làm mất dữ liệu người còn lại.
- Xóa một tin do mình gửi là xóa cho mọi người. Xóa nhóm toàn bộ vẫn chỉ dành cho chủ nhóm. Reply tới tin bị xóa được đặt null.
- Tệp chỉ bị xóa qua Storage API khi không còn tin nhắn, bản chuyển tiếp, tin hẹn giờ, hồ sơ hoặc ảnh nhóm tham chiếu. Không xóa trực tiếp `storage.objects`.
- Thay ảnh đại diện tạo công việc dọn ảnh cũ. Tải lên thất bại được dọn; tệp tải lên bỏ dở quá một ngày được rà soát khi chủ tệp quay lại ứng dụng.
- Tác vụ lỗi mạng giữ trong hàng đợi, thử lại ở lần thao tác/phiên tiếp theo. Mỗi lượt xử lý tối đa 500 tệp để không giữ yêu cầu quá lâu.
- Tải xuống trong chat/thư viện/lightbox dùng URL mới và Blob có tên tệp; có trạng thái chờ và thông báo lỗi. Thư viện đang mở cập nhật khi tệp được thêm/xóa.

## Supabase và triển khai

Đã áp dụng và ghi migration history:

- `20260922010000_private_deletion_storage.sql`
- `20260923010000_storage_retry_lifecycle.sql`

Đã xác minh lại migration giới hạn tên `20260920010000`. Migration xóa dữ liệu đã loại bỏ 11 tin nhắn trước đó đã được đánh dấu xóa; ứng dụng không thể khôi phục các tin đó. Tệp tương ứng được đưa vào hàng đợi khi không còn tham chiếu.

Mã ứng dụng vẫn cần được triển khai. Chưa thiết lập worker dọn Storage chạy độc lập khi không ai đăng nhập: môi trường hiện không có `SUPABASE_SERVICE_ROLE_KEY`. Script `npm run storage:cleanup` cần biến bí mật đó cùng `DIRECT_URL` và lịch chạy phía máy chủ. Không đưa service-role key vào biến `NEXT_PUBLIC_*`. Các thao tác xóa thông thường và thử lại khi đăng nhập dùng phiên của chính người dùng, không cần service-role key.

Không khẳng định đã quét/xóa toàn bộ tệp cũ của mọi tài khoản. Bản tải hoặc URL ký đã được CDN cache có thể tồn tại tới khi hết TTL, kể cả sau khi Storage API đã xóa object; điều này khác với dữ liệu gốc còn nằm trong bucket.

## Kiểm chứng

Kiểm thử dùng tài khoản và đường dẫn tệp tạm riêng, xóa sau mỗi lượt. Bao phủ quyền xóa, hai phía chat, lịch sử sau mở lại, bản chuyển tiếp, reply, ảnh đại diện cũ, nhóm, download trong trình duyệt và xóa object thật qua Storage API. Kết quả cuối được cập nhật sau lượt hồi quy.
