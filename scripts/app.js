"use strict";

const
  volumeRange = document.getElementById("volume-range"),
  distGainRange = document.getElementById("dist-gain-range"),
  fbGainRange = document.getElementById("fb-gain-range"),
  randomizeButton = document.getElementById("randomize-button"),
  svg = document.getElementById("svg"),
  space = document.getElementById("space"),
  NS = svg.getAttribute("xmlns"),
  system = [],
  planetRadius = 8,
  tmp = {},
  star = document.createElementNS(NS, "g"),
  starFrame = document.createElementNS(NS, "circle"),
  playIcon = document.createElementNS(NS, "polygon"),
  pauseIcon = document.createElementNS(NS, "path"),
  ctx = new AudioContext({latencyHint: "playback"}),
  distGain = new GainNode(ctx, {gain: Math.exp(distGainRange.value * 3)}),
  master = distGain.
    connect(new GainNode(ctx, {gain: 0.08})).
    connect(new WaveShaperNode(ctx, {curve: [...Array(5001)].map((_, i) => 
      2 / (1 + Math.exp(50 - i/50)) - 1)})).
    connect(new BiquadFilterNode(ctx, {type: "lowpass", frequency: 6000})).
    connect(new GainNode(ctx, {gain: 100 ** (volumeRange.value - 1)})),
  cosWave = new PeriodicWave(ctx, {real: [0,1]}),
  baseOscGain = new GainNode(ctx, {gain: 1 - fbGainRange.value}),
  fbGain = new GainNode(ctx, {gain: fbGainRange.value}),
  buf = new Float32Array(64);
let
  isInitialized = false,
  isManual = false,
  requestId,
  dt = 0,
  prev = performance.now();

for (let i = 0; i < 3; i++){
  let
    o = document.createElementNS(NS, "circle"),
    p = document.createElementNS(NS, "circle");
  const
    r = 40 + 10 * i,
    f = 2 / r / Math.sqrt(r),
    cos = new OscillatorNode(ctx, {frequency: f, periodicWave: cosWave}),
    sin = new OscillatorNode(ctx, {frequency: f}),
    xc = new GainNode(ctx, {gain: r}),
    xs = new GainNode(ctx, {gain: 0}),
    yc = new GainNode(ctx, {gain: 0}),
    ys = new GainNode(ctx, {gain: r}),
    ax = new AnalyserNode(ctx, {fftSize: 128}),
    ay = new AnalyserNode(ctx, {fftSize: 128}),
    pr = new GainNode(ctx, {gain: 1/r}),
    s = {
      planet: p, orbit: o, 
      cos: cos, sin: sin,
      xc: xc, xs: xs, yc: yc, ys: ys,
      ax: ax, ay: ay,
      product: pr
    };
  system[i] = s;

  o.setAttribute("class", "round-line");
  o.setAttribute("stroke", "gray");
  p.setAttribute("fill", "currentcolor");
  o.setAttribute("r", r);
  p.setAttribute("cx", r);
  p.setAttribute("r", planetRadius);
  p.style.color = ["wheat", "darkseagreen", "lightblue"][i];

  cos.connect(xc);
  cos.connect(yc);
  sin.connect(xs);
  sin.connect(ys);
  xc.connect(ax);
  xs.connect(ax);
  yc.connect(ay);
  ys.connect(ay);
  xc.connect(pr);
  xs.connect(pr);
};

system.forEach(s => space.appendChild(s.orbit));
system.forEach(s => space.appendChild(s.planet));

star.setAttribute("fill-opacity", .9);
star.setAttribute("stroke-opacity", .9);
starFrame.setAttribute("fill", "aliceblue");
starFrame.setAttribute("r", planetRadius);
playIcon.setAttribute("points", "-2,4 4,0 -2,-4");
playIcon.setAttribute("class", "round-line");
playIcon.setAttribute("stroke", "cadetblue");
pauseIcon.setAttribute("d", "M -3 3 L -1 3 L -1 -3 L -3 -3 Z M 1 3 L 3 3 L 3 -3 L 1 -3 Z");
pauseIcon.setAttribute("class", "round-line");
pauseIcon.setAttribute("stroke", "cadetblue");
pauseIcon.setAttribute("visibility", "hidden");

space.appendChild(star);
star.appendChild(starFrame);
star.appendChild(playIcon);
star.appendChild(pauseIcon);

ctx.suspend();

