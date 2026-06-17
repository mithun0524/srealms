import { Physics } from '../engine/Physics.js';
import { PowerUpManager } from './PowerUps.js';

export class Player {
  constructor(game, x, y) {
    this.game = game;
    this.x = x;
    this.y = y;
    
    // Size
    this.width = 24;
    this.height = 38;

    // Physics velocities
    this.vx = 0;
    this.vy = 0;

    // Movement attributes
    this.speed = 3.6;
    this.jumpHeight = 6.8;
    this.onGround = false;
    this.onWall = false;
    this.onWallSide = null;

    // Ability States & Progression
    this.hasDoubleJumped = false;
    this.isGliding = false;
    this.isDashing = false;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.hasAirDashed = false;
    this.isGroundPounding = false;

    // Attack State
    this.isAttacking = false;
    this.attackTimer = 0;
    this.facing = 'right'; // left, right

    // Stats
    this.maxHealth = 3;
    this.health = 3;
    this.maxEnergy = 100;
    this.energy = 100;

    // Buffs Manager
    this.powerups = new PowerUpManager(this);
    this.hasShield = false;

    // Invulnerability
    this.invulnTimer = 0;
    this.active = true;

    // Animation bobbing
    this.animTime = 0;
    this.runCycle = 0;
    this.history = [];
  }

  isInvulnerable() {
    return this.invulnTimer > 0;
  }

  damage(amount) {
    if (this.isInvulnerable() || !this.active) return;
    
    if (this.hasShield) {
      this.hasShield = false;
      this.invulnTimer = 1000;
      this.game.audio.playSFX('damage');
      this.game.camera.shake(200, 6);
      return;
    }

    this.health -= amount;
    this.invulnTimer = 1500; // 1.5 seconds invuln
    this.game.audio.playSFX('damage');
    this.game.camera.shake(300, 8);

    if (this.health <= 0) {
      this.die();
    } else {
      this.game.ui.updateHUD();
    }
  }

  die() {
    this.active = false;
    this.vx = 0;
    this.vy = 0;
    this.game.audio.playSFX('defeat');
    this.game.camera.shake(500, 12);
    this.game.particles.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, '#ef4444', 25);
    
