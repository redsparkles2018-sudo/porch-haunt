import { ArrivalGate, inZone } from './detection.mjs';
import { SOUND_CATALOG } from './sound-catalog.mjs';
import { TorchPulse, supportsTorch } from './torch-pulse.mjs';

const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
const gate = new ArrivalGate();
const sounds = new Map();
let stream, model, modelPromise, audio, gain, currentSound, wakeLock, lastSound;
let armed = false, starting = false, loadingAudio, loopVersion = 0, facing = 'environment', scares = 0;
let pendingSound = null, soundDueAt = 0;
let torchPulse = null;
const settings = () => ({ zone: +$('zone').value / 100, minHeight: +$('size').value / 100, confidence: +$('confidence').value / 100 });
for (const groupName of new Set(SOUND_CATALOG.map(sound => sound.group))) {
  const group = document.createElement('optgroup');
  group.label = groupName;
  for (const sound of SOUND_CATALOG.filter(sound => sound.group === groupName)) group.append(new Option(sound.label, sound.id));
  $('sound').append(group);
}

function status(title, message, active = armed) {
  $('statusTitle').textContent = title;
  if ($('statusText').textContent !== message) $('statusText').textContent = message;
  $('statusDot').classList.toggle('armed', active);
}
function report(message) { $('error').textContent = message; $('error').hidden = !message; }
function controls() {
  $('start').hidden = !!stream;
  $('start').disabled = starting;
  $('arm').hidden = !stream || armed;
  $('arm').disabled = starting || !model;
  $('disarm').hidden = !armed;
  $('flip').disabled = !stream || starting || armed;
  $('stop').disabled = !stream || starting;
  $('flash').disabled = !torchPulse;
  $('testFlash').disabled = !torchPulse || armed || starting;
}
function unlockAudio() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    gain = audio.createGain();
    gain.connect(audio.destination);
    gain.gain.value = +$('volume').value / 100;
    audio.addEventListener('statechange', () => {
      if (armed && audio.state !== 'running') {
        disarm();
        report('Sound was paused by the phone. Keep Safari open and tap Arm the haunt again.');
      }
    });
  }
  const resume = audio.resume(); // Called directly from a tap for iPhone audio permission.
  const silent = audio.createBufferSource();
  silent.buffer = audio.createBuffer(1, 1, audio.sampleRate);
  silent.connect(gain); silent.start();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Audio could not start. Open this link in Safari on the iPhone and tap Test sound again.')), 8000);
    resume.then(() => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); });
  });
}
async function loadSounds() {
  if (!loadingAudio) loadingAudio = Promise.all(SOUND_CATALOG.map(async ({id: name}) => {
    const response = await fetch('/sounds/' + name + '.wav');
    if (!response.ok) throw new Error('Could not load the built-in sounds. Check the connection to the Mac and try again.');
    sounds.set(name, await audio.decodeAudioData(await response.arrayBuffer()));
  })).catch(error => { loadingAudio = null; throw error; });
  return loadingAudio;
}
function silence() { if (currentSound) { try { currentSound.stop(); } catch {} currentSound = null; } }
function playSound() {
  if (!audio || audio.state !== 'running') throw new Error('Tap Test sound to enable audio, then arm again.');
  let name = $('sound').value;
  if (name === 'random') {
    const names = [...sounds.keys()].filter(id => sounds.size === 1 || id !== lastSound);
    name = names[Math.floor(Math.random() * names.length)];
  }
  const buffer = sounds.get(name);
  if (!buffer) throw new Error('This sound has not loaded. Tap Test sound to try again.');
  silence();
  currentSound = audio.createBufferSource();
  currentSound.buffer = buffer; currentSound.connect(gain); currentSound.start();
  lastSound = name;
}
async function keepAwake() {
  if (wakeLock || !stream || document.hidden) return;
  try {
    if (navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; $('wakeNote').textContent = 'Keep Safari open and the screen awake. If it dims, set Auto-Lock to Never. Keep the phone plugged in.'; });
      $('wakeNote').textContent = 'Screen wake lock is on. Keep Safari open and the phone plugged in.';
    }
  } catch { /* The visible setup note explains the Auto-Lock fallback. */ }
}
function loadModel() {
  if (!modelPromise) modelPromise = (async () => {
    if (!window.tf || !window.cocoSsd) throw new Error('The detector files did not load. Refresh the page and try again.');
    await window.tf.ready();
    model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: '/model/model.json' });
    return model;
  })().catch(error => { modelPromise = null; throw error; });
  return modelPromise;
}
async function startCamera() {
  if (starting || stream) return;
  starting = true; controls(); report('');
  status('Opening your camera', 'Allow camera access when Safari asks.', false);
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Open the HTTPS phone link in Safari. Camera access does not work with a plain HTTP address on the iPhone.');
    const audioReady = unlockAudio().then(loadSounds);
    // Observe loading failures immediately, even while the permission prompt is open.
    const assetsReady = Promise.all([audioReady, loadModel()]);
    assetsReady.catch(() => {});
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 12, max: 15 } } });
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (stream) { stopCamera(); report('The camera stopped. Tap Start camera to reconnect it.'); } });
    const track = stream.getVideoTracks()[0];
    if (supportsTorch(track)) {
      torchPulse = new TorchPulse(track, () => {
        stopCamera();
        report('Camera light control failed. The camera was turned off to release the light. Start it again and leave the flash toggle off.');
      });
      $('flashHint').textContent = 'Pulse the rear camera light for 5 seconds when a scary sound starts.';
    } else {
      $('flash').checked = false;
      $('flashHint').textContent = 'This camera or Safari version does not provide light control. Try the rear camera. Sounds still work.';
    }
    video.srcObject = stream;
    await video.play();
    video.classList.add('live'); $('cameraEmpty').hidden = true;
    $('cameraTag').textContent = 'Loading person detector…';
    status('Getting ready', 'Loading the person detector. The first load can take a little while.', false);
    await assetsReady;
    await keepAwake();
    status('Camera ready', 'Frame the entrance, test your speaker, then arm the haunt.', false);
    $('cameraTag').textContent = 'Preview · disarmed';
    const version = ++loopVersion;
    detect(version);
  } catch (error) {
    stopCamera();
    const message = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow Camera for this website in Safari, then try again.' : error.name === 'NotFoundError' ? 'No camera was found. Open this page on your iPhone.' : error.message;
    report(message);
    status('Camera is off', 'Check the message below, then try again.', false);
  } finally { starting = false; controls(); }
}
function disarm() {
  clearTimeout(pendingSound); pendingSound = null; soundDueAt = 0;
  void torchPulse?.stop();
  armed = false; silence(); controls();
  if (stream) { $('cameraTag').textContent = 'Preview · disarmed'; status('Haunt disarmed', 'The camera is previewing. Tap Arm the haunt when you’re ready.', false); }
}
function scheduleScare(now) {
  const delay = +$('delay').value * 1000;
  soundDueAt = now + delay;
  const fire = () => {
    pendingSound = null; soundDueAt = 0;
    if (!armed || !stream || document.hidden) return;
    try {
      playSound(); scares++;
      if ($('flash').checked) torchPulse?.start();
      // The cooldown starts when the sound actually plays.
      gate.lastScare = performance.now();
      $('count').textContent = scares + (scares === 1 ? ' scare tonight' : ' scares tonight');
    } catch (error) { disarm(); report('Sound paused: ' + error.message); }
  };
  if (delay === 0) fire();
  else pendingSound = setTimeout(fire, delay);
}
function stopCamera() {
  disarm(); loopVersion++;
  const old = stream; stream = null;
  torchPulse = null;
  old?.getTracks().forEach(track => track.stop());
  video.srcObject = null; video.classList.remove('live');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $('cameraEmpty').hidden = false; $('cameraTag').textContent = 'Camera off';
  $('flashHint').textContent = 'Start the rear camera to check whether its light is available.';
  wakeLock?.release().catch(() => {}); wakeLock = null;
  status('Camera is off', 'Start the camera when you’re ready.', false); controls();
}
function draw(predictions) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  // Canvas follows the video’s contained image, including portrait camera streams.
  const container = $('cameraBox');
  const scale = Math.min(container.clientWidth / w, container.clientHeight / h);
  canvas.style.width = w * scale + 'px'; canvas.style.height = h * scale + 'px';
  canvas.style.left = (container.clientWidth - w * scale) / 2 + 'px';
  canvas.style.top = (container.clientHeight - h * scale) / 2 + 'px';
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.clearRect(0, 0, w, h);
  const config = settings(), margin = (1 - config.zone) / 2;
  ctx.fillStyle = '#ffb45c0a'; ctx.fillRect(w * margin, h * .08, w * config.zone, h * .92);
  ctx.strokeStyle = '#ffb45c'; ctx.lineWidth = 2 / scale; ctx.setLineDash([7 / scale, 6 / scale]);
  ctx.strokeRect(w * margin + 1, h * .08, w * config.zone - 2, h * .92 - 2);
  ctx.setLineDash([]);
  for (const p of predictions.filter(p => p.class === 'person' && p.score >= config.confidence)) {
    const active = inZone(p, w, h, config);
    const [x, y, pw, ph] = p.bbox;
    ctx.strokeStyle = active ? '#b7d7bc' : '#c4b2c9';
    ctx.strokeRect(x, y, pw, ph);
    ctx.font = `${13 / scale}px -apple-system, sans-serif`;
    const text = (active ? 'Person' : 'Outside trigger area') + ' ' + Math.round(p.score * 100) + '%';
    const labelY = Math.max(22 / scale, y);
    ctx.fillStyle = '#241a32'; ctx.fillRect(x, labelY - 22 / scale, ctx.measureText(text).width + 12 / scale, 22 / scale);
    ctx.fillStyle = '#fff3dc'; ctx.fillText(text, x + 6 / scale, labelY - 6 / scale);
  }
}
async function detect(version) {
  if (version !== loopVersion || !stream) return;
  try {
    if (!document.hidden && video.readyState >= 2) {
      const predictions = await model.detect(video, 10, .35);
      if (version !== loopVersion) return;
      draw(predictions);
      if (armed) {
        const present = predictions.some(p => inZone(p, video.videoWidth, video.videoHeight, settings()));
        const now = performance.now();
        if (gate.step(present, now, +$('cooldown').value * 1000) && pendingSound === null) scheduleScare(now);
        const remaining = Math.ceil((gate.lastScare + +$('cooldown').value * 1000 - now) / 1000);
        if (pendingSound !== null) status('Person detected · sound queued', `Playing in ${(Math.max(0, soundDueAt - now) / 1000).toFixed(1)} sec. Disarm to cancel.`);
        else if (remaining > 0) status('A little breathing room', `Next scare available in ${remaining} sec. The group must also leave the area.`);
        else if (gate.latched) status('Waiting for the next group', 'The area needs to be clear for 3 seconds before another scare.');
        else status('The haunt is armed', present ? 'Person spotted. Confirming their arrival…' : 'Watching for a person in the outlined area.');
      }
    }
  } catch (error) { disarm(); report('Detection paused: ' + error.message + ' Turn the camera off and start it again.'); return; }
  setTimeout(() => detect(version), 450);
}

