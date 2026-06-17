export class Particle {
  constructor(x, y, vx, vy, color, size, maxLife, type = 'pixel') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.maxLife = maxLife;
    this.life = maxLife;
    this.type = type; // pixel, circle, glow, feather, bubble
  }

  update(dt) {
    this.x += this.vx;
    this.y += this.vy;
    this.life -= dt;
    
    // Bubble float up, snow float down
    if (this.type === 'bubble') {
      this.vy -= 0.02;
    } else if (this.type === 'snow') {
      this.vx += (Math.random() * 0.1 - 0.05);
    }
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;

    if (this.type === 'circle' || this.type === 'bubble' || this.type === 'glow') {
      if (this.type === 'glow') {
        ctx.shadowBlur = this.size * 2;
        ctx.shadowColor = this.color;
      }
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'feather') {
      // Wind feathers
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.beginPath();
      ctx.ellipse(0, 0, this.size * 2, this.size / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Default: Square/pixel particle
      ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    }
    ctx.restore();
  }
}

export class ParticleSystem {
  constructor(game) {
    this.game = game;
    this.particles = [];
  }

  clear() {
    this.particles = [];
  }

  update(dt) {
    // If not playing, spawn ambient menu stars
    if (this.game.state !== 'playing' && this.game.state !== 'paused') {
      if (Math.random() < 0.15) {
        const x = Math.random() * this.game.width;
        const y = this.game.height + 10;
        const vx = (Math.random() * 0.4 - 0.2);
        const vy = -(Math.random() * 0.8 + 0.4);
        const color = Math.random() > 0.5 ? 'rgba(168, 85, 247, 0.4)' : 'rgba(6, 182, 212, 0.4)';
        this.particles.push(new Particle(x, y, vx, vy, color, Math.random() * 3 + 1, 2000, 'circle'));
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    for (let p of this.particles) {
      p.draw(ctx);
    }
  }

  // --- SPECIFIC SPAWNERS ---
  spawnDust(x, y, count = 6) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() * 2 - 1);
      const vy = -(Math.random() * 1 + 0.2);
      const size = Math.random() * 3 + 2;
      const life = Math.random() * 300 + 200;
      this.particles.push(new Particle(x, y, vx, vy, 'rgba(200, 200, 200, 0.5)', size, life, 'circle'));
    }
  }

  spawnSparkles(x, y, color = '#eab308', count = 5) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 1;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = Math.random() * 2 + 1.5;
      const life = Math.random() * 400 + 200;
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'glow'));
    }
  }

  spawnExplosion(x, y, color = '#ef4444', count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1.5;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = Math.random() * 4 + 2;
      const life = Math.random() * 600 + 300;
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'circle'));
    }
  }

  spawnFlame(x, y, count = 2) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() * 1 - 0.5);
      const vy = -(Math.random() * 1.5 + 0.5);
      const size = Math.random() * 4 + 2;
      const life = Math.random() * 400 + 200;
      const colors = ['#f97316', '#ef4444', '#eab308'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'glow'));
    }
  }

  spawnSnow(x, y, count = 1) {
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() * 1 - 0.5);
      const vy = (Math.random() * 0.8 + 0.4);
      const size = Math.random() * 2 + 1;
      const life = Math.random() * 2000 + 1000;
      this.particles.push(new Particle(x, y, vx, vy, '#ffffff', size, life, 'snow'));
    }
  }

  spawnShadow(x, y, count = 2) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 0.6 + 0.2;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = Math.random() * 4 + 2;
      const life = Math.random() * 600 + 200;
      this.particles.push(new Particle(x, y, vx, vy, '#d946ef', size, life, 'glow'));
    }
  }

  spawnGlideFeathers(x, y, count = 1) {
    for (let i = 0; i < count; i++) {
      const vx = -1.5 - Math.random() * 1;
      const vy = (Math.random() * 0.4 - 0.2);
      const size = Math.random() * 2 + 1;
      const life = Math.random() * 400 + 200;
      this.particles.push(new Particle(x, y, vx, vy, 'rgba(255, 255, 255, 0.7)', size, life, 'feather'));
    }
  }
}
