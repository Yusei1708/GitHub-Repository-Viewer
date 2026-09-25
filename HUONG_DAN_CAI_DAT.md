# Hướng Dẫn Cài Đặt & Sử Dụng GitHub Repository Viewer Extension

Tài liệu này hướng dẫn chi tiết từng bước cách tải mã nguồn, nạp tiện ích mở rộng vào Google Chrome, tạo mã Personal Access Token và sử dụng extension.

---

## 📌 Bước 1: Chuẩn bị mã nguồn trên máy

Nếu bạn vừa clone repository này về hoặc tải file ZIP về máy tính:
1. Giải nén (nếu tải ZIP) hoặc mở thư mục chứa mã nguồn:
   ```bash
   git clone https://github.com/Yusei1708/GitHub-Repository-Viewer.git
   cd GitHub-Repository-Viewer
   ```
2. Đảm bảo thư mục có đầy đủ các tệp:
   - `manifest.json`
   - `popup.html`, `popup.css`, `popup.js`
   - `storage.js`, `api.js`
   - Thư mục `icons/` chứa `icon16.png`, `icon48.png`, `icon128.png`

> **Lưu ý**: Extension sử dụng mã nguồn thuần (Vanilla JavaScript Manifest V3), **không cần** chạy lệnh `npm install` hay `npm run build`.

---

## 📌 Bước 2: Nạp Extension vào Google Chrome

1. Mở trình duyệt **Google Chrome** (hoặc Microsoft Edge, Brave, Cốc Cốc).
2. Nhập vào thanh địa chỉ:
   ```text
   chrome://extensions
   ```
   rồi nhấn **Enter**.
3. Ở góc trên cùng bên phải màn hình, gạt công tắc để **Bật** chế độ **Developer mode** (Chế độ cho nhà phát triển).
4. Ở góc trên bên trái, nhấp vào nút **Load unpacked** (Tải tiện ích đã giải nén).
5. Trong hộp thoại chọn thư mục, chọn thư mục chứa mã nguồn extension (thư mục có chứa tệp `manifest.json`).
6. Nhấn **Select Folder** (hoặc **Mở**).
7. Tiện ích **GitHub Repository Viewer** sẽ xuất hiện ngay trong danh sách tiện ích của bạn!
8. Nhìn lên góc trên bên phải thanh công cụ của Chrome, nhấp vào biểu tượng **Mảnh ghép (🧩)** và bấm biểu tượng **Ghim (Pin)** cạnh tên tiện ích để tiện mở nhanh bất kỳ lúc nào.

---

## 📌 Bước 3: Tạo GitHub Personal Access Token (PAT)

Extension gọi trực tiếp GitHub REST API từ trình duyệt của bạn, do đó cần một mã Token quyền chỉ đọc (Read-only) để xem thông tin:

1. Truy cập trực tiếp trang tạo token của GitHub:
   👉 **[https://github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)**
2. Nhấp vào nút **Generate new token**.
3. Điền và chọn các thông tin:
   - **Token name**: Đặt tên tùy ý (ví dụ: `my-chrome-extension`).
   - **Expiration**: Chọn thời hạn (ví dụ: `30 days` hoặc `90 days`).
   - **Repository access**: Chọn **All repositories** (để extension hiển thị được cả repository Công khai và Riêng tư mà bạn có quyền truy cập).
   - **Permissions (Quyền hạn)**:
     - Bấm vào mục **Repository permissions** → Tìm **Metadata** → Chọn **Read-only** *(mặc định GitHub đã bật sẵn)*.
     - Bấm vào mục **Account permissions** → Tìm **Profile** (hoặc **Email**) → Chọn **Read-only** *(để lấy tên và ảnh đại diện)*.
4. Cuộn xuống cuối trang và nhấn nút xanh: **Generate token**.
5. Nhấn nút **Copy** (biểu tượng hai ô vuông) để sao chép chuỗi mã token (có định dạng bắt đầu bằng `github_pat_...` hoặc `ghp_...`).

---

## 📌 Bước 4: Kết nối và Sử dụng

1. Nhấp vào biểu tượng extension **GitHub Repository Viewer** trên thanh công cụ Chrome.
2. Dán mã token bạn vừa copy vào ô **Personal Access Token**.
3. Nhấn nút **Connect Account**.
4. Tiện ích sẽ xác thực và tải về:
   - Ảnh đại diện (avatar) và tên tài khoản GitHub của bạn.
   - Toàn bộ danh sách repository (Public và Private).
   - Ngôn ngữ lập trình, mô tả và thời gian cập nhật gần nhất.

### Các thao tác nhanh trong giao diện:
- **Tìm kiếm**: Gõ từ khóa vào ô *Find a repository...* để tìm kiếm tức thì theo tên hoặc mô tả; nhấp nút `✕` để xóa tìm kiếm.
- **Mở repository**: Nhấp chuột vào tên repository để mở trang GitHub tương ứng trên tab mới.
- **Tải lại (Reload)**: Nhấn nút xoay `↻` ở góc trên bên phải để làm mới dữ liệu mới nhất từ GitHub.
- **Ngắt kết nối (Disconnect)**: Nhấn nút **Disconnect** để xóa sạch token và dữ liệu đệm khỏi máy tính, đưa extension về trạng thái ban đầu một cách an toàn.

---

## 🔒 Cam kết bảo mật

- **Không lưu trữ trung gian**: Extension chạy 100% Client-side trên Chrome, không sử dụng server trung gian.
- **Bảo mật token**: Token được lưu trong `chrome.storage.local` trên máy của bạn, không gửi đi bất kỳ đâu ngoại trừ `https://api.github.com`.
