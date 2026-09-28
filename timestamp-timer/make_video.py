"""Render timestamp.mp4: October 06, clock 8:56:50 PM to 8:57:00 PM (exactly 10 s)."""
import imageio_ffmpeg, subprocess
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SECS = 1280, 720, 30, 10
N = FPS * SECS                      # 300 frames = exactly 10.000 s
START = 20 * 3600 + 56 * 60 + 50    # 8:56:50 PM as seconds since midnight
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
f_title, f_clock = ImageFont.truetype(BOLD, 44), ImageFont.truetype(MONO, 130)
f_small = ImageFont.truetype(BOLD, 30)

def fmt(sec):
    h, m, s = sec // 3600, sec // 60 % 60, sec % 60
    return f"{h % 12 or 12}:{m:02d}:{s:02d}", "PM" if h >= 12 else "AM"

f_ms = ImageFont.truetype(MONO, 80)

def clock(d, y, hms, ms, ampm, fill):
    # H:MM:SS big, .mmm smaller beside the seconds, then AM/PM
    parts = [(hms, f_clock, 0), (f".{ms:03d}", f_ms, 62), (" " + ampm, f_clock, 0)]
    total = sum(d.textlength(t, font=f) for t, f, _ in parts)
    x = (W - total) / 2
    for t, f, dy in parts:
        d.text((x, y + dy), t, font=f, fill=fill)
        x += d.textlength(t, font=f)

def center(d, y, text, font, fill):
    w = d.textlength(text, font=font)
    d.text(((W - w) / 2, y), text, font=font, fill=fill)

ff = subprocess.Popen(
    [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
     "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264",
     "-pix_fmt", "yuv420p", "-movflags", "+faststart", "timestamp.mp4"],
    stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

for i in range(N):
    t = i * SECS / (N - 1)          # first frame 0.0 s, last frame 10.0 s
    now = START + int(t + 1e-9)
    img = Image.new("RGB", (W, H), (15, 18, 28))
    d = ImageDraw.Draw(img)
    center(d, 90, "October 06", f_title, (230, 235, 245))
    hms, ap = fmt(now)
    clock(d, 260, hms, min(int((t % 1) * 1000 + 1e-6), 999) if t < SECS else 0, ap, (120, 220, 255))
    center(d, 470, f"Elapsed {t:.1f}s", f_small, (160, 170, 190))
    d.rounded_rectangle((190, 560, 1090, 590), 15, fill=(40, 46, 66))
    d.rounded_rectangle((190, 560, 190 + 900 * t / SECS, 590), 15, fill=(120, 220, 255))
    ff.stdin.write(img.tobytes())

ff.stdin.close(); ff.wait()
