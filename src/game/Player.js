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

    // Buffs Manager
    this.powerups = new PowerUpManager(this);
    this.hasShield = false;

    // Initialize class stats
    this.initClassStats();

    // Invulnerability
    this.invulnTimer = 0;
    this.active = true;

    // Animation bobbing
    this.animTime = 0;
    this.runCycle = 0;
    this.history = [];
  }

  initClassStats() {
    const selectedClass = this.game.saveData.selectedClass || 'skyrunner';
    this.selectedClass = selectedClass;
    switch (selectedClass) {
      case 'shadow_blade':
        this.speed = 4.2;
        this.jumpHeight = 6.5;
        this.maxHealth = 2;
        this.maxEnergy = 120;
        break;
      case 'crystal_knight':
        this.speed = 3.2;
        this.jumpHeight = 6.5;
        this.maxHealth = 4;
        this.maxEnergy = 80;
        this.hasShield = true;
        break;
      case 'magma_ranger':
        this.speed = 3.6;
        this.jumpHeight = 6.8;
        this.maxHealth = 3;
        this.maxEnergy = 100;
        break;
      case 'skyrunner':
      default:
        this.speed = 3.6;
        this.jumpHeight = 6.8;
        this.maxHealth = 3;
        this.maxEnergy = 100;
        break;
    }
    this.health = this.maxHealth;
    this.energy = this.maxEnergy;
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
      
      const selectedClass = this.game.saveData.selectedClass || 'skyrunner';
      if (selectedClass === 'magma_ranger') {
        this.fireMagmaRangerFireball();
      }
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
        const doubleJumpMult = (this.game.saveData.selectedClass === 'skyrunner') ? 1.15 : 0.95;
        this.vy = -this.jumpHeight * doubleJumpMult;
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
        const cooldownMult = (this.game.saveData.selectedClass === 'shadow_blade') ? 0.5 : 1.0;
        this.dashCooldown = 600 * cooldownMult; // 600ms (or 300ms) cooldown
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

    // Spawn cosmetic movement trails
    const trail = this.game.saveData.equippedTrail;
    if (trail !== 'none' && (Math.abs(this.vx) > 0.5 || !this.onGround) && Math.random() < 0.35) {
      const trailColor = this.getTrailColor();
      this.game.particles.particles.push({
        x: this.x + Math.random() * this.width,
        y: this.y + Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.4 - this.vx * 0.08,
        vy: (Math.random() - 0.5) * 0.4 - this.vy * 0.05,
        color: trailColor,
        size: Math.random() * 4 + 2,
        maxLife: 300,
        life: 300,
        type: 'glow',
        update(dt) { this.life -= dt; this.x += this.vx; this.y += this.vy; },
        draw(ctx) {
          ctx.save();
          ctx.globalAlpha = this.life / this.maxLife;
          ctx.fillStyle = this.color;
          ctx.shadowColor = this.color;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });
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
    let classColor = '#ffffff';
    const selectedClass = this.game.saveData.selectedClass || 'skyrunner';
    if (selectedClass === 'skyrunner') classColor = '#22d3ee';
    else if (selectedClass === 'shadow_blade') classColor = '#a855f7';
    else if (selectedClass === 'crystal_knight') classColor = '#60a5fa';
    else if (selectedClass === 'magma_ranger') classColor = '#f97316';

    // Weapon-specific particle emission
    const equippedWeapon = this.game.saveData.equippedWeapon || 'default';
    if (equippedWeapon === 'energy_saber') {
      // Crackling plasma sparks
      this.game.particles.spawnSparkles(swipeRect.x + reach / 2, swipeRect.y + swipeRect.height / 2, '#f43f5e', 4);
      this.game.particles.spawnSparkles(swipeRect.x + reach / 2, swipeRect.y + swipeRect.height / 2, '#38bdf8', 4);
    } else if (equippedWeapon === 'crystal_spear') {
      // Diamond crystal glow sparkles
      this.game.particles.spawnSparkles(swipeRect.x + reach / 2, swipeRect.y + swipeRect.height / 2, '#a855f7', 4);
      this.game.particles.spawnSparkles(swipeRect.x + reach / 2, swipeRect.y + swipeRect.height / 2, '#22d3ee', 4);
    } else if (equippedWeapon === 'obsidian_greatsword') {
      // Molten orange lava flames
      this.game.particles.spawnFlame(swipeRect.x + reach / 2, swipeRect.y + swipeRect.height / 2, 6);
    } else {
      // Default Runic Blade: standard class color sparkles
      const splashColor = this.powerups.has('fire') ? '#f97316' : (this.powerups.has('thunder') ? '#60a5fa' : classColor);
      this.game.particles.spawnSparkles(swipeRect.x + reach / 2, swipeRect.y + swipeRect.height / 2, splashColor, 6);
    }

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

  fireMagmaRangerFireball() {
    const isFacingRight = this.facing === 'right';
    const fireball = {
      x: isFacingRight ? this.x + this.width : this.x - 12,
      y: this.y + this.height / 2 - 6,
      width: 12,
      height: 12,
      vx: (isFacingRight ? 1 : -1) * 6,
      vy: 0,
      active: true,
      damagePower: 2.5,
      color: '#ef4444',
      glowColor: '#f97316',
      animTime: 0,
      game: this.game,
      update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        this.animTime += dt;

        // Spawn flame trail particles
        if (Math.random() < 0.4) {
          this.game.particles.spawnSparkles(this.x + this.width / 2, this.y + this.height / 2, '#f97316', 1);
        }

        // Check tile collisions
        let hits = Physics.getTileCollisions(this, this.game.world).length > 0;
        if (hits) {
          this.explode();
          return;
        }

        // Check enemy collisions
        for (let enemy of this.game.enemies) {
          if (enemy.active && Physics.checkAABB(this, enemy)) {
            enemy.hit(this.damagePower);
            this.game.camera.shake(100, 2);
            this.explode();
            return;
          }
        }

        // Check boss collisions
        if (this.game.activeBoss && this.game.activeBoss.active) {
          if (Physics.checkAABB(this, this.game.activeBoss)) {
            this.game.activeBoss.hit(this.damagePower);
            this.game.camera.shake(200, 4);
            this.explode();
            return;
          }
        }

        // Check range limits / offscreen check to clean up
        const camX = this.game.camera.x;
        if (this.x < camX - 100 || this.x > camX + this.game.width + 100) {
          this.active = false;
        }
      },
      explode() {
        this.active = false;
        // spawn explosion particles
        this.game.particles.spawnSparkles(this.x + this.width / 2, this.y + this.height / 2, '#ef4444', 8);
        this.game.particles.spawnSparkles(this.x + this.width / 2, this.y + this.height / 2, '#f97316', 6);
        // Play pop sound
        this.game.audio.playSFX('explosion'); 
      },
      draw(ctx) {
        ctx.save();
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 10;

        // Outer glow
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.beginPath();
        const pulse = 1 + Math.sin(this.animTime * 0.02) * 0.2;
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, 8 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Inner core
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // White core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2 - 1, this.y + this.height / 2 - 1, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    };

    this.game.world.projectiles.push(fireball);
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

    // Dynamic lean tilt based on movement speed
    const leanTilt = this.vx * 0.04;
    ctx.rotate(leanTilt);

    // Apply squashing/stretching
    let scaleX = 1;
    let scaleY = 1;

    if (!this.onGround) {
      if (this.vy < -0.1) {
        // Jumping - stretch
        scaleX = 0.88;
        scaleY = 1.12;
      } else if (this.vy > 0.5 && !this.isGliding) {
        // Falling - stretch
        scaleX = 0.9;
        scaleY = 1.1;
      }
    } else if (Math.abs(this.vx) > 0.1) {
      // Running wobble
      scaleY = 1 + Math.sin(this.runCycle) * 0.05;
      scaleX = 1 - Math.sin(this.runCycle) * 0.05;
    }

    ctx.scale(scaleX, scaleY);

    // DRAW CYBER-SHIELD IF ACTIVE (rippling hexagonal grid aura)
    if (this.hasShield) {
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 12;
      
      const r = Math.max(this.width, this.height) / 2 + 8;
      const pulseRadius = r + Math.sin(this.game.levelTime * 0.008) * 1.5;
      
      // Draw grid ring
      ctx.beginPath();
      ctx.arc(0, 0, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Cyber lines crossing
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
      ctx.beginPath();
      ctx.moveTo(-pulseRadius, 0); ctx.lineTo(pulseRadius, 0);
      ctx.moveTo(0, -pulseRadius); ctx.lineTo(0, pulseRadius);
      ctx.stroke();
      ctx.restore();
    }

    // 1. DRAW CAPE (drawn behind body with smooth wave history)
    const capeColor = this.getCapeColor();
    if (capeColor && this.history.length > 2) {
      ctx.save();
      ctx.fillStyle = capeColor;
      ctx.beginPath();
      ctx.moveTo(-5 * facingMult, -8);
      
      // Draw ribbon using coordinate history sways
      for (let i = this.history.length - 1; i >= 0; i--) {
        const pt = this.history[i];
        const dx = pt.x - this.x;
        const dy = pt.y - this.y;
        ctx.lineTo(-11 * facingMult + dx, 2 + dy + (this.history.length - i) * 1.5);
      }
      for (let i = 0; i < this.history.length; i++) {
        const pt = this.history[i];
        const dx = pt.x - this.x;
        const dy = pt.y - this.y;
        ctx.lineTo(-5 * facingMult + dx, 8 + dy + (this.history.length - i) * 1.5);
      }
      ctx.closePath();
      ctx.fill();

      // Cape inner runic vein line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-5 * facingMult, -4);
      for (let i = this.history.length - 1; i >= 0; i--) {
        const pt = this.history[i];
        const dx = pt.x - this.x;
        const dy = pt.y - this.y;
        ctx.lineTo(-8 * facingMult + dx, 5 + dy + (this.history.length - i) * 1.5);
      }
      ctx.stroke();

      ctx.restore();
    }
    // Apply Player glow shadow
    ctx.shadowColor = this.powerups.has('fire') ? '#f97316' : (this.powerups.has('thunder') ? '#60a5fa' : '#22d3ee');
    ctx.shadowBlur = this.powerups.has('fire') || this.powerups.has('thunder') ? 14 : 6;

    // 2. DRAW PET COMPANION (renders floating slightly offset)
    this.drawPet(ctx);

    // Get custom colors
    let primary = this.game.saveData.customColors.primary;
    let secondary = this.game.saveData.customColors.secondary;
    let visor = this.game.saveData.customColors.visor;
    let accent = this.game.saveData.customColors.accent;

    // Fallback if skin is equipped
    if (this.game.saveData.equippedSkin !== 'default') {
      secondary = this.getSkinColor();
    }

    // 3. DRAW LEGS
    ctx.fillStyle = '#0f172a'; // Slate dark pants/boots
    const legOffset = Math.sin(this.runCycle) * 6;
    if (Math.abs(this.vx) > 0.1 && this.onGround) {
      // Leg A
      ctx.fillRect(-6, 8, 3.5, 10 + legOffset * facingMult);
      // Leg B
      ctx.fillRect(2.5, 8, 3.5, 10 - legOffset * facingMult);
    } else {
      // Standing legs
      ctx.fillRect(-6, 8, 3.5, 10);
      ctx.fillRect(2.5, 8, 3.5, 10);
    }

    // 4. DRAW BODY (Cyber Torso Chassis)
    const armorStyle = this.game.saveData.equippedArmor || 'default';
    if (armorStyle === 'heavy_plate') {
      // Bulky Heavy Armor (Obsidian plates + Gold borders)
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.roundRect(-9.5, -12, 19, 22, 6);
      ctx.fill();
      ctx.strokeStyle = '#eab308'; // Luxury gold trim
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.roundRect(-8, -10, 16, 17, 4);
      ctx.fill();

      // Glowing heart core
      ctx.fillStyle = visor;
      ctx.shadowColor = visor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(3.5, -2.5);
      ctx.lineTo(0, 1);
      ctx.lineTo(-3.5, -2.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Heavy rivets
      ctx.fillStyle = accent;
      ctx.fillRect(-6, -8, 2, 2);
      ctx.fillRect(4, -8, 2, 2);
      ctx.fillRect(-6, 2, 2, 2);
      ctx.fillRect(4, 2, 2, 2);

      // Huge spiked shoulder pads
      ctx.fillStyle = '#475569';
      ctx.fillRect(-11.5, -11, 3.5, 6);
      ctx.fillRect(8, -11, 3.5, 6);
      ctx.fillStyle = '#eab308'; // Gold spikes
      ctx.beginPath();
      ctx.moveTo(-11.5, -11); ctx.lineTo(-14.5, -14); ctx.lineTo(-9.5, -8); ctx.closePath();
      ctx.moveTo(11.5, -11); ctx.lineTo(14.5, -14); ctx.lineTo(9.5, -8); ctx.closePath();
      ctx.fill();
    } else if (armorStyle === 'energy_robes') {
      // Flowing Wizard Robes (with cosmic energy rings)
      ctx.save();
      // Glowing magical aura ring behind chest
      ctx.strokeStyle = accent;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 2]);
      ctx.shadowColor = accent;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(0, -4, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.roundRect(-8, -12, 16, 21, 4);
      ctx.fill();

      ctx.fillStyle = secondary;
      ctx.beginPath();
      // Drapery hanging below hips
      ctx.moveTo(-7, -10);
      ctx.lineTo(7, -10);
      ctx.lineTo(9.5, 12);
      ctx.lineTo(-9.5, 12);
      ctx.closePath();
      ctx.fill();

      // Glowing magical runes down center
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(0, 6);
      ctx.moveTo(-3.5, -2); ctx.lineTo(3.5, -2);
      ctx.moveTo(-2, 2); ctx.lineTo(2, 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Shoulder wraps
      ctx.fillStyle = primary;
      ctx.fillRect(-9, -11, 1.5, 4);
      ctx.fillRect(7.5, -11, 1.5, 4);
    } else if (armorStyle === 'hazard_gear') {
      // Hazmat/Reformed Toxin Chassis (with glowing cables)
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.roundRect(-8, -12, 16, 21, 5);
      ctx.fill();

      // Ribbed lines on hazard suit
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-8, -8); ctx.lineTo(8, -8);
      ctx.moveTo(-8, -4); ctx.lineTo(8, -4);
      ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
      ctx.stroke();

      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.roundRect(-6.5, -10, 13, 8, 2);
      ctx.fill();

      // Glowing toxic tubes from filter to shoulder
      ctx.strokeStyle = '#10b981'; // radioactive green glow
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-3, 3);
      ctx.bezierCurveTo(-7, 3, -7, -6, -9.5, -6);
      ctx.moveTo(3, 3);
      ctx.bezierCurveTo(7, 3, 7, -6, 9.5, -6);
      ctx.stroke();

      // Circular Respirator filter on center chest
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(0, 3, 4.5, 0, Math.PI*2);
      ctx.fill();
      // visor color glow core
      ctx.fillStyle = visor;
      ctx.shadowColor = visor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(0, 3, 2, 0, Math.PI*2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Shoulder pads
      ctx.fillStyle = '#64748b';
      ctx.fillRect(-9.5, -11, 2, 4.5);
      ctx.fillRect(7.5, -11, 2, 4.5);
    } else {
      // Default Explorer Chassis (with golden neon trims)
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.roundRect(-8, -12, 16, 21, 5);
      ctx.fill();

      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.roundRect(-6.5, -10, 13, 15, 3);
      ctx.fill();

      // Torso glowing diagonal neon lines
      ctx.strokeStyle = this.powerups.has('fire') ? '#fbbf24' : accent;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(-4, -6); ctx.lineTo(4, -2);
      ctx.moveTo(-4, -2); ctx.lineTo(4, 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Runic explore crest detail
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(2.5, -4.5);
      ctx.lineTo(0, -2);
      ctx.lineTo(-2.5, -4.5);
      ctx.closePath();
      ctx.fill();

      // Shoulder pads
      ctx.fillStyle = '#334155';
      ctx.fillRect(-9.5, -11, 2, 4);
      ctx.fillRect(7.5, -11, 2, 4);
    }

    // 5. DRAW HELMET (Explorer Head Gear)
    const helmetStyle = this.game.saveData.equippedHelmet || 'default';
    if (helmetStyle === 'scanning_visor') {
      // Angular Cylindrical Helm with HUD telemetry overlay
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.roundRect(-8.5, -28, 17, 14, 2);
      ctx.fill();

      // Visor stretching corner-to-corner
      ctx.fillStyle = visor;
      ctx.shadowColor = visor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(-7, -24, 14, 7, 1);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Vertical sweep line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      const sweepX = Math.sin(this.game.levelTime * 0.009) * 6;
      ctx.beginPath();
      ctx.moveTo(sweepX, -24);
      ctx.lineTo(sweepX, -17);
      ctx.stroke();

      // Floating holographic HUD indicator ring (Luxury Sci-fi overlay!)
      ctx.strokeStyle = visor;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(8 * facingMult, -20.5, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(7.5 * facingMult, -21, 1, 1);
    } else if (helmetStyle === 'goggle_visor') {
      // Goggle Visor Dome with Gold rims
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(0, -19.5, 8.5, 0, Math.PI * 2);
      ctx.fill();

      // Goggles strap
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-9.5, -21.5, 19, 3);

      // Goggles base
      ctx.fillStyle = '#09090b';
      ctx.fillRect(-6.5, -23, 13, 6);

      // Gold Outer Rims
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(-3 * facingMult, -20, 3, 0, Math.PI * 2);
      ctx.arc(3.5 * facingMult, -20, 3, 0, Math.PI * 2);
      ctx.stroke();

      // Glowing lens cores
      ctx.fillStyle = visor;
      ctx.shadowColor = visor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(-3 * facingMult, -20, 2.2, 0, Math.PI * 2);
      ctx.arc(3.5 * facingMult, -20, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (helmetStyle === 'cyber_mask') {
      // Angular Plate Mask with ear fins & warning LED
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.moveTo(-8.5, -14);
      ctx.lineTo(-8.5, -25);
      ctx.lineTo(0, -28.5);
      ctx.lineTo(8.5, -25);
      ctx.lineTo(8.5, -14);
      ctx.closePath();
      ctx.fill();

      // V-shaped visor slit
      ctx.fillStyle = visor;
      ctx.shadowColor = visor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-6 * facingMult, -22);
      ctx.lineTo(6 * facingMult, -22);
      ctx.lineTo(0, -18);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Ear Fins
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.moveTo(-8.5, -20); ctx.lineTo(-13, -24); ctx.lineTo(-8.5, -17); ctx.closePath();
      ctx.moveTo(8.5, -20); ctx.lineTo(13, -24); ctx.lineTo(8.5, -17); ctx.closePath();
      ctx.fill();

      // Accented lower grill
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, -15); ctx.lineTo(-2, -17);
      ctx.moveTo(4, -15); ctx.lineTo(2, -17);
      ctx.stroke();

      // Blinking warning indicator LED
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(-5 * facingMult, -14.5, 0.9, 0, Math.PI*2);
      ctx.fill();
    } else if (helmetStyle === 'horned_helm') {
      // Horned Dragon Helm with Golden crown circlet
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(0, -19.5, 8.5, 0, Math.PI * 2);
      ctx.fill();

      // Comm headset module
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-9.5, -22, 2, 5);
      ctx.fillRect(7.5, -22, 2, 5);

      // Golden Crown Circlet
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-8.5, -22);
      ctx.quadraticCurveTo(0, -25, 8.5, -22);
      ctx.stroke();

      // Curved Horns (using accent highlight color)
      ctx.fillStyle = '#eab308'; // Gold horn base
      ctx.beginPath();
      // Left horn
      ctx.moveTo(-6, -26);
      ctx.quadraticCurveTo(-14, -34, -15, -30);
      ctx.quadraticCurveTo(-10, -28, -5, -25);
      ctx.closePath();
      ctx.fill();
      // Right horn
      ctx.beginPath();
      ctx.moveTo(6, -26);
      ctx.quadraticCurveTo(14, -34, 15, -30);
      ctx.quadraticCurveTo(10, -28, 5, -25);
      ctx.closePath();
      ctx.fill();

      // Horn glowing energy highlights
      ctx.fillStyle = visor;
      ctx.beginPath();
      ctx.arc(-12, -30, 1, 0, Math.PI * 2);
      ctx.arc(12, -30, 1, 0, Math.PI * 2);
      ctx.fill();

      // Glowing visor with scan lines
      ctx.fillStyle = visor;
      ctx.shadowColor = visor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(-4, -21.5, 10 * facingMult, 4, 1.5);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Visor sweep line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      const visorSweepY = -19.5 + Math.sin(this.game.levelTime * 0.007) * 1.8;
      ctx.beginPath();
      ctx.moveTo(-3.5, visorSweepY);
      ctx.lineTo(6, visorSweepY);
      ctx.stroke();
    } else {
      // Default dome
      ctx.fillStyle = primary;
      ctx.beginPath();
      ctx.arc(0, -19.5, 8.5, 0, Math.PI * 2);
      ctx.fill();

      // Comm headset module
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-9.5, -22, 2, 5);
      ctx.fillRect(7.5, -22, 2, 5);
      
      // Tiny diagonal antenna
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-8.5, -20);
      ctx.lineTo(-13, -26);
      ctx.stroke();
      ctx.fillStyle = secondary;
      ctx.beginPath();
      ctx.arc(-13, -26, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Glowing visor with scan lines
      ctx.fillStyle = visor;
      ctx.shadowColor = visor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(-4, -21.5, 10 * facingMult, 4, 1.5);
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      // Visor sweep line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      const visorSweepY = -19.5 + Math.sin(this.game.levelTime * 0.007) * 1.8;
      ctx.beginPath();
      ctx.moveTo(-3.5, visorSweepY);
      ctx.lineTo(6, visorSweepY);
      ctx.stroke();
    }

    // 6. DRAW ARMS
    ctx.fillStyle = secondary;
    if (this.isAttacking) {
      // Slash pose: Arm extended forward holding sword arc
      ctx.save();
      ctx.rotate(-0.5 * facingMult);
      ctx.fillRect(4 * facingMult, -6, 12 * facingMult, 4);
      // Render based on equipped weapon
      const equippedWeapon = this.game.saveData.equippedWeapon || 'default';
      let bladeColor = '#e2e8f0';
      const selectedClass = this.game.saveData.selectedClass || 'skyrunner';
      if (selectedClass === 'skyrunner') bladeColor = '#22d3ee';
      else if (selectedClass === 'shadow_blade') bladeColor = '#a855f7';
      else if (selectedClass === 'crystal_knight') bladeColor = '#60a5fa';
      else if (selectedClass === 'magma_ranger') bladeColor = '#f97316';

      const glowColor = this.powerups.has('fire') ? '#f97316' : (this.powerups.has('thunder') ? '#60a5fa' : bladeColor);

      if (equippedWeapon === 'energy_saber') {
        // Plasma Blade Saber: cylindrical neon beam with electric arcs
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12;
        // Cylindrical handle
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(14 * facingMult, -4, 2 * facingMult, 4);
        // Energy emitter ring
        ctx.fillStyle = '#64748b';
        ctx.fillRect(12.5 * facingMult, -6, 5 * facingMult, 2);
        // Neon plasma beam cylinder
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(13.5 * facingMult, -26, 3 * facingMult, 20, 1.5);
          ctx.fill();
        } else {
          ctx.fillRect(13.5 * facingMult, -26, 3 * facingMult, 20);
        }
        // White inner hot core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(14.5 * facingMult, -25, 1 * facingMult, 18, 0.8);
          ctx.fill();
        } else {
          ctx.fillRect(14.5 * facingMult, -25, 1 * facingMult, 18);
        }
      } else if (equippedWeapon === 'crystal_spear') {
        // Resonance Crystal Spear: long metallic shaft with a double-diamond crystal spearhead
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        // Long pole arm shaft
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(14.5 * facingMult, -4, 1.2 * facingMult, 14); // extend shaft downwards/backwards
        ctx.fillRect(14.5 * facingMult, -20, 1.2 * facingMult, 16); // extend shaft upwards
        // Spearhead connector sleeve
        ctx.fillStyle = '#475569';
        ctx.fillRect(13 * facingMult, -22, 4 * facingMult, 2);
        // Double diamond crystal head
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.moveTo(15 * facingMult, -34); // tip
        ctx.lineTo(17.5 * facingMult, -27); // right corner
        ctx.lineTo(15 * facingMult, -22); // base
        ctx.lineTo(12.5 * facingMult, -27); // left corner
        ctx.closePath();
        ctx.fill();
        // Inner glowing core line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(15 * facingMult, -23);
        ctx.lineTo(15 * facingMult, -33);
        ctx.stroke();
      } else if (equippedWeapon === 'obsidian_greatsword') {
        // Volcanic Obsidian Greatsword: massive craggy lava-infused stone blade
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        // Sturdy hilt
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(13.5 * facingMult, -3, 3 * facingMult, 3);
        // Wide crossguard
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(10 * facingMult, -5, 10 * facingMult, 2);
        // Wide craggy stone blade
        ctx.fillStyle = '#090d16'; // near black basalt
        ctx.beginPath();
        ctx.moveTo(12 * facingMult, -5);
        ctx.lineTo(12 * facingMult, -25); // craggy left
        ctx.lineTo(13.5 * facingMult, -26);
        ctx.lineTo(15 * facingMult, -29); // tip
        ctx.lineTo(16.5 * facingMult, -26);
        ctx.lineTo(18 * facingMult, -25); // craggy right
        ctx.lineTo(18 * facingMult, -5);
        ctx.closePath();
        ctx.fill();
        // Flowing orange lava fissure core line
        ctx.fillStyle = glowColor;
        ctx.fillRect(14 * facingMult, -24, 2 * facingMult, 18);
        // Molten spots
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(14.5 * facingMult, -22, 1 * facingMult, 2);
        ctx.fillRect(14.5 * facingMult, -13, 1 * facingMult, 3);
      } else {
        // Glowing Runic Blade: rectangular sword with runic line details
        ctx.fillStyle = glowColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 8;
        // Draw hilt
        ctx.fillStyle = '#475569';
        ctx.fillRect(14 * facingMult, -5, 2.5 * facingMult, 3);
        // Draw crossguard
        ctx.fillRect(12 * facingMult, -7, 6.5 * facingMult, 2);
        // Draw blade
        ctx.fillStyle = glowColor;
        ctx.fillRect(14 * facingMult, -22, 2.5 * facingMult, 15);
        // Draw runic highlight circuit line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(15.2 * facingMult, -8);
        ctx.lineTo(15.2 * facingMult, -19);
        ctx.stroke();
      }
      ctx.restore();
    } else if (this.isGliding) {
      // Gliding: arms out wide
      ctx.fillRect(-12, -7, 24, 3);
    } else {
      // Idle bobbing arms
      ctx.fillRect(8 * facingMult, -7, 3, 10);
      ctx.fillRect(-11 * facingMult, -7, 3, 10);
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
