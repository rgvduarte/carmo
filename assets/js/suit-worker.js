// Builds the trisuit mesh off the main thread (suit-mesh.js) and hands the buffers back without copying them.
import { buildMesh } from './suit-mesh.js';

self.onmessage = (e) => {
  try {
    const r = buildMesh(e.data), transfer = new Set();
    const take = (o) => { for (const v of Object.values(o)) { if (ArrayBuffer.isView(v)) transfer.add(v.buffer); else if (Array.isArray(v)) v.forEach((x) => ArrayBuffer.isView(x) && transfer.add(x.buffer)); } };
    for (const k in r.parts) take(r.parts[k]);
    for (const k in r.body) take(r.body[k]);
    take(r.layout);
    self.postMessage({ ok: true, ...r }, [...transfer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.stack) || err) });
  }
};
