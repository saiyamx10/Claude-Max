"""Render timestamp.mp4: October 06, clock 8:56:50 PM -> 8:57:00 PM.
The clock holds at 8:56:57.00 for 3 s while birthday fireworks burst behind it.
Total 13 s."""
import colorsys, math, random, subprocess
import imageio_ffmpeg
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1280, 720, 30
HOLD_AT, HOLD_LEN, RUN = 7.0, 3.0, 10.0      # clock seconds run 0..10; hold at 7 (=57 s)
TOTAL = RUN + HOLD_LEN                        # 13 s
N = int(TOTAL * FPS)                          # 390 frames
START = 20 * 3600 + 56 * 60 + 50              # 8:56:50 PM
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
f_title, f_clock = ImageFont.truetype(BOLD, 44), ImageFont.truetype(MONO, 130)

def fmt(sec):
    h, m, s = sec // 3600, sec // 60 % 60, sec % 60
    return f"{h % 12 or 12}:{m:02d}:{s:02d}", "PM" if h >= 12 else "AM"

def center(d, y, text, font, fill):
    d.text(((W - d.textlength(text, font=font)) / 2, y), text, font=font, fill=fill)

def clock(d, y, hms, cs, ampm):
    text = f"{hms}.{cs:02d} {ampm}"
    center(d, y, text, f_clock, (255, 255, 255))

# --- fireworks: deterministic bursts (launch time, x, burst y, hue) ---
rnd = random.Random(6)
BURSTS = []
for k in range(14):
    t_burst = 7.0 + k * 0.42
    x = rnd.randint(150, W - 150)
    y = rnd.randint(90, 330)
    hue = rnd.random()
    parts = []
    for _ in range(70):
        a, sp = rnd.uniform(0, 2 * math.pi), rnd.uniform(60, 260)
        h2 = (hue + rnd.uniform(-0.06, 0.06)) % 1
        parts.append((math.cos(a) * sp, math.sin(a) * sp, h2))
    BURSTS.append((t_burst, x, y, parts))
RISE, LIFE, G, DRAG = 0.55, 1.6, 140.0, 1.6

def fireworks(s):
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for tb, x, y, parts in BURSTS:
        if tb - RISE <= s < tb:                     # rocket rising
            p = (s - (tb - RISE)) / RISE
            ry = H + (y - H) * (1 - (1 - p) ** 2)
            d.ellipse((x - 3, ry - 3, x + 3, ry + 3), fill=(255, 235, 180))
            d.line((x, ry, x, ry + 26), fill=(120, 100, 60), width=2)
        elif tb <= s < tb + LIFE:                   # burst
            for vx, vy, hue in parts:
                for j in range(4):                  # short trail
                    tau = s - tb - j * 0.03
                    if tau < 0:
                        continue
                    k = (1 - math.exp(-DRAG * tau)) / DRAG
                    px, py = x + vx * k, y + vy * k + 0.5 * G * tau * tau
                    fade = max(0.0, 1 - tau / LIFE) * (1 - j * 0.25)
                    r, g, b = colorsys.hsv_to_rgb(hue, 0.85, fade)
                    rad = 3 - j * 0.5
                    d.ellipse((px - rad, py - rad, px + rad, py + rad),
                              fill=(int(r * 255), int(g * 255), int(b * 255)))
    return ImageChops.add(layer, layer.filter(ImageFilter.GaussianBlur(6)))

ff = subprocess.Popen(
    [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
     "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264",
     "-pix_fmt", "yuv420p", "-movflags", "+faststart", "timestamp.mp4"],
    stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

for i in range(N):
    s = i * TOTAL / (N - 1)                          # video time; last frame = 13.0 s
    if s < HOLD_AT:
        c = s                                        # running toward 8:56:57
    elif s < HOLD_AT + HOLD_LEN:
        c = HOLD_AT                                  # frozen at 8:56:57.00
    else:
        c = s - HOLD_LEN                             # resumes to 8:57:00
    c = min(c, RUN)
    img = fireworks(s)
    d = ImageDraw.Draw(img)
    center(d, 90, "October 06", f_title, (255, 255, 255))
    hms, ap = fmt(START + int(c + 1e-9))
    clock(d, 260, hms, min(int((c % 1) * 100 + 1e-6), 99) if c < RUN else 0, ap)
    d.rounded_rectangle((190, 540, 1090, 560), 10, fill=(50, 50, 50))
    d.rounded_rectangle((190, 540, 190 + 900 * c / RUN, 560), 10, fill=(255, 255, 255))
    ff.stdin.write(img.tobytes())

ff.stdin.close(); ff.wait()
