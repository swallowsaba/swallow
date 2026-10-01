import math, random, json, sys
from PIL import Image, ImageDraw, ImageFilter
S = 2
W, H = 1080, 772
TW, TH = 15, 7.5
HS = 0.62            # 高さの縮尺
OX, OY = 540, 36
N = 40

def run(stage):
    rnd = random.Random(21)
    img = Image.new('RGB', (W*S, H*S), (70, 118, 156))
    d = ImageDraw.Draw(img, 'RGBA')
    def iso(x, y, z=0): return ((OX + (x-y)*TW)*S, (OY + (x+y)*TH - z*HS)*S)
    def hexc(c, a=255):
        c = c.lstrip('#'); return (int(c[0:2],16), int(c[2:4],16), int(c[4:6],16), a)
    def shade(c, f):
        r,g,b,a = hexc(c) if isinstance(c,str) else c
        return (max(0,min(255,int(r*f))), max(0,min(255,int(g*f))), max(0,min(255,int(b*f))), a)
    def P(pts, fill): d.polygon([iso(*p) for p in pts], fill=fill)

    cx0, cy0 = 20, 19
    def radius(th): return 18.5 + 1.6*math.sin(3*th+0.4) + 1.0*math.sin(5*th+1.7) + 0.6*math.sin(9*th+0.3)
    land = [(cx0 + radius(t)*math.cos(t), cy0 + radius(t)*math.sin(t)) for t in [i/360*2*math.pi for i in range(360)]]
    d.polygon([(px, py+12*S) for px,py in [iso(x,y) for x,y in land]], fill=hexc('#3d5526'))
    d.polygon([iso(x,y) for x,y in land], fill=hexc('#d9cfa8'))
    inner = []
    for x,y in land:
        th = math.atan2(y-cy0, x-cx0); r = radius(th)-0.6
        inner.append((cx0+r*math.cos(th), cy0+r*math.sin(th)))
    d.polygon([iso(x,y) for x,y in inner], fill=hexc('#7a9a52'))
    def on_land(x, y, m=1.2): return math.hypot(x-cx0, y-cy0) < radius(math.atan2(y-cy0, x-cx0)) - m

    def ribbon(pts, w, fill):
        L, R = [], []
        for i in range(len(pts)):
            a = pts[max(0,i-1)]; b = pts[min(len(pts)-1,i+1)]
            dx, dy = b[0]-a[0], b[1]-a[1]; l = math.hypot(dx,dy) or 1
            nx, ny = -dy/l, dx/l
            L.append((pts[i][0]+nx*w, pts[i][1]+ny*w)); R.append((pts[i][0]-nx*w, pts[i][1]-ny*w))
        d.polygon([iso(*p) for p in L + R[::-1]], fill=fill)

    def river_c(t): return (3 + t*38, 30 + 4.5*math.sin(t*math.pi*2.2+0.6) - t*10)
    riv = [p for p in [river_c(i/239) for i in range(240)] if on_land(p[0], p[1], 0.2)]
    ribbon(riv, 1.95, hexc('#cdbf95')); ribbon(riv, 1.5, hexc('#4f7fa3')); ribbon(riv, 0.8, hexc('#5a8cb2'))
    def dist_to(pts, x, y): return min(math.hypot(x-a, y-b) for a,b in pts[::3])

    # スタジアムと施設の位置
    SC = (20.5, 15.5)
    facilities = [
        ('shell', 'シェル道場', (13.5, 11.5), 1, '#1f7a4d', 18),
        ('git',   'Git 資料室', (27.5, 10.5), 2, '#c46a1c', 22),
        ('k8s',   'k8s 訓練場', (28.5, 21.5), 2, '#1a6fd6', 34),
        ('net',   '通信室',     (12.5, 21.5), 3, '#7a3fd0', 26),
        ('gh',    'GitHub 会議室', (21.5, 25.5), 3, '#2b3a4f', 20),
    ]
    # 開発の広がり
    reach = {1: 7.5, 2: 12.5, 3: 30}[stage]
    maxh  = {1: 18, 2: 95, 3: 250}[stage]

    # 道路（格子）
    def road_cell(x, y): return x % 7 == 0 or y % 7 == 0
    for x in range(N):
        for y in range(N):
            if not road_cell(x, y) or not on_land(x+.5, y+.5, 1.0): continue
            if math.hypot(x+.5-SC[0], y+.5-SC[1]) > reach + 3: continue
            wet = dist_to(riv, x+.5, y+.5) < 1.8
            P([(x,y),(x+1,y),(x+1,y+1),(x,y+1)], hexc('#9a8a70') if wet else hexc('#8b8c88'))

    # 大通り（段階 2 から）
    if stage >= 2:
        def blvd_c(t): return (8 + 22*t + 3.0*math.sin(t*math.pi*1.6), 5 + 28*t - 3.5*math.sin(t*math.pi*1.3+0.5))
        blv = [p for p in [blvd_c(i/239) for i in range(240)] if on_land(p[0], p[1], 0.8) and math.hypot(p[0]-SC[0], p[1]-SC[1]) < reach + 4]
        if len(blv) > 4:
            ribbon(blv, 0.95, hexc('#6f706c')); ribbon(blv, 0.75, hexc('#8b8c88'))
    else:
        blv = []

    # 建物・木・スタジアム・施設を奥から手前へ
    objs = []
    blocked = [(SC, 4.6)] + [(f[2], 2.7) for f in facilities]
    for x in range(1, N-1):
        for y in range(1, N-1):
            cx, cy = x+.5, y+.5
            if road_cell(x, y) or not on_land(cx, cy, 1.4): continue
            if any(math.hypot(cx-p[0], cy-p[1]) < r for p, r in blocked): continue
            dd = math.hypot(cx-SC[0], cy-SC[1])
            if dist_to(riv, cx, cy) < 2.4:
                if rnd.random() < .45: objs.append(('tree', cx+rnd.uniform(-.3,.3), cy+rnd.uniform(-.3,.3), 0))
                continue
            if blv and dist_to(blv, cx, cy) < 1.5:
                if rnd.random() < .5: objs.append(('tree', cx, cy, 0))
                continue
            rr = rnd.random()
            if dd > reach:
                if rr < .22: objs.append(('tree', cx+rnd.uniform(-.3,.3), cy+rnd.uniform(-.3,.3), 0))
                continue
            h = max(10, int((250 - dd*12) * (0.35 + rnd.random()*0.9)))
            if dd > 15: h = rnd.choice([10, 13, 16])
            h = min(h, maxh)
            kind = 'round' if (h > 120 and rnd.random() < .22) else 'box'
            objs.append((kind, x, y, h))
    for key, name, (fx, fy), since, col, fh in facilities:
        if stage >= since: objs.append(('fac', fx, fy, (key, col, fh)))
        elif stage + 1 == since: objs.append(('site', fx, fy, 0))
    objs.append(('stadium', SC[0], SC[1], stage))
    objs.sort(key=lambda o: o[1] + o[2] if o[0] not in ('stadium',) else o[1] + o[2] + 1.5)

    def tree(x, y):
        bx, by = iso(x, y)
        d.ellipse([bx-6*S, by-2*S, bx+6*S, by+2*S], fill=(46,62,34,110))
        d.rectangle([bx-1*S, by-6*S, bx+1*S, by], fill=hexc('#5d4a34'))
        for ox, oy, r, c in [(0,-10,5.5,'#3f5f2c'), (-2,-12,4,'#4f7236'), (2,-13,3,'#5f8540')]:
            d.ellipse([bx+(ox-r)*S, by+(oy-r)*S, bx+(ox+r)*S, by+(oy+r)*S], fill=hexc(c))

    def box(x, y, h, base=None, inset=.12, roof=True):
        tall = h > 110
        base = base or (rnd.choice(['#8fa3b6','#7f93a6','#9aa9b5','#6f7f8f']) if tall else rnd.choice(['#c9c2b3','#b9b2a4','#d2cbbd','#a9a79f','#c2b39a']))
        x0, y0, x1, y1 = x+inset, y+inset, x+1-inset, y+1-inset
        d.polygon([iso(x1,y0), iso(x1+h*HS/38, y0-h*HS/76), iso(x1+h*HS/38, y1-h*HS/76), iso(x1,y1)], fill=(40,56,30,70))
        L, R, T = shade(base,.82), shade(base,.6), shade(base,1.08)
        P([(x0,y1),(x1,y1),(x1,y1,h),(x0,y1,h)], L)
        P([(x1,y1),(x1,y0),(x1,y0,h),(x1,y1,h)], R)
        P([(x0,y0,h),(x1,y0,h),(x1,y1,h),(x0,y1,h)], T)
        for f in range(max(1, h//8)):
            z = 4 + f*8
            if z + 4 > h: break
            for i in range(3):
                u = x0 + (i+.5)*(x1-x0)/3
                c = hexc('#ffcf7a') if rnd.random() < (.45 if tall else .3) else shade(L,.7)
                P([(u-.1,y1,z),(u+.1,y1,z),(u+.1,y1,z+4),(u-.1,y1,z+4)], c)
                v = y0 + (i+.5)*(y1-y0)/3
                c = hexc('#e8b867') if rnd.random() < (.35 if tall else .2) else shade(R,.72)
                P([(x1,v-.1,z),(x1,v+.1,z),(x1,v+.1,z+4),(x1,v-.1,z+4)], c)
        if roof and h <= 16:
            mx = (x0+x1)/2
            P([(x0,y1,h),(x1,y1,h),(mx,(y0+y1)/2,h+7)], hexc('#9a4d3e'))
            P([(x1,y1,h),(x1,y0,h),(mx,(y0+y1)/2,h+7)], hexc('#7b3c31'))

    def cyl(x, y, h):
        cx, cy, r = x+.5, y+.5, .42
        ring = [(cx + r*math.cos(t), cy + r*math.sin(t)) for t in [i/40*2*math.pi for i in range(40)]]
        base = '#8fa7ba'
        for i in range(40):
            a = ring[i]; b = ring[(i+1) % 40]; ang = (i+.5)/40*2*math.pi
            if math.sin(ang + math.pi/4) < -0.2: continue
            lit = .55 + .4*max(0, math.cos(ang - math.pi*0.15))
            P([(a[0],a[1]),(b[0],b[1]),(b[0],b[1],h),(a[0],a[1],h)], shade(base, lit))
        d.polygon([iso(p[0], p[1], h) for p in ring], fill=shade(base, 1.12))

    def facility(x, y, key, col, h):
        # 2x2 の施設。平屋根＋看板の色帯＋屋上の目印
        for dx in (0, 1):
            for dy in (0, 1):
                pass
        x0, y0, x1, y1 = x-1+.1, y-1+.1, x+1-.1, y+1-.1
        d.polygon([iso(x1,y0), iso(x1+.8, y0-.4), iso(x1+.8, y1-.4), iso(x1,y1)], fill=(40,56,30,70))
        wall = '#e8dcc4'
        P([(x0,y1),(x1,y1),(x1,y1,h),(x0,y1,h)], shade(wall,.86))
        P([(x1,y1),(x1,y0),(x1,y0,h),(x1,y1,h)], shade(wall,.66))
        P([(x0,y0,h),(x1,y0,h),(x1,y1,h),(x0,y1,h)], hexc(col))
        P([(x0,y1,h-6),(x1,y1,h-6),(x1,y1,h),(x0,y1,h)], hexc(col))
        P([(x1,y1,h-6),(x1,y0,h-6),(x1,y0,h),(x1,y1,h)], shade(col,.75))
        for i in range(4):
            u = x0 + (i+.5)*(x1-x0)/4
            P([(u-.14,y1,5),(u+.14,y1,5),(u+.14,y1,h-10),(u-.14,y1,h-10)], hexc('#ffcf7a'))
        mx, my = (x0+x1)/2, (y0+y1)/2
        if key == 'k8s':
            for k in range(6):
                a = k/6*2*math.pi
                d.line([iso(mx, my, h+2), iso(mx+.5*math.cos(a), my+.5*math.sin(a), h+2)], fill=(255,255,255,230), width=2*S)
        elif key == 'net':
            d.line([iso(mx, my, h), iso(mx, my, h+26)], fill=(80,80,80,255), width=2*S)
            bx, by = iso(mx, my, h+26); d.ellipse([bx-3*S, by-3*S, bx+3*S, by+3*S], fill=hexc('#e5645a'))
        elif key == 'git':
            P([(x0,y1,h),(x1,y1,h),(mx,my,h+12)], hexc('#b4574a')); P([(x1,y1,h),(x1,y0,h),(mx,my,h+12)], hexc('#8a3f35'))

    def site(x, y):
        x0, y0, x1, y1 = x-1+.1, y-1+.1, x+1-.1, y+1-.1
        P([(x0,y0),(x1,y0),(x1,y1),(x0,y1)], hexc('#b8a47c'))
        for u in (x0, x1):
            for v in (y0, y1):
                d.line([iso(u, v), iso(u, v, 20)], fill=hexc('#e0a32a'), width=int(1.4*S))
        d.line([iso(x0, y1, 20), iso(x1, y1, 20), iso(x1, y0, 20)], fill=hexc('#e0a32a'), width=int(1.4*S))
        # クレーン
        d.line([iso(x1-.2, y0+.2), iso(x1-.2, y0+.2, 48)], fill=hexc('#f2b632'), width=2*S)
        d.line([iso(x1-.2, y0+.2, 48), iso(x0-.6, y0+.2, 48)], fill=hexc('#f2b632'), width=2*S)

    def stadium(x, y, st):
        rx, ry = {1: (2.2, 1.7), 2: (2.8, 2.2), 3: (3.4, 2.7)}[st]
        hh = {1: 10, 2: 18, 3: 28}[st]
        ring = [(x + rx*math.cos(t), y + ry*math.sin(t)) for t in [i/96*2*math.pi for i in range(96)]]
        inner = [(x + rx*.72*math.cos(t), y + ry*.72*math.sin(t)) for t in [i/96*2*math.pi for i in range(96)]]
        # 影
        d.polygon([(px+10*S, py+4*S) for px,py in [iso(*p) for p in ring]], fill=(30,44,24,90))
        # 外壁（手前半分）
        for i in range(96):
            a = ring[i]; b = ring[(i+1) % 96]; ang = (i+.5)/96*2*math.pi
            if math.sin(ang + math.pi/4) < -0.15: continue
            lit = .6 + .35*max(0, math.cos(ang - math.pi*0.15))
            P([(a[0],a[1]),(b[0],b[1]),(b[0],b[1],hh),(a[0],a[1],hh)], shade('#c9ced6', lit))
        # 観客席（上面）→ 紺と金の帯
        d.polygon([iso(p[0], p[1], hh) for p in ring], fill=hexc('#1b2f52'))
        mid = [(x + rx*.86*math.cos(t), y + ry*.86*math.sin(t)) for t in [i/96*2*math.pi for i in range(96)]]
        d.line([iso(p[0], p[1], hh) for p in mid] + [iso(mid[0][0], mid[0][1], hh)], fill=hexc('#f2b632'), width=int(1.6*S))
        # ピッチ
        d.polygon([iso(p[0], p[1], hh*.35) for p in inner], fill=hexc('#2e8a54'))
        for k in range(-3, 4):
            if k % 2 == 0:
                band = [(x + rx*.72*math.cos(t), y + ry*.72*math.sin(t)) for t in [i/96*2*math.pi for i in range(96)]]
        d.line([iso(x-rx*.5, y, hh*.35), iso(x+rx*.5, y, hh*.35)], fill=(255,255,255,200), width=S)
        cc = [(x + .35*math.cos(t), y + .3*math.sin(t)) for t in [i/32*2*math.pi for i in range(33)]]
        d.line([iso(p[0], p[1], hh*.35) for p in cc], fill=(255,255,255,200), width=S)
        # 照明塔（段階 2 から）
        if st >= 2:
            for t in (math.pi*1.25, math.pi*1.75, math.pi*.25, math.pi*.75):
                px, py = x + rx*1.05*math.cos(t), y + ry*1.05*math.sin(t)
                d.line([iso(px, py), iso(px, py, hh+30)], fill=hexc('#8a8f99'), width=int(1.6*S))
                bx, by = iso(px, py, hh+30)
                d.rectangle([bx-4*S, by-3*S, bx+4*S, by+1*S], fill=hexc('#fff4c2'))
        # 屋根（段階 3）
        if st >= 3:
            top = [(x + rx*1.02*math.cos(t), y + ry*1.02*math.sin(t)) for t in [i/96*2*math.pi for i in range(96)]]
            inn = [(x + rx*.82*math.cos(t), y + ry*.82*math.sin(t)) for t in [i/96*2*math.pi for i in range(96)]]
            poly = [iso(p[0], p[1], hh+10) for p in top] + [iso(p[0], p[1], hh+10) for p in inn[::-1]]
            d.polygon(poly, fill=(236,240,246,190))

    for o in objs:
        k = o[0]
        if k == 'tree': tree(o[1], o[2])
        elif k == 'round': cyl(o[1], o[2], o[3])
        elif k == 'box': box(o[1], o[2], o[3])
        elif k == 'fac': facility(o[1], o[2], *o[3])
        elif k == 'site': site(o[1], o[2])
        elif k == 'stadium': stadium(o[1], o[2], o[3])

    img = img.resize((W, H), Image.LANCZOS)
    glow = img.point(lambda v: 255 if v > 228 else 0).filter(ImageFilter.GaussianBlur(2.5))
    img = Image.blend(img, Image.composite(glow, img, glow.convert('L')), 0.15)
    vig = Image.radial_gradient('L').resize((W, H)).point(lambda v: int(min(255, max(0, (v-120)*1.4))*0.45))
    img = Image.composite(Image.new('RGB', (W, H), (14, 27, 46)), img, vig)
    img.save(f'town{stage}.png', optimize=True)

    # 名札の位置（画像座標）
    def pos(x, y, z): px, py = iso(x, y, z); return [round(px/S), round(py/S)]
    stadium_h = {1: 10, 2: 18, 3: 28}[stage]
    labels = {'stadium': pos(SC[0], SC[1], stadium_h + 36)}
    for key, name, (fx, fy), since, col, fh in facilities:
        if stage >= since: labels[key] = pos(fx, fy, fh + 14)
        elif stage + 1 == since: labels[key] = pos(fx, fy, 60)
    return labels

out = {s: run(s) for s in (1, 2, 3)}
json.dump(out, open('town_labels.json', 'w'))
print(json.dumps(out))
