# Sổ tay từ vựng Android

Đây là bản điện thoại riêng của ứng dụng, làm theo dạng **PWA**: chạy trong Chrome trên Android, có thể thêm vào màn hình chính và dùng ngoại tuyến sau lần mở đầu tiên. Bản Python trên máy tính được giữ nguyên.

## Cài lên Android

PWA cần được mở từ một địa chỉ HTTPS để Android cho phép cài ứng dụng và dùng bộ nhớ ngoại tuyến.

1. Đưa toàn bộ nội dung thư mục này lên một dịch vụ web tĩnh có HTTPS (ví dụ GitHub Pages hoặc máy chủ HTTPS của bạn).
2. Mở địa chỉ đó bằng Chrome trên điện thoại Android và chờ trang tải xong một lần.
3. Mở menu Chrome rồi chọn **Cài đặt ứng dụng** hoặc **Thêm vào màn hình chính**.
4. Mở biểu tượng mới trên màn hình chính. Sau lần tải đầu, các màn hình và dữ liệu có thể dùng khi ngoại tuyến.

Không cần cài thư viện hay chạy máy chủ Python trên điện thoại. Để xem thử trên máy tính, mở Terminal ở thư mục này và chạy `python -m http.server 8000`; địa chỉ localhost chỉ phục vụ xem thử, còn cài đặt PWA cần HTTPS.

## Tính năng

- Thêm cùng một từ với nhiều định nghĩa; mỗi mục từ + định nghĩa có bộ đếm và ngưỡng xóa riêng.
- Ôn bằng cách nối cặp, xem định nghĩa rồi nhập từ, hoặc trắc nghiệm bốn lựa chọn.
- Khi trả lời sai ở ba kiểu ôn, ứng dụng hiện lời giải, chuyển tiếp và không tăng bộ đếm đúng.
- Cần ít nhất 2 mục đã lưu để vào phần ôn; trắc nghiệm cần 4 từ khác nhau.
- Từ và thiết lập được lưu trong bộ nhớ của trình duyệt trên thiết bị. Dữ liệu không tự đồng bộ với bản máy tính.
- Để đưa từ từ máy tính sang Android, dùng nút **Nhập kho từ** và chọn file `vocabulary.json` của bản Python.
- Để đưa từ Android sang máy tính, dùng **Xuất kho từ**, sao lưu file cũ rồi chép file tải về thành `vocabulary.json` trong thư mục bản Python khi ứng dụng Python đã đóng.

## Các file chính

- `index.html`: khung ứng dụng và metadata cài đặt.
- `styles.css`: giao diện ưu tiên màn hình cảm ứng và điện thoại nhỏ.
- `app.js`: lưu dữ liệu, thêm nghĩa, các kiểu ôn và nhập/xuất JSON.
- `manifest.webmanifest`: tên, màu và icon khi cài lên màn hình chính.
- `service-worker.js`: lưu file giao diện để dùng ngoại tuyến.
- `generate_icons.py`: mã nguồn tạo hai icon PNG bằng thư viện chuẩn Python.
