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
      color: '#84cc16',
      update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        
        // Remove if hit solid
        let hits = Physics.getTileCollisions(this, this.game.world).length > 0;
        if (hits) this.active = false;
      },
      draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
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
      update(dt) {
        this.vy += Physics.GRAVITY * 0.8;
        this.x += this.vx;
        this.y += this.vy;
        
        // spawn spark embers
        if (Math.random() < 0.3) {
          this.game.particles.spawnFlame(this.x, this.y, 1);
        }

        let hits = Physics.getTileCollisions(this, this.game.world).length > 0;
        if (hits) {
          this.active = false;
          // explode splash sparks
          this.game.particles.spawnExplosion(this.x, this.y, '#f97316', 6);
        }
      },
      draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
        ctx.fill();
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
      case 'puffling':
        // Pink bouncing ball
        ctx.fillStyle = '#f472b6';
        ctx.beginPath();
        // squash/stretch on bounce
        let bounceScaleY = 1;
        let bounceScaleX = 1;
        if (this.vy > 0.5) { bounceScaleY = 1.15; bounceScaleX = 0.85; }
        else if (this.vy < -0.5) { bounceScaleY = 0.85; bounceScaleX = 1.15; }
        ctx.scale(bounceScaleX, bounceScaleY);
        ctx.arc(0, 0, this.width / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Eye
        ctx.fillStyle = '#000';
        ctx.fillRect(2 * facingMult, -2, 2, 2);
        break;

      case 'thornback':
        // Armored green beetle
        ctx.fillStyle = '#065f46'; // dark green shell
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        
        // Yellow spikes on back
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-this.width / 2 + 4, -this.height / 2 - 4, 4, 4);
        ctx.fillRect(this.width / 2 - 8, -this.height / 2 - 4, 4, 4);
        
        // Eyes
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(this.width / 2 - 4, -2, 2, 2);
        break;

      case 'glider':
        // Blue bat-wing bird
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wings
        ctx.fillStyle = '#1d4ed8';
        ctx.beginPath();
        const wingSway = Math.sin(this.game.levelTime * 0.01) * 8;
        ctx.moveTo(-6, 0);
        ctx.lineTo(-18, -4 + wingSway);
        ctx.lineTo(-10, 4);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(18, -4 + wingSway);
        ctx.lineTo(10, 4);
        ctx.closePath();
        ctx.fill();
        break;

      case 'spitter':
        // Yellow-green plant
        ctx.fillStyle = '#4d7c0f'; // Stem
        ctx.fillRect(-4, 0, 8, this.height / 2);
        
        // Red flower head
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(0, -this.height / 2 + 10, 8, 0, Math.PI*2);
        ctx.fill();

        // Yellow core
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(0, -this.height / 2 + 10, 4, 0, Math.PI*2);
        ctx.fill();
        break;

      case 'burrower':
        // Ambush mole/rock
        if (this.burrowed) {
          ctx.fillStyle = '#78350f'; // dirt mound
          ctx.beginPath();
          ctx.ellipse(0, 8, 12, 4, 0, 0, Math.PI*2);
          ctx.fill();
          // tiny eyes peaking
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-3, 6, 1.5, 1.5);
          ctx.fillRect(2, 6, 1.5, 1.5);
        } else {
          // Popped up grey mole
          ctx.fillStyle = '#52525b';
          ctx.beginPath();
          ctx.roundRect(-this.width/2, -this.height/2, this.width, this.height, 8);
          ctx.fill();

          // Angry eyes
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-6, -4, 3, 2);
          ctx.fillRect(3, -4, 3, 2);
        }
        break;

      // ELITES
      case 'golem':
        // Big purple rock golem
        ctx.fillStyle = '#5b21b6';
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-this.width/2, -this.height/2, this.width, this.height, 4);
        ctx.fill();
        ctx.stroke();

        // Eye cracks
        ctx.fillStyle = '#e9d5ff';
        ctx.fillRect(-6, -10, 4, 2);
        ctx.fillRect(2, -10, 4, 2);
        break;

      case 'skyhunter':
        // Glowing cyan flying bird/drone
        ctx.fillStyle = '#0891b2';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        // Wings
        ctx.fillStyle = '#06b6d4';
        const hWing = Math.sin(this.game.levelTime * 0.015) * 12;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-20 * facingMult, -6 + hWing);
        ctx.lineTo(-12 * facingMult, 8);
        ctx.closePath();
        ctx.fill();

        // Cyber red visor
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(4 * facingMult, -3, 6 * facingMult, 3);
        break;

      case 'lavawarden':
        // Volcano magma core demon
        ctx.fillStyle = '#1e293b'; // dark char stone
        ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        
        // Lava veins glowing
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-8, -12, 16, 4);
        ctx.fillRect(-4, 0, 8, 4);
        ctx.fillRect(-6, 8, 12, 4);
        
        // Fire head
        ctx.fillStyle = '#ef4444';
        const flameY = -this.height/2 - 4 + Math.sin(this.game.levelTime * 0.01) * 3;
        ctx.beginPath();
        ctx.moveTo(-10, -this.height/2);
        ctx.quadraticCurveTo(0, flameY - 8, 10, -this.height/2);
        ctx.lineTo(0, -this.height/2);
        ctx.closePath();
        ctx.fill();
        break;
    }

    ctx.restore();
  }
}
