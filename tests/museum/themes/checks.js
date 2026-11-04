// Prüfungen eines Themas im Browser (Seitenkontext). Gibt { name, errors: [...], stats } zurück.
const FRONT = 2.0; // Freifläche vor Türen (m)

function wallGeom(room, door) {
  const { x0, z0, x1, z1 } = room;
  return {
    n: { p: (t, d) => [t, z0 + d], dir: [0, -1] }, s: { p: (t, d) => [t, z1 - d], dir: [0, 1] },
    w: { p: (t, d) => [x0 + d, t], dir: [-1, 0] }, e: { p: (t, d) => [x1 - d, t], dir: [1, 0] },
  }[door.wall];
}

function rayHits(THREE, group, from, to) {
  const o = new THREE.Vector3(...from), t = new THREE.Vector3(...to);
  const dir = t.clone().sub(o);
  const len = dir.length();
  const rc = new THREE.Raycaster(o, dir.normalize(), 0, len);
  return rc.intersectObject(group, true).length;
}

function checkDoors(THREE, room, group, errors) {
  for (const door of room.doors) {
    const g = wallGeom(room, door);
    const y = Math.min(1.4, door.height / 2);
    const at = (t, d, yy) => { const [x, z] = g.p(t, d); return [x, yy, z]; };
    const hit = rayHits(THREE, group, at(door.center, 1.2, y), at(door.center, -1.2, y));
    if (hit) errors.push(`Ray durch Türmitte (${door.wall}@${door.center}) trifft ${hit} Fläche(n)`);
    const hitEdge = rayHits(THREE, group, at(door.center + door.width / 2 + 0.4, 1.2, y), at(door.center + door.width / 2 + 0.4, -1.2, y));
    if (!hitEdge) errors.push(`Neben der Tür (${door.wall}) fehlt die Wand`);
    const hitTop = rayHits(THREE, group, at(door.center, 1.2, door.height + 0.4), at(door.center, -1.2, door.height + 0.4));
    if (!hitTop) errors.push(`Über der Tür (${door.wall}) fehlt der Sturz`);
    const hitSide = rayHits(THREE, group, at(door.center + door.width / 2 - 0.05, 1.2, y), at(door.center + door.width / 2 - 0.05, -1.2, y));
    if (hitSide) errors.push(`Türöffnung (${door.wall}) ist enger als door.width`);
  }
}

function inRect(r, x, z, pad) {
  return x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
}

function checkObstacles(room, obstacles, errors) {
  if (!Array.isArray(obstacles)) { errors.push('obstacles ist kein Array'); return; }
  for (const o of obstacles) {
    if (!(o.x0 < o.x1 && o.z0 < o.z1)) errors.push(`Hindernis ungültig ${JSON.stringify(o)}`);
    if (o.x0 < room.x0 || o.x1 > room.x1 || o.z0 < room.z0 || o.z1 > room.z1) errors.push(`Hindernis außerhalb ${JSON.stringify(o)}`);
  }
  const fronts = room.doors.map((d) => {
    const g = wallGeom(room, d);
    const [xa, za] = g.p(d.center - d.width / 2, 0), [xb, zb] = g.p(d.center + d.width / 2, FRONT);
    return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb), pt: g.p(d.center, 1.0) };
  });
  fronts.forEach((f, i) => {
    for (const o of obstacles) {
      if (o.x0 < f.x1 && o.x1 > f.x0 && o.z0 < f.z1 && o.z1 > f.z0) errors.push(`Hindernis blockiert Tür ${i}`);
    }
    for (let j = i + 1; j < fronts.length; j++) {
      const a = f.pt, b = fronts[j].pt;
      for (let s = 0; s <= 24; s++) {
        const x = a[0] + (b[0] - a[0]) * s / 24, z = a[1] + (b[1] - a[1]) * s / 24;
        if (obstacles.some((o) => inRect(o, x, z, 1.0))) { errors.push(`Hindernis auf Achse Tür ${i}-${j}`); break; }
      }
    }
  });
}

