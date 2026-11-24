# Demo HIS qua ba vai trò

Dùng tài khoản và dữ liệu giả trên môi trường cục bộ. Xem [README](../README.md) để cấu hình API, SQL Server và hai cổng.

1. **Admin** tạo hoặc chọn một khoa và bác sĩ đang hoạt động. Mở lịch làm việc có ít nhất một giờ trống trong ngày demo theo giờ Việt Nam.
2. **Patient** đăng nhập, tạo hoặc chọn hồ sơ của mình, tìm bác sĩ và đặt khung giờ. Mở **My Appointments** để xem lịch `Pending`.
3. **Doctor** mở lịch được giao và xác nhận. Đối chiếu trạng thái `Confirmed`.
4. **Patient** tải lại trang chi tiết trong ngày hẹn, xác minh dữ liệu hàng đợi đã tải thành công, rồi bấm **Check in** một lần. Ghi nhận số thứ tự và trạng thái `Waiting`.
5. **Doctor** mở **Doctor Queue** và lần lượt gọi, bắt đầu, hoàn tất lượt. Đối chiếu `Called → InService → Completed`.
6. **Patient** tải lại toàn bộ trang chi tiết để đối chiếu trạng thái cuối. Nếu còn thời gian, hủy một lịch hẹn mẫu khác đang ở trạng thái `Pending` và xem trạng thái `Cancelled`.

Theo dõi các lần chuyển trạng thái trên màn hình Doctor. Trang Patient có thể tiếp tục hiển thị `Waiting` cho đến khi tải lại trang. Nếu trạng thái hàng đợi tải lỗi, xác minh lại trước khi check-in. Giữ bệnh án điện tử ở trạng thái tắt trong buổi demo.
