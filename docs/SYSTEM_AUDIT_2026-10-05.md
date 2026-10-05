# Rà soát và tối ưu Chatly — 05/10/2026

Phạm vi: mã nguồn Next.js trong `chatly/`, giao diện desktop/mobile, kiểm thử trình duyệt,
server actions/API, phân quyền Supabase, index, lịch sử migration và công cụ bảo trì.
Các thay đổi có sẵn trong working tree được giữ lại; không tính chúng là kết quả của đợt audit này.

## Các thay đổi đã thực hiện

| Vấn đề                                                          | Cách xử lý                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Dependency Next.js 16.3.4 có advisory critical                  | Nâng Next.js, `@next/env`, `eslint-config-next` lên 16.3.8 và cập nhật lockfile.                              |
| Tìm kiếm chỉ hiển thị 20 tin đầu                                | Lấy thêm một bản ghi để xác định còn trang sau; bổ sung nút tải thêm trong danh sách chat và hộp tìm kiếm.    |
| Phân trang trùng/mất kết quả khi timestamp giống nhau           | Sắp xếp thêm theo ID trong SQL và fallback; kiểm tra đủ 45 tin, không trùng qua ba trang.                     |
| Bộ lọc ngày bỏ sót tin trong ngày kết thúc                      | Chuyển ngày theo múi giờ trình duyệt thành đầu ngày/cuối ngày trước khi gửi truy vấn.                         |
| Tìm kiếm `%`, `_`, `\` thành wildcard                           | Escape ký tự đặc biệt trong tìm kiếm hồ sơ và đường tìm kiếm dự phòng.                                        |
| Lỗi SQL bị hiểu nhầm là thiếu RPC                               | Chỉ dùng fallback khi nhận mã `PGRST202`; kiểm tra số nguyên và giới hạn offset/limit.                        |
| Trang quản trị hiển thị 0/0 khi trang tiếp theo vừa hết dữ liệu | Tải lại trang đầu và tổng số mới, vẫn loại phản hồi của request đã cũ.                                        |
| Trang AI/join thiếu kiểm tra suspension ở proxy                 | Bổ sung vào nhóm đường dẫn được kiểm tra trước khi render.                                                    |
| Bộ lọc tìm kiếm bị chật trên điện thoại                         | Cho phép xuống dòng, thêm nhãn input, hỗ trợ Escape, giới hạn focus trong dialog và khôi phục focus khi đóng. |
| Avatar chữ trắng thiếu tương phản                               | Đổi các nền màu sáng sang sắc đậm hơn, giữ hệ màu và cách sinh avatar theo tên.                               |
| Thời gian trong kết quả tìm kiếm thiếu tương phản khi hover     | Đổi sang màu chữ secondary; kiểm tra lại bằng axe trên desktop/mobile.                                        |
| Nút quay lại và trường hồ sơ thiếu nhãn                         | Bổ sung tên truy cập; thay cấu trúc button lồng trong link bằng link dùng chung kiểu nút.                     |
| Nút kết bạn mất tên trên mobile                                 | Dùng nội dung dành cho trình đọc màn hình khi nhãn trực quan bị ẩn.                                           |
| Hộp xác nhận chặn tải thêm danh sách không cần thiết            | Chỉ truy vấn danh sách khi mở màn quản lý người bị chặn; bổ sung tên dialog/nút đóng.                         |
| Kết nối PostgreSQL lặp ở nhiều script                           | Gom logic vào `scripts/lib/database.mjs`, tái sử dụng ở 5 script; thống nhất TLS, timeout và CA tùy chọn.     |
| Audit file nhận nhầm `global-error.tsx` là thừa                 | Nhận diện thêm các entry point của Next.js; không xóa trang xử lý lỗi.                                        |
| Format quét file build và kết quả test                          | Thêm các thư mục sinh tự động và CSS sinh tự động vào `.prettierignore`.                                      |
| Test phụ thuộc cấu hình agent thật hoặc tên fixture trùng nhau  | Dùng agent tạm riêng và định danh tài khoản cụ thể; giữ cấu hình AI thật.                                     |

Advisory: [GHSA-vcvr-r3jv-pc5j của Vercel](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).
Advisory có điều kiện khai thác liên quan dữ liệu do bên ngoài kiểm soát trong SVG của
Node.js ImageResponse; audit dependency không đồng nghĩa ứng dụng đã bị khai thác.

## Database đã thay đổi

Đã chạy dry-run rồi áp dụng và ghi nhận migration
`20261004010000_search_pagination_and_index_cleanup.sql` trên Supabase đang cấu hình.
Migration giữ `search_messages` là SECURITY INVOKER, kiểm tra đúng `auth.uid()`, giữ RLS
và quyền gọi cho authenticated.

Đã xóa 6 index đơn không unique, được phần đầu của index btree đầy đủ khác bao phủ:

| Index đã xóa                         | Index giữ lại                             |
| ------------------------------------ | ----------------------------------------- |
| `idx_conversation_label_map_conv`    | `conversation_label_map_pkey`             |
| `idx_participants_user`              | `idx_participants_conv_user`              |
| `idx_reactions_message`              | `message_reactions_one_per_user`          |
| `idx_starred_message`                | `starred_messages_message_id_user_id_key` |
| `idx_typing_indicators_conversation` | `typing_indicators_pkey`                  |
| `idx_blocks_blocker`                 | `user_blocks_blocker_id_blocked_id_key`   |

Không xóa bảng nghiệp vụ, lịch sử tin nhắn hay migration cũ. `chat_assistant_config` vẫn có
đường đọc trong mã server nên không được coi là bảng thừa. Các fixture kiểm thử được rollback
hoặc dọn theo ID/metadata sở hữu. Đã xác minh và dọn riêng 16 tài khoản tạm và một agent tạm
còn lại từ các lượt audit bị gián đoạn/timeout. Bổ sung `finally` để vẫn dọn fixture khi đóng
browser context gặp lỗi. Kiểm tra cuối: còn 0 tài khoản mang metadata fixture `chatly_e2e_run`,
0 agent mang tên fixture `E2E agent …`; cả 6 index dư đều đã được xóa.

## Kiểm chứng

**104 ca đạt, 11 ca bỏ qua**, tính theo kết quả mới nhất của từng ca trong lượt chạy toàn bộ
và các lượt chạy lại có mục tiêu. Đây không phải một lượt chạy toàn bộ xanh duy nhất:
lượt đầy đủ có 98 ca đạt, 6 ca thất bại, 11 ca bỏ qua; cả 6 ca thất bại đã được sửa lỗi
ứng dụng/fixture/locator tương ứng và xác nhận lại đạt. Các lần chạy trung gian được giữ trong
[bảng kết quả chi tiết](audit-2026-10-05/test-summary.json).

Các luồng đã xác nhận gồm đăng nhập/phân quyền, quản trị/phân trang, kết bạn/thông báo realtime,
chặn/bỏ chặn và lịch sử chat, gọi thoại/video/từ chối/cuộc gọi nhỡ, chọn agent và giữ agent mặc
định độc lập, tìm kiếm 45 tin qua ba trang, lọc ngày và chặn tài khoản suspended trên AI/join.
Mười trang đăng nhập được quét trên desktop/mobile: không phát hiện tràn ngang hoặc lỗi axe
mức serious/critical trong trạng thái đã kiểm tra. Phản hồi AI ở bài kiểm tra chọn agent được
mock; kết quả này không xác nhận chất lượng trả lời của model/n8n thật.

11 ca bỏ qua: 2 ca hủy webhook chỉ chạy development; 6 ca cần bật tích hợp AI/n8n thật;
1 ca tạo/quản lý nhóm cần cấu hình riêng; 2 biến thể mobile của bài chặn chat/cuộc gọi vốn chỉ
thiết kế cho desktop. Chức năng nhóm vẫn có kiểm tra database và bài giao diện tùy chọn nhóm.

Ảnh kiểm chứng bằng dữ liệu giả: [desktop](audit-2026-10-05/search-desktop.png),
[mobile](audit-2026-10-05/search-mobile.png).

Các kiểm tra đã đạt trong quá trình thực hiện:

- ESLint, TypeScript, production build Next.js 16.3.8 và audit file không dùng.
- 23 kiểm tra release database: phân quyền, nhóm, quyền riêng tư hồ sơ, suspension, tìm kiếm/phân trang.
- 17 kiểm tra database gọi điện/danh bạ/RLS; probe 10.000 tin dùng Index Only Scan.
- Kiểm tra AI database: ownership, server-only writes, idempotency, serialization, rate limit và suspension.
- Fixture PostgreSQL riêng cho assistant: 11 assertions và 20 thao tác trái quyền bị từ chối.
- Audit database: tất cả bảng public có RLS; không có SECURITY DEFINER cho phép anon gọi;
  không có index trùng hoàn toàn hay object đang chờ storage cleanup tại thời điểm kiểm tra.
- `npm audit --omit=dev`: 0 lỗ hổng được báo cáo sau nâng cấp.

## Những điểm còn giới hạn

- Môi trường local thiếu `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`:
  chưa thể xác nhận push nền hoạt động thực tế. TURN đã có cấu hình; cuộc gọi qua các mạng/NAT
  khác nhau cần kiểm chứng bằng thiết bị thật.
- `npm audit` đầy đủ còn báo 5 mục high từ chuỗi dev dependency ESLint → fast-glob →
  micromatch → braces. Tại thời điểm tra registry, braces mới nhất là 3.0.3 và chưa có bản vá
  phù hợp. Không dùng `audit fix --force` để hạ ESLint Next xuống major không tương thích.
- Remote migration history thiếu `20260929010000` và `20260929020000`, dù các đối tượng
  assistant tương ứng đang tồn tại. Chưa tự đánh dấu đã áp dụng hoặc chạy lại migration tạo bảng,
  vì cần đối chiếu lịch sử triển khai gốc.
- Kiểm thử local không chứng minh mọi tích hợp ngoài hoặc website đã deploy đều hoạt động.
  Đợt này không triển khai website lên hosting.
- Một số lượt chuyển trang/đóng browser còn ghi log Next.js `The destination stream closed early`.
  Các ca liên quan đã đạt khi chạy lại; chưa quy kết hay tuyên bố đã xử lý triệt để log này.
- Khóa bí mật gửi qua chat không được thêm vào mã nguồn/báo cáo. Nên thay khóa đó trong
  Supabase và cập nhật môi trường sử dụng khóa sau khi hoàn tất rà soát.

Lệnh xóa bốn thư mục cache sinh tự động (`.next-build`, `.next-dev-3000`, `.next-dev`,
`.next-playwright`, khoảng 987 MB tại lúc đo) bị bộ kiểm duyệt tự động chặn với thông báo
`blocked by policy`, không cung cấp lý do chi tiết. Các thư mục được giữ nguyên. Audit import
không còn báo file source không được tham chiếu; không gộp các module nghiệp vụ đang được sử dụng
chỉ để giảm số lượng file.
