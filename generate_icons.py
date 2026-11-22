"""Tạo icon PNG của ứng dụng bằng thư viện chuẩn Python, không cần cài thêm gì."""

from pathlib import Path
import struct
import zlib


ICON_FOLDER = Path(__file__).resolve().parent / "icons"
BACKGROUND = (15, 118, 110, 255)
PAPER = (245, 255, 253, 255)
PAGE_LINE = (45, 154, 143, 255)
SEAM = (8, 74, 69, 255)


def blend_pixel(canvas, x, y, color):
    """Đặt một điểm ảnh nếu tọa độ nằm trong khung hình."""
    height = len(canvas)
    width = len(canvas[0])
    if 0 <= x < width and 0 <= y < height:
        canvas[y][x] = color


def fill_polygon(canvas, points, color):
    """Tô đa giác bằng thuật toán tia cắt ngang đơn giản."""
    x_min = max(0, int(min(point[0] for point in points)))
    x_max = min(len(canvas[0]) - 1, int(max(point[0] for point in points)))
    y_min = max(0, int(min(point[1] for point in points)))
    y_max = min(len(canvas) - 1, int(max(point[1] for point in points)))
    for y in range(y_min, y_max + 1):
        for x in range(x_min, x_max + 1):
            inside = False
            previous = points[-1]
            for current in points:
                x1, y1 = current
                x2, y2 = previous
                crosses = (y1 > y) != (y2 > y)
                if crosses:
                    cross_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
                    if x < cross_x:
                        inside = not inside
                previous = current
            if inside:
                blend_pixel(canvas, x, y, color)


def draw_line(canvas, start, end, color, width):
    """Vẽ nét dày bằng khoảng cách từ điểm ảnh tới đoạn thẳng."""
    x1, y1 = start
    x2, y2 = end
    radius = width / 2
    min_x = max(0, int(min(x1, x2) - radius))
    max_x = min(len(canvas[0]) - 1, int(max(x1, x2) + radius))
    min_y = max(0, int(min(y1, y2) - radius))
    max_y = min(len(canvas) - 1, int(max(y1, y2) + radius))
    segment_length = max((x2 - x1) ** 2 + (y2 - y1) ** 2, 1)
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            ratio = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / segment_length
            ratio = max(0, min(1, ratio))
            nearest_x = x1 + ratio * (x2 - x1)
            nearest_y = y1 + ratio * (y2 - y1)
            if (x - nearest_x) ** 2 + (y - nearest_y) ** 2 <= radius ** 2:
                blend_pixel(canvas, x, y, color)


def png_chunk(chunk_type, payload):
    """Đóng gói một khối PNG cùng độ dài và mã kiểm tra CRC."""
    chunk_data = chunk_type + payload
    checksum = zlib.crc32(chunk_data) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + chunk_data + struct.pack(">I", checksum)


def create_icon(size):
    """Vẽ quyển sổ mở và ghi ảnh RGBA ở kích thước cần cho Android."""
    canvas = [[BACKGROUND for _ in range(size)] for _ in range(size)]
    scale = size / 512
    scale_points = lambda points: [(x * scale, y * scale) for x, y in points]

    # Hai trang sách nằm trong vùng an toàn để icon không bị cắt khi Android bo góc.
    fill_polygon(canvas, scale_points([(104, 155), (248, 178), (248, 367), (104, 340)]), PAPER)
    fill_polygon(canvas, scale_points([(264, 178), (408, 155), (408, 340), (264, 367)]), PAPER)

    # Nét dọc giữa quyển sổ và các dòng chữ trên hai trang.
    draw_line(canvas, (256 * scale, 174 * scale), (256 * scale, 367 * scale), SEAM, 9 * scale)
    for y in (222, 264, 306):
        draw_line(canvas, (130 * scale, y * scale), (222 * scale, (y + 13) * scale), PAGE_LINE, 7 * scale)
        draw_line(canvas, (290 * scale, (y + 13) * scale), (382 * scale, y * scale), PAGE_LINE, 7 * scale)

    # PNG lưu mỗi dòng theo bộ lọc 0, sau đó nén dữ liệu RGBA.
    raw_rows = bytearray()
    for row in canvas:
        raw_rows.append(0)
        for red, green, blue, alpha in row:
            raw_rows.extend((red, green, blue, alpha))
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png_data = (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(bytes(raw_rows), 9))
        + png_chunk(b"IEND", b"")
    )
    ICON_FOLDER.mkdir(parents=True, exist_ok=True)
    (ICON_FOLDER / f"icon-{size}.png").write_bytes(png_data)


if __name__ == "__main__":
    create_icon(192)
    create_icon(512)
    print("Đã tạo icon-192.png và icon-512.png.")