    setTimeout(() => {
      this.game.changeState('gameover');
      this.game.ui.showGameOverScreen(this.game.levelShards, this.game.levelRelics);
    }, 1200);
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.game.ui.updateHUD();
    this.game.particles.spawnSparkles(this.x + this.width / 2, this.y + this.height / 2, '#10b981', 10);
  }

  increaseMaxHealth() {
    this.maxHealth = Math.min(6, this.maxHealth + 1);
    this.health = this.maxHealth;
    this.game.ui.updateHUD();
    this.game.particles.spawnSparkles(this.x + this.width / 2, this.y + this.height / 2, '#ef4444', 15);
  }

  update(dt) {
    if (!this.active) return;

    // Save history for trail / cape cloth sway
    this.history.push({ x: this.x, y: this.y });
    if (this.history.length > 8) this.history.shift();

    // Timers
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    
    // Update active powerups
    this.powerups.update(dt);

    // Dynamic animation time ticks
    this.animTime += dt;

    // Replenish Energy
    if (!this.isDashing && !this.isGliding) {
      this.energy = Math.min(this.maxEnergy, this.energy + dt * 0.04);
    }
    this.game.ui.updateHUDEnergy();

    // Check unlocks
    const canUse = (ability) => this.game.saveData.unlockedAbilities.includes(ability);

    // --- ATTACK TRIGGER ---
    if (this.game.input.keys.interact && !this.isAttacking && !this.isDashing) {
      this.isAttacking = true;
      this.attackTimer = 160; // 160ms attack
      this.game.audio.playSFX('jump'); // Whistle/swipe
      this.performAttackSwipe();
    }

    if (this.isAttacking) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
      }
    }

    // --- DASH STATE RESOLVE ---
    if (this.isDashing) {
      this.dashTimer -= dt;
      this.vy = 0; // Freeze gravity while dashing
      
      // Spawn trail particles
      if (Math.random() < 0.5) {
        const trailColor = this.getTrailColor();
        this.game.particles.particles.push({
          x: this.x + Math.random() * this.width,
          y: this.y + Math.random() * this.height,
          vx: -this.vx * 0.1,
          vy: 0,
          color: trailColor,
          size: Math.random() * 4 + 2,
          maxLife: 200,
          life: 200,
          type: 'glow',
          update(dt) { this.life -= dt; },
          draw(ctx) {
            ctx.save();
            ctx.globalAlpha = this.life / this.maxLife;
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.size, this.size);
            ctx.restore();
          }
        });
      }

      if (this.dashTimer <= 0) {
        this.isDashing = false;
        this.vx = 0;
      }
      Physics.resolveCollisions(this, this.game.world);
      return; // Skip normal movement
    }

    // --- NORMAL MOVEMENT AND INPUTS ---
    // Horizontal Acceleration
    let moveDir = 0;
    if (this.game.input.keys.left) moveDir = -1;
    if (this.game.input.keys.right) moveDir = 1;

    if (moveDir !== 0) {
      this.facing = moveDir > 0 ? 'right' : 'left';
      let speedMultiplier = this.powerups.has('wind') ? 1.4 : 1.0;
      this.vx = moveDir * this.speed * speedMultiplier;
      this.runCycle += 0.12;
    } else {
      this.vx = 0;
    }

    // Gravity
    let currentGravity = Physics.GRAVITY;
    let terminalV = Physics.TERMINAL_VELOCITY;

    // Glide check
    this.isGliding = false;
    if (!this.onGround && this.game.input.keys.up && this.vy > 0.5 && canUse('glide')) {
      this.isGliding = true;
      currentGravity = Physics.GLIDE_GRAVITY;
      terminalV = Physics.GLIDE_TERMINAL_VELOCITY;
      
      if (Math.random() < 0.15) {
        this.game.particles.spawnGlideFeathers(this.x + this.width / 2, this.y + this.height);
      }
    }

    // Apply gravity
    if (!this.onGround) {
      this.vy = Math.min(terminalV, this.vy + currentGravity);
    }

    // Reset double jump on ground
    if (this.onGround) {
      this.hasDoubleJumped = false;
      this.hasAirDashed = false;
      this.isGroundPounding = false;
    }

    // --- JUMPS AND DOUBLE JUMPS ---
    if (this.game.input.keys.up) {
      if (this.onGround) {
        // Normal Jump
        this.vy = -this.jumpHeight;
        this.onGround = false;
        this.game.audio.playSFX('jump');
        this.game.particles.spawnDust(this.x + this.width / 2, this.y + this.height, 8);
        this.game.input.keys.up = false; // consume input
      } 
      // Wall Jump
      else if (this.onWall && canUse('walljump') && !this.onGround) {
        this.vy = -this.jumpHeight * 0.9;
        this.vx = (this.onWallSide === 'left' ? 1 : -1) * this.speed * 1.5;
        this.game.audio.playSFX('jump');
        this.game.particles.spawnDust(this.x + (this.onWallSide === 'left' ? 0 : this.width), this.y + this.height / 2, 6);
        this.game.input.keys.up = false; // consume
      }
      // Double Jump
      else if (!this.hasDoubleJumped && canUse('doublejump')) {
        this.vy = -this.jumpHeight * 0.95;
        this.hasDoubleJumped = true;
        this.game.audio.playSFX('jump');
        this.game.particles.spawnDust(this.x + this.width / 2, this.y + this.height, 10);
        this.game.input.keys.up = false; // consume
      }
    }

    // --- WALL SLIDE CAP ---
    if (this.onWall && this.vy > 0.8 && canUse('wallslide') && !this.onGround) {
      this.vy = 0.8; // Slide speed cap
      if (Math.random() < 0.1) {
        this.game.particles.spawnDust(this.x + (this.onWallSide === 'left' ? 0 : this.width), this.y + this.height / 2, 1);
      }
    }

    // --- DASH INITIATE ---
    if (this.game.input.keys.dash && canUse('dash') && this.dashCooldown <= 0 && this.energy >= 30) {
      const isAirDash = !this.onGround;
      
      if (!isAirDash || (isAirDash && canUse('airdash') && !this.hasAirDashed)) {
        this.isDashing = true;
        this.dashTimer = 160; // 160ms of dash speed
        this.dashCooldown = 600; // 600ms cooldown
        this.energy = Math.max(0, this.energy - 30);
        
        let speedMult = this.powerups.has('wind') ? 2.8 : 2.2;
        this.vx = (this.facing === 'right' ? 1 : -1) * this.speed * speedMult;
        
        if (isAirDash) {
          this.hasAirDashed = true;
        }

        this.game.audio.playSFX('dash');
        this.game.camera.shake(150, 3);
        this.game.input.keys.dash = false; // consume
      }
    }

    // --- GROUND POUND INITIATE ---
    if (this.game.input.keys.down && !this.onGround && !this.isGroundPounding && canUse('pound') && this.vy > 1) {
      this.isGroundPounding = true;
      this.vx = 0;
      this.vy = 12; // Slam downward velocity
      this.game.audio.playSFX('dash'); // swoosh sound
      this.game.input.keys.down = false; // consume
    }

    // Apply ground pound check
    if (this.isGroundPounding) {
      this.vx = 0; // Freeze horizontal movement
    }

    // Move & Resolve Collisions
    const prevOnGround = this.onGround;
    Physics.resolveCollisions(this, this.game.world);

    // Landing effects
    if (this.onGround && !prevOnGround) {
      this.game.audio.playSFX('land');
      this.game.particles.spawnDust(this.x + this.width / 2, this.y + this.height, 6);
      
      if (this.isGroundPounding) {
        this.isGroundPounding = false;
        this.game.camera.shake(300, 8);
        this.game.particles.spawnDust(this.x + this.width / 2, this.y + this.height, 16);
        this.game.audio.playSFX('explosion');
        this.performGroundPoundShockwave();
      }
    }
  }

  // Combat Slash Attack logic
  performAttackSwipe() {
    const reach = this.powerups.has('fire') ? 54 : 32;
    const swipeRect = {
      x: this.facing === 'right' ? this.x + this.width : this.x - reach,
      y: this.y - 4,
      width: reach,
      height: this.height + 8
    };

    // Attack particles
    const splashColor = this.powerups.has('fire') ? '#f97316' : (this.powerups.has('thunder') ? '#60a5fa' : '#ffffff');
    this.game.particles.spawnSparkles(swipeRect.x + reach / 2, swipeRect.y + swipeRect.height / 2, splashColor, 6);

    // Hit standard/elite enemies
    for (let enemy of this.game.enemies) {
      if (enemy.active && Physics.checkAABB(swipeRect, enemy)) {
        let dmg = this.powerups.has('fire') ? 2 : 1;
        enemy.hit(dmg);
        this.game.camera.shake(100, 2);
        
        // Chain lightning
        if (this.powerups.has('thunder')) {
          this.triggerChainLightning(enemy);
        }
      }
    }

    // Hit bosses
    if (this.game.activeBoss && this.game.activeBoss.active) {
      if (Physics.checkAABB(swipeRect, this.game.activeBoss)) {
        let dmg = this.powerups.has('fire') ? 3 : 1.5;
        this.game.activeBoss.hit(dmg);
        this.game.camera.shake(200, 4);
      }
    }
  }

  performGroundPoundShockwave() {
    const shockwaveRect = {
      x: this.x - 45,
      y: this.y + this.height - 10,
      width: 90 + this.width,
      height: 20
    };

    // Shockwave particles
    this.game.particles.spawnSparkles(this.x + this.width / 2, this.y + this.height, '#ffffff', 16);

    for (let enemy of this.game.enemies) {
      if (enemy.active && Physics.checkAABB(shockwaveRect, enemy)) {
        enemy.hit(2); // Double damage for ground slam
      }
    }

    if (this.game.activeBoss && this.game.activeBoss.active) {
      if (Physics.checkAABB(shockwaveRect, this.game.activeBoss)) {
        this.game.activeBoss.hit(3);
      }
    }
  }

  triggerChainLightning(sourceEnemy) {
    let hits = 0;
    for (let enemy of this.game.enemies) {
      if (enemy !== sourceEnemy && enemy.active && hits < 3) {
        // Distance check
        const dist = Math.hypot(enemy.x - sourceEnemy.x, enemy.y - sourceEnemy.y);
        if (dist < 150) {
          enemy.hit(1);
          hits++;
          
          // Draw lightning spark at enemy
          this.game.particles.spawnSparkles(enemy.x + enemy.width/2, enemy.y + enemy.height/2, '#60a5fa', 4);
        }
      }
    }
  }

  // Cosmetics Color Pickers
  getSkinColor() {
    const skin = this.game.saveData.equippedSkin;
    switch (skin) {
      case 'sky_warden': return '#3b82f6'; // Deep Blue
      case 'meadow_sprite': return '#10b981'; // Green
      case 'crimson_ember': return '#ef4444'; // Red
      case 'shadow_stalker': return '#8b5cf6'; // Purple
      case 'gold_explorer': return '#eab308'; // Gold
      default: return '#0ea5e9'; // Default Cyan
    }
  }

  getCapeColor() {
    const cape = this.game.saveData.equippedCape;
    switch (cape) {
      case 'wind_cape': return 'rgba(255, 255, 255, 0.4)';
      case 'fire_trail': return 'rgba(239, 68, 68, 0.6)';
      case 'crystal_wing': return 'rgba(6, 182, 212, 0.5)';
      default: return null;
    }
  }

  getTrailColor() {
    const trail = this.game.saveData.equippedTrail;
    switch (trail) {
      case 'sparkle': return '#eab308';
      case 'fire': return '#f97316';
      case 'ice': return '#06b6d4';
      case 'shadow': return '#d946ef';
      default: return 'rgba(255, 255, 255, 0.3)';
    }
  }

  // --- DRAWING PROCEDURAL VECTOR GRAPHICS ---
  draw(ctx) {
    if (!this.active) return;
    
    // Flash if invulnerable
    if (this.isInvulnerable() && Math.floor(this.animTime / 100) % 2 === 0) {
      return;
    }

    const color = this.getSkinColor();
    const facingMult = this.facing === 'right' ? 1 : -1;

    ctx.save();
    
    // Position transform
    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);

    // Apply squashing/stretching
    let scaleX = 1;
    let scaleY = 1;

    if (!this.onGround) {
      if (this.vy < -0.1) {
        // Jumping - stretch
        scaleX = 0.9;
        scaleY = 1.1;
      } else if (this.vy > 0.5 && !this.isGliding) {
        // Falling - stretch
        scaleX = 0.92;
        scaleY = 1.08;
      }
    } else if (Math.abs(this.vx) > 0.1) {
      // Running wobble
      scaleY = 1 + Math.sin(this.runCycle) * 0.04;
      scaleX = 1 - Math.sin(this.runCycle) * 0.04;
    }

    ctx.scale(scaleX, scaleY);

    // DRAW SHIELD IF ACTIVE
    if (this.hasShield) {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(this.width, this.height) / 2 + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset
    }

    // 1. DRAW CAPE (drawn behind body with smooth wave history)
    const capeColor = this.getCapeColor();
    if (capeColor && this.history.length > 2) {
      ctx.save();
      ctx.fillStyle = capeColor;
      ctx.beginPath();
      ctx.moveTo(-4 * facingMult, -8);
      
      // Draw ribbon using coordinate history sways
      for (let i = this.history.length - 1; i >= 0; i--) {
        const pt = this.history[i];
        const dx = pt.x - this.x;
        const dy = pt.y - this.y;
        ctx.lineTo(-10 * facingMult + dx, 2 + dy + (this.history.length - i) * 1.5);
      }
      for (let i = 0; i < this.history.length; i++) {
        const pt = this.history[i];
        const dx = pt.x - this.x;
        const dy = pt.y - this.y;
        ctx.lineTo(-4 * facingMult + dx, 8 + dy + (this.history.length - i) * 1.5);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Apply Player glow shadow
    ctx.shadowColor = this.powerups.has('fire') ? '#f97316' : (this.powerups.has('thunder') ? '#60a5fa' : color);
    ctx.shadowBlur = this.powerups.has('fire') || this.powerups.has('thunder') ? 12 : 4;

    // 2. DRAW PET COMPANION (renders floating slightly offset)
    this.drawPet(ctx);

    // 3. DRAW LEGS
    ctx.fillStyle = '#1e293b'; // dark pants
    const legOffset = Math.sin(this.runCycle) * 6;
    if (Math.abs(this.vx) > 0.1 && this.onGround) {
      // Leg A
      ctx.fillRect(-6, 8, 3, 10 + legOffset * facingMult);
      // Leg B
      ctx.fillRect(2, 8, 3, 10 - legOffset * facingMult);
    } else {
      // Standing legs
      ctx.fillRect(-6, 8, 3, 10);
      ctx.fillRect(3, 8, 3, 10);
    }

    // 4. DRAW BODY (Gown / Shirt)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-8, -12, 16, 22, 6);
    ctx.fill();

    // Chest crystal star detail
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(3, -3);
    ctx.lineTo(0, 0);
    ctx.lineTo(-3, -3);
    ctx.closePath();
    ctx.fill();

    // 5. DRAW HEAD
    ctx.fillStyle = '#fed7aa'; // skin peach
    ctx.beginPath();
    ctx.arc(0, -20, 7, 0, Math.PI * 2);
    ctx.fill();

    // Hair or Hood
    ctx.fillStyle = '#1e293b'; // dark hair
    ctx.beginPath();
    ctx.arc(0, -22, 7.5, Math.PI, 0); // top half cap
    ctx.fill();
    // Front fringe
    ctx.fillRect(-7.5, -22, 5, 4);

    // Glowing Goggles/Visor instead of plain square eye
    ctx.fillStyle = this.powerups.has('fire') ? '#fbbf24' : '#22d3ee';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect(1 * facingMult, -22, 6 * facingMult, 3.5, 1);
    ctx.fill();
    ctx.shadowBlur = 0; // reset to avoid blurring everything else

    // 6. DRAW ARMS
    ctx.fillStyle = color;
    if (this.isAttacking) {
      // Slash pose: Arm extended forward holding sword arc
      ctx.save();
      ctx.rotate(-0.5 * facingMult);
      ctx.fillRect(4 * facingMult, -6, 12 * facingMult, 4);
      // Sword vector
      ctx.fillStyle = this.powerups.has('fire') ? '#f97316' : '#e2e8f0';
      ctx.fillRect(14 * facingMult, -14, 2 * facingMult, 14);
      ctx.restore();
    } else if (this.isGliding) {
      // Gliding: arms out wide
      ctx.fillRect(-12, -8, 24, 3);
    } else {
      // Idle bobbing arms
      ctx.fillRect(8 * facingMult, -8, 3, 10);
      ctx.fillRect(-11 * facingMult, -8, 3, 10);
    }

    ctx.restore();
  }

  drawPet(ctx) {
    const pet = this.game.saveData.equippedPet;
    if (pet === 'none') return;

    ctx.save();

    // Float offset
    const floatY = -28 + Math.sin(this.animTime * 0.005) * 4;
    const floatX = -18 * (this.facing === 'right' ? 1 : -1);

    ctx.translate(floatX, floatY);

    if (pet === 'puffling_pet') {
      // Bouncing puffling
      ctx.fillStyle = '#e9d5ff'; // light purple
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      // Little wing
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.ellipse(-2, 1, 3, 2, -0.2, 0, Math.PI*2);
      ctx.fill();
      // Eye
      ctx.fillStyle = '#000';
      ctx.fillRect(2, -2, 1.5, 1.5);
    } else if (pet === 'tiny_golem') {
      ctx.fillStyle = '#94a3b8'; // grey stone
      ctx.fillRect(-5, -5, 10, 10);
      // glowing cyan eye line
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(-3, -2, 6, 2);
    } else if (pet === 'wisp') {
      ctx.shadowColor = '#eab308';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#fef08a'; // glowing yellow ball
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
