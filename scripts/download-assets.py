"""Download pinned browser libraries and the official lightweight detector."""
from pathlib import Path
import json
import urllib.request

root = Path(__file__).resolve().parent.parent / 'dist'
assets = {
    'vendor/tf.min.js': 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    'vendor/coco-ssd.min.js': 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',
    'vendor/tfjs-LICENSE': 'https://raw.githubusercontent.com/tensorflow/tfjs/master/LICENSE',
    'vendor/coco-ssd-LICENSE': 'https://raw.githubusercontent.com/tensorflow/tfjs-models/master/LICENSE',
}
base = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/'
for name, url in assets.items():
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, target)
    print('Downloaded', name)
model_dir = root / 'model'
model_dir.mkdir(exist_ok=True)
urllib.request.urlretrieve(base + 'model.json', model_dir / 'model.json')
model = json.loads((model_dir / 'model.json').read_text())
for group in model['weightsManifest']:
    for shard in group['paths']:
        urllib.request.urlretrieve(base + shard, model_dir / shard)
        print('Downloaded', shard)
print('Detector ready.')
