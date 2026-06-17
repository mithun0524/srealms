import { Physics } from '../engine/Physics.js';

export class Boss {
  constructor(game, x, y, worldIndex) {
    this.game = game;
    this.x = x;
    this.y = y;
    this.worldIndex = worldIndex; // 1 to 6

    // Boss names
    this.names = [
      "",
      "Verdant Tortoise",
      "Crystal Serpent",
      "Storm Roc",
      "Inferno Colossus",
      "Frost Mammoth",
      "The Void King"
    ];
    this.name = this.names[worldIndex];

    // Sizing
    this.width = 64;
    this.height = 64;
    this.vx = 0;
    this.vy = 0;

    // Health config
    this.maxHealth = 10 + worldIndex * 2; // 12 to 22 HP
    this.health = this.maxHealth;
    this.active = true;
    this.dying = false;
    this.deathTimer = 0;
    this.phase = 1;

    // AI timers
    this.actionTimer = 0;
    this.projectiles = [];

    // Specific mechanics
    this.slideCooldown = 0;
    this.laserActive = false;
    this.laserTimer = 0;
    this.gravityShifted = false;

    this.initBossStats();
  }

  initBossStats() {
    switch (this.worldIndex) {
      case 1: // Verdant Tortoise
        this.width = 72;
        this.height = 48;
        break;
      case 2: // Crystal Serpent
        this.width = 54;
        this.height = 72;
        break;
      case 3: // Storm Roc
        this.width = 80;
        this.height = 48;
        break;
      case 4: // Inferno Colossus
        this.width = 72;
        this.height = 80;
        break;
      case 5: // Frost Mammoth
        this.width = 84;
        this.height = 64;
        break;
      case 6: // Void King
        this.width = 48;
        this.height = 64;
        break;
    }
  }

  hit(amount) {
    if (this.dying || !this.active) return;
    this.health -= amount;

    // Camera shake
    this.game.camera.shake(150, 4);

    // Hit particle sparks
    this.game.particles.spawnSparkles(this.x + this.width / 2, this.y + this.height / 2, '#ffffff', 12);

    // Update UI Boss Health Bar
    this.game.ui.updateHUD();

    // Check Phase change
    const ratio = this.health / this.maxHealth;
    let oldPhase = this.phase;
    if (ratio <= 0.33) {
      this.phase = 3;
    } else if (ratio <= 0.66) {
      this.phase = 2;
    }

    if (this.phase !== oldPhase) {
      this.game.camera.shake(400, 10);
      this.game.audio.playSFX('victory_relic'); // Phase shift alert sound
      // spawn warning particles
      this.game.particles.spawnExplosion(this.x + this.width / 2, this.y + this.height / 2, '#eab308', 20);
    }

    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    this.dying = true;
    this.deathTimer = 2000; // 2 seconds dramatic explosion phase
    this.vx = 0;
    this.vy = 0;
    this.projectiles = [];
    
    // Disable boss collision
    this.game.camera.shake(600, 15);
  }

  update(dt) {
    if (!this.active) return;

    if (this.dying) {
      this.deathTimer -= dt;
      // Spawn constant random explosions
      if (Math.random() < 0.15) {
        this.game.audio.playSFX('explosion');
        this.game.particles.spawnExplosion(
          this.x + Math.random() * this.width,
          this.y + Math.random() * this.height,
          '#f97316',
          8
        );
      }

      if (this.deathTimer <= 0) {
        this.active = false;
        this.game.activeBoss = null;
        // Trigger Victory portal spawning or direct Level Completion!
        this.game.completeLevel();
      }
      return;
    }

    const player = this.game.player;
    if (!player) return;

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (!p.active) {
        this.projectiles.splice(i, 1);
      }
    }

