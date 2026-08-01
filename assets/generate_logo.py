#!/usr/bin/env python3
"""
PhysBox logo generator
======================
Draws the PhysBox mark from geometry and writes two files next to this script:

    physbox_logo2.svg   real vector paths + linear gradients, no embedded raster
    physbox_logo2.png   283x263 RGBA, rendered from the same geometry

The mark is an isometric cube -- three rhombic faces, each inset to leave a
frame band -- overlaid with a phi: a ring and a full-height stem. The cube's
three internal edges show as hairlines. Everything below is described by the
constants in section 1; nothing is traced at run time and nothing is embedded.

One model drives both outputs. The SVG gets the silhouette as path data and
paints it with clipped gradients; the PNG rasterises the same signed-distance
field at 4x. Needs numpy; the PNG additionally needs PIL.

Run:  python3 generate_logo.py
"""

import math
import os

import numpy as np

# ==========================================================================
# 1. Geometry
# ==========================================================================
# Fitted to the original artwork by minimising anti-aliased coverage error.
# All distances are canvas pixels.

W, H = 283, 263

CX, CY  = 141.011, 132.523     # centre of the cube
HW      = 106.936              # half width -> the two vertical hexagon sides
SH      =  60.362              # half height at the left/right shoulders
AH      = 122.669              # half height at the top/bottom apexes

FRAME   =  26.825              # band left around each face once it is inset
STEM_HW =  13.021              # half width of the phi stem
RING_RO =  61.712              # phi ring, outer radius
RING_RI =  35.696              # phi ring, inner radius
EDGE_HW =   1.896              # half width of the cube's internal hairlines

# The two apex notches. In the original the top-left and bottom-right face
# holes run past their inset corner towards the apex, leaving a narrow slot
# beside the stem. It is what makes the top and bottom of the mark read as
# 180-degree rotations of one another, so it is reproduced rather than
# smoothed away. The slot runs to the hexagon's own edge, which is what lets
# these two holes open onto the background.
NOTCH_DX = 22.995              # outer side of the slot, measured from CX

V = {
    'T':  (CX,      CY - AH),
    'UR': (CX + HW, CY - SH),
    'LR': (CX + HW, CY + SH),
    'B':  (CX,      CY + AH),
    'LL': (CX - HW, CY + SH),
    'UL': (CX - HW, CY - SH),
    'C':  (CX,      CY),
}
HEXAGON = [V[k] for k in ('T', 'UR', 'LR', 'B', 'LL', 'UL')]

# The three visible cube faces, as rhombi.
FACES = {
    'top':   [V['T'],  V['UR'], V['C'],  V['UL']],
    'left':  [V['UL'], V['C'],  V['B'],  V['LL']],
    'right': [V['C'],  V['UR'], V['LR'], V['B']],
}
FACE_ORDER = ('top', 'left', 'right')

# The three internal edges radiating from the centre.
EDGE_KEYS = ('C-UL', 'C-UR', 'C-B')
INTERNAL_EDGES = {
    'C-UL': (V['C'], V['UL']),
    'C-UR': (V['C'], V['UR']),
    'C-B':  (V['C'], V['B']),
}
EDGE_WIDTHS = {'C-UL': 2.8, 'C-UR': 2.8, 'C-B': 2.4}


def _centroid(poly):
    n = float(len(poly))
    return (sum(p[0] for p in poly) / n, sum(p[1] for p in poly) / n)


def _signed(p, q, inside, x, y, inset=0.0):
    """Signed distance to the line p->q, positive on `inside`'s side and
    moved inwards by `inset`."""
    dx, dy = q[0] - p[0], q[1] - p[1]
    n = math.hypot(dx, dy)
    a, b = -dy / n, dx / n
    c = -(a * p[0] + b * p[1])
    if a * inside[0] + b * inside[1] + c < 0:
        a, b, c = -a, -b, -c
    return (a * x + b * y + c) - inset


