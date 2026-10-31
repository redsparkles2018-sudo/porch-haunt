export function supportsTorch(track) {
  const torch = track?.getCapabilities?.().torch;
  return torch === true || (Array.isArray(torch) && torch.includes(true));
}

// Serialize camera constraints so stopping cannot race an in-flight light-on request.
export class TorchPulse {
  constructor(track, onError, random = Math.random) {
    this.track = track;
    this.onError = onError;
    this.version = 0;
    this.queue = Promise.resolve();
    this.random = random;
  }
  apply(on, version) {
    this.queue = this.queue.then(async () => {
      if (version !== this.version || this.track.readyState !== 'live') return;
      await this.track.applyConstraints({ advanced: [{ torch: on }] });
    }).catch(error => {
      if (version !== this.version) return;
      clearTimeout(this.tickTimer); clearTimeout(this.endTimer);
      this.version++;
      this.onError(error);
    });
    return this.queue;
  }
  start() {
    this.stop();
    const version = this.version;
    this.endTimer = setTimeout(() => this.stop(), 5000);
    const between = (min, max) => Math.round(min + this.random() * (max - min));
    let flashesLeft = this.random() < .65 ? 2 : 1;
    const tick = async on => {
      await this.apply(on, version);
      if (version !== this.version) return;
      let wait;
      if (on) {
        flashesLeft--;
        wait = between(70, 160);
      } else if (flashesLeft > 0) {
        wait = between(90, 180);
      } else {
        // Short single/double strikes, separated by an unpredictable dark pause.
        flashesLeft = this.random() < .65 ? 2 : 1;
        wait = between(700, 1300);
      }
      this.tickTimer = setTimeout(() => tick(!on), wait);
    };
    void tick(true);
  }
  stop() {
    clearTimeout(this.tickTimer); clearTimeout(this.endTimer);
    this.version++;
    return this.apply(false, this.version);
  }
}