$('start').addEventListener('click', startCamera);
$('stop').addEventListener('click', stopCamera);
$('flip').addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; stopCamera(); startCamera(); });
$('arm').addEventListener('click', async () => {
  try {
    await unlockAudio(); await loadSounds();
    if (!stream || document.hidden) return;
    report(''); gate.reset(); armed = true; controls();
    $('cameraTag').textContent = 'Armed · person detection';
    status('The haunt is armed', 'Watching for a person in the outlined area.');
    await keepAwake();
  } catch (error) { report(error.message); }
});
$('disarm').addEventListener('click', disarm);
$('flash').addEventListener('change', () => { if (!$('flash').checked) void torchPulse?.stop(); });
$('testFlash').addEventListener('click', () => torchPulse?.start());
$('test').addEventListener('click', async () => {
  $('test').disabled = true;
  try { await unlockAudio(); await loadSounds(); report(''); playSound(); }
  catch (error) { report(error.message); }
  finally { $('test').disabled = false; }
});
for (const [name, unit] of [['volume', '%'], ['delay', ' sec'], ['cooldown', ' sec'], ['zone', '%'], ['size', '%'], ['confidence', '%']]) {
  $(name).addEventListener('input', () => {
    $(name + 'Out').value = $(name).value + unit;
    if (name === 'volume' && gain) gain.gain.setTargetAtTime(+$(name).value / 100, audio.currentTime, .03);
  });
}
$('upload').addEventListener('change', async event => {
  try {
    await unlockAudio();
    let added = 0;
    for (const file of event.target.files) {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose audio files smaller than 20 MB.');
      const decoded = await audio.decodeAudioData(await file.arrayBuffer());
      if (decoded.duration > 30) throw new Error('Choose clips up to 30 seconds long.');
      const id = 'custom-' + sounds.size;
      sounds.set(id, decoded);
      const option = new Option(file.name, id); $('sound').add(option); $('sound').value = id; added++;
    }
    $('uploadHint').textContent = `${added} ${added === 1 ? 'clip' : 'clips'} added. Files stay here until this page is closed or refreshed.`;
    report('');
  } catch (error) { report('Could not add audio: ' + error.message + ' Try an MP3 or WAV file.'); }
  event.target.value = '';
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) void torchPulse?.stop();
  if (document.hidden && armed) { disarm(); report('The haunt paused because Safari was hidden or the phone locked. Return to this page and tap Arm the haunt.'); }
  if (!document.hidden) keepAwake();
});
window.addEventListener('pagehide', stopCamera);
controls();
$('cameraTag').textContent = 'Loading person detector…';
loadModel().then(() => {
  if (!stream && !starting) $('cameraTag').textContent = 'Detector ready · camera off';
}).catch(() => {
  if (!stream && !starting) $('cameraTag').textContent = 'Start camera to retry detector';
});