def _convex(sides, x, y):
    """Signed distance to an intersection of half planes; positive inside."""
    d = None
    for p, q, inside, inset in sides:
        s = _signed(p, q, inside, x, y, inset)
        d = s if d is None else np.minimum(d, s)
    return d


def _slab(p, q, half, x, y):
    """Signed distance to the rectangle swept along the segment p->q."""
    dx, dy = q[0] - p[0], q[1] - p[1]
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    perp = -uy * (x - p[0]) + ux * (y - p[1])
    along = ux * (x - p[0]) + uy * (y - p[1])
    return np.minimum(half - np.abs(perp), np.minimum(along, n - along))


def _polygon_sdf(poly, x, y):
    mid = _centroid(poly)
    return _convex([(poly[i], poly[(i + 1) % len(poly)], mid, 0.0)
                    for i in range(len(poly))], x, y)


def _is_internal(p, q):
    for a, b in INTERNAL_EDGES.values():
        if (p == a and q == b) or (p == b and q == a):
            return True
    return False


def _face_hole(face, x, y):
    """The background rhombus punched out of one cube face.

    Each side is inset by FRAME where it lies on the hexagon's silhouette, by
    STEM_HW where the stem covers it, and by EDGE_HW where only a hairline
    separates this face from its neighbour.
    """
    poly = FACES[face]
    mid = _centroid(poly)
    sides = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        on_stem = abs(p[0] - CX) < 1e-6 and abs(q[0] - CX) < 1e-6
        if on_stem:
            inset = STEM_HW
        elif _is_internal(p, q):
            inset = EDGE_HW
        else:
            inset = FRAME
        sides.append((p, q, mid, inset))
    return _convex(sides, x, y)


def _apex_notch(sign, x, y):
    """The slot beside the stem, running from the centre towards the top
    (sign=-1) or bottom (sign=+1) apex. It is left open-ended: the hexagon
    clips it, so it reaches exactly as far as the silhouette does and the
    hole it extends genuinely opens onto the background."""
    lo, hi = sorted((CX + sign * STEM_HW, CX + sign * NOTCH_DX))
    return _convex([
        ((lo, 0.0), (lo, 1.0), (hi, 0.0), 0.0),
        ((hi, 0.0), (hi, 1.0), (lo, 0.0), 0.0),
        ((0.0, CY), (1.0, CY), (0.0, CY + sign), 0.0),
    ], x, y)


def fields(x, y):
    """The three signed-distance fields the renderers need.

    shape  the mark itself, positive inside
    outer  the same with the enclosed holes filled in, so its zero level is
           the outer silhouette alone
    enc    the enclosed background holes, positive inside a hole

    The split matters because the artwork bevels the outer silhouette (a dark
    line plus a bright rim) but gives the hole edges only the dark line.
    """
    hexagon = _polygon_sdf(HEXAGON, x, y)

    top = _face_hole('top', x, y)
    left_of_stem = _signed((CX, 0.0), (CX, 1.0), (CX - 10.0, 0.0), x, y, STEM_HW)
    right_of_stem = _signed((CX, 0.0), (CX, 1.0), (CX + 10.0, 0.0), x, y, STEM_HW)

    # Holes that reach the exterior through an apex notch...
    reaches_out = np.maximum(
        np.maximum(np.minimum(top, left_of_stem), _apex_notch(-1, x, y)),
        np.maximum(_face_hole('right', x, y), _apex_notch(+1, x, y)))
    # ...and the two that stay enclosed.
    enclosed = np.maximum(np.minimum(top, right_of_stem),
                          _face_hole('left', x, y))

    # Everything drawn back on top of the holes.
    r = np.hypot(x - CX, y - CY)
    over = np.minimum(RING_RO - r, r - RING_RI)
    over = np.maximum(over, np.minimum(_slab(V['T'], V['B'], STEM_HW, x, y),
                                       hexagon))
    for p, q in INTERNAL_EDGES.values():
        over = np.maximum(over, np.minimum(_slab(p, q, EDGE_HW, x, y), hexagon))

    outer = np.maximum(np.minimum(hexagon, -reaches_out), over)
    shape = np.maximum(np.minimum(outer, -enclosed), over)
    enc = np.minimum(enclosed, -over)
    return {'shape': shape, 'outer': outer, 'enc': enc}


