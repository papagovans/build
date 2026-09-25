# Procedural studio light map (equirectangular Radiance .hdr): a big soft key
# light high on one side, a weaker fill opposite, warm ceiling, dark floor.
# Directional light is what makes a model read as photographed, not drawn.
import math, struct
W, H = 512, 256
def light(d, c, spread):  # soft area light around direction c
    dot = sum(a*b for a,b in zip(d,c)); return max(0.0, dot) ** spread
KEY  = (math.cos(math.radians(28))*math.cos(math.radians(35)), math.sin(math.radians(28)), math.cos(math.radians(28))*math.sin(math.radians(35)))
FILL = (-0.8, 0.35, -0.45)
rows = []
for y in range(H):
    phi = math.pi * (0.5 - (y + 0.5) / H)          # +90 top .. -90 bottom
    row = []
    for x in range(W):
        th = 2 * math.pi * (x + 0.5) / W
        d = (math.cos(phi)*math.cos(th), math.sin(phi), math.cos(phi)*math.sin(th))
        up = max(0.0, d[1])
        base = 0.22 + 0.18*up if d[1] > 0 else 0.12 + 0.05*(1+d[1])   # sky vs floor
        k = 7.0 * light(d, KEY, 40); f = 1.6 * light(d, FILL, 10)
        r = base*1.00 + k*1.00 + f*0.85
        g = base*0.97 + k*0.96 + f*0.92
        b = base*0.92 + k*0.90 + f*1.00
        row.append((r, g, b))
    rows.append(row)
def rgbe(r, g, b):
    v = max(r, g, b)
    if v < 1e-32: return b'\0\0\0\0'
    m, e = math.frexp(v); s = m * 256.0 / v
    return bytes((int(r*s), int(g*s), int(b*s), e + 128))
with open('public/models/studio.hdr', 'wb') as f:
    f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {H} +X {W}\n'.encode())
    for row in rows: f.write(b''.join(rgbe(*p) for p in row))
print('ok')
