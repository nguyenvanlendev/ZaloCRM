# Hướng Dẫn Import Dữ Liệu Lịch Sử Tin Nhắn Zalo PC Vào ZaloCRM

Tài liệu này hướng dẫn quy trình trích xuất và nạp (import) toàn bộ lịch sử tin nhắn từ ứng dụng **Zalo PC** (file backup định dạng `.zl.zip`) vào cơ sở dữ liệu của **ZaloCRM**.

---

## 1. Tổng quan cơ chế kỹ thuật

File xuất dữ liệu từ Zalo PC (`backup_zalo_<ngày>.zl.zip`) là một gói lưu trữ `tar` được Zalo mã hóa bằng thuật toán **AES-256-CBC**:
* **Cipher:** `aes-256-cbc`
* **Key:** `SHA-256(uin)`
* **IV:** `"zie" + uin.slice(0, 13)`
* **UIN (`dkey`):** Khóa phiên bảo mật động của tài khoản Zalo khi đang đăng nhập.

Hệ thống ZaloCRM đã trang bị sẵn script tự động hóa: [import-zalo-pc-backup.ts](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/scripts/import-zalo-pc-backup.ts) có khả năng:
1. **Tự động trích xuất khóa phiên & profile:** Kết nối với Zalo PC đang mở qua cổng Chrome DevTools (port 9222) để lấy `UIN`, `UID`, và toàn bộ thông tin danh bạ (tên Zalo, ảnh đại diện, tên gợi nhớ/alias).
2. **Tự động đồng bộ tên nhóm:** Kết nối API CRM backend để lấy đầy đủ tên nhóm (`groupName`) và số lượng thành viên (`groupMembersCount`) cho 100% nhóm chat.
3. **Phân luồng tin nhắn chuẩn xác 100%:** Tin nhắn nhóm (kể cả do thành viên khác gửi) luôn được định tuyến đúng vào nhóm tương ứng (`toUid.startsWith('g')`), không bị phân tán thành các hội thoại cá nhân giả mạo.
4. **Đồng bộ đầy đủ Media & File đính kèm:** Nhận diện và phân loại chính xác các loại tin nhắn: tệp (`file` - PDF, Word, Excel...), hình ảnh (`image`), nhãn dán (`sticker`), video (`video`), tin thoại (`voice`), liên kết (`link`). Chuẩn hóa metadata (tên file, dung lượng, link tải trực tiếp CDN, thumbnail) tương thích hoàn hảo với component chat frontend, hiển thị trực quan thẻ tệp và preview ảnh thay vì `[Tin nhắn]`.
5. **Giải mã luồng (Stream Decryption):** Giải mã trực tiếp luồng dữ liệu mà không cần giải nén file 3GB ra đĩa, tiết kiệm dung lượng ổ cứng.
6. **Tốc độ cao:** Batch-insert vào PostgreSQL với tốc độ **~3.000 - 4.000 tin nhắn/giây** (nạp hơn 330.000 tin nhắn chỉ mất khoảng 1-2 phút).
7. **Cập nhật mốc thời gian:** Tự động cập nhật `lastMessageAt` cho tất cả hội thoại để sắp xếp đúng thứ tự trên giao diện Chat.

---

## 2. Quy trình thực hiện từng bước

### Bước 1: Xuất file dữ liệu từ Zalo PC
1. Mở ứng dụng **Zalo PC** trên máy tính.
2. Bấm vào biểu tượng **Cài đặt** (hình bánh răng ở góc dưới bên trái).
3. Chọn **Lưu trữ** -> bấm nút **Xuất dữ liệu**.
4. Chọn các mục muốn xuất (Tin nhắn, Hình ảnh,...) và chọn thư mục lưu (ví dụ: `Desktop`).
5. Zalo sẽ tạo ra file có đuôi `.zl.zip` (ví dụ: `backup_zalo_14_09_2026.zl.zip`).

---

### Bước 2: Khởi động Zalo PC với cổng Debug (Để script tự lấy khóa giải mã & profile)

Để script có thể tự động lấy khóa `UIN` và đồng bộ tên danh bạ / ảnh đại diện:

1. Đóng hẳn ứng dụng Zalo đang chạy:
   ```bash
   osascript -e 'quit app "Zalo"'
   ```
2. Mở lại Zalo kèm tham số debug port 9222:
   ```bash
   /Applications/Zalo.app/Contents/MacOS/Zalo --remote-debugging-port=9222 >/dev/null 2>&1 &
   ```
3. Đảm bảo cửa sổ Zalo PC đã mở lên và hiển thị danh sách chat bình thường.

---

### Bước 3: Chạy lệnh Import vào ZaloCRM

Mở Terminal tại thư mục gốc dự án ZaloCRM (`/Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM`), chạy lệnh sau:

```bash
DATABASE_URL="postgresql://crmuser:ZaloCRMPassword123!@localhost:5433/zalocrm" \
npx tsx scripts/import-zalo-pc-backup.ts /Users/lennguyen/Desktop/backup_zalo_14_09_2026.zl.zip --all
```

