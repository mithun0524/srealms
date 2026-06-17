import { Physics } from '../engine/Physics.js';

export class Enemy {
  constructor(game, x, y, type) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.type = type; // puffling, thornback, glider, spitter, burrower, golem, skyhunter, lavawarden

    // Base dimensions
    this.width = 24;
    this.height = 24;

    this.vx = 0;
    this.vy = 0;

    // AI configurations
    this.health = 1;
    this.maxHealth = 1;
    this.active = true;
    this.dying = false;
    this.deathTimer = 0;
    this.onGround = false;

    this.facing = 'left';
    this.damagePower = 1;

    // Spitter cooldowns
    this.attackCooldown = 0;

    // Burrower state
    this.burrowed = true;
    this.burrowState = 'under'; // under, rising, up, sinking

    // Glider state
    this.homeY = y;
    this.gliderState = 'hover'; // hover, diving, returning

    this.initTypeStats();
  }

  initTypeStats() {
    switch (this.type) {
      case 'puffling':
        this.width = 18;
        this.height = 18;
        this.health = 1;
        this.maxHealth = 1;
        break;
      case 'thornback':
        this.width = 28;
        this.height = 20;
        this.health = 2;
        this.maxHealth = 2;
        break;
      case 'glider':
        this.width = 24;
        this.height = 18;
        this.health = 1;
        this.maxHealth = 1;
        this.vy = 0;
        break;
      case 'spitter':
        this.width = 22;
        this.height = 30;
        this.health = 2;
        this.maxHealth = 2;
        break;
      case 'burrower':
        this.width = 24;
        this.height = 24;
        this.health = 1;
        this.maxHealth = 1;
        break;
      // Elites
      case 'golem': // Crystal Golem
        this.width = 32;
        this.height = 44;
        this.health = 5;
        this.maxHealth = 5;
        this.damagePower = 2;
        break;
      case 'skyhunter':
        this.width = 26;
        this.height = 22;
        this.health = 3;
        this.maxHealth = 3;
        break;
      case 'lavawarden':
        this.width = 30;
        this.height = 40;
        this.health = 4;
        this.maxHealth = 4;
        this.damagePower = 2;
        break;
    }
  }

  hit(amount) {
    if (this.dying || !this.active) return;
    this.health -= amount;

    // spawn sparkles
    const colors = {
      puffling: '#f472b6',
      thornback: '#10b981',
      glider: '#3b82f6',
      spitter: '#84cc16',
      burrower: '#a1a1aa',
      golem: '#a855f7',
      skyhunter: '#06b6d4',
      lavawarden: '#ef4444'
    };
    this.game.particles.spawnSparkles(this.x + this.width / 2, this.y + this.height / 2, colors[this.type] || '#ffffff', 8);

    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    this.dying = true;
    this.deathTimer = 400; // 400ms death fade
    this.vx = 0;
    this.vy = 0;
    
    // SFX
    this.game.audio.playSFX('land');

    // Spawn crystals
    let crystalSpawn = 3;
    if (this.type === 'golem' || this.type === 'skyhunter' || this.type === 'lavawarden') {
      crystalSpawn = 12; // Elites drop more
    }
    
    // Add shards directly to level score
    this.game.levelShards += crystalSpawn;
    this.game.ui.updateHUD();

    // Particle burst
    const colors = {
      puffling: '#f472b6',
      thornback: '#10b981',
      glider: '#3b82f6',
      spitter: '#84cc16',
      burrower: '#a1a1aa',
      golem: '#a855f7',
      skyhunter: '#06b6d4',
      lavawarden: '#ef4444'
    };
    this.game.particles.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, colors[this.type] || '#ffffff', 12);
  }

  update(dt) {
    if (!this.active) return;

    if (this.dying) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.active = false;
        this.markedForRemoval = true;
      }
      return;
    }

    const player = this.game.player;
    if (!player) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    this.facing = dx > 0 ? 'right' : 'left';

    switch (this.type) {
      case 'puffling':
        // Bounce hop towards player
        if (this.onGround) {
          this.vy = -4.5;
          this.vx = (dx > 0 ? 1 : -1) * 1.5;
        }
        this.vy += Physics.GRAVITY;
        Physics.resolveCollisions(this, this.game.world);
        break;

      case 'thornback':
        // Charge beetle
        if (this.onGround) {
          // If in range, charge fast! Else walk back/forth
          if (dist < 180 && Math.abs(dy) < 40) {
            this.vx = (dx > 0 ? 1 : -1) * 3.0; // Charge speed
          } else {
            // Idle pacing
            if (Math.abs(this.vx) < 0.1) {
              this.vx = this.facing === 'left' ? -0.8 : 0.8;
            }
            // Check wall bounce
            if (this.onWall) {
              this.vx = -this.vx;
            }
          }
        }
        this.vy += Physics.GRAVITY;
        Physics.resolveCollisions(this, this.game.world);
        break;

      case 'glider':
        // Hover and Dive
        if (this.gliderState === 'hover') {
          // Bobbing slightly
          this.y = this.homeY + Math.sin(this.game.levelTime * 0.003) * 6;
          this.vx = 0;
          this.vy = 0;

          // Check if player is directly underneath
          if (Math.abs(dx) < 40 && dy > 0 && dist < 200) {
            this.gliderState = 'diving';
            this.vy = 6; // dive speed
          }
        } else if (this.gliderState === 'diving') {
          this.y += this.vy;
          // Dive impact or floor collision
          let hitsTile = Physics.getTileCollisions(this, this.game.world).length > 0;
          if (hitsTile || this.y > this.homeY + 200) {
            this.gliderState = 'returning';
            this.vy = -2.0; // Slow rise
          }
        } else if (this.gliderState === 'returning') {
          this.y += this.vy;
          if (this.y <= this.homeY) {
            this.y = this.homeY;
            this.gliderState = 'hover';
          }
        }
        break;

      case 'spitter':
        // Stand and shoot seeds
        this.vx = 0;
        this.vy += Physics.GRAVITY;
        Physics.resolveCollisions(this, this.game.world);

        if (dist < 260) {
          if (this.attackCooldown <= 0) {
            this.fireSeed();
            this.attackCooldown = 1800; // 1.8 seconds cooldown
          }
        }
        if (this.attackCooldown > 0) {
          this.attackCooldown -= dt;
        }
        break;

      case 'burrower':
        // Ambush from ground
        this.vx = 0;
        this.vy += Physics.GRAVITY;
        Physics.resolveCollisions(this, this.game.world);

        if (this.burrowed) {
          this.height = 4; // Flat hit box when hidden
          if (dist < 70) {
            this.burrowed = false;
            this.height = 24;
            this.y -= 20; // pop up
            this.game.audio.playSFX('bounce');
            this.game.particles.spawnDust(this.x + this.width / 2, this.y + this.height, 8);
            
            // Stay up briefly
            setTimeout(() => {
              this.burrowed = true;
              this.height = 4;
            }, 2000);
          }
        }
        break;

      // ELITES
      case 'golem':
        // Heavy slow patrol
        if (this.onGround) {
          if (dist < 150) {
            this.vx = (dx > 0 ? 1 : -1) * 0.8;
          } else {
            if (this.vx === 0) this.vx = 0.5;
            if (this.onWall) this.vx = -this.vx;
          }
        }
        this.vy += Physics.GRAVITY;
        Physics.resolveCollisions(this, this.game.world);
        break;

      case 'skyhunter':
        // Fast flying chaser
        if (dist < 220) {
          this.vx = (dx > 0 ? 1 : -1) * 2.2;
          this.vy = (dy > 0 ? 1 : -1) * 1.5;
        } else {
          this.vx = 0;
          this.vy = Math.sin(this.game.levelTime * 0.004) * 0.8;
        }
        this.x += this.vx;
        this.y += this.vy;
        break;

      case 'lavawarden':
        // Area denial fireball thrower
        this.vx = 0;
        this.vy += Physics.GRAVITY;
        Physics.resolveCollisions(this, this.game.world);

        if (dist < 250) {
          if (this.attackCooldown <= 0) {
            this.fireLavaBall();
            this.attackCooldown = 2200;
          }
        }
        if (this.attackCooldown > 0) {
          this.attackCooldown -= dt;
        }
        break;
    }
  }

  fireSeed() {
    this.game.audio.playSFX('jump');
    // Spawn a spitter seed bullet
    const dx = this.game.player.x - this.x;
    const dy = this.game.player.y - this.y;
    const angle = Math.atan2(dy, dx);

    const bullet = {
      x: this.x + this.width / 2,
      y: this.y + 6,
      width: 8,
      height: 8,
      vx: Math.cos(angle) * 3.5,
      vy: Math.sin(angle) * 3.5,
      active: true,
      damagePower: 1,
      color: '#a3e635',
      glowColor: '#84cc16',
      animTime: 0,
      update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.animTime += dt;
        
        // Remove if hit solid
        let hits = Physics.getTileCollisions(this, this.game.world).length > 0;
        if (hits) this.active = false;
      },
      draw(ctx) {
        ctx.save();
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 8;
        
        // Glow shell
        ctx.fillStyle = 'rgba(132, 204, 22, 0.4)';
        ctx.beginPath();
        const pulse = 1 + Math.sin(this.animTime * 0.01) * 0.15;
        ctx.arc(this.x, this.y, 6 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // High spec highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x - 1, this.y - 1, 1, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    };
    
    // Inject directly into world projectiles
    this.game.world.projectiles.push(bullet);
  }

  fireLavaBall() {
    this.game.audio.playSFX('laser');
    const dx = this.game.player.x - this.x;
    const angle = dx > 0 ? 0.3 : -0.3; // toss arcs

    const bullet = {
      x: this.x + this.width / 2,
      y: this.y - 4,
      width: 12,
      height: 12,
      vx: (dx > 0 ? 1 : -1) * 3.2,
      vy: -5.0, // lob arc
      active: true,
      damagePower: 2,
      color: '#f97316',
      game: this.game,
      animTime: 0,
      update(dt) {
        this.vy += Physics.GRAVITY * 0.8;
        this.x += this.vx;
        this.y += this.vy;
        this.animTime += dt;
        
        // spawn spark embers
        if (Math.random() < 0.45) {
          this.game.particles.spawnFlame(this.x, this.y, 1);
        }

        let hits = Physics.getTileCollisions(this, this.game.world).length > 0;
        if (hits) {
          this.active = false;
          // explode splash sparks
          this.game.particles.spawnExplosion(this.x, this.y, '#f97316', 8);
        }
      },
      draw(ctx) {
        ctx.save();
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 12;

        // Plasma heat shell
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
        ctx.fill();

        // Lava Core
        let grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 6);
        grad.addColorStop(0, '#fef08a'); // Bright center
        grad.addColorStop(0.5, '#f97316'); // Orange core
        grad.addColorStop(1, '#ef4444'); // Red edge
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 5.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    };
    this.game.world.projectiles.push(bullet);
  }

  // --- DRAWING PROCEDURAL VECTOR GRAPHICS FOR ENEMIES ---
  draw(ctx) {
    if (!this.active) return;
    
    ctx.save();
    
    if (this.dying) {
      ctx.globalAlpha = Math.max(0, this.deathTimer / 400);
    }

    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
    const facingMult = this.facing === 'right' ? 1 : -1;

    switch (this.type) {
      case 'puffling': {
        // --- Premium Bouncing Shadow Puffling ---
        // Concentric shadow gaseous field
        const pulse = Math.sin(this.game.levelTime * 0.012) * 2.5;
        
        ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
        ctx.beginPath();
        ctx.arc(0, 0, this.width / 2 + 7 + pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, this.width / 2 + 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        // squash/stretch on bounce
        let bounceScaleY = 1;
        let bounceScaleX = 1;
        if (this.vy > 0.5) { bounceScaleY = 1.18; bounceScaleX = 0.82; }
        else if (this.vy < -0.5) { bounceScaleY = 0.82; bounceScaleX = 1.18; }
        ctx.scale(bounceScaleX, bounceScaleY);

        // Solid shadow body
        let bodyGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, this.width / 2);
        bodyGrad.addColorStop(0, '#3b0764'); // Dark purple core
        bodyGrad.addColorStop(0.7, '#0f051d'); // Indigo body
        bodyGrad.addColorStop(1, '#020005'); // Outer edge
        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = '#d946ef'; // Neon pink boundary
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Angry Visor Visage
        ctx.fillStyle = '#f472b6'; // Neon pink visor slit
        ctx.shadowColor = '#f472b6';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(0 * facingMult, -3);
        ctx.lineTo(6 * facingMult, -3.5);
        ctx.lineTo(5 * facingMult, -0.5);
        ctx.lineTo(0 * facingMult, -1);
        ctx.closePath();
        ctx.fill();

        // Symmetrical minor eye check
        ctx.beginPath();
        ctx.moveTo(-2 * facingMult, -3.2);
        ctx.lineTo(-5 * facingMult, -3.5);
        ctx.lineTo(-4 * facingMult, -1);
        ctx.lineTo(-2 * facingMult, -1.2);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        break;
      }

      case 'thornback': {
        // --- Volcanic Magma Beetle ---
        // Rugged segmented obsidian shell
        ctx.fillStyle = '#0f172a'; // Base black stone
        ctx.strokeStyle = '#334155'; // Rock highlights
        ctx.lineWidth = 1.5;

        // Draw craggy main body
        ctx.beginPath();
        ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 6);
        ctx.fill();
        ctx.stroke();

        // Glowing magma fissures threading through shell
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-10, -2); ctx.lineTo(-4, 4); ctx.lineTo(6, -3);
        ctx.moveTo(-6, 4); ctx.lineTo(2, 6);
        ctx.stroke();

        // Spikes on back: Orange-to-Yellow gradient
        ctx.save();
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 8;
        let spikeGrad = ctx.createLinearGradient(0, -this.height / 2, 0, -this.height / 2 - 6);
        spikeGrad.addColorStop(0, '#ef4444');
        spikeGrad.addColorStop(0.6, '#f97316');
        spikeGrad.addColorStop(1, '#facc15');
        ctx.fillStyle = spikeGrad;

        // Draw 3 angled spikes
        const drawSpike = (sx, sy, h) => {
          ctx.beginPath();
          ctx.moveTo(sx - 3, sy);
          ctx.lineTo(sx, sy - h);
          ctx.lineTo(sx + 3, sy);
          ctx.closePath();
          ctx.fill();
        };
        drawSpike(-this.width / 2 + 5, -this.height / 2, 6);
        drawSpike(0, -this.height / 2, 7.5);
        drawSpike(this.width / 2 - 5, -this.height / 2, 6);
        ctx.restore();

        // Legs with glowing joints
        ctx.fillStyle = '#1e293b';
        const legWalk = Math.sin(this.game.levelTime * 0.015) * 4;
        ctx.fillRect(-10, this.height / 2, 3.5, 4 + legWalk);
        ctx.fillRect(0, this.height / 2, 3.5, 4 - legWalk);
        ctx.fillRect(8, this.height / 2, 3.5, 4 + legWalk);

        // Cyber glowing visor
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.roundRect(this.width / 2 - 4.5 * facingMult, -4, 4.5 * facingMult, 2.5, 1);
        ctx.fill();
        break;
      }

      case 'glider': {
        // --- Cyber Void Drone ---
        // Sleek mechanical body
        let droneGrad = ctx.createLinearGradient(0, -6, 0, 6);
        droneGrad.addColorStop(0, '#475569');
        droneGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = droneGrad;
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Energy wings: semi-transparent neon cyan light
        const wingSway = Math.sin(this.game.levelTime * 0.012) * 7;
        ctx.save();
        ctx.fillStyle = 'rgba(34, 211, 238, 0.45)';
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.8;
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 8;

        // Left Wing
        ctx.beginPath();
        ctx.moveTo(-6, -1);
        ctx.lineTo(-20, -7 + wingSway);
        ctx.lineTo(-12, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right Wing
        ctx.beginPath();
        ctx.moveTo(6, -1);
        ctx.lineTo(20, -7 + wingSway);
        ctx.lineTo(12, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Cyber laser visor eye
        ctx.fillStyle = '#22d3ee';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.roundRect(4 * facingMult, -3.5, 6 * facingMult, 2.5, 1);
        ctx.fill();

        // Jet thrust flame in back
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        const jetW = 3 + Math.sin(this.game.levelTime * 0.04) * 2.5;
        ctx.moveTo(-8 * facingMult, -3);
        ctx.lineTo(-15 * facingMult, 0);
        ctx.lineTo(-8 * facingMult, 3);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'spitter': {
        // --- Bio-Luminescent Spore ---
        // Organic stalk with glowing rings
        ctx.fillStyle = '#1e3a1e'; // Dark moss green
        ctx.fillRect(-3, 0, 6, this.height / 2);
        
        ctx.fillStyle = '#4ade80'; // Neon green ring
        ctx.fillRect(-3.5, 4, 7, 2.5);

        // Pulsing spore sac bulb
        const pulse = 1 + Math.sin(this.game.levelTime * 0.008) * 0.08;
        ctx.save();
        ctx.scale(pulse, pulse);
        
        // Glow back
        ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
        ctx.beginPath();
        ctx.arc(0, -this.height / 2 + 10, 12, 0, Math.PI * 2);
        ctx.fill();

        // Spore outer shell
        let bulbGrad = ctx.createRadialGradient(-2, -this.height / 2 + 8, 1, 0, -this.height / 2 + 10, 9);
        bulbGrad.addColorStop(0, '#86efac'); // bright core
        bulbGrad.addColorStop(0.6, '#22c55e'); // Green body
        bulbGrad.addColorStop(1, '#14532d'); // Dark green edge
        ctx.fillStyle = bulbGrad;
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, -this.height / 2 + 10, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Dark toxic seeds suspended inside
        ctx.fillStyle = '#166534';
        ctx.beginPath();
        ctx.arc(-3, -this.height / 2 + 8, 2, 0, Math.PI * 2);
        ctx.arc(3, -this.height / 2 + 12, 1.8, 0, Math.PI * 2);
        ctx.arc(1, -this.height / 2 + 7, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Spitting mouth nozzle pointing towards player direction
        ctx.fillStyle = '#0f2f0f';
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(3.5 * facingMult, -this.height / 2 + 8, 5.5 * facingMult, 4, 1.5);
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'burrower': {
        // --- Magma Grinder ---
        if (this.burrowed) {
          // Craggy lava rock pile when hidden
          ctx.fillStyle = '#27272a'; // dark granite stone
          ctx.strokeStyle = '#52525b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(0, 8, 13, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Magma crack
          ctx.strokeStyle = '#ea580c';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(-7, 7); ctx.lineTo(-2, 9); ctx.lineTo(6, 6);
          ctx.stroke();
        } else {
          // Unburrowed: Magma Drill shell
          let coreGrad = ctx.createLinearGradient(0, -this.height / 2, 0, this.height / 2);
          coreGrad.addColorStop(0, '#52525b');
          coreGrad.addColorStop(1, '#18181b');
          ctx.fillStyle = coreGrad;
          ctx.strokeStyle = '#f97316'; // orange glowing edge
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 4);
          ctx.fill();
          ctx.stroke();

          // Grinder spiraling metal drill lines
          ctx.strokeStyle = '#3f3f46';
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(-10, -6); ctx.lineTo(10, -1);
          ctx.moveTo(-10, 0); ctx.lineTo(10, 5);
          ctx.moveTo(-10, 6); ctx.lineTo(10, 11);
          ctx.stroke();

          // Angry Visor
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(-6, -8);
          ctx.lineTo(6, -8);
          ctx.lineTo(4, -5);
          ctx.lineTo(-4, -5);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }

      // --- ELITE ENEMIES ---
      case 'golem': {
        // --- Colossal Crystal Golem ---
        // Rock block shoulders and head
        ctx.fillStyle = '#1e1b4b'; // midnight rock
        ctx.strokeStyle = '#312e81';
        ctx.lineWidth = 2.0;

        // Draw Left Fist / Shoulder
        ctx.beginPath();
        ctx.roundRect(-this.width / 2 - 4, -this.height / 2 + 10, 7, 24, 2);
        ctx.fill();
        ctx.stroke();

        // Draw Right Fist / Shoulder
        ctx.beginPath();
        ctx.roundRect(this.width / 2 - 3, -this.height / 2 + 10, 7, 24, 2);
        ctx.fill();
        ctx.stroke();

        // Main rocky torso
        ctx.beginPath();
        ctx.roundRect(-this.width / 2 + 2, -this.height / 2, this.width - 4, this.height, 5);
        ctx.fill();
        ctx.stroke();

        // Glowing amethyst fissure core in center chest
        ctx.save();
        ctx.fillStyle = '#c084fc';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 10;
        
        const corePulse = Math.sin(this.game.levelTime * 0.01) * 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4 + corePulse, 0);
        ctx.lineTo(0, 6);
        ctx.lineTo(-4 - corePulse, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Rune symbols on rock limbs
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, -12); ctx.lineTo(-6, -12); ctx.lineTo(-10, -8);
        ctx.moveTo(10, -12); ctx.lineTo(6, -12); ctx.lineTo(10, -8);
        ctx.stroke();

        // Eye slit
        ctx.fillStyle = '#d946ef';
        ctx.beginPath();
        ctx.fillRect(-5, -17, 10, 2.5);
        break;
      }

      case 'skyhunter': {
        // --- Cyber Sentinel Drone ---
        // Metallic circular turbine body
        let metalGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 11);
        metalGrad.addColorStop(0, '#64748b');
        metalGrad.addColorStop(0.7, '#334155');
        metalGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = metalGrad;
        ctx.strokeStyle = '#06b6d4'; // Cyan ring
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner rotor fans
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const spinAngle = this.game.levelTime * 0.02;
        ctx.moveTo(Math.cos(spinAngle) * 9, Math.sin(spinAngle) * 9);
        ctx.lineTo(Math.cos(spinAngle + Math.PI) * 9, Math.sin(spinAngle + Math.PI) * 9);
        ctx.moveTo(Math.cos(spinAngle + Math.PI/2) * 9, Math.sin(spinAngle + Math.PI/2) * 9);
        ctx.lineTo(Math.cos(spinAngle - Math.PI/2) * 9, Math.sin(spinAngle - Math.PI/2) * 9);
        ctx.stroke();

        // Side thruster pods
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-15, -4, 4, 8);
        ctx.fillRect(11, -4, 4, 8);

        // Cyber searchlight cone (semi-transparent overlay)
        ctx.save();
        let searchGrad = ctx.createLinearGradient(0, 0, 20 * facingMult, 80);
        searchGrad.addColorStop(0, 'rgba(253, 224, 71, 0.45)');
        searchGrad.addColorStop(0.4, 'rgba(253, 224, 71, 0.12)');
        searchGrad.addColorStop(1, 'rgba(253, 224, 71, 0.0)');
        ctx.fillStyle = searchGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(30 * facingMult - 25, 80);
        ctx.lineTo(30 * facingMult + 25, 80);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Visor eye
        ctx.fillStyle = '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 6;
        ctx.fillRect(4 * facingMult, -4, 6 * facingMult, 2.5);
        break;
      }

      case 'lavawarden': {
        // --- Volcanic Fire Spirit ---
        // Floating carbon plate armor cuffs
        ctx.fillStyle = '#18181b';
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 1.5;
        // Left hand plate
        ctx.fillRect(-this.width / 2 - 3, 2, 5, 14);
        // Right hand plate
        ctx.fillRect(this.width / 2 - 2, 2, 5, 14);

        // Core magma body
        let lavaGrad = ctx.createLinearGradient(0, -this.height / 2, 0, this.height / 2);
        lavaGrad.addColorStop(0, '#f97316'); // Bright hot top
        lavaGrad.addColorStop(0.5, '#ef4444');
        lavaGrad.addColorStop(1, '#7f1d1d'); // Cold core base
        ctx.fillStyle = lavaGrad;

        // Flickering fire tail
        ctx.save();
        ctx.shadowColor = '#ea580c';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        const flick = Math.sin(this.game.levelTime * 0.025) * 4;
        ctx.moveTo(-11, -10);
        ctx.bezierCurveTo(-15, 10, -8 + flick, 22, 0, this.height / 2);
        ctx.bezierCurveTo(8 + flick, 22, 15, 10, 11, -10);
        ctx.closePath();
        ctx.fill();

        // Glowing fire crown
        const flameH = -this.height / 2 - 6 + Math.sin(this.game.levelTime * 0.015) * 4;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(-8, -this.height / 2 + 2);
        ctx.lineTo(-4, flameH + 2);
        ctx.lineTo(0, -this.height / 2 - 2);
        ctx.lineTo(4, flameH + 2);
        ctx.lineTo(8, -this.height / 2 + 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Dark floating mask
        ctx.fillStyle = '#27272a';
        ctx.beginPath();
        ctx.roundRect(-6, -15, 12, 10, 3);
        ctx.fill();

        // Visor eyes inside mask
        ctx.fillStyle = '#facc15';
        ctx.fillRect(-4, -12, 2.5, 2);
        ctx.fillRect(1.5, -12, 2.5, 2);
        break;
      }
    }

    ctx.restore();
  }
}
