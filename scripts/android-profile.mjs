// Local CDP tool; drag/kernel modes require a developer-provided window.__jelly hook.
import { readFileSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
const targets = await globalThis.fetch('http://127.0.0.1:9222/json').then((r) => r.json());
const target = targets.find((t) => t.type === 'page' && t.url === 'https://localhost/');
if (!target) throw new Error('Forward the running Jelly Hop WebView to localhost:9222 first');
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let id = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const result = JSON.parse(String(event.data));
  if (result.id) {
    const p = pending.get(result.id);
    pending.delete(result.id);
    if (result.error) p.reject(result.error);
    else p.resolve(result.result);
  }
};
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const request = ++id;
    pending.set(request, { resolve, reject });
    ws.send(JSON.stringify({ id: request, method, params }));
  });
try {
  if (process.argv[2] === 'drag') {
    const evaluate = async (expression) =>
      (await call('Runtime.evaluate', { expression, returnByValue: true })).result.value;
    const point = await evaluate(
      '(()=>{const j=__jelly;const p=j.body.center.clone();p.y+=.012;p.project(j.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}})()',
    );
    await evaluate(
      'window.__dragFrames=[];window.__dragMeasuring=true;requestAnimationFrame(function f(t){if(!window.__dragMeasuring)return;window.__dragFrames.push(t);requestAnimationFrame(f)})',
    );
    await call('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ ...point, id: 1 }],
    });
    for (let i = 1; i <= 20; i++) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
      await call('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x + (50 * i) / 20, y: point.y - (65 * i) / 20, id: 1 }],
      });
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2000));
    const held = await evaluate(
      '({grabs:__jelly.body.grabs.length,finite:__jelly.body.isFinite()})',
    );
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2000));
    console.log(
      JSON.stringify(
        {
          held,
          measurement: await evaluate(
            '(()=>{window.__dragMeasuring=false;const a=__dragFrames;const deltas=a.slice(1).map((v,i)=>v-a[i]).sort((a,b)=>a-b);return {fps:1000*(a.length-1)/(a.at(-1)-a[0]),p95FrameMs:deltas[Math.floor(deltas.length*.95)],grabs:__jelly.body.grabs.length,throws:document.querySelector("#throw-count").textContent,diagnostics:document.querySelector("#diagnostic-text").value.split("Recent frame rate:")[1]}})()',
          ),
        },
        null,
        2,
      ),
    );
  } else if (process.argv[2] === 'kernel') {
    const source = readFileSync('src/physics/soft-body-kernel.js', 'utf8').replaceAll(
      'export ',
      '',
    );
    const expression = `(()=>{const make=new Function(${JSON.stringify(source + ';return createSoftBodyKernel;')})();const b=__jelly.body;const k=make(b);const phys={gravity:2.4,shear:1200,bulk:65000,damping:3,iterations:3,staticFriction:.65,dynamicFriction:.42,restitution:.065,floor:.00015,maxGrabForce:2.8};const t=performance.now();for(let i=0;i<120;i++)k.step(1/240,phys);const stepMs=(performance.now()-t)/120;const s=performance.now();for(let i=0;i<10;i++)k.updateSurface();return {stepMs,surfaceMs:(performance.now()-s)/10};})()`;
    console.log(
      JSON.stringify(await call('Runtime.evaluate', { expression, returnByValue: true }), null, 2),
    );
  } else if (process.argv[2] === 'eval') {
    console.log(
      JSON.stringify(
        await call('Runtime.evaluate', {
          expression: process.argv[3],
          awaitPromise: true,
          returnByValue: true,
        }),
        null,
        2,
      ),
    );
  } else if (process.argv[2] === 'screenshot') {
    const result = await call('Page.captureScreenshot', { format: 'png' });
    writeFileSync('.android-tools/phone.png', Buffer.from(result.data, 'base64'));
    console.log('.android-tools/phone.png');
  } else {
    await call('Profiler.enable');
    await call('Profiler.start');
    await new Promise((resolve) => globalThis.setTimeout(resolve, 10000));
    const { profile } = await call('Profiler.stop');
    writeFileSync('.android-tools/phone.cpuprofile', JSON.stringify(profile));
    const counts = new Map();
    for (const sample of profile.samples ?? []) counts.set(sample, (counts.get(sample) ?? 0) + 1);
    console.log(
      profile.nodes
        .map((n) => ({
          name: n.callFrame.functionName,
          url: n.callFrame.url,
          samples: counts.get(n.id) ?? 0,
        }))
        .sort((a, b) => b.samples - a.samples)
        .slice(0, 20),
    );
    console.log(
      JSON.stringify(
        await call('Runtime.evaluate', {
          expression:
            '({hidden:document.hidden,screen:document.body.dataset.screen,diagnostics:document.querySelector("#diagnostic-text").value})',
          returnByValue: true,
        }),
        null,
        2,
      ),
    );
  }
} finally {
  ws.close();
}