> **Ghi chú các tham số an toàn:**
> * Thay `/Users/lennguyen/Desktop/backup_zalo_14_09_2026.zl.zip` bằng đường dẫn thực tế file backup của bạn.
> * `--all`: Nạp toàn bộ tin nhắn không giới hạn.
> * `--clean`: **MẶC ĐỊNH TẮT (AN TOÀN)**. Chỉ truyền cờ này nếu bạn muốn **xóa sạch toàn bộ** tin nhắn và hội thoại cũ của nick này để nạp lại từ đầu. Nếu không truyền `--clean`, script sẽ chạy ở chế độ **bổ sung (idempotent / append)**, không làm mất dữ liệu hiện có.
> * `--dry-run`: Chạy thử nghiệm kiểm tra dữ liệu và danh sách hội thoại, không ghi vào database.
> * `--max <số_lượng>`: Chỉ nạp thử số lượng tin nhắn chỉ định (ví dụ: `--max 500`).

---

## 3. Quy trình thực hiện trên Môi Trường Production

Do Zalo PC chạy trên máy tính cá nhân của sale/admin (Windows/macOS), còn máy chủ Production chạy độc lập (Linux/Docker):

### Cách 1 (Khuyến nghị — Nhanh & Tự động hoàn toàn):
Chạy script từ máy tính cá nhân (nơi đang mở Zalo PC port 9222), trỏ kết nối `DATABASE_URL` và `API_BASE_URL` về máy chủ Production (thông qua SSH tunnel hoặc VPN):

```bash
# Ví dụ tạo SSH Tunnel cổng DB về localhost:5434 nếu DB không expose trực tiếp:
# ssh -L 5434:localhost:5432 user@production-server.com -N &

DATABASE_URL="postgresql://crmuser:MatKhauThatProd@localhost:5434/zalocrm" \
API_BASE_URL="https://crm.yourdomain.com" \
npx tsx scripts/import-zalo-pc-backup.ts /Users/lennguyen/Desktop/backup_zalo_14_09_2026.zl.zip --all
```

### Cách 2 (Chạy trực tiếp trên Server Production — Khách gửi file zip + UIN):
1. **Lấy mã khóa UIN từ máy khách (Client Windows)**:
   - Gửi file [scripts/LayKeyZalo.bat](file:///Volumes/DATA/YOOT/YOEDU_ERP/ZaloCRM/scripts/LayKeyZalo.bat) cho khách hàng.
   - Khách hàng chỉ cần bấm đúp chuột vào file `LayKeyZalo.bat`. Script sẽ tự động đọc mã `UIN` và tự động copy vào Clipboard. Khách chỉ cần bấm `Ctrl + V` gửi lại cho bạn.
2. **Tải file backup lên Server**:
   ```bash
   scp /Users/lennguyen/Desktop/backup_zalo_14_09_2026.zl.zip user@production-server.com:/opt/backups/
   ```
3. **Chạy script trên Server**:
   ```bash
   npx tsx scripts/import-zalo-pc-backup.ts /opt/backups/backup_zalo_14_09_2026.zl.zip \
     --uin <UIN_VUA_LAY> \
     --account <ACCOUNT_ID_TRONG_CRM> \
     --all
   ```

---

## 4. Xử lý sự cố thường gặp (Troubleshooting)

| Vấn đề | Nguyên nhân | Cách khắc phục |
|:---|:---|:---|
| `Không thể tự lấy UIN từ Zalo PC (port 9222)` | Zalo chưa chạy với cờ `--remote-debugging-port=9222` | Chạy lệnh ở **Bước 2** để khởi động lại Zalo với port 9222. |
| `File backup không tồn tại` | Sai đường dẫn file backup | Kéo thả file `.zl.zip` từ Finder vào Terminal để lấy đúng đường dẫn tuyệt đối. |
| `Connection refused localhost:5433` | Docker container PostgreSQL chưa chạy | Chạy `docker compose up -d db` để khởi động cơ sở dữ liệu. |
| `Hội thoại hiển thị Unknown` | Chưa đồng bộ danh bạ từ Zalo PC | Chạy script import với cờ `--clean` trong khi Zalo PC đang mở ở port 9222 để script tự động lấy 100% tên nhóm và tên bạn bè. |

---

## 5. Kiểm tra kết quả sau khi Import

1. **Trên giao diện Web:** Mở trình duyệt vào trang **ZaloCRM -> Mục Chat (Hội thoại)** (`http://localhost:3081/chat`).
2. **Kiểm tra qua câu lệnh Database:**
   ```bash
   DATABASE_URL="postgresql://crmuser:ZaloCRMPassword123!@localhost:5433/zalocrm" npx tsx -e '
   const { PrismaClient } = require("@prisma/client");
   const prisma = new PrismaClient();
   async function check() {
     const msgs = await prisma.message.count();
     const convs = await prisma.conversation.count();
     const unknown = await prisma.conversation.count({
       where: { threadType: "user", contact: { fullName: "Unknown" } }
     });
     console.log("Tổng hội thoại:", convs, "| Tổng tin nhắn:", msgs, "| Hội thoại Unknown:", unknown);
   }
   check();
   '
   ```
   Kết quả chuẩn: `Tổng hội thoại: 502 | Hội thoại Unknown: 0`.