star.addEventListener("click", () => {
  if (ctx.state === "suspended"){
    playIcon.setAttribute("visibility", "hidden");
    pauseIcon.setAttribute("visibility", "visible");
    ctx.resume();
    requestId = window.requestAnimationFrame(draw);
  }
  else if (ctx.state === "running"){
    playIcon.setAttribute("visibility", "visible");
    pauseIcon.setAttribute("visibility", "hidden");
    ctx.suspend();
    window.cancelAnimationFrame(requestId);
  }
  if (!isInitialized) init();
});

function draw(timestamp){
  system.forEach(s => {
    s.ax.getFloatTimeDomainData(buf);
    const x = buf.slice(-1)[0];
    s.ay.getFloatTimeDomainData(buf);
    const y = buf.slice(-1)[0];
    s.planet.setAttribute("cx", x);
    s.planet.setAttribute("cy", y);
    s.orbit.setAttribute("r", Math.hypot(x,y));
  });
  dt = (timestamp - prev) / 1000;
  prev = timestamp;
  requestId = window.requestAnimationFrame(draw);				
}

volumeRange.addEventListener("input", e =>
  master.gain.linearRampToValueAtTime(
    e.target.value == 0 ? 0 : 100 ** (e.target.value - 1), ctx.currentTime + dt));

distGainRange.addEventListener("input", e =>
  distGain.gain.linearRampToValueAtTime(
    Math.exp(e.target.value * 3), ctx.currentTime + dt));

fbGainRange.addEventListener("input", e => {
  baseOscGain.gain.linearRampToValueAtTime(1 - e.target.value, ctx.currentTime + dt);
  fbGain.gain.linearRampToValueAtTime(e.target.value, ctx.currentTime + dt);
});

