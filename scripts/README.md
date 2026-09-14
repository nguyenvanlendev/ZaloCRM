# 🛠️ Bộ Công Cụ Import Lịch Sử Tin Nhắn Zalo PC Vào ZaloCRM

Bộ công cụ này cung cấp giải pháp toàn diện để xuất lịch sử tin nhắn từ ứng dụng **Zalo PC**, trích xuất khóa giải mã và nạp (import) vào cơ sở dữ liệu của **ZaloCRM** một cách nhanh chóng, an toàn và bảo toàn 100% dữ liệu.

---

## 📂 Danh Sách Các Tệp Tin Trong Thư Mục

| Tên tệp | Đối tượng sử dụng | Mô tả chức năng |
|:---|:---|:---|
| **[LayKeyZalo.bat](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/scripts/LayKeyZalo.bat)** | Khách hàng / Sale (Windows) | File thực thi 1-click trên máy tính Windows. Tự động mở lại Zalo PC với cổng debug, trích xuất mã khóa giải mã `UIN`, và tự động copy vào Clipboard để gửi cho kỹ thuật. |
| **[LayKeyZalo.ps1](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/scripts/LayKeyZalo.ps1)** | Khách hàng / IT (Windows) | Bản script PowerShell thuần túy (dành cho quản trị viên muốn chạy trực tiếp bằng lệnh PowerShell). |
| **[LayKeyZalo.command](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/scripts/LayKeyZalo.command)** | Khách hàng / Kỹ thuật (macOS) | File shell script hỗ trợ mở Zalo PC với cổng debug trên hệ điều hành macOS. |
| **[import-zalo-pc-backup.ts](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/scripts/import-zalo-pc-backup.ts)** | Kỹ thuật viên / DevOps | Script chính thực hiện giải mã luồng file `.zl.zip`, chuẩn hóa dữ liệu media/văn bản, và batch-insert vào cơ sở dữ liệu PostgreSQL. |

---

## 🚀 Quy Trình Vận Hành (2 Kịch Bản)

### Kịch Bản 1: Khách Hàng Gửi File Backup + Key -> Kỹ Thuật Nạp Trên Server (Phổ Biến Nhất)

Đây là quy trình khi khách hàng/nhân sự sử dụng máy tính cá nhân ở xa, còn ZaloCRM chạy trên máy chủ Production.

```
[Máy Khách Hàng]                                               [Máy Chủ Server CRM]
 1. Xuất file .zl.zip từ Zalo PC ------> Upload Google Drive ---> Tải file về Server
 2. Chạy LayKeyZalo.bat lấy UIN -------> Gửi mã UIN qua chat ----> Chạy lệnh Import
```

#### Bước 1: Khách hàng xuất file và lấy mã UIN
- Gửi file [LayKeyZalo.bat](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/scripts/LayKeyZalo.bat) kèm hướng dẫn [HUONG-DAN-DANH-CHO-KHACH-HANG-EXPORT-ZALO.md](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/docs/HUONG-DAN-DANH-CHO-KHACH-HANG-EXPORT-ZALO.md) cho khách hàng.
- Khách hàng xuất file `.zl.zip` từ Zalo PC -> Upload lên Google Drive.
- Khách hàng click đúp chuột vào `LayKeyZalo.bat` -> Bấm `Ctrl + V` gửi mã khóa `UIN` cho kỹ thuật.
- *(Dặn khách KHÔNG bấm đăng xuất Zalo PC)*.

#### Bước 2: Kỹ thuật nạp dữ liệu trên Server
Tải file backup về máy chủ (ví dụ: `/var/backups/backup_zalo.zl.zip`), chạy lệnh:

```bash
DATABASE_URL="postgresql://<USER>:<PASS>@<HOST>:5432/<DB_NAME>" \
API_BASE_URL="https://crm.yourdomain.com" \
npx tsx scripts/import-zalo-pc-backup.ts /var/backups/backup_zalo.zl.zip \
  --uin <MÃ_UIN_NHẬN_TỪ_KHÁCH> \
  --account <ACCOUNT_ID_TRONG_CRM> \
  --all
```

---

### Kịch Bản 2: Kỹ Thuật Tự Chạy Trên Máy Cá Nhân Trỏ Về Database

Dành cho trường hợp kỹ thuật đang trực tiếp ngồi trên máy tính có Zalo PC đăng nhập tài khoản:

1. Đóng Zalo, mở lại với cờ debug:
   - **Windows:** Chạy file `LayKeyZalo.bat`
   - **macOS:** `/Applications/Zalo.app/Contents/MacOS/Zalo --remote-debugging-port=9222 &`
2. Chạy lệnh import trỏ thẳng vào database (qua SSH Tunnel hoặc cổng DB):
   ```bash
   DATABASE_URL="postgresql://crmuser:pass@localhost:5433/zalocrm" \
   API_BASE_URL="http://localhost:3081" \
   npx tsx scripts/import-zalo-pc-backup.ts /duong-dan/file_backup.zl.zip --all
   ```
   *(Script sẽ tự động quét session từ Zalo PC qua cổng 9222 mà không cần gõ `--uin`)*.

---

## ⚙️ Các Tham Số Dòng Lệnh Của `import-zalo-pc-backup.ts`

| Tham số | Ý nghĩa | Mặc định |
|:---|:---|:---:|
| `/duong-dan/file.zl.zip` | Đường dẫn file backup cần nạp (bắt buộc). | Không |
| `--uin <key>` | Khóa giải mã UIN (chuỗi 32 ký tự hex). Tự động lấy nếu có cổng 9222. | Không |
| `--account <id>` | ID của tài khoản Zalo trong CRM. Tự động lấy nếu khớp UID. | Không |
| `--all` | Nạp toàn bộ tin nhắn trong file backup không giới hạn số lượng. | Bật nếu có cờ |
| `--max <số_lượng>` | Chỉ nạp thử nghiệm N tin nhắn đầu tiên (ví dụ: `--max 500`). | Vô hạn |
| `--clean` | **Xóa sạch toàn bộ** hội thoại và tin nhắn cũ của tài khoản trước khi nạp lại. | **`false` (Tắt)** |
| `--dry-run` | Chạy thử nghiệm giải mã, đọc dữ liệu, kiểm tra danh bạ nhưng **không ghi vào DB**. | `false` |

> ⚠️ **Lưu ý an toàn:** Cờ `--clean` mặc định tắt để đảm bảo an toàn cho Production. Chỉ truyền cờ này khi bạn chủ động muốn xóa dữ liệu cũ để nạp lại từ đầu.

---

## 🛡️ Đánh Giá Quota SDK Zalo

* **Gửi tin nhắn (`message`):** Tiêu hao **0**. (Dữ liệu giải mã nội bộ và ghi trực tiếp vào PostgreSQL).
* **Xem profile (`profile`):** Tiêu hao **0**. (Đọc từ bộ nhớ Zalo PC qua Chrome DevTools).
* **Kết bạn (`friend_action`):** Tiêu hao **0**.
* **Đọc nhóm (`group_read`):** Tiêu hao **~2 - 3 request** trên tổng hạn ngạch 1.000 request/ngày (chỉ gọi đúng 1 lần khi bắt đầu để lấy tên nhóm).

---

## 📖 Tài Liệu Tham Khảo Thêm
* [Hướng dẫn chi tiết dành cho Khách hàng](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/docs/HUONG-DAN-DANH-CHO-KHACH-HANG-EXPORT-ZALO.md)
* [Hướng dẫn kỹ thuật nạp lịch sử Zalo PC](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/docs/HUONG-DAN-IMPORT-LICH-SU-ZALO-PC.md)
