# [Tên Tài Liệu / Quy Trình]
**Phiên bản:** 1.0
**Ngày cập nhật:** DD/MM/YYYY
**Người viết:** [Tên/Phòng ban]
**Mô tả ngắn:** [1-2 câu tóm tắt nội dung tài liệu để Vector DB dễ dàng nhận diện ngữ cảnh tổng quát]

---

## 1. Định nghĩa Thực thể (Entities & Roles)
> **Mẹo cho GraphRAG:** Khai báo rõ các danh từ riêng, tên người, vai trò, hoặc tên sản phẩm để LLM dễ dàng tạo các "Node" (Điểm nút) trong Neo4j.

- **[Tên Hệ thống/Sản phẩm]**: [Mô tả ngắn gọn chức năng]
- **[Vai trò A - ví dụ: Khách hàng / Quản lý]**: [Trách nhiệm hoặc hành động liên quan]
- **[Thuật ngữ chuyên ngành]**: [Giải thích ý nghĩa]

---

## 2. Quy trình & Luồng nghiệp vụ (Processes & Relationships)
> **Mẹo cho GraphRAG:** Sử dụng các động từ mạnh chỉ sự liên kết (gửi, duyệt, phụ thuộc vào, bao gồm) để tạo các "Edge" (Đường nối) trong Graph DB.

**Ví dụ Luồng Đăng ký:**
1. **Khách hàng** `gửi` **Yêu cầu hỗ trợ** qua Zalo.
2. **Hệ thống ZaloCRM** `tiếp nhận` và `phân công` cho **Nhân viên CSKH**.
3. Nếu là lỗi kỹ thuật, **Nhân viên CSKH** `chuyển tiếp` đến **Bộ phận IT**.

---

## 3. Câu hỏi thường gặp (Q&A / FAQ)
> **Mẹo cho Vector RAG:** Đặt câu hỏi bằng ngôn ngữ tự nhiên giống như cách khách hàng hay hỏi. Vector DB (Qdrant) sẽ so sánh Semantic Search (ngữ nghĩa) rất chính xác với các câu hỏi này.

**Q: Làm sao để cài đặt hệ thống ABC?**
**A:** Để cài đặt hệ thống ABC, bạn cần làm theo 3 bước sau: [Mô tả chi tiết các bước]. Hệ thống ABC `yêu cầu` máy chủ phải cài đặt Docker.

**Q: Chi phí triển khai gói Premium là bao nhiêu?**
**A:** Gói Premium có chi phí là [Số tiền]. Gói này `bao gồm` các tính năng [Liệt kê tính năng].

---

## 4. Xử lý ngoại lệ / Cảnh báo (Exceptions & Warnings)
> **Mẹo chung:** Giúp AI biết cách từ chối hoặc xử lý các trường hợp ngoài lề mà không bị ảo giác (hallucination).

- **Nếu khách hàng hỏi về [Vấn đề X]:** Hãy phản hồi rằng hệ thống hiện chưa hỗ trợ và hứa sẽ ghi nhận lại.
- **Lưu ý bảo mật:** Tuyệt đối không cung cấp mật khẩu server hoặc Database ID cho khách hàng dưới mọi hình thức.
