# Giữ cuộc trò chuyện khi chặn người dùng

- Đã đối chiếu lịch sử migration local/remote của Supabase `hhfbswakqgluklhvuvda`: các file trong ảnh, đến `20260913020000_storage_cleanup_queue.sql`, đã được áp dụng. Không cần chạy lại bằng SQL Editor.
- Bỏ lọc người bị chặn khỏi danh sách chat chính và lưu trữ, cả lúc tải dữ liệu, cập nhật realtime và cập nhật bộ nhớ cục bộ.
- Chặn không tự chuyển về `/chats`; người dùng vẫn đọc lịch sử và có nút bỏ chặn. Giữ nguyên cơ chế ngăn gửi tin/gọi và chính sách DB.
- Sửa đồng bộ cờ lưu trữ để chat chuyển đúng danh sách ngay sau thao tác, không chờ tải lại. Cập nhật lặp từ realtime không tạo bản sao.
- Thêm nhãn truy cập cho nút đóng menu cuộc trò chuyện.

## Kiểm chứng

- `npm run lint`, `npm run typecheck`, `npm run build`: đạt.
- `e2e/blocked-chat.spec.ts`: 2 kiểm thử đạt trên Chromium với build production. Kiểm tra store khi chặn, tải lại, cập nhật realtime, lưu trữ/bỏ lưu trữ; kiểm tra UI đăng nhập, chặn, chat vẫn còn sau reload, đọc lịch sử, khóa composer/nút gọi, lưu trữ, bỏ chặn và mở lại composer.
- Kiểm thử UI dùng hai tài khoản Supabase tạm; đã xóa tài khoản và hội thoại thử sau kiểm tra, không xóa dữ liệu người dùng thật.

Không có migration mới cho thay đổi này. Mã đã sửa và kiểm tra trong workspace; chưa triển khai bản sửa này lên website production.
