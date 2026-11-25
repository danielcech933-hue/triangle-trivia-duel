let ctx: AudioContext | null = null;
function tone(freq: number, dur: number, delay = 0, type: OscillatorType = "sine", vol = 0.08) {
  if (typeof window === "undefined") return;
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur);
  } catch { /* audio unavailable */ }
}
export const sfx = {
  pick: () => tone(660, 0.12, 0, "triangle"),
  correct: () => { tone(523, 0.15); tone(784, 0.25, 0.12); },
  wrong: () => { tone(220, 0.25, 0, "sawtooth", 0.05); tone(160, 0.35, 0.18, "sawtooth", 0.05); },
  tick: () => tone(1200, 0.04, 0, "square", 0.03),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, i * 0.14, "triangle")),
};
