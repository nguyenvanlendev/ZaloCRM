// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * vietnamese-bigrams.ts — Bảng thống kê N-gram (Bigram) các cặp từ tiếp theo có xác suất cao nhất.
 * Tối ưu hóa đặc thù cho giao tiếp, chăm sóc khách hàng, tư vấn và bán hàng tiếng Việt.
 */

export const VIETNAMESE_BIGRAMS: Record<string, string[]> = {
  // ── Lời chào & mở đầu ───────────────────────────────────────────────────
  'xin': ['chào', 'phép', 'lỗi', 'cảm ơn', 'hỏi', 'gửi', 'chúc'],
  'chào': ['anh', 'chị', 'bạn', 'quý khách', 'em', 'mọi người', 'buổi sáng'],
  'dạ': ['em', 'vâng', 'chào', 'anh', 'chị', 'bên em', 'đúng rồi', 'được ạ'],
  'vâng': ['ạ', 'dạ', 'em', 'anh', 'chị', 'đúng rồi', 'em cảm ơn'],
  'kính': ['chào', 'gửi', 'mời'],

  // ── Đại từ xưng hô ───────────────────────────────────────────────────────
  'em': ['gửi', 'chào', 'xin', 'cảm ơn', 'hỗ trợ', 'tư vấn', 'đã', 'có thể', 'báo giá', 'hẹn', 'liên hệ', 'hiểu rồi ạ'],
  'anh': ['chị', 'ạ', 'nhé', 'có thể', 'cho em', 'xem qua', 'kiểm tra', 'thông cảm', 'cần hỗ trợ', 'đã nhận', 'vui lòng'],
  'chị': ['ạ', 'nhé', 'có thể', 'cho em', 'xem qua', 'kiểm tra', 'thông cảm', 'cần hỗ trợ', 'đã nhận', 'vui lòng'],
  'bạn': ['ạ', 'nhé', 'có thể', 'cho mình', 'xem qua', 'cần hỗ trợ', 'vui lòng'],
  'quý': ['khách', 'công ty', 'vị', 'khách hàng', 'đối tác'],
  'mình': ['gửi', 'xin', 'cảm ơn', 'có thể', 'hỗ trợ', 'trao đổi'],
  'bên': ['em', 'mình', 'công ty', 'anh', 'chị'],
  'chúng': ['tôi', 'em', 'mình'],

  // ── Động từ hành động CSKH ───────────────────────────────────────────────
  'gửi': ['anh', 'chị', 'báo giá', 'thông tin', 'file', 'lịch hẹn', 'hình ảnh', 'chi tiết', 'hợp đồng', 'tin nhắn'],
  'báo': ['giá', 'cáo', 'cho em', 'trước', 'lại'],
  'hỗ': ['trợ', 'tương'],
  'tư': ['vấn', 'cách', 'duy'],
  'liên': ['hệ', 'kết', 'quan', 'tục', 'hoan'],
  'kiểm': ['tra', 'soát', 'toán', 'định'],
  'xem': ['qua', 'lại', 'giúp em', 'chi tiết', 'thông tin'],
  'trao': ['đổi', 'giải', 'tay', 'nhận'],
  'xác': ['nhận', 'thực', 'định', 'suất'],
  'hoàn': ['thành', 'toàn', 'tất', 'tiền', 'hảo'],
  'thanh': ['toán', 'khoản', 'niên', 'lý'],
  'chốt': ['đơn', 'lịch', 'hợp đồng', 'phương án'],
  'đặt': ['lịch', 'hàng', 'cọc', 'chỗ', 'câu hỏi'],
  'hẹn': ['gặp', 'lại', 'anh', 'chị', 'giờ', 'lịch'],
  'chăm': ['sóc', 'chỉ', 'chú'],
  'kết': ['nối', 'bạn', 'quả', 'thúc', 'hợp'],
  'tra': ['cứu', 'đổi', 'khảo'],
  'nhận': ['được', 'thông tin', 'hàng', 'tiền', 'thông báo'],
  'giải': ['quyết', 'đáp', 'pháp', 'trình', 'thích'],
  'chia': ['sẻ', 'buồn', 'tay'],
  'phục': ['vụ', 'hồi', 'vụ chu đáo'],
  'thông': ['tin', 'báo', 'qua', 'minh', 'số', 'cảm'],
  'cập': ['nhật', 'bến'],
  'phản': ['hồi', 'ánh', 'quang', 'ứng'],
  'lắng': ['nghe', 'đọng'],

  // ── Danh từ & Thuật ngữ nghiệp vụ ────────────────────────────────────────
  'số': ['điện thoại', 'lượng', 'liệu', 'tiền', 'tài khoản', 'nhà'],
  'điện': ['thoại', 'tử', 'nước', 'lực'],
  'tin': ['nhắn', 'tức', 'tưởng', 'cậy'],
  'lịch': ['hẹn', 'trình', 'sử', 'sự', 'làm việc'],
  'khách': ['hàng', 'sạn', 'thể', 'quan'],
  'sản': ['phẩm', 'xuất', 'lượng'],
  'dịch': ['vụ', 'thuật', 'bệnh'],
  'hợp': ['đồng', 'tác', 'lý', 'nhất', 'thời'],
  'tài': ['khoản', 'chính', 'liệu', 'năng', 'sản'],
  'chi': ['tiết', 'phí', 'nhánh', 'tiêu'],
  'bảng': ['giá', 'tin', 'lương', 'điểm'],
  'hóa': ['đơn', 'học', 'chất'],
  'mức': ['giá', 'độ', 'phí', 'lương'],
  'ưu': ['đãi', 'tiên', 'điểm', 'thế'],
  'chương': ['trình', 'mục', 'đoạn'],
  'khuyến': ['mãi', 'nghị', 'khích'],
  'chính': ['sách', 'xác', 'trị', 'phủ', 'quyền'],
  'quy': ['định', 'trình', 'mô', 'chuẩn'],
  'yêu': ['cầu', 'thương', 'quý'],
  'nhu': ['cầu', 'yếu phẩm'],
  'nội': ['dung', 'bộ', 'thất'],
  'vấn': ['đề', 'nạn'],
  'thời': ['gian', 'khóa', 'điểm', 'tiết', 'hạn'],

  // ── Thời gian & Lịch hẹn ─────────────────────────────────────────────────
  'hôm': ['nay', 'qua', 'kia'],
  'ngày': ['mai', 'hôm nay', 'kia', 'tháng', 'nào', 'nghỉ'],
  'tuần': ['này', 'sau', 'tới', 'trước'],
  'tháng': ['này', 'sau', 'trước', 'tới'],
  'buổi': ['sáng', 'chiều', 'tối', 'trưa', 'hẹn'],
  'cuối': ['tuần', 'cùng', 'năm', 'tháng'],
  'bây': ['giờ'],
  'lúc': ['nào', 'mấy giờ', 'đó', 'này'],

  // ── Cảm xúc, Thái độ & Từ đệm ────────────────────────────────────────────
  'cảm': ['ơn', 'thấy', 'tạ', 'xúc', 'giác'],
  'chúc': ['anh', 'chị', 'ngày', 'buổi', 'cuối tuần', 'mừng', 'thành công', 'sức khỏe'],
  'vui': ['lòng', 'vẻ', 'mừng'],
  'mong': ['anh', 'chị', 'sớm', 'muốn', 'được'],
  'hy': ['vọng'],
  'rất': ['hân hạnh', 'vui', 'tốt', 'tiếc', 'mong'],
  'sẵn': ['sàng', 'có'],
  'nhiệt': ['tình', 'độ', 'huyết'],
  'chuẩn': ['bị', 'xác', 'mực'],
  'nhanh': ['chóng', 'nhất', 'chóng phản hồi'],
  'tiện': ['lợi', 'trao đổi', 'không'],
  'phiền': ['anh', 'chị'],
  'yên': ['tâm', 'tĩnh', 'lặng'],
  'hài': ['lòng', 'hước'],

  // ── Tính từ & Trạng từ thông dụng ────────────────────────────────────────
  'không': ['sao ạ', 'biết', 'có gì', 'thành vấn đề', 'cần', 'phải', 'được'],
  'được': ['không ạ', 'ạ', 'chưa ạ', 'hỗ trợ', 'phục vụ'],
  'có': ['thể', 'được', 'phải', 'không ạ', 'sẵn', 'gì'],
  'nhé': ['anh', 'chị', 'ạ', 'em cảm ơn'],
  'ạ': ['em', 'anh', 'chị', 'chúc', 'dạ'],
  'nhất': ['định', 'có thể', 'trí'],
  'thật': ['sự', 'tuyệt vời', 'sự cảm ơn'],
};
