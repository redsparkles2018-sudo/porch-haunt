export function inZone(prediction, width, height, settings) {
  if (prediction.class !== 'person' || prediction.score < settings.confidence) return false;
  const [x, y, w, h] = prediction.bbox;
  const footX = (x + w / 2) / width;
  const footY = (y + h) / height;
  const margin = (1 - settings.zone) / 2;
  return h / height >= settings.minHeight && footX >= margin && footX <= 1 - margin && footY >= .08 && footY <= 1;
}

// A group must leave for three seconds before another arrival can trigger.
export class ArrivalGate {
  constructor() { this.reset(); }
  reset() { this.hits = 0; this.lastSeen = -Infinity; this.lastScare = -Infinity; this.latched = false; }
  step(present, now, cooldown) {
    if (now - this.lastSeen >= 3000) { this.latched = false; this.hits = 0; }
    if (!present) { this.hits = 0; return false; }
    this.lastSeen = now;
    this.hits++;
    if (!this.latched && this.hits >= 2 && now - this.lastScare >= cooldown) {
      this.lastScare = now;
      this.latched = true;
      return true;
    }
    return false;
  }
}
