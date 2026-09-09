/** Small, interruptible performance layered over the original resting smile. */
export class FaceExpression {
  blink = 0;
  sob = 0;
  laugh = 0;
  time = 0;
  surprise = 0;
  private airborne = false;
  private flightSpeed = 0;
  private hardLanding = 0;
  private celebration = 0;
  celebrate() {
    this.celebration = 1.4;
  }
  private held = false;
  private heldFor = 0;
  private releaseFor = 10;
  private blinkAt = 2.4;
  private blinkFor = -1;
  private doubleBlink = false;
  reset() {
    this.blink = 0;
    this.sob = 0;
    this.laugh = 0;
    this.time = 0;
    this.surprise = 0;
    this.airborne = false;
    this.flightSpeed = 0;
    this.hardLanding = 0;
    this.celebration = 0;
    this.held = false;
    this.heldFor = 0;
    this.releaseFor = 10;
    this.blinkAt = 2.4;
    this.blinkFor = -1;
    this.doubleBlink = false;
  }
  update(dt: number, grabbed: boolean, airborne = false, speed = 0) {
    dt = Math.min(0.05, Math.max(0, dt));
    this.time += dt;
    if (airborne && !grabbed && Number.isFinite(speed))
      this.flightSpeed = Math.max(this.flightSpeed, speed);
    if (this.airborne && !airborne && !grabbed) {
      this.blinkFor = 0;
      this.hardLanding = this.flightSpeed > 0.44 ? 0.22 : 0;
    }
    if (!airborne || grabbed) this.flightSpeed = 0;
    this.hardLanding = Math.max(0, this.hardLanding - dt);
    this.airborne = airborne;
    this.surprise += ((airborne && !grabbed ? 1 : 0) - this.surprise) * (1 - Math.exp(-10 * dt));
    if (this.surprise < 0.0001) this.surprise = 0;
    this.celebration = Math.max(0, this.celebration - dt);
    if (this.held && !grabbed && this.heldFor > 0.12) this.releaseFor = 0;
    this.heldFor = grabbed ? this.heldFor + dt : 0;
    this.held = grabbed;
    this.releaseFor += dt;
    const squeezed = grabbed || this.hardLanding > 0;
    this.sob += ((squeezed ? 1 : 0) - this.sob) * (1 - Math.exp(-dt * (squeezed ? 10 : 7)));
    // A little breath after release, then buoyant chuckles, then home.
    const laughTarget =
      !grabbed && this.releaseFor > 0.22 && this.releaseFor < 1.65
        ? Math.sin((Math.PI * (this.releaseFor - 0.22)) / 1.43)
        : 0;
    const joy = !grabbed && this.celebration > 0 ? Math.sin((Math.PI * this.celebration) / 1.4) : 0;
    this.laugh += (Math.max(laughTarget, joy) - this.laugh) * (1 - Math.exp(-12 * dt));
    if (this.sob < 0.0001) this.sob = 0;
    if (this.laugh < 0.0001) this.laugh = 0;
    this.blinkAt -= dt;
    if (this.blinkAt <= 0 && this.blinkFor < 0 && !airborne) {
      this.blinkFor = 0;
      this.blinkAt = this.doubleBlink
        ? 2.8 + Math.random() * 2.8
        : Math.random() < 0.22
          ? 0.32
          : 2.8 + Math.random() * 2.8;
      this.doubleBlink = this.blinkAt === 0.32;
    }
    if (this.blinkFor >= 0) {
      this.blinkFor += dt;
      const t = this.blinkFor;
      this.blink =
        t < 0.065
          ? Math.sin(((t / 0.065) * Math.PI) / 2)
          : t < 0.095
            ? 1
            : Math.max(0, Math.cos((((t - 0.095) / 0.12) * Math.PI) / 2));
      if (t >= 0.215) {
        this.blinkFor = -1;
        this.blink = 0;
      }
    }
  }
}
