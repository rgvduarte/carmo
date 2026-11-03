// The 3D t-shirt of the merch page (/admin/merch/). admin-merch.js imports this module only once the page has drawn and
// the browser has WebGL 2, so three.js, the model and the textures are never fetched before (and never without 3D).
// - The tee: shirt_baked.glb (admin/merch/model/, ATTRIBUTION.txt there), the cloth in the chosen colour, and the prints
//   as decals at their real size: 1 mm = 0.30 / 370 units (the body is 0.30 units wide below the arms, a size M tee
//   about 37 cm there). Back: centred, the top 9 cm under the collar seam; chest: left of the wearer, the centre 10 cm
//   from the middle, the top 16.5 cm under the shoulder. The same placement as the phase 1 renders and the print kit.
// - Memory (an iPhone must not choke): pixel ratio at most 2 and no MSAA from 2 pixels per point, only the textures of
//   the tee on screen (the others are given back to the GPU at once), a frame drawn only when something moves, nothing
//   drawn while the stage is off screen or the tab hidden, and dispose() gives everything back (the page calls it on
//   pagehide).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeContext, release } from './gl3d.js';

const MM = 0.30 / 370;                          // model units per millimetre
const HPS_Y = 0.255, BACK_COLLAR_Y = 0.236;      // shoulder top and the back collar seam at the centre line
const BOX = { w: 0.56, h: 0.62, cy: -0.045 };    // the model's box (sleeves included), and its centre height
const FOV = 24, TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
export const VIEWS = { frente: 0, costas: 180, '34': -38, '34c': 148 };   // degrees the viewer walks round the tee
const SPIN = THREE.MathUtils.degToRad(18);       // auto-rotation, per second
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export async function createViewer(host, { model, onLost } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const ctx = makeContext({ antialias: dpr < 2 });   // throws a GLFail when the GPU hands out no (or a dead) context
  const canvas = ctx.canvas;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: ctx.gl, alpha: true, antialias: dpr < 2, preserveDrawingBuffer: false });
  } catch (e) { release(ctx); throw e; }
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envRT = pmrem.fromScene(room, 0.04);
  room.dispose(); pmrem.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-1.2, 1.6, 2.0);
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.6); fill.position.set(1.6, 0.4, 1.2);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(0.4, 1.2, -2.2);
  scene.add(key, fill, rim);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);

  // soft contact shadow under the tee
  const sh = document.createElement('canvas'); sh.width = sh.height = 128;
  { const g = sh.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(0,0,0,.30)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  const shadowTex = new THREE.CanvasTexture(sh);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.22), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.40; scene.add(shadow);

  const tee = new THREE.Group(); scene.add(tee);
  let gltf;
  try { gltf = await new GLTFLoader().loadAsync(model); } catch (e) {
    shadow.geometry.dispose(); shadow.material.dispose(); shadowTex.dispose(); envRT.dispose(); release(renderer);
    throw e;
  }
  const src = gltf.scene.getObjectByName('T_Shirt_male');
  const o = src.material;
  const cloth = new THREE.MeshPhysicalMaterial({
    color: 0x17171a, roughness: 0.94, sheen: 1.0, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x4a4a50),
    normalMap: o.normalMap, normalScale: o.normalScale.clone().multiplyScalar(0.8), aoMap: o.aoMap, aoMapIntensity: 1,
    side: THREE.DoubleSide,
  });
  const baseNormal = o.normalScale.clone();
  o.dispose();
  const mesh = new THREE.Mesh(src.geometry, cloth);
  tee.add(mesh);
  tee.updateMatrixWorld(true);

  const ray = new THREE.Raycaster();
  function surface(x, y, fromFront) {
    ray.set(new THREE.Vector3(x, y, fromFront ? 1 : -1), new THREE.Vector3(0, 0, fromFront ? -1 : 1));
    const hit = ray.intersectObject(mesh, false)[0];
    return hit ? hit.point : new THREE.Vector3(x, y, fromFront ? 0.13 : -0.12);
  }
  // a print as a decal; built with the tee unrotated (DecalGeometry works in world space), then carried by the tee
  function decal(map, size, where, tech) {
    const w = size.w * MM, h = size.h * MM, front = where === 'front';
    const yTop = front ? HPS_Y - 165 * MM : BACK_COLLAR_Y - (90 + (size.top || 0)) * MM;
    const x = front ? 72 * MM : 0;   // 10 cm along the chest is about 7 cm seen from the front
    const p = surface(x, yTop - h / 2, front);
    const geo = new DecalGeometry(mesh, p, new THREE.Euler(0, front ? 0 : Math.PI, 0), new THREE.Vector3(w, h, 0.09));
    const mat = new THREE.MeshPhysicalMaterial({ map, transparent: true, roughness: tech ? 0.6 : 0.72, metalness: 0,
      sheen: 0.25, sheenRoughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false,
      normalMap: o.normalMap, normalScale: baseNormal.clone().multiplyScalar(0.12) });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 1;
    return m;
  }
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  async function texture(srcOrCanvas) {
    const t = typeof srcOrCanvas === 'string' ? await loader.loadAsync(srcOrCanvas) : new THREE.CanvasTexture(srcOrCanvas);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    return t;
  }

  // ---------- state, views and the frame loop ----------
  const S = { yaw: 0, from: 0, to: 0, t0: 0, dur: 0, zoom: 0, spin: false, visible: true, raf: 0, dirty: true, frames: 0, look: null, prints: [], token: 0, last: 0, dead: false, color: 0x17171a, tech: false };
  function fit() {
    const r = host.getBoundingClientRect(), W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    frame();
  }
  // the distance that shows the whole tee in this aspect, and the zoom between that and 2.6 times closer
  const fullDist = (aspect) => Math.max((BOX.h / 2) * 1.14 / TAN, (BOX.w / 2) * 1.12 / (TAN * aspect));
  function place(aspect = camera.aspect, room = 1) {
    const d0 = fullDist(aspect) * room, d = d0 * (1 - S.zoom * (1 - 1 / 2.6));
    const ly = BOX.cy + (0.035 - BOX.cy) * S.zoom;   // closer in, the aim rises to the prints
    camera.aspect = aspect; camera.position.set(0, ly + 0.05 * (d / d0), d); camera.lookAt(0, ly, 0);
    camera.updateProjectionMatrix();
    tee.rotation.y = -S.yaw;
  }
  function frame() { S.dirty = true; if (!S.raf && !S.dead) S.raf = requestAnimationFrame(tick); }
  function tick(now) {
    S.raf = 0;
    if (S.dead) return;
    const dt = S.last ? Math.min(0.1, (now - S.last) / 1000) : 0; S.last = now;
    let more = false;
    if (S.dur) {
      const k = Math.min(1, (now - S.t0) / S.dur), e = 1 - Math.pow(1 - k, 3);
      S.yaw = S.from + (S.to - S.from) * e;
      if (k >= 1) S.dur = 0; else more = true;
    } else if (S.spin && !S.drag) { S.yaw = wrap(S.yaw + SPIN * dt); more = true; }
    if (S.dirty || more) {
      if (S.visible && !document.hidden) { place(); renderer.render(scene, camera); S.frames++; }
      S.dirty = false;
    }
    if (more && S.visible && !document.hidden) S.raf = requestAnimationFrame(tick); else S.last = 0;
  }
  // walk to a yaw (radians), eased, or at once with reduced motion
  function walk(to) {
    S.spin = false;
    const d = wrap(to - S.yaw);
    if (reduce() || Math.abs(d) < 1e-3) { S.yaw = wrap(to); S.dur = 0; frame(); return; }
    S.from = S.yaw; S.to = S.yaw + d; S.t0 = performance.now(); S.dur = 550 + 350 * Math.abs(d) / Math.PI;
    frame();
  }
  function setView(name) {
    const deg = name === '34' ? (Math.cos(S.yaw) >= 0 ? VIEWS['34'] : VIEWS['34c']) : VIEWS[name];
    if (deg !== undefined) walk(THREE.MathUtils.degToRad(deg));
  }
  const turn = (deg) => walk((S.dur ? S.to : S.yaw) + THREE.MathUtils.degToRad(deg));

  // ---------- the look: cloth and prints ----------
  // look: { back: { src, w, h, top }, front: { src, w, h }, tech }; src is a URL or a canvas. The latest call wins.
  // A texture already on the tee (the same file: the chest of style 1 is also the técnica's) is used again, not fetched.
  async function setLook(look) {
    const my = ++S.token;
    const have = new Map(S.prints.map((m) => [m.userData.src, m.material.map]));
    const get = (src) => (typeof src === 'string' && have.has(src) ? Promise.resolve(have.get(src)) : texture(src));
    const [bt, ft] = await Promise.all([get(look.back.src), get(look.front.src)]);
    const mine = (t) => ![...have.values()].includes(t);
    if (my !== S.token || S.dead) { for (const t of [bt, ft]) if (mine(t)) t.dispose(); return false; }
    const keep = S.yaw;
    S.yaw = 0; place(); tee.updateMatrixWorld(true);
    const prints = [decal(bt, look.back, 'back', look.tech), decal(ft, look.front, 'front', look.tech)];
    prints[0].userData.src = look.back.src; prints[1].userData.src = look.front.src;
    S.yaw = keep;
    const used = new Set([bt, ft]);
    for (const m of S.prints) { tee.remove(m); m.geometry.dispose(); if (!used.has(m.material.map)) m.material.map.dispose(); m.material.dispose(); }
    S.prints = prints; for (const m of prints) tee.add(m);
    S.tech = !!look.tech; S.look = look;
    paintCloth();
    frame();
    return true;
  }
  function paintCloth() {
    const t = S.tech;
    cloth.color.set(t ? 0x121215 : S.color);
    cloth.roughness = t ? 0.62 : 0.94; cloth.sheen = t ? 0.35 : 1.0; cloth.sheenRoughness = t ? 0.45 : 0.8;
    cloth.sheenColor.set(t ? 0x50525a : 0x4a4a50);
    cloth.normalScale.copy(baseNormal).multiplyScalar(t ? 0.35 : 0.8);
  }
  function setColor(hex) { S.color = new THREE.Color(hex).getHex(); paintCloth(); frame(); }
  function setSpin(on) { S.spin = !!on; S.dur = 0; frame(); }

  // ---------- drag to rotate, pinch or wheel to zoom ----------
  const pts = new Map();
  let pinch0 = 0, zoom0 = 0;
  const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { host.setPointerCapture(e.pointerId); } catch (_) {}
    S.drag = true; S.dur = 0;
    if (pts.size === 2) { pinch0 = spread(); zoom0 = S.zoom; }
  }
  function move(e) {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) { S.yaw = wrap(S.yaw - dx * (Math.PI * 1.1) / Math.max(240, host.clientWidth)); frame(); }
    else if (pts.size === 2 && pinch0) { setZoom(zoom0 + (spread() / pinch0 - 1) * 1.1); }
  }
  function up(e) {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = 0;
    if (!pts.size) { S.drag = false; frame(); }
  }
  function setZoom(z) { const v = Math.min(1, Math.max(0, z)); if (v === S.zoom) return false; S.zoom = v; frame(); return true; }
  function wheel(e) {
    const changed = setZoom(S.zoom - e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    if (changed) e.preventDefault();   // at a limit the page scrolls on
  }
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);
  host.addEventListener('wheel', wheel, { passive: false });
  const ro = new ResizeObserver(() => fit());
  ro.observe(host);
  const io = new IntersectionObserver((es) => { S.visible = es.some((x) => x.isIntersecting); if (S.visible) frame(); });
  io.observe(host);
  const onVis = () => { if (!document.hidden) frame(); };
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (!S.dead) { dispose(); if (onLost) onLost(); } });
  fit();

  // ---------- the picture to download ----------
  // the view as it is, w × h, on a 2D canvas (the caller adds the background and the captions under it)
  function snapshot(w, h) {
    const pr = renderer.getPixelRatio(), size = renderer.getSize(new THREE.Vector2()), aspect = camera.aspect;
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    place(w / h, 1.12); renderer.render(scene, camera);   // a little more air round the tee than on the stage
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(canvas, 0, 0);   // in the same task as the render: the drawing buffer is still there
    renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y, false);
    place(aspect); renderer.render(scene, camera);
    return out;
  }
  // test hook: the share of the stage the tee covers and of print colours in it, from a fresh frame
  function probe() {
    place(); renderer.render(scene, camera);
    const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 / camera.aspect);
    const g = c.getContext('2d'); g.drawImage(canvas, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let cover = 0, light = 0, gold = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      cover++;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r > 150 && gg > 150 && b > 140 && Math.abs(r - b) < 40) light++;
      else if (r > 120 && gg > 80 && b < 110 && r - b > 60) gold++;
    }
    const n = d.length / 4;
    return { cover: cover / n, light: light / n, gold: gold / n };
  }

  function dispose() {
    if (S.dead) return;
    S.dead = true;
    if (S.raf) cancelAnimationFrame(S.raf);
    ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up); host.removeEventListener('wheel', wheel);
    for (const m of S.prints) { m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
    S.prints = [];
    mesh.geometry.dispose(); cloth.dispose(); if (o.normalMap) o.normalMap.dispose(); if (o.aoMap) o.aoMap.dispose();
    shadow.geometry.dispose(); shadow.material.dispose(); shadowTex.dispose();
    envRT.dispose();
    release(renderer);
  }

  return {
    setLook, setColor, setView, turn, setSpin, setZoom, snapshot, probe, dispose,
    get spin() { return S.spin; },
    state: () => ({ yaw: Math.round(THREE.MathUtils.radToDeg(S.yaw)), zoom: S.zoom, spin: S.spin, frames: S.frames, dead: S.dead, moving: !!S.dur, prints: S.prints.length }),
  };
}