function checkFrame(THREE, frame, errors) {
  for (const [w, h] of [[0.6, 0.6], [1.2, 1.6], [2.8, 1.9], [4.0, 2.4]]) {
    const obj = frame(w, h);
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    if (bb.max.z > 0.12 + 1e-6) errors.push(`frame(${w},${h}) tiefer als 0,12 m: ${bb.max.z.toFixed(3)}`);
    if (bb.min.z < -1e-4) errors.push(`frame(${w},${h}) ragt hinter die Bildebene: ${bb.min.z.toFixed(3)}`);
    if (bb.max.x - bb.min.x < w || bb.max.y - bb.min.y < h) errors.push(`frame(${w},${h}) kleiner als das Bild`);
    if (bb.max.x - bb.min.x > w + 1.2 || bb.max.y - bb.min.y > h + 1.2) errors.push(`frame(${w},${h}) unplausibel groß`);
    let meshes = 0;
    obj.traverse((o) => { if (o.isMesh) meshes++; });
    if (meshes > 3) errors.push(`frame hat ${meshes} Meshes`);
    for (const [px, py] of [[0, 0], [w / 2 - 0.03, h / 2 - 0.03], [-w / 2 + 0.03, -h / 2 + 0.03]]) {
      const rc = new THREE.Raycaster(new THREE.Vector3(px, py, 1), new THREE.Vector3(0, 0, -1), 0, 2);
      if (rc.intersectObject(obj, true).length) errors.push(`frame(${w},${h}) verdeckt die Bildfläche bei ${px.toFixed(2)},${py.toFixed(2)}`);
    }
  }
}

function checkPlaque(THREE, plaque, errors) {
  const cases = [['Kurz', ''], ['Strand bei Sonnenuntergang', '12. Juni 2021'],
    ['Ein sehr langer Titel für eine Erinnerung an einen schönen Tag am Meer mit Freunden', '3. August 2019']];
  for (const [t, d] of cases) {
    const obj = plaque(t, d);
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(obj);
    const sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    if (sz.x > 0.6 + 1e-6 || sz.y > 0.2 + 1e-6) errors.push(`plaque zu groß ${sz.x.toFixed(3)}x${sz.y.toFixed(3)}`);
    if (sz.z > 0.12) errors.push(`plaque zu tief ${sz.z.toFixed(3)}`);
    if (Math.abs(c.x) > 0.03 || Math.abs(c.y) > 0.03) errors.push(`plaque nicht zentriert ${c.x.toFixed(3)},${c.y.toFixed(3)}`);
    if (bb.min.z < -1e-4) errors.push('plaque ragt hinter die Wandebene');
  }
}

function checkScene(THREE, room, group, errors, stats) {
  let meshes = 0, lights = 0;
  const box = new THREE.Box3();
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      if (o.castShadow || o.receiveShadow) errors.push('Mesh mit Schatten');
      box.expandByObject(o);
    }
    if (o.isLight) { lights++; if (o.castShadow) errors.push('Licht mit Schatten'); }
  });
  stats.meshes = meshes; stats.lights = lights;
  stats.triangles = 0;
  group.traverse((o) => { if (o.isMesh) stats.triangles += o.geometry.attributes.position.count / 3; });
  if (meshes > 60) errors.push(`${meshes} Meshes (max. 60)`);
  if (lights > 1) errors.push(`${lights} Lichter (max. 1)`);
  const T = 0.16;
  if (box.min.x < room.x0 - T || box.max.x > room.x1 + T || box.min.z < room.z0 - T || box.max.z > room.z1 + T) {
    errors.push(`Geometrie außerhalb des Raums: ${box.min.toArray().map((v) => v.toFixed(2))} .. ${box.max.toArray().map((v) => v.toFixed(2))}`);
  }
  if (box.min.y < -0.01 || box.max.y > room.height + 0.01) errors.push(`Höhe außerhalb 0..${room.height}: ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)}`);
}

export function runChecks(THREE, buildTheme, name, room) {
  const errors = [], stats = {};
  const t0 = performance.now();
  const theme = buildTheme(name, room);
  stats.buildMs = Math.round(performance.now() - t0);
  const keys = Object.keys(theme).sort().join(',');
  if (keys !== 'frame,group,obstacles,plaque') errors.push(`Rückgabe-Schlüssel: ${keys}`);
  checkScene(THREE, room, theme.group, errors, stats);
  checkDoors(THREE, room, theme.group, errors);
  checkObstacles(room, theme.obstacles, errors);
  checkFrame(THREE, theme.frame, errors);
  checkPlaque(THREE, theme.plaque, errors);
  stats.obstacles = theme.obstacles.length;
  return { name, errors, stats };
}
