"""Create Halloween voice clips with macOS voices and original audio effects."""
from array import array
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import wave

root = Path(__file__).resolve().parent.parent / 'dist'
out = root / 'sounds'
out.mkdir(parents=True, exist_ok=True)

clips = [
    ('witch-laugh', 'Witch’s cackle', 'Whisper', 165, .98, 'Hee hee hee! Ha ha ha ha! Hee hee hee!', 'Laughs'),
    ('monster-laugh', 'Monster’s evil laugh', 'Ralph', 145, .77, 'Mwah ha ha ha! Ha ha ha ha!', 'Laughs'),
    ('welcome-monsters', 'Welcome, little monsters', 'Daniel', 140, .85, 'Welcome, little monsters. We have been waiting for you!', 'Halloween voices'),
    ('come-closer', 'Come closer…', 'Whisper', 130, .94, 'Come closer. The candy is waiting!', 'Halloween voices'),
    ('haunted-porch', 'The haunted porch', 'Daniel', 135, .82, 'Beware! You have entered the haunted porch!', 'Halloween voices'),
    ('trick-or-treat', 'Trick or treat, smell my feet!', 'Ralph', 150, .88, 'Trick or treat! Smell my feet! Give me something good to eat!', 'Halloween voices'),
    ('if-you-dare', 'Take a treat… if you dare!', 'Daniel', 130, .80, 'Take a treat. If you dare! Ha ha ha!', 'Halloween voices'),
    ('no-more-treats', 'No more treats… just kidding!', 'Daniel', 150, .85, 'Ha ha ha! You come too late. No more treats. Now leave in five seconds. Five, four, three, two, one. Just kidding!', 'Halloween voices'),
]

def process(source, target, speed):
    with wave.open(str(source), 'rb') as f:
        if f.getsampwidth() != 2 or f.getnchannels() != 1:
            raise RuntimeError('Expected mono 16-bit PCM speech')
        rate = f.getframerate()
        values = array('h', f.readframes(f.getnframes()))
        if sys.byteorder != 'little':
            values.byteswap()
    if not values or max(abs(x) for x in values) < 100:
        raise RuntimeError('Speech synthesis returned silence. Run this script with access to macOS speech services.')
    # Lower the character's pitch and add two quieter, decaying echoes.
    dry = []
    for i in range(int((len(values) - 1) / speed)):
        position = i * speed
        left = int(position)
        mix = position - left
        dry.append(values[left] * (1 - mix) + values[left + 1] * mix)
    wet = [0.0] * (len(dry) + int(rate * .65))
    for i, value in enumerate(dry):
        t = i / rate
        value *= .94 + .06 * math.sin(t * 31)
        wet[i] += value
        wet[i + int(rate * .19)] += value * .23
        wet[i + int(rate * .38)] += value * .10
    peak = max(abs(x) for x in wet)
    factor = 24000 / peak
    pcm = array('h', (int(x * factor) for x in wet))
    if sys.byteorder != 'little':
        pcm.byteswap()
    with wave.open(str(target), 'wb') as f:
        f.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        f.writeframes(pcm.tobytes())
    print(f'Created {target.name}: {len(wet) / rate:.1f} sec')

catalog = [
    {'id': 'howl', 'label': 'Ghostly howl', 'group': 'Spooky effects'},
    {'id': 'laugh', 'label': 'Goblin chuckle', 'group': 'Spooky effects'},
    {'id': 'creak', 'label': 'Creaking door', 'group': 'Spooky effects'},
]
with tempfile.TemporaryDirectory(prefix='porch-voices-') as temporary:
    for name, label, voice, pace, speed, text, group in clips:
        if not sys.argv[1:] or name in sys.argv[1:]:
            source = Path(temporary) / (name + '.wav')
            spoken = text
            if name == 'no-more-treats':
                spoken = ('Ha ha ha! [[slnc 400]] You come too late. No more treats. '
                          'Now leave in five seconds. [[slnc 500]] '
                          'Five. [[slnc 500]] Four. [[slnc 500]] Three. [[slnc 500]] '
                          'Two. [[slnc 500]] One. [[slnc 1000]] Just kidding!')
            subprocess.run(['/usr/bin/say', '-v', voice, '-r', str(pace), '-o', str(source),
                            '--file-format=WAVE', '--data-format=LEI16@22050', spoken], check=True)
            process(source, out / (name + '.wav'), speed)
        catalog.append({'id': name, 'label': label, 'group': group, 'text': text})

(root / 'sound-catalog.mjs').write_text('export const SOUND_CATALOG = ' + json.dumps(catalog, ensure_ascii=False, indent=2) + ';\n')