    // Run AI based on World Index
    this.runAI(dt, player);
  }

  runAI(dt, player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    this.actionTimer += dt;

    switch (this.worldIndex) {
      case 1: // Verdant Tortoise
        this.aiTortoise(dt, player, dx);
        break;
      case 2: // Crystal Serpent
        this.aiSerpent(dt, player, dx, dy);
        break;
      case 3: // Storm Roc
        this.aiRoc(dt, player, dx, dy);
        break;
      case 4: // Inferno Colossus
        this.aiColossus(dt, player, dx, dy);
        break;
      case 5: // Frost Mammoth
        this.aiMammoth(dt, player, dx);
        break;
      case 6: // Void King
        this.aiVoidKing(dt, player, dx, dy);
        break;
    }
  }

  // --- INDIVIDUAL BOSS AI STATE ROUTINES ---

  aiTortoise(dt, player, dx) {
    // Normal gravity
    this.vy += Physics.GRAVITY;
    Physics.resolveCollisions(this, this.game.world);

    const speed = this.phase === 3 ? 3.5 : (this.phase === 2 ? 2.2 : 1.5);

    if (this.phase === 1) {
      // Pace back and forth towards player
      this.vx = dx > 0 ? speed : -speed;
    } 
    else if (this.phase === 2) {
      // Shell mode: static shell, drop spikes from ceiling periodically
      this.vx = 0;
      if (this.actionTimer >= 1500) {
        this.actionTimer = 0;
        this.spawnFallingHazard('spike');
      }
    } 
    else if (this.phase === 3) {
      // Enraged: rapid bouncing spin slides
      if (Math.abs(this.vx) < 0.1) {
        this.vx = dx > 0 ? speed : -speed;
      }
      if (this.onWall) {
        this.vx = -this.vx;
        this.game.camera.shake(150, 4);
        this.game.audio.playSFX('land');
      }
    }
  }

  aiSerpent(dt, player, dx, dy) {
    // Floating slither: sine wave movement
    this.vx = dx > 0 ? 1.5 : -1.5;
    this.y = (this.game.height / 2 - 80) + Math.sin(this.game.levelTime * 0.002) * 80;
    this.x += this.vx;

    // Boundaries check
    if (this.x < 100) this.x = 100;
    if (this.x > this.game.world.cols * this.game.world.tileSize - 180) {
      this.x = this.game.world.cols * this.game.world.tileSize - 180;
    }

    // Phase attacks
    if (this.phase === 1) {
      if (this.actionTimer >= 2000) {
        this.actionTimer = 0;
        this.shootBossCrystal(player);
      }
    } 
    else if (this.phase === 2) {
      // Laser beam grid
      this.laserActive = true;
      this.laserTimer += dt;
      if (this.actionTimer >= 3000) {
        this.actionTimer = 0;
        this.shootBossCrystal(player);
      }
    } 
    else if (this.phase === 3) {
      // Rapid fire homing crystal chasers
      if (this.actionTimer >= 1000) {
        this.actionTimer = 0;
        this.shootBossCrystal(player);
        this.shootBossCrystal(player);
      }
    }
  }

  aiRoc(dt, player, dx, dy) {
    // Hover fly overhead
    const targetX = player.x - 20;
    const targetY = player.y - 140;
    this.x += (targetX - this.x) * 0.04;
    this.y += (targetY - this.y) * 0.04;

    if (this.phase === 1) {
      // Push wind force on player
      if (this.actionTimer >= 100) {
        this.actionTimer = 0;
        // blow air trails
        this.game.particles.spawnGlideFeathers(this.x + this.width / 2, this.y + this.height, 1);
        // Add velocity directly to player
        player.vx += dx > 0 ? -0.8 : 0.8;
      }
    } 
    else if (this.phase === 2) {
      // Drop boulders
      if (this.actionTimer >= 1600) {
        this.actionTimer = 0;
        this.spawnFallingHazard('boulder');
      }
    } 
    else if (this.phase === 3) {
      // Dive bomb loops
      if (this.actionTimer >= 2200) {
        this.actionTimer = 0;
        this.vy = 12; // Dive down velocity
        this.game.audio.playSFX('dash');
      }

      if (this.vy > 0) {
        this.y += this.vy;
        if (this.y > player.y + 80) {
          this.vy = -4.0; // Return up
        }
      } else if (this.vy < 0) {
        this.y += this.vy;
        if (this.y <= targetY) {
          this.vy = 0;
        }
      }
    }
  }

  aiColossus(dt, player, dx, dy) {
    // Giant rock golem
    this.vy += Physics.GRAVITY;
    Physics.resolveCollisions(this, this.game.world);

    if (this.phase === 1) {
      // Slam ground
      if (this.actionTimer >= 3000) {
        this.actionTimer = 0;
        this.game.camera.shake(300, 8);
        this.game.audio.playSFX('explosion');
        // Spawn floor flame waves
        this.spawnFlameWave();
      }
    } 
    else if (this.phase === 2) {
      // Lava rising mode: Colossus sits, lava level rises
      this.vx = 0;
      this.game.world.lavaLevel = Math.max(200, (this.game.world.lavaLevel || 540) - dt * 0.02);
      if (this.actionTimer >= 2500) {
        this.actionTimer = 0;
        this.shootFireBall(player);
      }
    } 
    else if (this.phase === 3) {
      // Continuous flame streams
      this.vx = dx > 0 ? 0.8 : -0.8;
      if (this.actionTimer >= 100) {
        this.actionTimer = 0;
        this.game.particles.spawnFlame(this.x + this.width / 2, this.y + 10, 3);
        
        // Custom short-range flame damage check
        if (Math.abs(dx) < 120 && Math.abs(dy) < 50) {
          player.damage(1);
        }
      }
    }
  }

  aiMammoth(dt, player, dx) {
    this.vy += Physics.GRAVITY;
    Physics.resolveCollisions(this, this.game.world);

    const speed = this.phase === 3 ? 3.0 : 1.2;

    if (this.phase === 1) {
      // Charge slide back and forth
      if (this.actionTimer >= 4000) {
        this.actionTimer = 0;
        this.vx = dx > 0 ? speed * 2.5 : -speed * 2.5;
        this.game.audio.playSFX('dash');
      }
      // Apply slide dampening
      this.vx *= 0.96;
    } 
    else if (this.phase === 2) {
      // Slip blocks fall, freeze attempts
      this.vx = 0;
      if (this.actionTimer >= 2000) {
        this.actionTimer = 0;
        this.spawnFallingHazard('ice');
      }
    } 
    else if (this.phase === 3) {
      // Slam ceiling creating icicles
      this.vx = dx > 0 ? speed : -speed;
      if (this.actionTimer >= 2200) {
        this.actionTimer = 0;
        this.game.camera.shake(300, 6);
        this.game.audio.playSFX('land');
        for (let i = 0; i < 4; i++) {
          this.spawnFallingHazard('icicle');
        }
      }
    }
  }

  aiVoidKing(dt, player, dx, dy) {
    // Float slightly above ground
    this.vy = Math.sin(this.game.levelTime * 0.005) * 0.8;
    this.y += this.vy;
    
    // Teleport and projectiles
    if (this.phase === 1) {
      if (this.actionTimer >= 3000) {
        this.actionTimer = 0;
        this.teleportRandomly();
        this.shootVoidSphere(player);
      }
    } 
    else if (this.phase === 2) {
      // Shifts gravity periodically
      if (this.actionTimer >= 4000) {
        this.actionTimer = 0;
        this.gravityShifted = !this.gravityShifted;
        this.game.camera.shake(400, 8);
        this.game.audio.playSFX('relic');
        
        // Apply reversed gravity to player
        player.vy = this.gravityShifted ? -6.0 : 6.0;
        this.game.particles.spawnExplosion(player.x, player.y, '#d946ef', 10);
      }
    } 
    else if (this.phase === 3) {
      // Spawns void black hole portals
      if (this.actionTimer >= 2800) {
        this.actionTimer = 0;
        this.teleportRandomly();
        this.shootVoidSphere(player);
        this.shootVoidSphere(player);
      }
      
      // Pull player force towards Boss
      const pullForce = 0.45;
      player.vx += dx > 0 ? pullForce : -pullForce;
    }
  }

  // --- BOSS ATTACK SPAWNERS ---

  shootBossCrystal(player) {
    this.game.audio.playSFX('laser');
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    
    this.projectiles.push({
      x: this.x + this.width / 2,
      y: this.y + this.height / 2,
      width: 10,
      height: 10,
      vx: Math.cos(angle) * 4.2,
      vy: Math.sin(angle) * 4.2,
      active: true,
      color: '#8b5cf6',
      update(dt) {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > 2000 || this.y < 0 || this.y > 800) {
          this.active = false;
        }
      },
      draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  shootFireBall(player) {
    this.game.audio.playSFX('laser');
    const angle = Math.atan2(player.y - this.y, player.x - this.x);
    
    this.projectiles.push({
      x: this.x + this.width / 2,
      y: this.y + 10,
      width: 12,
      height: 12,
      vx: Math.cos(angle) * 3.8,
      vy: Math.sin(angle) * 3.8,
      active: true,
      color: '#f97316',
      update(dt) {
        this.x += this.vx;
        this.y += this.vy;
      },
      draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  shootVoidSphere(player) {
    this.game.audio.playSFX('laser');
    const angle = Math.atan2(player.y - this.y, player.x - this.x);

    this.projectiles.push({
      x: this.x + this.width / 2,
      y: this.y + 20,
      width: 14,
      height: 14,
      vx: Math.cos(angle) * 3.0,
      vy: Math.sin(angle) * 3.0,
      active: true,
      color: '#d946ef',
      update(dt) {
        this.x += this.vx;
        this.y += this.vy;
      },
      draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  spawnFallingHazard(type) {
    // Spawn hazard falling from top of screen at player's general X
    const spawnX = Math.max(50, this.game.player.x + (Math.random() * 200 - 100));
    
    const hazard = {
      x: spawnX,
      y: this.game.camera.y - 30,
      width: 20,
      height: 20,
      vx: 0,
      vy: 4.8,
      active: true,
      damagePower: 1,
      color: type === 'spike' ? '#ef4444' : (type === 'icicle' ? '#06b6d4' : '#78350f'),
      game: this.game,
      update(dt) {
        this.y += this.vy;
        
        // Check player hit
        if (Physics.checkAABB(this, this.game.player)) {
          this.game.player.damage(this.damagePower);
          this.active = false;
        }

        // Check floor hit
        let hits = Physics.getTileCollisions(this, this.game.world).length > 0;
        if (hits || this.y > 600) {
          this.active = false;
          this.game.particles.spawnExplosion(this.x, this.y, this.color, 4);
        }
      },
      draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        if (type === 'spike' || type === 'icicle') {
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(this.x + this.width, this.y);
          ctx.lineTo(this.x + this.width / 2, this.y + this.height);
        } else {
          // Boulder (circle)
          ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, Math.PI*2);
        }
        ctx.closePath();
        ctx.fill();
      }
    };
    this.game.world.projectiles.push(hazard);
  }

  spawnFlameWave() {
    // Spawn two firewaves rolling left & right along ground
    const spawnWave = (dir) => {
      const wave = {
        x: this.x + this.width / 2,
        y: this.y + this.height - 12,
        width: 16,
        height: 16,
        vx: dir * 3.5,
        vy: 0,
        active: true,
        damagePower: 1,
        color: '#f97316',
        game: this.game,
        update(dt) {
          this.x += this.vx;
          
          if (Physics.checkAABB(this, this.game.player)) {
            this.game.player.damage(this.damagePower);
            this.active = false;
          }

          // Check walls
          let hits = Physics.getTileCollisions(this, this.game.world).length > 0;
          if (hits || this.x < 0 || this.x > 2000) {
            this.active = false;
          }
          if (Math.random() < 0.3) {
            this.game.particles.spawnFlame(this.x, this.y, 1);
          }
        },
        draw(ctx) {
          ctx.fillStyle = this.color;
          ctx.beginPath();
          ctx.arc(this.x + 8, this.y + 8, 8, 0, Math.PI*2);
          ctx.fill();
        }
      };
      this.game.world.projectiles.push(wave);
    };

    spawnWave(-1);
    spawnWave(1);
  }

  teleportRandomly() {
    this.game.particles.spawnExplosion(this.x + this.width/2, this.y + this.height/2, '#d946ef', 12);
    
    // Teleport within map range
    const tileCols = this.game.world.cols;
    const padding = 120;
    this.x = padding + Math.random() * (tileCols * this.game.world.tileSize - padding * 2 - this.width);
    this.y = 120 + Math.random() * 160;
    
    this.game.particles.spawnExplosion(this.x + this.width/2, this.y + this.height/2, '#d946ef', 12);
    this.game.audio.playSFX('dash');
  }

  // --- DRAWING PROCEDURAL VECTOR GRAPHICS FOR BOSSES ---
  draw(ctx) {
    if (!this.active) return;

    ctx.save();

    // Fade if dying
    if (this.dying) {
      ctx.globalAlpha = Math.max(0, this.deathTimer / 2000);
    }

    // Glow red if in Phase 3 enraged
    if (this.phase === 3) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 15;
    }

    ctx.translate(this.x + this.width / 2, this.y + this.height / 2);

    // Draw individual bosses
    switch (this.worldIndex) {
      case 1: // Verdant Tortoise
        this.drawTortoise(ctx);
        break;
      case 2: // Crystal Serpent
        this.drawSerpent(ctx);
        break;
      case 3: // Storm Roc
        this.drawRoc(ctx);
        break;
      case 4: // Inferno Colossus
        this.drawColossus(ctx);
        break;
      case 5: // Frost Mammoth
        this.drawMammoth(ctx);
        break;
      case 6: // Void King
        this.drawVoidKing(ctx);
        break;
    }

    ctx.restore();

    // Draw active projectles
    for (let p of this.projectiles) {
      p.draw(ctx);
    }

    // Draw vertical lasers for serpent
    if (this.laserActive && this.worldIndex === 2) {
      this.drawSerpentLasers(ctx);
    }
  }

  drawTortoise(ctx) {
    // Green shell
    ctx.fillStyle = '#065f46';
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2 + 12, this.width, this.height - 12, 16);
    ctx.fill();

    // Shell yellow accents
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-this.width / 4, -this.height / 2 + 16, 12, 6);
    ctx.fillRect(8, -this.height / 2 + 16, 12, 6);

    // Head
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(this.width / 2 - 2, 4, 12, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#000';
    ctx.fillRect(this.width / 2 + 2, 0, 3, 3);
  }

  drawSerpent(ctx) {
    // Floating segment body
    ctx.fillStyle = '#6d28d9';
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Crown horns
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-8, -32, 4, 12);
    ctx.fillRect(4, -32, 4, 12);

    // Visor eyes
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(-10, -6, 20, 4);
  }

  drawSerpentLasers(ctx) {
    const period = Math.sin(this.laserTimer * 0.003);
    const laserX1 = this.game.width / 3 + period * 100;
    const laserX2 = (this.game.width / 3) * 2 - period * 100;

    const drawBeam = (x) => {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(this.laserTimer * 0.02) * 0.3;
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 14;
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.game.height);
      ctx.stroke();

      // Check player hits laser
      const laserBox = { x: x - 6, y: 0, width: 12, height: this.game.height };
      if (Physics.checkAABB(laserBox, this.game.player) && !this.game.player.isInvulnerable()) {
        this.game.player.damage(1);
      }
      ctx.restore();
    };

    drawBeam(laserX1);
    drawBeam(laserX2);
  }

  drawRoc(ctx) {
    // Majestic blue falcon bird
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(28, -2);
    ctx.lineTo(38, 4);
    ctx.lineTo(28, 8);
    ctx.closePath();
    ctx.fill();

    // Giant wings swaying
    const swing = Math.sin(this.game.levelTime * 0.008) * 16;
    ctx.fillStyle = '#0369a1';
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-48, -12 + swing);
    ctx.lineTo(-24, 16);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(48, -12 + swing);
    ctx.lineTo(24, 16);
    ctx.closePath();
    ctx.fill();
  }

  drawColossus(ctx) {
    // Dark stone volcanic giant
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 12);
    ctx.fill();
    ctx.stroke();

    // Lava fissures detail
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(-this.width/2 + 16, -10, 8, 20);
    ctx.fillRect(this.width/2 - 24, -10, 8, 20);

    // Glowing eyes
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(-14, -20, 6, 0, Math.PI*2);
    ctx.arc(14, -20, 6, 0, Math.PI*2);
    ctx.fill();
  }

  drawMammoth(ctx) {
    // Snow tusker mammoth
    ctx.fillStyle = '#cbd5e1'; // light frost fur
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 16);
    ctx.fill();

    // White Tusks
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(this.width / 2 - 4, 4);
    ctx.quadraticCurveTo(this.width / 2 + 16, 12, this.width / 2 + 18, -4);
    ctx.quadraticCurveTo(this.width / 2 + 8, 4, this.width / 2 - 4, 12);
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(this.width / 2 - 16, -12, 4, 4);
  }

  drawVoidKing(ctx) {
    // Shadow monarch vector details
    ctx.fillStyle = '#1e1b4b'; // deep midnight indigo
    ctx.strokeStyle = '#d946ef'; // glowing pink outline
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 12);
    ctx.fill();
    ctx.stroke();

    // Crown
    ctx.fillStyle = '#d946ef';
    ctx.beginPath();
    ctx.moveTo(-16, -this.height/2);
    ctx.lineTo(-12, -this.height/2 - 10);
    ctx.lineTo(-4, -this.height/2 - 2);
    ctx.lineTo(0, -this.height/2 - 14); // center peak
    ctx.lineTo(4, -this.height/2 - 2);
    ctx.lineTo(12, -this.height/2 - 10);
    ctx.lineTo(16, -this.height/2);
    ctx.closePath();
    ctx.fill();

    // Face glowing mask
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, -8, 8, 0, Math.PI*2);
    ctx.fill();

    // Cyber purple eyes
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(-4, -9, 2, 2);
    ctx.fillRect(2, -9, 2, 2);
  }
}
