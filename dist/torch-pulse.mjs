export function supportsTorch(track) {
  const torch = track?.getCapabilities?.().torch;
  return torch === true || (Array.isArray(torch) && torch.includes(true));
}

// Serialize camera constraints so stopping cannot race an in-flight light-on request.
export class TorchPulse {
  constructor(track, onError) {
    this.track = track;
    this.onError = onError;
    this.version = 0;
    this.queue = Promise.resolve();
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
    const tick = async on => {
      await this.apply(on, version);
      if (version === this.version) this.tickTimer = setTimeout(() => tick(!on), 500);
    };
    void tick(true);
  }
  stop() {
    clearTimeout(this.tickTimer); clearTimeout(this.endTimer);
    this.version++;
    return this.apply(false, this.version);
  }
}
