#!/usr/bin/env python3
import struct
import zlib
import os
import math

def make_png(width, height, pixels):
    """
    Creates a valid RGBA PNG from a list of rows, where each row is a list of (r, g, b, a).
    Uses only standard library (struct + zlib).
    """
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xffffffff
        return c + struct.pack(">I", crc)

    # PNG signature
    png = b"\x89PNG\r\n\x1a\n"
    # IHDR
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    png += chunk(b"IHDR", ihdr_data)

    # Raw scanlines with filter byte 0 (None)
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            r, g, b, a = pixels[y][x]
            raw.extend([r, g, b, a])

    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    return png

def render_icon(size):
    pixels = [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]
    center = size / 2.0
    radius = size * 0.44
    corner_r = size * 0.22

    for y in range(size):
        for x in range(size):
            # Signed distance to rounded rectangle
            dx = abs(x + 0.5 - center) - (center - corner_r - (size * 0.05))
            dy = abs(y + 0.5 - center) - (center - corner_r - (size * 0.05))
            dist = math.hypot(max(0, dx), max(0, dy)) + min(0, max(dx, dy)) - corner_r
            
            # Anti-aliasing alpha
            if dist > 0.5:
                continue
            alpha_bg = max(0.0, min(1.0, 0.5 - dist))

            # Modern gradient from deep violet (#4F46E5) to vibrant cyan/blue (#06B6D4 / #2563EB)
            t = (x + y) / (2.0 * size)
            r_bg = int(79 * (1 - t) + 14 * t)
            g_bg = int(70 * (1 - t) + 165 * t)
            b_bg = int(229 * (1 - t) + 233 * t)

            # Draw glowing stylized "Z" and lightning bolt motif
            # Normalize coords -1 to 1 relative to center
            nx = (x + 0.5 - center) / (size * 0.38)
            ny = (y + 0.5 - center) / (size * 0.38)

            # Check if point is inside stylized Z / lightning bolt
            # Upper bar: ny around -0.6 to -0.25, nx from -0.7 to 0.7
            # Diagonal: nx + ny ~ 0 from (0.6, -0.4) down to (-0.6, 0.4)
            # Lower bar: ny around 0.25 to 0.6, nx from -0.7 to 0.7
            is_z = False
            z_glow = 0.0

            # Top bar
            if -0.75 <= ny <= -0.25 and -0.7 <= nx <= 0.75:
                is_z = True
            # Bottom bar
            elif 0.25 <= ny <= 0.75 and -0.75 <= nx <= 0.7:
                is_z = True
            # Diagonal with dynamic taper
            elif -0.6 <= ny <= 0.6:
                diag_center = -ny * 0.9
                if abs(nx - diag_center) <= 0.32:
                    is_z = True

            # Clock / gauge indicator dot in the top right
            clock_dist = math.hypot((x + 0.5) - (size * 0.78), (y + 0.5) - (size * 0.22))
            is_clock_dot = clock_dist <= (size * 0.12)

            if is_clock_dot:
                # Bright emerald / cyan dot signifying live sync
                fg_r, fg_g, fg_b = 52, 211, 153 # #34D399
                fg_alpha = 1.0
            elif is_z:
                # White / bright ice-blue glyph with gradient
                fg_r, fg_g, fg_b = 255, 255, 255
                fg_alpha = 1.0
            else:
                fg_alpha = 0.0

            if fg_alpha > 0.0:
                final_a = int(alpha_bg * 255)
                pixels[y][x] = (fg_r, fg_g, fg_b, final_a)
            else:
                pixels[y][x] = (r_bg, g_bg, b_bg, int(alpha_bg * 255))

    return make_png(size, size, pixels)

def main():
    os.makedirs("icons", exist_ok=True)
    for size in [16, 32, 48, 128]:
        png_data = render_icon(size)
        path = os.path.join("icons", f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(png_data)
        print(f"Generated {path} ({size}x{size}) - {len(png_data)} bytes")

if __name__ == "__main__":
    main()