def silhouette_sdf(x, y):
    return fields(x, y)['shape']


# ==========================================================================
# 2. Palette
# ==========================================================================
# Nine regions -- {frame, ring, stem} x {top, left, right face}. Each is a
# ramp: project the pixel onto a unit direction, rescale the span (t0, t1) to
# 0..1, clamp, and interpolate the stops. That is precisely what an SVG
# linearGradient does, so one table drives both renderers and they cannot
# drift apart. The directions are the principal axis of a least-squares plane
# fit; the stops are then fitted along it with a smoothness prior, which also
# extrapolates the ends of the axis that no pixel data reaches.
# Residual rms against the original artwork is ~1.5 per channel.

REGION_RAMPS = {
    ('hex', 'top'):  (( 0.820998, -0.570931), (  -12.247,   161.554), (
        (173,  9, 99), (168, 20,106), (161, 36,114),
        (147, 57,126), (129, 81,138), (111,106,148),
        ( 94,129,156), ( 82,149,164), ( 70,168,172),
    )),   # rms 1.78
    ('ring', 'top'):  (( 0.850290, -0.526315), (   21.303,   111.636), (
        (172, 20,107), (165, 31,113), (159, 42,119),
        (152, 52,125), (144, 63,130), (135, 75,136),
        (126, 87,142), (117,100,147), (109,112,152),
    )),   # rms 1.74
    ('stem', 'top'):  (( 0.814928, -0.579562), (   32.563,   114.949), (
        (164, 38,118), (156, 48,123), (148, 58,128),
        (139, 69,134), (129, 82,139), (120, 94,144),
        (112,106,149), (103,118,154), ( 94,129,158),
    )),   # rms 1.49
    ('hex', 'left'): (( 0.683489, -0.729961), ( -116.984,    -4.419), (
        ( 78,  6, 57), ( 81,  8, 58), ( 85, 11, 60),
        ( 90, 13, 64), ( 98, 15, 67), (108, 18, 70),
        (117, 20, 73), (127, 22, 76), (137, 24, 79),
    )),   # rms 1.31
    ('ring', 'left'): (( 0.693016, -0.720922), (  -59.120,    -7.353), (
        (100, 13, 65), (103, 14, 66), (107, 15, 68),
        (110, 16, 69), (114, 17, 71), (117, 18, 72),
        (120, 19, 74), (123, 20, 76), (126, 20, 77),
    )),   # rms 1.17
    ('stem', 'left'): (( 0.559432, -0.828876), ( -133.260,   -31.226), (
        ( 83, 10, 58), ( 90, 12, 61), ( 96, 13, 63),
        (102, 15, 65), (108, 16, 67), (113, 17, 70),
        (118, 18, 72), (123, 19, 75), (129, 20, 77),
    )),   # rms 1.56
    ('hex', 'right'): (( 0.782077, -0.623182), (  -21.847,   148.383), (
        (145, 46,119), (130, 70,130), (116, 93,141),
        (102,116,151), ( 89,138,161), ( 77,160,171),
        ( 63,183,181), ( 50,203,188), ( 38,223,195),
    )),   # rms 1.45
    ('ring', 'right'): (( 0.699400, -0.714731), (  -29.528,    62.773), (
        (124, 79,138), (116, 93,144), (109,106,149),
        (102,120,155), ( 94,133,161), ( 85,147,166),
        ( 77,159,171), ( 69,171,176), ( 61,183,180),
    )),   # rms 1.33
    ('stem', 'right'): (( 0.631445, -0.775421), ( -107.995,    -0.389), (
        (159, 24,103), (150, 37,111), (140, 51,118),
        (131, 64,126), (124, 78,134), (116, 92,142),
        (109,106,148), (101,121,155), ( 93,136,161),
    )),   # rms 1.53
}

