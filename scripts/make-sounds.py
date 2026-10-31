"""Generate short, original spooky effects; no external audio required."""
from pathlib import Path
import math
import random
import struct
import wave

out = Path(__file__).resolve().parent.parent / 'dist' / 'sounds'
out.mkdir(parents=True, exist_ok=True)
rate = 22050
random.seed(31)

def save(name, duration, synth):
    phase = 0.0
    samples = []
    for i in range(int(duration * rate)):
        t = i / rate
        value, freq = synth(t)
        phase += 2 * math.pi * freq / rate
        signal = value * (math.sin(phase) + .23 * math.sin(phase * 2) + .09 * math.sin(phase * 3))
        edge = min(1, t / .08, (duration - t) / .25)
        samples.append(max(-32767, min(32767, int(signal * edge * 19000))))
    with wave.open(str(out / (name + '.wav')), 'wb') as f:
        f.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        f.writeframes(struct.pack('<' + 'h' * len(samples), *samples))
    print('Created', name + '.wav')

save('howl', 3.6, lambda t: (.48 * math.sin(math.pi * t / 3.6) ** .6, 180 + 100 * math.sin(math.pi * t / 3.6) + 9 * math.sin(t * 31)))
save('laugh', 3.0, lambda t: (.52 * max(0, math.sin(t * 16)) ** 1.5, 125 + 60 * max(0, math.sin(t * 16)) + 12 * math.sin(t * 39)))
save('creak', 3.2, lambda t: (.34 * (.65 + .35 * math.sin(t * 57)) * min(1, (3.2 - t)), 90 + 210 * (t / 3.2) ** 1.5 + 20 * math.sin(t * 23) + random.random() * 35))
