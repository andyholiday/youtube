// Geometrie-Sammler: viele Formen werden zu EINEM Mesh gemerged (Handy: wenige Draw-Calls).
import * as THREE from 'three';

const tmp = new THREE.Color();

function rgba(c) {
  if (c === undefined || c === null) return [1, 1, 1, 1];
  if (Array.isArray(c)) { tmp.set(c[0]); return [tmp.r, tmp.g, tmp.b, c[1]]; }
  tmp.set(c);
  return [tmp.r, tmp.g, tmp.b, 1];
}

function normalOf(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** Planare UVs in Metern (Achse der größten Normalen), damit Texturen über Teile hinweg durchlaufen. */
function planar(v, n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  if (ay >= ax && ay >= az) return [v[0], v[2]];
  return ax >= az ? [v[2], v[1]] : [v[0], v[1]];
}

const EULER = new THREE.Euler();
const QUAT = new THREE.Quaternion();
/** Matrix aus Position, Euler-Drehung (rad) und Skalierung. */
export function xf(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  QUAT.setFromEuler(EULER.set(rx, ry, rz));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), QUAT, new THREE.Vector3(sx, sy, sz));
}

export class Batch {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.u = [];
    this.colored = false; this.alpha = false; this.uvFn = null;
  }

  get empty() { return this.p.length === 0; }

  /** Dreieck; o.n Normale, o.uvs [[u,v]x3], o.colors [color x3]. */
  tri(a, b, c, color, o = {}) {
    const n = o.n || normalOf(a, b, c);
    const cols = (o.colors || [color, color, color]).map(rgba);
    if (color != null || o.colors) this.colored = true;
    [a, b, c].forEach((v, i) => {
      if (cols[i][3] < 1) this.alpha = true;
      this.p.push(v[0], v[1], v[2]);
      this.n.push(n[0], n[1], n[2]);
      this.c.push(cols[i][0], cols[i][1], cols[i][2], cols[i][3]);
      const uv = o.uvs ? o.uvs[i] : (this.uvFn ? this.uvFn(v) : planar(v, n));
      this.u.push(uv[0], uv[1]);
    });
  }

  quad(a, b, c, d, color, o = {}) {
    const pick = (arr, ix) => arr && ix.map((i) => arr[i]);
    this.tri(a, b, c, color, { n: o.n, uvs: pick(o.uvs, [0, 1, 2]), colors: pick(o.colors, [0, 1, 2]) });
    this.tri(a, c, d, color, { n: o.n, uvs: pick(o.uvs, [0, 2, 3]), colors: pick(o.colors, [0, 2, 3]) });
  }

  /** Achsenparalleler Quader von (x0,y0,z0) bis (x1,y1,z1); faces = 'xXyYzZ' schaltet Seiten ab. */
  aabb(x0, y0, z0, x1, y1, z1, color, skip = '') {
    const f = (key, a, b, c, d, n) => { if (!skip.includes(key)) this.quad(a, b, c, d, color, { n }); };
    f('x', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    f('X', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    f('y', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    f('Y', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    f('z', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    f('Z', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
  }

  /** Box um Mittelpunkt. */
  box(w, h, d, x, y, z, color, skip) {
    this.aabb(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, color, skip);
  }

  /** Beliebige three-Geometrie (z. B. Zylinder, Kugel) mit Matrix und Vertexfarbe hinzufügen. */
  geo(geometry, matrix, color) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const k = rgba(color);
    if (color != null) this.colored = true;
    if (k[3] < 1) this.alpha = true;
    for (let i = 0; i < P.count; i++) {
      const v = [P.getX(i), P.getY(i), P.getZ(i)];
      const n = [N.getX(i), N.getY(i), N.getZ(i)];
      this.p.push(...v); this.n.push(...n); this.c.push(...k);
      this.u.push(...(U ? [U.getX(i), U.getY(i)] : planar(v, n)));
    }
    g.dispose();
  }

  /**
   * Rahmen um ein w×h-Rechteck als Profil-Sweep mit Gehrung. profile: [[d, z, color?], ...] von innen
   * (d = Abstand vom Bildrand, z = Höhe über der Bildebene) nach außen.
   */
  sweep(w, h, profile, color) {
    const hw = w / 2, hh = h / 2;
    const ring = (d, z) => [[-hw - d, -hh - d, z], [hw + d, -hh - d, z], [hw + d, hh + d, z], [-hw - d, hh + d, z]];
    for (let k = 0; k < profile.length - 1; k++) {
      const [d0, z0, c0] = profile[k], [d1, z1, c1] = profile[k + 1];
      if (d0 === d1 && z0 === z1) continue;
      const r0 = ring(d0, z0), r1 = ring(d1, z1);
      const col = c1 !== undefined ? c1 : (c0 !== undefined ? c0 : color);
      for (let s = 0; s < 4; s++) {
        const t = (s + 1) % 4;
        const colors = [c0 ?? color, c1 ?? color, c1 ?? color, c0 ?? color];
        this.quad(r0[s], r1[s], r1[t], r0[t], col, { colors });
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.colored) {
      const size = this.alpha ? 4 : 3;
      const out = [];
      for (let i = 0; i < this.c.length; i += 4) {
        out.push(this.c[i], this.c[i + 1], this.c[i + 2]);
        if (this.alpha) out.push(this.c[i + 3]);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(out, size));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  mesh(material) {
    return new THREE.Mesh(this.build(), material);
  }
}
