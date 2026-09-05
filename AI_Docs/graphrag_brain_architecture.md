# Kiến trúc GraphRAG: Xây dựng "Đầu não AI" (AI Brain) cho ZaloCRM

Thay vì chỉ dùng GraphRAG như một công cụ truy xuất văn bản để "Gợi ý trả lời" (Q&A), chúng ta có thể biến Neo4j thành một **Kho Tri Thức Trung Tâm (Central Knowledge Graph)**. Toàn bộ các module AI trong hệ thống sẽ kết nối vào "bộ não" này để ra quyết định.

---

## 1. Sơ đồ Kiến trúc AI Brain Trung Tâm

```mermaid
graph TD
    %% Nguồn dữ liệu
    subgraph Data Sources [Các nguồn Dữ liệu]
        A1(Tài liệu PDF/Word)
        A2(Lịch sử Chat Zalo)
        A3(Thông tin Khách hàng - CRM)
        A4(Cấu hình Automation)
    end

    %% Ingestion Pipeline
    subgraph AI Ingestion [Đường ống Xử lý AI]
        B1[Vectorization - Qdrant]
        B2[Entity Extraction - LLM]
        B3[Relationship Mapping]
    end

    %% Bộ não Trung tâm
    subgraph AI Brain [GraphRAG - Neo4j Brain]
        C1((Người dùng))
        C2((Tài liệu))
        C3((Sản phẩm))
        C4((Luồng công việc))
        
        C1 -->|MUA| C3
        C1 -->|HỎI VỀ| C2
        C2 -->|HƯỚNG DẪN| C4
    end

    %% Ứng dụng AI
    subgraph AI Features [Các tính năng AI tiêu thụ Brain]
        F1[AI Chatbot Tự động]
        F2[Automation Routing Thông minh]
        F3[Phân tích Customer 360]
        F4[Gợi ý Upsell/Cross-sell]
    end

    Data Sources --> AI Ingestion
    AI Ingestion --> B1
    AI Ingestion --> B2
    B2 --> B3
    B3 --> AI Brain
    
    AI Brain <--> AI Features
```

---

## 2. Các Tính năng AI tiềm năng (AI Features)

Khi Neo4j nắm giữ toàn bộ "Mối quan hệ", bạn có thể triển khai các tính năng sau:

### 2.1. Automation Routing Thông minh (Intelligent Routing)
Thay vì dùng quy tắc IF/ELSE cứng nhắc trong module Automation, AI sẽ truy vấn Graph:
* **Ngữ cảnh:** Khách hàng A phàn nàn về "Lỗi kết nối máy chủ".
* **AI Brain xử lý:** GraphRAG tìm Node `(Lỗi kết nối máy chủ)` -> thấy liên kết `[THUỘC VỀ]` Node `(Phòng IT)` -> thấy liên kết `[TRƯỞNG PHÒNG]` là `(Anh Huy)`.
* **Hành động:** AI tự động chuyển (route) ticket này thẳng cho Anh Huy mà không cần bạn phải cấu hình luồng tĩnh.

### 2.2. Phân tích Khách hàng 360 (Customer 360 & Root Cause Analysis)
* Neo4j có thể liên kết mọi điểm chạm (touchpoints). 
* Ví dụ: Node `(Khách hàng X)` -> `[CHAT VỚI]` -> `(Nhân viên Y)` -> `[VỀ VẤN ĐỀ]` -> `(Sản phẩm Z)`.
* **Tính năng:** Khi mở hồ sơ khách hàng, AI tổng hợp ngay một báo cáo: *"Khách hàng này đã gặp lỗi Sản phẩm Z 3 lần trong tháng qua, nguy cơ rời bỏ (churn rate) cao. Hãy tặng voucher!"*.

### 2.3. Trợ lý Agentic AI (AI tự hành)
* Chuyển từ "Gợi ý" sang "Hành động".
* AI Brain lưu trữ các Node dạng `(API Endpoint)` hoặc `(Chức năng hệ thống)`.
* Khi khách nhắn *"Hủy lịch hẹn ngày mai giúp em"*, LLM truy vấn GraphRAG, tìm ra Node `(Chức năng Hủy Lịch)` kèm theo tham số cần thiết, và **tự động gọi API** để hủy lịch thay vì chỉ mớm lời cho nhân viên.

### 2.4. Phát hiện Điểm mù trong Kiến thức (Knowledge Gap Detection)
* AI tự động chạy báo cáo định kỳ trên GraphRAG để tìm các Node "Câu hỏi của khách hàng" mà không liên kết tới bất kỳ Node "Tài liệu / Giải pháp" nào.
* **Tính năng:** Báo cáo cho Admin biết: *"Tuần qua có 50 khách hỏi về chính sách hoàn tiền, nhưng hệ thống chưa có tài liệu nào nói về vấn đề này. Hãy bổ sung ngay!"*

---

## 3. Cấu trúc Graph Data Model đề xuất (Ontology)

Để làm được những điều trên, bạn không nên chỉ nạp file PDF (Unstructured Data) một cách mù quáng, mà cần kết hợp bơm cả Dữ liệu có cấu trúc (Structured Data) từ Database (PostgreSQL) vào Neo4j:

- **Label `Customer`:** Tên, SĐT, Phân hạng.
- **Label `Employee`:** Tên, Chuyên môn, Trạng thái online.
- **Label `DocumentChunk`:** Đoạn trích xuất từ PDF.
- **Label `Product/Service`:** Gói phần mềm, tính năng.
- **Label `Ticket/Conversation`:** Cuộc hội thoại Zalo.

**Ví dụ một Graph Path hoàn chỉnh:**
`(Customer: "Phan Công Chính")` -[:ASKED_IN]-> `(Conversation: "Chat 123")` -[:ABOUT]-> `(Concept: "Quy trình CI/CD")` <-[:EXPLAINED_IN]- `(DocumentChunk: "Doc_456")`
