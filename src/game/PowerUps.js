export class PowerUp {
  constructor(type, duration) {
    this.type = type; // wind, thunder, shield, time, fire
    this.maxDuration = duration; // ms
    this.duration = duration; // ms
    this.active = true;
  }

  update(dt) {
    this.duration -= dt;
    if (this.duration <= 0) {
      this.active = false;
    }
  }

  getRatio() {
    return Math.max(0, this.duration / this.maxDuration);
  }
}

export class PowerUpManager {
  static DURATION = 8000; // 8 seconds base duration

  constructor(player) {
    this.player = player;
    this.activePowerUps = {};
  }

  activate(type) {
    this.player.game.audio.playSFX('victory_relic');
    
    if (type === 'shield') {
      // Shield is binary (hit protection) rather than duration based, but we can give it a visual shield value
      this.activePowerUps[type] = new PowerUp(type, 999999); // Indefinite until hit
      this.player.hasShield = true;
    } else {
      this.activePowerUps[type] = new PowerUp(type, PowerUpManager.DURATION);
    }
    
    this.player.game.ui.updateHUDPowerUps();
  }

  update(dt) {
    for (let key in this.activePowerUps) {
      const p = this.activePowerUps[key];
      if (key === 'shield') {
        if (!this.player.hasShield) {
          delete this.activePowerUps[key];
          this.player.game.ui.updateHUDPowerUps();
        }
        continue;
      }

      p.update(dt);
      
      // Apply passive particles
      if (p.active) {
        if (key === 'fire' && Math.random() < 0.3) {
          this.player.game.particles.spawnFlame(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 1);
        } else if (key === 'wind' && Math.random() < 0.2) {
          this.player.game.particles.spawnGlideFeathers(this.player.x + this.player.width / 2, this.player.y + this.player.height, 1);
        } else if (key === 'thunder' && Math.random() < 0.3) {
          this.player.game.particles.spawnSparkles(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#60a5fa', 1);
        }
      } else {
        delete this.activePowerUps[key];
        this.player.game.ui.updateHUDPowerUps();
      }
    }
  }

  has(type) {
    return !!this.activePowerUps[type];
  }

  get(type) {
    return this.activePowerUps[type];
  }

  clear() {
    this.activePowerUps = {};
    this.player.hasShield = false;
  }
}