# The hairline highlights on the cube's internal edges do not vary linearly
# (they cross the ring), so each is a multi-stop ramp sampled from the centre
# outwards.
EDGE_STOPS = {
    'C-UL': [
        (110, 173, 188), (109, 135, 169), (109, 135, 169), (151, 121, 164),
        (151, 115, 164), (158,  99, 156), (161,  86, 153), (158,  82, 148),
        (186,  32, 117), (188,  30, 116), (179,  30, 112), (182,  29, 111),
        (176,  28, 108),
    ],
    'C-UR': [
        (106, 173, 187), (105, 150, 175), (104, 150, 175), ( 80, 195, 189),
        ( 80, 195, 189), ( 78, 198, 190), ( 75, 205, 192), ( 80, 194, 188),
        ( 60, 208, 192), ( 58, 206, 191), ( 53, 208, 189), ( 53, 208, 188),
        ( 54, 212, 190),
    ],
    'C-B': [
        ( 76, 202, 196), ( 76, 192, 191), ( 85, 176, 183), ( 98, 150, 174),
        (112, 133, 166), (125, 116, 156), (134,  91, 149), (150,  78, 143),
        (161,  60, 132), (180,  38, 122), (194,  22, 112), (188,  18, 105),
        (205,  16, 110),
    ],
}

# Bevel, as stroke layers hugging a contour: full stroke width, colour,
# opacity. Clipping to the shape keeps only the inner half of each stroke.
# The outer silhouette gets a two-step bright rim and a dark line; the hole
# edges get the dark line only -- haloing the holes as well is the single
# thing that most makes a reconstruction of this mark look wrong.
BEVEL_OUTER = (
    (6.0, (255, 255, 255), 0.0129),
    (4.0, (255, 255, 255), 0.0315),
    (2.0, (0, 0, 0),       0.3535),
)
BEVEL_HOLE = (
    (2.0, (0, 0, 0),       0.2424),
)


def _ramp(stops, t):
    """Interpolate a stop list at parameter t in 0..1."""
    arr = np.asarray(stops, float)
    ts = np.linspace(0.0, 1.0, len(arr))
    return [np.interp(t, ts, arr[:, c]) for c in range(3)]


def _project(axis, span, x, y):
    (ux, uy), (t0, t1) = axis, span
    return np.clip((ux * x + uy * y - t0) / (t1 - t0), 0.0, 1.0)


# ==========================================================================
# 3. PNG renderer
# ==========================================================================

def render_png(path, scale=1.0, supersample=4):
    from PIL import Image

    ss = supersample
    w, h = int(round(W * scale)), int(round(H * scale))
    yy, xx = np.mgrid[0:h * ss, 0:w * ss]
    x = (xx + 0.5) / (ss * scale)
    y = (yy + 0.5) / (ss * scale)

    f = fields(x, y)
    inside = f['shape'] > 0
    r = np.hypot(x - CX, y - CY)

    rgb = np.zeros(x.shape + (3,), float)
    for face in FACE_ORDER:
        fm = (_polygon_sdf(FACES[face], x, y) >= 0) & inside
        for name, m in (('hex',  fm),
                        ('ring', fm & (r <= RING_RO) & (r >= RING_RI)),
                        ('stem', fm & (np.abs(x - CX) <= STEM_HW))):
            if not m.any():
                continue
            axis, span, stops = REGION_RAMPS[(name, face)]
            vals = _ramp(stops, _project(axis, span, x[m], y[m]))
            for c in range(3):
                rgb[..., c][m] = vals[c]

    for key in EDGE_KEYS:
        p, q = INTERNAL_EDGES[key]
        m = (_slab(p, q, EDGE_WIDTHS[key] / 2.0, x, y) > 0) & inside
        if not m.any():
            continue
        n2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
        t = np.clip((((x[m] - p[0]) * (q[0] - p[0])
                      + (y[m] - p[1]) * (q[1] - p[1])) / n2), 0.0, 1.0)
        vals = _ramp(EDGE_STOPS[key], t)
        for c in range(3):
            rgb[..., c][m] = vals[c]

    for dist, layers in ((f['outer'], BEVEL_OUTER), (-f['enc'], BEVEL_HOLE)):
        for width, colour, opacity in layers:
            band = inside & (dist < width / 2.0)
            for c in range(3):
                rgb[..., c][band] += (colour[c] - rgb[..., c][band]) * opacity

    alpha = np.where(inside, 1.0, 0.0)
    prem = rgb * alpha[..., None]
    acc_rgb = prem.reshape(h, ss, w, ss, 3).mean(axis=(1, 3))
    acc_a = alpha.reshape(h, ss, w, ss).mean(axis=(1, 3))
    out = np.zeros((h, w, 4))
    nz = acc_a > 0
    out[..., :3][nz] = acc_rgb[nz] / acc_a[nz][:, None]
    out[..., 3] = acc_a * 255.0

    Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(path)
    print('[PNG] %s  %dx%d' % (path, w, h))


