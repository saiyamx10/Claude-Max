"""Overlay the timer on a photo: clock 8:56:50 PM -> 8:57:00 PM, then it stops
at 8:57:00.00 for 3 s.
Total 13 s.  Usage: python3 make_photo_video.py <image> <output.mp4>"""
import subprocess, sys
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

SRC, OUT = sys.argv[1], sys.argv[2]
W, H, FPS = 1920, 1080, 30
RUN, HOLD = 10.0, 3.0                         # clock runs 10 s, then stops for 3 s
TOTAL = RUN + HOLD
N = int(TOTAL * FPS)
START = 20 * 3600 + 56 * 60 + 50              # 8:56:50 PM
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
f_clock = ImageFont.truetype(MONO, 110)
CLOCK_Y = 40

photo = ImageOps.fit(Image.open(SRC).convert("RGB"), (W, H), Image.LANCZOS)

def fmt(sec, cs):
    h, m, s = sec // 3600, sec // 60 % 60, sec % 60
    return f"{h % 12 or 12}:{m:02d}:{s:02d}.{cs:02d} {'PM' if h >= 12 else 'AM'}"

def draw_clock(img, text):
    # soft dark shadow behind white digits so they read over the photo
    tw = ImageDraw.Draw(img).textlength(text, font=f_clock)
    x = (W - tw) / 2
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).text((x, CLOCK_Y), text, font=f_clock, fill=200)
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    img.paste((0, 0, 0), (0, 0), shadow)
    ImageDraw.Draw(img).text((x, CLOCK_Y), text, font=f_clock, fill=(255, 255, 255))

ff = subprocess.Popen(
    [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
     "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "18",
     "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
    stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

for i in range(N):
    s = i * TOTAL / (N - 1)
    c = min(s, RUN)                              # stops at 8:57:00.00
    img = photo.copy()
    cs = min(int((c % 1) * 100 + 1e-6), 99) if c < RUN else 0
    draw_clock(img, fmt(START + int(c + 1e-9), cs))
    ff.stdin.write(img.tobytes())

ff.stdin.close(); ff.wait()
