# GitHub Repository Viewer — Chrome Extension (Manifest V3)

Một tiện ích mở rộng (Chrome Extension) hiện đại, gọn gàng, sử dụng **Manifest V3** giúp bạn xem nhanh thông tin tài khoản GitHub và danh sách repository (cả công khai và riêng tư) trực tiếp từ popup của trình duyệt mà **không cần bất kỳ máy chủ backend nào**.

---

## 📑 Mục lục
1. [Tính năng nổi bật](#-tính-năng-nổi-bật)
2. [Cấu trúc thư mục](#-cấu-trúc-thư-mục)
3. [Bảo mật & Quyền hạn](#-bảo-mật--quyền-hạn)
4. [Hướng dẫn tạo GitHub Personal Access Token (PAT)](#-hướng-dẫn-tạo-github-personal-access-token-pat)
5. [Hướng dẫn cài đặt Extension vào Chrome ("Load unpacked")](#-hướng-dẫn-cài-đặt-extension-vào-chrome-load-unpacked)
6. [Hướng dẫn sử dụng](#-hướng-dẫn-sử-dụng)
7. [Kiểm thử tự động](#-kiểm-thử-tự-động)

---

## ✨ Tính năng nổi bật

- 👤 **Xem nhanh tài khoản**: Hiển thị ảnh đại diện (avatar) và tên tài khoản GitHub (name + login handle).
- 📦 **Danh sách Repository đầy đủ**: Hiển thị tất cả repository bạn có quyền truy cập (bao gồm cả Public và Private). Hỗ trợ tự động phân trang (pagination) tải đầy đủ khi tài khoản có trên 100 repo.
- 🏷️ **Thông tin trực quan**: Tên repo, huy hiệu trạng thái (Public/Private), mô tả repo, ngôn ngữ lập trình chính và thời gian cập nhật gần nhất (dạng tương đối như *2h ago*, *yesterday*, *Sep 20, 2026*).
- 🔍 **Tìm kiếm tức thì**: Lọc repository theo tên hoặc nội dung mô tả ngay khi gõ phím, có nút xóa nhanh tìm kiếm.
- 🔄 **Làm mới dữ liệu**: Nút tải lại (Reload) có hiệu ứng xoay mượt mà, giữ nguyên bộ nhớ đệm nếu gặp sự cố mạng.
- 🚨 **Xử lý lỗi thông minh**: Thông báo rõ ràng khi token hết hạn/sai (401), thiếu quyền (403), giới hạn lượt gọi GitHub API (Rate Limit kèm thời gian đếm ngược reset) hoặc mất kết nối mạng.
- 🔌 **Ngắt kết nối an toàn (Disconnect)**: Xóa sạch toàn bộ token và dữ liệu đệm khỏi trình duyệt, đưa extension về màn hình thiết lập ban đầu.
- ⚡ **Thuần Vanilla**: Viết bằng HTML5, CSS3 và ES Modules, không cần Node.js build step, cài đặt chạy ngay.

---

## 📂 Cấu trúc thư mục

```text
/home/yusei1708/code/chrome/
├── manifest.json              # File cấu hình Manifest V3 (quyền storage, action popup)
├── popup.html                 # Giao diện chính của popup (tuân thủ chuẩn bảo mật CSP)
├── popup.css                  # Giao diện phong cách GitHub hiện đại, dark mode
├── popup.js                   # Logic điều khiển giao diện popup, tương tác người dùng
├── storage.js                 # Module quản lý lưu trữ an toàn bằng chrome.storage.local
├── api.js                     # Module kết nối GitHub REST API v2022-11-28, phân trang & lọc
├── icons/                     # Bộ icon ứng dụng cho Chrome
│   ├── icon16.png             # Icon kích thước 16x16 px
│   ├── icon48.png             # Icon kích thước 48x48 px
│   └── icon128.png            # Icon kích thước 128x128 px
├── tests/                     # Bộ kiểm thử tự động toàn diện (125 test cases)
│   ├── e2e_runner.js          # Test runner độc lập, không phụ thuộc package ngoài
│   ├── tier1_features.test.js # Kiểm thử các tính năng cốt lõi và CSP
│   ├── tier2_boundaries.test.js # Kiểm thử các trường hợp biên và dữ liệu ngoại lệ
│   ├── tier3_combinations.test.js # Kiểm thử tích hợp đa module
│   └── tier4_workloads.test.js    # Kiểm thử luồng trải nghiệm người dùng thực tế
└── README.md                  # Hướng dẫn chi tiết bằng tiếng Việt
```

---

## 🔒 Bảo mật & Quyền hạn

1. **Nguyên tắc quyền tối thiểu (Least Privilege)**:
   - `manifest.json` chỉ xin duy nhất quyền `"storage"` (để lưu token trên máy bạn) và `"host_permissions": ["https://api.github.com/*"]` (để gọi trực tiếp GitHub API).
   - Tuyệt đối không xin quyền đọc lịch sử duyệt web, không chèn content script vào các trang web khác.
2. **Không gửi dữ liệu sang bên thứ ba**: Toàn bộ quá trình gọi API diễn ra trực tiếp từ trình duyệt của bạn tới máy chủ GitHub (`https://api.github.com`).
3. **Lưu trữ bảo mật**:
   - Token chỉ lưu trong `chrome.storage.local` của Chrome, không lưu vào `chrome.storage.sync` (tránh đồng bộ token qua tài khoản Google).
   - Ô nhập token sử dụng `type="password"` chống nhìn trộm (shoulder-surfing).
   - Token không bao giờ được ghi ra `console.log`, không hiển thị lại dưới dạng plain text trên giao diện sau khi lưu.

---

## 🔑 Hướng dẫn tạo GitHub Personal Access Token (PAT)

Để xem được thông tin tài khoản và danh sách repository cá nhân, bạn chỉ cần tạo một token có quyền **chỉ đọc (Read-only)**:

1. Đăng nhập vào GitHub trên trình duyệt.
2. Bấm vào ảnh đại diện của bạn ở góc trên bên phải → chọn **Settings**.
3. Ở menu bên trái, cuộn xuống dưới cùng và chọn **Developer settings**.
4. Chọn **Personal access tokens** → chọn **Fine-grained tokens**.
5. Nhấp nút **Generate new token**.
6. Điền các thông tin như sau:
   - **Token name**: Ví dụ `chrome-repo-viewer`.
   - **Expiration**: Chọn thời hạn bạn muốn (ví dụ 30 days hoặc 90 days).
   - **Repository access**:
     - Chọn **All repositories** (nếu muốn xem tất cả repo cá nhân của bạn, cả public và private).
     - Hoặc chọn **Only select repositories** (nếu chỉ muốn xem một số repo cụ thể).
   - **Permissions (Quyền hạn)**:
     - **Repository permissions**: Tìm mục **Metadata** → Đảm bảo trạng thái là **Read-only** (mặc định đã được chọn).
     - **Account permissions**: Tìm mục **Profile** (hoặc **Email**) → Chọn **Read-only** (để extension lấy được tên và ảnh đại diện).
7. Cuộn xuống cuối trang và nhấn **Generate token**.
8. Sao chép chuỗi token vừa tạo (bắt đầu bằng `github_pat_...`). *Lưu ý: GitHub chỉ hiển thị token này một lần duy nhất.*

---

## 🚀 Hướng dẫn cài đặt Extension vào Chrome ("Load unpacked")

1. Mở trình duyệt Google Chrome (hoặc Brave, Cốc Cốc, Microsoft Edge).
2. Nhập vào thanh địa chỉ: `chrome://extensions` rồi nhấn **Enter**.
3. Ở góc trên bên phải trang, bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển).
4. Ở góc trên bên trái, nhấp vào nút **Load unpacked** (Tải tiện ích đã giải nén).
5. Trong cửa sổ chọn thư mục, tìm và chọn thư mục chứa mã nguồn:
   ```text
   /home/yusei1708/code/chrome
   ```
6. Bấm **Select** (hoặc Mở). Extension **GitHub Repository Viewer** sẽ xuất hiện ngay trong danh sách tiện ích của Chrome mà không có bất kỳ cảnh báo lỗi nào.
7. Bấm vào biểu tượng mảnh ghép (Extensions) trên thanh công cụ của Chrome và ghim (Pin) **GitHub Repository Viewer** để tiện mở nhanh.

---

## 💡 Hướng dẫn sử dụng

### 1. Kết nối tài khoản lần đầu:
- Nhấp vào biểu tượng extension trên thanh công cụ Chrome.
- Cửa sổ popup sẽ hiển thị màn hình **Connect GitHub**.
- Dán mã token `github_pat_...` bạn đã tạo vào ô nhập.
- Bấm **Connect Account**. Tiện ích sẽ xác thực với GitHub, tải ảnh đại diện và toàn bộ danh sách repository của bạn.

### 2. Xem danh sách & Mở Repository:
- Cửa sổ hiển thị ảnh đại diện và tên người dùng của bạn ở phía trên cùng.
- Bên dưới là danh sách các thẻ repository. Mỗi thẻ bao gồm:
  - Tên repo (liên kết màu xanh).
  - Huy hiệu **Public** (xanh lam) hoặc **Private** (vàng đồng).
  - Mô tả tóm tắt của repository.
  - Ngôn ngữ lập trình và thời gian cập nhật gần nhất.
- Nhấp chuột vào tên repository bất kỳ sẽ mở trang GitHub của repository đó trong một tab mới.

### 3. Tìm kiếm repository:
- Gõ từ khóa vào ô **Find a repository...**.
- Danh sách sẽ lọc tức thì theo tên và mô tả repository mà không cần gọi lại mạng.
- Nhấp vào nút `✕` ở bên phải ô tìm kiếm để xóa nhanh từ khóa và xem lại toàn bộ danh sách.

### 4. Tải lại danh sách (Reload):
- Bấm vào biểu tượng xoay `↻` ở góc trên bên phải để cập nhật dữ liệu mới nhất từ GitHub.
- Nếu bạn gặp sự cố mạng hoặc bị giới hạn số lượt gọi API, extension sẽ hiển thị thanh thông báo lỗi màu đỏ kèm nút **Retry**, đồng thời vẫn giữ nguyên danh sách repo đã tải trước đó để bạn tiếp tục tra cứu.

### 5. Ngắt kết nối (Disconnect):
- Bấm vào nút **Disconnect** màu đỏ ở góc trên bên phải.
- Toàn bộ token bí mật, ảnh đại diện và danh sách repository đã lưu trong `chrome.storage.local` sẽ được xóa hoàn toàn khỏi trình duyệt.
- Giao diện lập tức quay về màn hình nhập token ban đầu.

---

## 🧪 Kiểm thử tự động

Dự án tích hợp sẵn bộ kiểm thử toàn diện gồm **125 bài test tự động** kiểm tra toàn bộ các khía cạnh: tính hợp lệ của Manifest V3, bảo mật CSP, xử lý token, phân trang Link header RFC 8288, phân loại lỗi API (401, 403, 429 rate limit reset), tìm kiếm tức thì và các kịch bản người dùng.

Để chạy kiểm thử, bạn có thể thực thi lệnh sau trong thư mục dự án:

```bash
node tests/e2e_runner.js
```

Kết quả:
```text
====================================================
Test Execution Summary:
  Total Tests:    125
  Passed:         125
  Failed:         0
  Skipped:        0
====================================================
 PASS  All executed tests passed!
```