# ==========================================================================
# 4. Silhouette outline: geometry -> path data
# ==========================================================================
# Marching squares over the signed-distance field, then simplify: straight
# runs collapse to line segments and runs sitting on a known radius collapse
# to real arcs, so the SVG stays smooth at any zoom.

_MS_CASES = {
    1: [(3, 0)], 2: [(0, 1)], 3: [(3, 1)], 4: [(1, 2)],
    5: [(3, 2), (1, 0)], 6: [(0, 2)], 7: [(3, 2)], 8: [(2, 3)],
    9: [(2, 0)], 10: [(0, 3), (2, 1)], 11: [(2, 1)], 12: [(1, 3)],
    13: [(1, 0)], 14: [(0, 3)],
}


def _marching_squares(field, ox, oy, step):
    f00, f10 = field[:-1, :-1], field[:-1, 1:]
    f11, f01 = field[1:, 1:],   field[1:, :-1]
    case = ((f00 > 0).astype(np.uint8)
            | ((f10 > 0).astype(np.uint8) << 1)
            | ((f11 > 0).astype(np.uint8) << 2)
            | ((f01 > 0).astype(np.uint8) << 3))
    jj, ii = np.meshgrid(np.arange(field.shape[1] - 1, dtype=float),
                         np.arange(field.shape[0] - 1, dtype=float))

    def cut(a, b):
        d = a - b
        return np.where(np.abs(d) < 1e-12, 0.5, a / np.where(d == 0, 1e-12, d))

    ends = {
        0: (jj + cut(f00, f10), ii),                    # top edge
        1: (jj + 1.0,           ii + cut(f10, f11)),    # right edge
        2: (jj + cut(f01, f11), ii + 1.0),              # bottom edge
        3: (jj,                 ii + cut(f00, f01)),    # left edge
    }

    segs = []
    for code, pairs in _MS_CASES.items():
        sel = case == code
        if not sel.any():
            continue
        for ea, eb in pairs:
            segs.append(np.stack([ends[ea][0][sel], ends[ea][1][sel],
                                  ends[eb][0][sel], ends[eb][1][sel]], 1))
    if not segs:
        return []
    segs = np.concatenate(segs, 0)
    segs[:, 0::2] = segs[:, 0::2] * step + ox
    segs[:, 1::2] = segs[:, 1::2] * step + oy

    def key(px, py):
        return (round(px, 5), round(py, 5))

    link = {}
    for ax, ay, bx, by in segs:
        link.setdefault(key(ax, ay), []).append((bx, by))
        link.setdefault(key(bx, by), []).append((ax, ay))

    loops, seen = [], set()
    for ax, ay, _bx, _by in segs:
        if key(ax, ay) in seen:
            continue
        loop, cur, prev = [(ax, ay)], (ax, ay), None
        seen.add(key(ax, ay))
        while True:
            nxt = [p for p in link.get(key(*cur), [])
                   if prev is None or key(*p) != key(*prev)]
            if not nxt or key(*nxt[0]) in seen:
                break
            prev, cur = cur, nxt[0]
            loop.append(cur)
            seen.add(key(*cur))
        if len(loop) > 8:
            loops.append(loop)
    return loops


