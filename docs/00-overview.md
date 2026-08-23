# 00 - Tổng quan sản phẩm

## Mục tiêu sản phẩm
Xây dựng một ứng dụng nhắn tin realtime hiện đại với giao diện tối giản, hỗ trợ chat 1-1, danh bạ, cuộc gọi, trạng thái, và cài đặt — lấy cảm hứng từ template Chatly.

## Tham khảo giao diện
- **Template gốc**: https://html.designstream.co.in/chatly/
- **Tên thương hiệu**: Chatly
- **Màu chủ đạo**: Indigo `#6366f1` / Purple gradient
- **Theme**: Light + Dark (system-aware, user toggle)

## User Personas

### Primary: Người dùng phổ thông
- Đăng ký bằng email hoặc OAuth (Google/GitHub)
- Chat 1-1 với bạn bè, đồng nghiệp
- Cần realtime, thông báo tin nhắn mới
- Cần tìm kiếm cuộc trò chuyện
- Quản lý danh sách yêu thích, ghim chat

### Secondary: Người dùng doanh nghiệp nhỏ
- Cần chia sẻ file, hình ảnh
- Quản lý nhóm (Phase 2)
- Cần gọi thoại/video (Phase 3)

## Mục tiêu MVP (Phase 1)
1. ✅ Giao diện đầy đủ giống template (tất cả sidebar, panels, settings screens)
2. ✅ Mock data cho mọi view (conversations, contacts, calls, status, settings)
3. ✅ Dark/Light mode hoạt động
4. ✅ Responsive (desktop ưu tiên, mobile sau)
5. ✅ Điều hướng giữa các tab sidebar mượt mà

## Phi chức năng (Non-functional)
- **Performance**: First contentful paint < 1.5s
- **Accessibility**: WCAG AA, keyboard navigation
- **Type safety**: TypeScript strict, zero `any`
- **SEO**: Không ưu tiên (app private)

## Out of scope (Phase 1)
- ❌ Backend thực sự (dùng mock data)
- ❌ Authentication thực (mock current user)
- ❌ Realtime messaging (chỉ UI)
- ❌ Gửi file/ảnh
- ❌ Voice/Video call
- ❌ Status/Story
- ❌ Group chat
