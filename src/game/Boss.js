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
        ctx.save();
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#d8b4fe';
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - 6);
        ctx.lineTo(this.x + 4, this.y);
        ctx.lineTo(this.x, this.y + 6);
        ctx.lineTo(this.x - 4, this.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
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
        ctx.save();
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 10;
        let grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 6);
        grad.addColorStop(0, '#fef08a');
        grad.addColorStop(0.5, '#f97316');
        grad.addColorStop(1, '#dc2626');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
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
        ctx.save();
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = 12;
        // black core
        ctx.fillStyle = '#090514';
        ctx.strokeStyle = '#d946ef';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
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
        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        if (type === 'spike') {
          // Volcanic shard or needle
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(this.x + this.width, this.y);
          ctx.lineTo(this.x + this.width / 2, this.y + this.height);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (type === 'icicle') {
          // Translucent blue ice spike
          let iceGrad = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.height);
          iceGrad.addColorStop(0, '#e0f2fe');
          iceGrad.addColorStop(1, '#0284c7');
          ctx.fillStyle = iceGrad;
          ctx.beginPath();
          ctx.moveTo(this.x + 3, this.y);
          ctx.lineTo(this.x + this.width - 3, this.y);
          ctx.lineTo(this.x + this.width / 2, this.y + this.height);
          ctx.closePath();
          ctx.fill();
        } else {
          // Rock boulder with electric lines
          ctx.fillStyle = '#475569';
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, Math.PI*2);
          ctx.fill();
          ctx.stroke();
          
          // cracks
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(this.x + 4, this.y + 6);
          ctx.lineTo(this.x + this.width - 4, this.y + this.height - 6);
          ctx.stroke();
        }
        ctx.restore();
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
          ctx.save();
          ctx.shadowColor = '#f97316';
          ctx.shadowBlur = 10;
          let fireGrad = ctx.createRadialGradient(this.x + 8, this.y + 8, 0, this.x + 8, this.y + 8, 8);
          fireGrad.addColorStop(0, '#fef08a');
          fireGrad.addColorStop(0.6, '#f97316');
          fireGrad.addColorStop(1, 'rgba(239, 68, 68, 0.1)');
          ctx.fillStyle = fireGrad;
          ctx.beginPath();
          ctx.arc(this.x + 8, this.y + 8, 8, 0, Math.PI*2);
          ctx.fill();
          ctx.restore();
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
    // Colossal mossy runic tortoise
    const breathing = Math.sin(this.game.levelTime * 0.005) * 1.5;
    
    // Draw 4 heavy armored stone legs
    ctx.fillStyle = '#334155'; // Dark grey stone legs
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    
    // Back legs
    ctx.fillRect(-this.width / 2 + 6, 8 + breathing, 12, 16);
    ctx.fillRect(this.width / 4 - 2, 8 - breathing, 12, 16);
    
    // Green runic shell
    let shellGrad = ctx.createLinearGradient(0, -this.height / 2, 0, this.height / 2);
    shellGrad.addColorStop(0, '#064e3b'); // Dark green moss
    shellGrad.addColorStop(1, '#065f46');
    ctx.fillStyle = shellGrad;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2 + 10, this.width, this.height - 10, 18);
    ctx.fill();
    ctx.stroke();

    // Draw shell plates (hexagons)
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Hex 1
    ctx.moveTo(-20, -10); ctx.lineTo(-10, -18); ctx.lineTo(10, -18); ctx.lineTo(20, -10);
    ctx.lineTo(10, -2); ctx.lineTo(-10, -2); ctx.closePath();
    // Hex 2
    ctx.moveTo(-32, 2); ctx.lineTo(-20, -6); ctx.lineTo(-20, 10); ctx.lineTo(-32, 14);
    // Draw lines
    ctx.stroke();

    // Glowing emerald runes (pulsing)
    ctx.save();
    const runeGlow = 0.5 + Math.sin(this.game.levelTime * 0.007) * 0.3;
    ctx.strokeStyle = `rgba(52, 211, 153, ${runeGlow})`;
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    // Rune A
    ctx.moveTo(-15, -8); ctx.lineTo(-10, -13); ctx.lineTo(-5, -8);
    // Rune B
    ctx.moveTo(5, -8); ctx.lineTo(10, -13); ctx.lineTo(15, -8);
    ctx.stroke();
    ctx.restore();

    // Front legs
    ctx.fillStyle = '#475569';
    ctx.fillRect(-this.width / 2 + 2, 10 + breathing, 13, 14);
    ctx.fillRect(this.width / 4 - 6, 10 - breathing, 13, 14);

    // Dynamic bobbing neck + head
    ctx.save();
    ctx.translate(this.width / 2 - 4, 2 + breathing * 0.5);
    ctx.fillStyle = '#10b981'; // Green skin
    ctx.beginPath();
    ctx.roundRect(-2, -6, 12, 12, 4); // neck
    ctx.arc(8, -6, 11, 0, Math.PI * 2); // head
    ctx.fill();

    // Glowing green eye
    ctx.fillStyle = '#34d399';
    ctx.beginPath();
    ctx.arc(10, -8, 2.5, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  drawSerpent(ctx) {
    // Segmented Amethyst Serpent
    // We draw the head here, and we will draw tail segments behind it
    const headScale = 1 + Math.sin(this.game.levelTime * 0.006) * 0.05;
    ctx.scale(headScale, headScale);
    
    // Draw 3 tail segments trailing
    ctx.save();
    for (let i = 1; i <= 3; i++) {
      const segOffset = i * 22;
      const segY = Math.sin(this.game.levelTime * 0.005 - i * 0.8) * 14;
      
      // Amethyst crystal segment
      let segGrad = ctx.createRadialGradient(-segOffset - 2, segY - 2, 1, -segOffset, segY, 11);
      segGrad.addColorStop(0, '#c084fc');
      segGrad.addColorStop(0.7, '#7c3aed');
      segGrad.addColorStop(1, '#4c1d95');
      ctx.fillStyle = segGrad;
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.8;
      
      ctx.beginPath();
      // Diamond crystal shape
      ctx.moveTo(-segOffset, segY - 12);
      ctx.lineTo(-segOffset + 12, segY);
      ctx.lineTo(-segOffset, segY + 12);
      ctx.lineTo(-segOffset - 12, segY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Electric link beam (lightning arcs between segments)
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-segOffset + 12, segY);
      ctx.lineTo(-segOffset + 22, Math.sin(this.game.levelTime * 0.005 - (i-1)*0.8) * 14);
      ctx.stroke();
    }
    ctx.restore();

    // Main head: large amethyst crystal spear-tip
    let headGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 24);
    headGrad.addColorStop(0, '#d8b4fe');
    headGrad.addColorStop(0.6, '#6d28d9');
    headGrad.addColorStop(1, '#2e1065');
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(22, 0); // nose tip
    ctx.lineTo(-4, -20);
    ctx.lineTo(-20, -14);
    ctx.lineTo(-20, 14);
    ctx.lineTo(-4, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Crown horns
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-8, -19); ctx.lineTo(-14, -34); ctx.lineTo(-4, -19); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-4, -19); ctx.lineTo(0, -36); ctx.lineTo(6, -17); ctx.fill();

    // Glowing cyan visor visor
    ctx.fillStyle = '#22d3ee';
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(0, -6, 12, 4, 1.5);
    ctx.fill();
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
    // Colossal Storm Roc
    const floatSway = Math.sin(this.game.levelTime * 0.008) * 3;
    ctx.translate(0, floatSway);

    // Steel-blue body base
    let bodyGrad = ctx.createLinearGradient(-15, -15, 20, 20);
    bodyGrad.addColorStop(0, '#0ea5e9'); // Light blue
    bodyGrad.addColorStop(0.5, '#0284c7');
    bodyGrad.addColorStop(1, '#0c4a6e'); // Dark iron navy
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 36, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eagle crest head detailing
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.moveTo(18, -12);
    ctx.lineTo(26, -26); // Feather tuft
    ctx.lineTo(26, -10);
    ctx.lineTo(34, -4);
    ctx.lineTo(26, 8);
    ctx.closePath();
    ctx.fill();

    // Golden sharp beak
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.moveTo(32, -3);
    ctx.lineTo(44, 4);
    ctx.quadraticCurveTo(36, 10, 32, 8);
    ctx.closePath();
    ctx.fill();

    // Segmented cyber energy wings swaying
    const swing = Math.sin(this.game.levelTime * 0.012) * 18;
    ctx.save();
    
    // Draw 3 layered feathers on each wing
    const drawWing = (dir) => {
      ctx.fillStyle = dir > 0 ? '#0369a1' : '#075985';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      
      // Feather 1 (Main wing bone)
      ctx.beginPath();
      ctx.moveTo(10 * dir, -4);
      ctx.lineTo(52 * dir, -16 + swing);
      ctx.lineTo(26 * dir, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Energy feathers overlay
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.beginPath();
      ctx.moveTo(20 * dir, 0);
      ctx.lineTo(48 * dir, -4 + swing);
      ctx.lineTo(26 * dir, 18);
      ctx.closePath();
      ctx.fill();
    };

    drawWing(-1); // Left wing
    drawWing(1);  // Right wing
    ctx.restore();

    // Flashing neon yellow storm visor
    ctx.fillStyle = '#facc15';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(14, -8, 10, 3.5, 1);
    ctx.fill();
    
    // Draw lightning sparks crackling around body
    if (Math.random() < 0.25) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-10, -10); ctx.lineTo(-18, -26); ctx.lineTo(-12, -28);
      ctx.stroke();
    }
  }

  drawColossus(ctx) {
    // Volcanic Inferno Titan of obsidian and lava
    const heartPulse = 1 + Math.sin(this.game.levelTime * 0.015) * 0.07;
    
    // Lava Core (radial glow)
    let coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, this.width / 2 + 10);
    coreGrad.addColorStop(0, '#fde047'); // bright yellow
    coreGrad.addColorStop(0.3, '#f97316'); // hot orange
    coreGrad.addColorStop(0.7, '#dc2626'); // red plasma
    coreGrad.addColorStop(1, 'rgba(220, 38, 38, 0)'); // transparent fade
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, this.width / 2 + 10, 0, Math.PI*2);
    ctx.fill();

    // Floating Obsidian armor plates
    ctx.fillStyle = '#18181b'; // obsidian black
    ctx.strokeStyle = '#ea580c'; // magma glow joints
    ctx.lineWidth = 2.5;

    // Torso armor plate left
    ctx.beginPath();
    ctx.roundRect(-this.width / 2 + 4, -this.height / 2 + 15, this.width / 2 - 6, this.height - 25, 6);
    ctx.fill();
    ctx.stroke();

    // Torso armor plate right
    ctx.beginPath();
    ctx.roundRect(2, -this.height / 2 + 15, this.width / 2 - 6, this.height - 25, 6);
    ctx.fill();
    ctx.stroke();

    // Colossal stone shoulders
    ctx.fillStyle = '#27272a';
    ctx.fillRect(-this.width / 2 - 6, -this.height / 2 + 8, 12, 14);
    ctx.fillRect(this.width / 2 - 6, -this.height / 2 + 8, 12, 14);

    // Glowing Lava Veins on plates
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-20, -10); ctx.lineTo(-12, 8); ctx.lineTo(-18, 20);
    ctx.moveTo(20, -10); ctx.lineTo(12, 8); ctx.lineTo(18, 20);
    ctx.stroke();

    // Glowing magma head
    ctx.save();
    ctx.translate(0, -this.height / 2 + 4);
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, -12, 14, 0, Math.PI*2);
    ctx.fill();

    // Obsidian face shield plate
    ctx.fillStyle = '#09090b';
    ctx.fillRect(-8, -18, 16, 12);

    // Red fire eyes
    ctx.fillStyle = '#fde047';
    ctx.fillRect(-5, -14, 2.5, 2);
    ctx.fillRect(2.5, -14, 2.5, 2);
    ctx.restore();
  }

  drawMammoth(ctx) {
    // Colossal Frost Mammoth
    // Base layered blue-grey fur
    let furGrad = ctx.createLinearGradient(0, -this.height/2, 0, this.height/2);
    furGrad.addColorStop(0, '#cbd5e1');
    furGrad.addColorStop(0.5, '#94a3b8');
    furGrad.addColorStop(1, '#475569');
    ctx.fillStyle = furGrad;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 16);
    ctx.fill();
    ctx.stroke();

    // Fur ridges (lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-25, 0); ctx.lineTo(-35, 12);
    ctx.moveTo(-10, 8); ctx.lineTo(-20, 20);
    ctx.moveTo(10, 8); ctx.lineTo(5, 20);
    ctx.stroke();

    // Massive ice crystal tusks (translucent cryo effect)
    ctx.save();
    let tuskGrad = ctx.createLinearGradient(this.width/2 - 4, 10, this.width/2 + 25, -10);
    tuskGrad.addColorStop(0, 'rgba(6, 182, 212, 0.85)');
    tuskGrad.addColorStop(0.5, 'rgba(34, 211, 238, 0.6)');
    tuskGrad.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
    ctx.fillStyle = tuskGrad;
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 10;

    // Right massive curved tusk
    ctx.beginPath();
    ctx.moveTo(this.width / 2 - 6, 2);
    ctx.quadraticCurveTo(this.width / 2 + 22, 14, this.width / 2 + 24, -14);
    ctx.quadraticCurveTo(this.width / 2 + 10, 4, this.width / 2 - 6, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Left minor tusk (slightly offset and layered behind)
    ctx.translate(-this.width + 12, 0);
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(-22, 14, -24, -14);
    ctx.quadraticCurveTo(-10, 4, 0, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Frost rune helm overlay on skull
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(this.width / 2 - 22, -18, 14, 18, 2);
    ctx.fill();

    // Glowing cyan eye
    ctx.fillStyle = '#06b6d4';
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 8;
    ctx.fillRect(this.width / 2 - 14, -10, 3.5, 3.5);
  }

  drawVoidKing(ctx) {
    // Colossal Void King shadow monarch
    // Ambient cosmic starfield cloak
    ctx.fillStyle = '#090514'; // Midnight base
    ctx.strokeStyle = '#d946ef'; // Magenta aura
    ctx.lineWidth = 2.2;
    ctx.save();
    ctx.shadowColor = '#d946ef';
    ctx.shadowBlur = 14;

    // Cloak path
    ctx.beginPath();
    ctx.moveTo(-16, -this.height / 2);
    ctx.lineTo(-24, this.height / 2 - 4);
    ctx.lineTo(24, this.height / 2 - 4);
    ctx.lineTo(16, -this.height / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Star texture in the cloak
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 8; i++) {
      const starX = -18 + Math.sin(this.game.levelTime * 0.001 + i) * 16;
      const starY = -12 + (i * 6);
      ctx.fillRect(starX, starY, 1, 1);
    }
    ctx.restore();

    // Swirling black hole chest core
    ctx.save();
    const spin = this.game.levelTime * 0.01;
    ctx.translate(0, -4);
    ctx.rotate(spin);
    
    // Outer event horizon
    ctx.fillStyle = 'rgba(217, 70, 239, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = '#020005';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Crown of pink fire energy
    ctx.save();
    ctx.fillStyle = '#d946ef';
    ctx.shadowColor = '#d946ef';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(-12, -this.height / 2);
    ctx.lineTo(-9, -this.height / 2 - 9);
    ctx.lineTo(-3, -this.height / 2 - 2);
    ctx.lineTo(0, -this.height / 2 - 13); // Center peak
    ctx.lineTo(3, -this.height / 2 - 2);
    ctx.lineTo(9, -this.height / 2 - 9);
    ctx.lineTo(12, -this.height / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Faceless dark void mask
    ctx.fillStyle = '#050508';
    ctx.beginPath();
    ctx.arc(0, -this.height/2 + 10, 7.5, 0, Math.PI*2);
    ctx.fill();

    // Eerie glowing eyes
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(-3, -this.height/2 + 9, 1.8, 1.8);
    ctx.fillRect(1.5, -this.height/2 + 9, 1.8, 1.8);
  }
}
