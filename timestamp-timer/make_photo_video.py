"""Overlay the timer on a photo: clock 8:56:50 PM -> 8:57:00 PM, then it stops
at 8:57:00.00 for 3 s while fireworks burst on either side of the photo.
Total 13 s.  Usage: python3 make_photo_video.py <image> <output.mp4>"""
import colorsys, math, random, subprocess, sys
import imageio_ffmpeg
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

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

# --- fireworks, kept to the left and right of the photo so they don't cover her ---
rnd = random.Random(6)
BURSTS = []
for k in range(10):
    t_burst = RUN + k * 0.3
    x = rnd.randint(150, 600) if k % 2 == 0 else rnd.randint(1320, 1770)
    y = rnd.randint(200, 480)
    hue = rnd.random()
    parts = []
    for _ in range(80):
        a, sp = rnd.uniform(0, 2 * math.pi), rnd.uniform(90, 360)
        parts.append((math.cos(a) * sp, math.sin(a) * sp, (hue + rnd.uniform(-0.06, 0.06)) % 1))
    BURSTS.append((t_burst, x, y, parts))
RISE, LIFE, G, DRAG = 0.55, 1.6, 200.0, 1.6

def fireworks(s):
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for tb, x, y, parts in BURSTS:
        if tb - RISE <= s < tb:
            p = (s - (tb - RISE)) / RISE
            ry = H + (y - H) * (1 - (1 - p) ** 2)
            d.ellipse((x - 4, ry - 4, x + 4, ry + 4), fill=(255, 235, 180))
            d.line((x, ry, x, ry + 36), fill=(120, 100, 60), width=3)
        elif tb <= s < tb + LIFE:
            for vx, vy, hue in parts:
                for j in range(4):
                    tau = s - tb - j * 0.03
                    if tau < 0:
                        continue
                    k = (1 - math.exp(-DRAG * tau)) / DRAG
                    px, py = x + vx * k, y + vy * k + 0.5 * G * tau * tau
                    fade = max(0.0, 1 - tau / LIFE) * (1 - j * 0.25)
                    r, g, b = colorsys.hsv_to_rgb(hue, 0.85, fade)
                    rad = 4 - j * 0.7
                    d.ellipse((px - rad, py - rad, px + rad, py + rad),
                              fill=(int(r * 255), int(g * 255), int(b * 255)))
    return ImageChops.add(layer, layer.filter(ImageFilter.GaussianBlur(8)))

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
    img = ImageChops.add(photo, fireworks(s)) if s >= RUN - RISE else photo.copy()
    cs = min(int((c % 1) * 100 + 1e-6), 99) if c < RUN else 0
    draw_clock(img, fmt(START + int(c + 1e-9), cs))
    ff.stdin.write(img.tobytes())

ff.stdin.close(); ff.wait()