def _rdp(pts, eps):
    pts = np.asarray(pts, float)
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        d = pts[j] - pts[i]
        length = math.hypot(d[0], d[1])
        if length < 1e-9:
            dev = np.hypot(*(pts[i + 1:j] - pts[i]).T)
        else:
            nrm = np.array([-d[1], d[0]]) / length
            dev = np.abs((pts[i + 1:j] - pts[i]) @ nrm)
        k = int(np.argmax(dev))
        if dev[k] > eps:
            keep[i + 1 + k] = True
            stack += [(i, i + 1 + k), (i + 1 + k, j)]
    return pts[keep]


def _emit_loop(loop, radii, arc_tol=0.35):
    if np.hypot(*(loop[0] - loop[-1])) > 1e-9:
        loop = np.vstack([loop, loop[0]])
    simple = _rdp(loop, 0.12)

    rad = np.hypot(simple[:, 0] - CX, simple[:, 1] - CY)
    on = np.zeros(len(simple), int)
    for idx, R in enumerate(radii, start=1):
        on[np.abs(rad - R) < arc_tol] = idx

    out = ['M %.2f %.2f' % (simple[0][0], simple[0][1])]
    i, n = 0, len(simple)
    while i < n - 1:
        j = i
        while j + 1 < n and on[j + 1] and on[j + 1] == on[i]:
            j += 1
        if on[i] and j - i >= 3:
            R = radii[on[i] - 1]
            ang = lambda p: math.atan2(p[1] - CY, p[0] - CX)
            a0, a1 = ang(simple[i]), ang(simple[j])
            mid = (ang(simple[(i + j) // 2]) - a0) % (2 * math.pi)
            ccw = (a1 - a0) % (2 * math.pi)
            # Which way round did the contour actually go?
            sweep = 1 if mid < ccw else 0
            span = ccw if sweep else (2 * math.pi - ccw)
            out.append('A %.3f %.3f 0 %d %d %.2f %.2f'
                       % (R, R, 1 if span > math.pi else 0, sweep,
                          simple[j][0], simple[j][1]))
            i = j
        else:
            out.append('L %.2f %.2f' % (simple[i + 1][0], simple[i + 1][1]))
            i += 1
    out.append('Z')
    return ' '.join(out)


def outline_paths(step=0.25):
    """(outer silhouette, hole contours) as SVG path data.

    The longest loop is the outer silhouette; every other loop encloses a
    hole. They are kept apart so the bevel can treat them differently.
    """
    pad = 2.0
    xs = np.arange(-pad, W + pad + step, step)
    ys = np.arange(-pad, H + pad + step, step)
    gx, gy = np.meshgrid(xs, ys)
    loops = _marching_squares(silhouette_sdf(gx, gy), xs[0], ys[0], step)
    loops.sort(key=len, reverse=True)
    emit = [_emit_loop(np.asarray(l), (RING_RO, RING_RI)) for l in loops]
    return emit[0], ' '.join(emit[1:])


# ==========================================================================
# 5. SVG writer
# ==========================================================================

def _gradient_def(gid, p0, p1, stops):
    """One emitter for both tables: an SVG gradient is a ramp between two
    points, which is exactly how the palette is stored, so nothing is
    approximated on the way out."""
    body = ''.join('<stop offset="%.4f" stop-color="#%02x%02x%02x"/>'
                   % (i / float(len(stops) - 1), *s)
                   for i, s in enumerate(stops))
    return ('<linearGradient id="%s" gradientUnits="userSpaceOnUse" '
            'x1="%.3f" y1="%.3f" x2="%.3f" y2="%.3f">%s</linearGradient>'
            % (gid, p0[0], p0[1], p1[0], p1[1], body))


def _poly_d(points):
    return 'M ' + ' L '.join('%.3f %.3f' % pt for pt in points) + ' Z'


def _ring_d():
    return ('M %.3f %.3f A %.3f %.3f 0 1 1 %.3f %.3f '
            'A %.3f %.3f 0 1 1 %.3f %.3f Z '
            'M %.3f %.3f A %.3f %.3f 0 1 0 %.3f %.3f '
            'A %.3f %.3f 0 1 0 %.3f %.3f Z'
            % (CX - RING_RO, CY, RING_RO, RING_RO, CX + RING_RO, CY,
               RING_RO, RING_RO, CX - RING_RO, CY,
               CX - RING_RI, CY, RING_RI, RING_RI, CX + RING_RI, CY,
               RING_RI, RING_RI, CX - RING_RI, CY))


def render_svg(path):
    outer, holes = outline_paths()
    outline = outer + ' ' + holes

    defs = ['<clipPath id="sil"><path clip-rule="evenodd" d="%s"/></clipPath>'
            % outline]
    for face in FACE_ORDER:
        defs.append('<clipPath id="f-%s"><path d="%s"/></clipPath>'
                    % (face, _poly_d(FACES[face])))
    for (name, face), ((ux, uy), (t0, t1), stops) in sorted(REGION_RAMPS.items()):
        defs.append(_gradient_def('g-%s-%s' % (name, face),
                                  (ux * t0, uy * t0), (ux * t1, uy * t1),
                                  stops))
    for key in EDGE_KEYS:
        p, q = INTERNAL_EDGES[key]
        defs.append(_gradient_def('g-%s' % key.lower(), p, q, EDGE_STOPS[key]))

    body = []
    for face in FACE_ORDER:
        body.append('<g clip-path="url(#f-%s)">' % face)
        body.append('  <rect x="0" y="0" width="%d" height="%d" '
                    'fill="url(#g-hex-%s)"/>' % (W, H, face))
        body.append('  <path d="%s" fill-rule="evenodd" '
                    'fill="url(#g-ring-%s)"/>' % (_ring_d(), face))
        body.append('  <rect x="%.3f" y="0" width="%.3f" height="%d" '
                    'fill="url(#g-stem-%s)"/>'
                    % (CX - STEM_HW, 2 * STEM_HW, H, face))
        body.append('</g>')
    for key in EDGE_KEYS:
        p, q = INTERNAL_EDGES[key]
        body.append('<path d="M %.3f %.3f L %.3f %.3f" stroke="url(#g-%s)" '
                    'stroke-width="%.2f" fill="none"/>'
                    % (p[0], p[1], q[0], q[1], key.lower(), EDGE_WIDTHS[key]))
    for d, layers in ((outer, BEVEL_OUTER), (holes, BEVEL_HOLE)):
        for width, colour, opacity in layers:
            body.append('<path d="%s" fill="none" stroke="#%02x%02x%02x" '
                        'stroke-width="%.2f" stroke-opacity="%.4f"/>'
                        % (d, colour[0], colour[1], colour[2],
                           width, opacity))

    svg = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
           'width="%d" height="%d">\n'
           '  <title>PhysBox</title>\n'
           '  <defs>\n    %s\n  </defs>\n'
           '  <g clip-path="url(#sil)">\n    %s\n  </g>\n'
           '</svg>\n'
           % (W, H, W, H, '\n    '.join(defs), '\n    '.join(body)))
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(svg)
    print('[SVG] %s  %.1f kB' % (path, len(svg) / 1024.0))


# ==========================================================================

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    render_svg(os.path.join(here, 'physbox_logo2.svg'))
    render_png(os.path.join(here, 'physbox_logo2.png'))


if __name__ == '__main__':
    main()