async function init(){
  isInitialized = true;
  const
    baseFreq = system[2].product.
      connect(new WaveShaperNode(ctx, {curve: [...Array(1001)].
        map((_, i) => 78 * 8 ** (i/1000))})),
    baseOsc = new OscillatorNode(ctx, {frequency: 0}),
    reverb0 = new ConvolverNode(ctx, {buffer: await fetch("audio/ir0.wav").
      then(x => x.arrayBuffer()).
      then(x => ctx.decodeAudioData(x)), disableNormalization: true}), 
    reverb1 = new ConvolverNode(ctx, {buffer: await fetch("audio/ir1.wav").
      then(x => x.arrayBuffer()).
      then(x => ctx.decodeAudioData(x)), disableNormalization: true}), 
    modulator = new OscillatorNode(ctx, {frequency: 0}),
    ratio = new GainNode(ctx, {gain: 0}),
    splitter = new ChannelSplitterNode(ctx, {numberOfOutputs: 2}),
    merger = new ChannelMergerNode(ctx, {numberOfInputs: 2}),
    hpf = new BiquadFilterNode(ctx, {type: "highpass", frequency: 10}),
    xl = new GainNode(ctx, {gain: 0.5}),
    xr = new GainNode(ctx, {gain: 0.5}),
    del = new DelayNode(ctx, {delayTime: 0.7}),
    bus1 = new GainNode(ctx, {gain: 0}),
    bus2 = new GainNode(ctx, {gain: 0}),
    scale = [1, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5];

  function squareOf(node){
    const g = new GainNode(ctx, {gain: 0});
    node.connect(g);
    node.connect(g.gain);
    return g;
  }

  baseFreq.
    connect(baseOsc.frequency);
  baseOsc.
    connect(baseOscGain).
    connect(reverb0);
  baseOscGain.
    connect(reverb1);
  splitter.
    connect(reverb0, 1, 0).
    connect(merger, 0, 0);
  splitter.
    connect(reverb1, 0, 0).
    connect(merger, 0, 1).
    connect(new BiquadFilterNode(ctx, {type: "lowpass", frequency: 7000})).
    connect(hpf).
    connect(xl);
  hpf.
    connect(xr);
  modulator.
    connect(xl).
    connect(new WaveShaperNode(ctx, {curve: [1,0,1]})).
    connect(del);
  modulator.
    connect(new GainNode(ctx, {gain: -1})).
    connect(xr).
    connect(new WaveShaperNode(ctx, {curve: [1,0,1]})).
    connect(new GainNode(ctx, {gain: -1})).
    connect(del).
    connect(fbGain).
    connect(splitter);
  system[1].product.
    connect(new WaveShaperNode(ctx, {curve: [0, 2]})).
    connect(ratio.gain);
  baseFreq.
    connect(ratio).
    connect(modulator.frequency);
  squareOf(system[0].product.
    connect(new WaveShaperNode(ctx, {curve: [0, 1]}))).
    connect(bus1.gain);
  squareOf(system[0].product.
    connect(new WaveShaperNode(ctx, {curve: [1, 0]}))).
    connect(bus2.gain);
  bus1.
    connect(distGain);
  bus2.
    connect(distGain);
  master.
    connect(ctx.destination);

  baseOsc.start();
  modulator.start();
  system.forEach(s => {
    s.cos.start();
    s.sin.start();
  });
  for (let i = 0; i < 7; i++){
    const dest =
      (i === 2 || i === 5) ? bus1 :
      (i === 3 || i === 6) ? bus2 :
      distGain;
    for (let j = 0, f = 22 * scale[i]; j < 7; j++, f *= 2){
      const
        o = new OscillatorNode(ctx, {frequency: 3 * f}),
        g = hpf.
          connect(new BiquadFilterNode(ctx, {type: "bandpass", Q: 70, frequency: f})).
          connect(new GainNode(ctx, {gain: 0}));
      o.connect(g.gain);
      g.connect(new BiquadFilterNode(ctx, {type: "bandpass", Q: 70, frequency: 2 * f})).
        connect(dest);
      o.start();
    }
  }

  randomizeButton.addEventListener("click", () => {
    if (ctx.state === "suspended") return;
    window.cancelAnimationFrame(requestId);
    system.forEach(s => {
      const
        t = 2 * Math.PI * Math.random(),
        r = 80 * Math.random() + 2 * planetRadius,
        a = r * Math.cos(t),
        b = r * Math.sin(t);
      s.xc.gain.linearRampToValueAtTime(a, ctx.currentTime + dt);
      s.xs.gain.linearRampToValueAtTime(-b, ctx.currentTime + dt);
      s.yc.gain.linearRampToValueAtTime(b, ctx.currentTime + dt);
      s.ys.gain.linearRampToValueAtTime(a, ctx.currentTime + dt);
      s.cos.frequency.value = s.sin.frequency.value = 2 / r / Math.sqrt(r);
    });
    requestId = window.requestAnimationFrame(draw);
  });

  function spacePoint(x, y){
    let pt = new DOMPoint(x,y);
    return pt.matrixTransform(space.getScreenCTM().inverse());
  };

  function followPointer(x, y){
    const
      pt = spacePoint(x, y);
    let
      cx = pt.x - tmp.x,
      cy = pt.y - tmp.y,
      r = Math.hypot(cx, cy);
    if (r == 0) return;
    if (r <= planetRadius) {
      cx *= planetRadius / r;
      cy *= planetRadius / r;
      r = planetRadius;
    }
    const
      a = cx * tmp.cos + cy * tmp.sin,
      b = cy * tmp.cos - cx * tmp.sin;
    tmp.s.product.gain.linearRampToValueAtTime(1 / r, ctx.currentTime + dt);
    tmp.s.xc.gain.linearRampToValueAtTime(a, ctx.currentTime + dt);
    tmp.s.xs.gain.linearRampToValueAtTime(-b, ctx.currentTime + dt);
    tmp.s.yc.gain.linearRampToValueAtTime(b, ctx.currentTime + dt);
    tmp.s.ys.gain.linearRampToValueAtTime(a, ctx.currentTime + dt);
  }

  system.forEach(s =>
    s.planet.addEventListener("pointerdown", e => {
      if (ctx.state === "suspended") return;
      isManual = true;
      tmp.s = s;
      const
        cx = s.planet.cx.baseVal.value,
        cy = s.planet.cy.baseVal.value,
        r = s.orbit.r.baseVal.value,
        pt = spacePoint(e.clientX, e.clientY);
      tmp.x = pt.x - cx;
      tmp.y = pt.y - cy;
      tmp.cos = (cx * s.xc.gain.value + cy * s.yc.gain.value) / r / r;
      tmp.sin = (cy * s.xc.gain.value - cx * s.yc.gain.value) / r / r;
      s.cos.frequency.value = s.sin.frequency.value = 0;
    })
  );

  window.addEventListener("mousemove", e => {
    if (!isManual) return;
    followPointer(e.clientX, e.clientY);
  });

  window.addEventListener("touchmove", e => {
    if (!isManual) return;
    followPointer(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, {passive: false});

  window.addEventListener("pointerup", e => {
    if (!isManual) return;
    const
      r = tmp.s.orbit.r.baseVal.value,
      cx = tmp.s.planet.cx.baseVal.value,
      cy = tmp.s.planet.cy.baseVal.value;
    tmp.s.cos.frequency.value = tmp.s.sin.frequency.value = 2 / r / Math.sqrt(r);
    tmp.s.product.gain.linearRampToValueAtTime(1 / r, ctx.currentTime + dt); 
    isManual = false;
  });
}