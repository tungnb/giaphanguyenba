# Blog Cá Nhân

Blog cá nhân sử dụng Cloudflare Pages với khả năng lưu trữ bài viết thông qua Google Sheets và hình ảnh thông qua Google Drive.

## Cấu hình biến môi trường

### Biến môi trường cho Google Sheets
- `GOOGLE_SERVICE_ACCOUNT_KEY`: Chứa thông tin xác thực Service Account cho Google Sheets
- `GOOGLE_SPREADSHEET_ID`: ID của Google Spreadsheet để lưu trữ bài viết

### Biến môi trường cho Google Drive (mới)
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY`: Chứa thông tin xác thực Service Account cho Google Drive
- `GOOGLE_DRIVE_FOLDER_ID`: ID của thư mục Google Drive để lưu trữ hình ảnh

## Cấu hình Google Drive API

Để tính năng tải lên hình ảnh lên Google Drive hoạt động, bạn cần:

1. **Kích hoạt Google Drive API:**
   - Truy cập [Google Cloud Console](https://console.cloud.google.com/)
   - Chọn dự án của bạn
   - Vào mục "APIs & Services" > "Library"
   - Tìm kiếm "Google Drive API" và kích hoạt
   
2. **Tạo Service Account cho Google Drive:**
   - Vào mục "APIs & Services" > "Credentials"
   - Chọn "Create credentials" > "Service account"
   - Điền thông tin và cấp quyền cho service account
   - Tạo khóa mới (dạng JSON) và tải về
   - Sao chép nội dung tệp JSON vào biến môi trường `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY`

3. **Cấu hình thư mục Google Drive:**
   - Tạo một thư mục trong Google Drive
   - Chia sẻ thư mục với email của service account (với quyền Contributor)
   - Lấy ID của thư mục từ URL và đặt vào biến môi trường `GOOGLE_DRIVE_FOLDER_ID`

## Xử lý lỗi phổ biến

### Lỗi "Google Drive API has not been used in project...":
Lỗi này xuất hiện khi Google Drive API chưa được kích hoạt trong dự án. Hãy nhấp vào liên kết trong thông báo lỗi để kích hoạt API.

### Lỗi "Permission denied" (403):
Kiểm tra lại việc chia sẻ thư mục Google Drive với tài khoản service account. 