import { Input } from './Input.js';
import { Camera } from './Camera.js';
import { SaveSystem } from './SaveSystem.js';
import { Player } from '../game/Player.js';
import { World } from '../game/World.js';
import { ParticleSystem } from '../game/ParticleSystem.js';
import { AudioSynthesizer } from '../audio/AudioSynthesizer.js';
import { UIManager } from '../ui/UIManager.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Virtual resolution (16:9 ratio)
    this.width = 960;
    this.height = 540;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.state = 'title'; // title, map, playing, paused, shop, achievements, settings, gameover, victory
    this.saveData = SaveSystem.load();

    // Engine modules
    this.input = new Input();
    this.camera = new Camera(this.width, this.height);
    this.audio = new AudioSynthesizer(this);
    this.particles = new ParticleSystem(this);
    this.ui = new UIManager(this);

    // Game variables
    this.player = null;
    this.world = null;
    this.enemies = [];
    this.powerUps = [];
    this.activeBoss = null;

    // Level progression stats
    this.currentWorldIndex = 1;
    this.currentLevelIndex = 1;
    
    this.levelTime = 0; // ms
    this.levelShards = 0;
    this.levelRelics = 0;
    this.levelKey = false;
    this.noDamageRun = true;

    // Timing
    this.lastTime = 0;
    this.accumulator = 0;
    this.physicsStep = 1000 / 60; // Fixed 60 FPS physics tick

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Start loop
    requestAnimationFrame((t) => this.loop(t));
  }

  resizeCanvas() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Lock height to 540 (matches 17 grid rows of 32px)
    this.height = 540;
    // Calculate width to match aspect ratio
    this.width = Math.round(this.height * (windowWidth / windowHeight));
    
    // Cap virtual width to keep physics and visibility balanced
    if (this.width < 720) this.width = 720;     // Minimum width
    if (this.width > 1280) this.width = 1280;   // Maximum width
    
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Position canvas absolute centered in CSS
    this.canvas.style.position = 'absolute';
    this.canvas.style.left = '50%';
    this.canvas.style.top = '50%';
    this.canvas.style.transform = 'translate(-50%, -50%)';

    // Calculate canvas size style to fit screen without deforming
    const targetRatio = this.width / this.height;
    const windowRatio = windowWidth / windowHeight;

    if (windowRatio > targetRatio) {
      this.canvas.style.height = '100%';
      this.canvas.style.width = 'auto';
    } else {
      this.canvas.style.width = '100%';
      this.canvas.style.height = 'auto';
    }

    if (this.camera) {
      this.camera.width = this.width;
      this.camera.height = this.height;
      if (this.world) {
        this.camera.setBounds(0, 0, this.world.cols * this.world.tileSize, this.world.rows * this.world.tileSize);
      }
    }
  }

  // --- STATE TRANSITIONS ---
  changeState(newState) {
    const prevState = this.state;
    this.state = newState;
    this.ui.updateScreens();

    if (newState === 'map') {
      this.audio.playMusic('map');
      this.input.reset();
    } else if (newState === 'title') {
      this.audio.playMusic('title');
    } else if (newState === 'playing') {
      if (prevState === 'title' || prevState === 'map' || prevState === 'gameover' || prevState === 'victory') {
        this.loadLevel(this.currentWorldIndex, this.currentLevelIndex);
      }
      this.audio.playMusic(`w${this.currentWorldIndex}`);
    }
  }

  loadLevel(worldIdx, levelIdx) {
    this.currentWorldIndex = worldIdx;
    this.currentLevelIndex = levelIdx;

    this.levelTime = 0;
    this.levelShards = 0;
    this.levelRelics = 0;
    this.levelKey = false;
    this.noDamageRun = true;

    // Generate World
    this.world = new World(this, worldIdx, levelIdx);
    
    // Spawn player at world spawn point
    this.player = new Player(this, this.world.spawnX, this.world.spawnY);
    
    // Setup camera
    this.camera.setTarget(this.player);
    this.camera.setBounds(0, 0, this.world.cols * this.world.tileSize, this.world.rows * this.world.tileSize);

    // Spawn entities (enemies, items, obstacles)
    this.world.spawnEntities();

    // Reset particles
    this.particles.clear();

    this.ui.updateHUD();
  }

  restartLevel() {
    this.changeState('playing');
    if (this.world && this.player) {
      // Restore player health, active status, energy
      this.player.health = this.player.maxHealth;
      this.player.energy = this.player.maxEnergy;
      this.player.active = true;
      this.player.invulnTimer = 1500; // Brief invulnerability shield
      this.player.vx = 0;
      this.player.vy = 0;
      
      // Position player at checkpoint
      this.player.x = this.world.latestCheckpoint.x;
      this.player.y = this.world.latestCheckpoint.y;
      
      // Snap camera to target checkpoint immediately
      this.camera.x = this.player.x + this.player.width / 2 - this.width / 2;
      this.camera.y = this.player.y + this.player.height / 2 - this.height / 2;
      
      // Clear level projectiles to avoid immediate hazard damage
      this.world.projectiles = [];
      
      // Reset active boss if present
      if (this.activeBoss) {
        this.activeBoss.health = this.activeBoss.maxHealth;
        this.activeBoss.active = true;
        this.activeBoss.dying = false;
        this.activeBoss.phase = 1;
        this.activeBoss.projectiles = [];
      }
      
      this.ui.updateHUD();
    } else {
      this.loadLevel(this.currentWorldIndex, this.currentLevelIndex);
    }
  }

  nextLevel() {
    // Determine next level
    let nextW = this.currentWorldIndex;
    let nextL = this.currentLevelIndex + 1;
    
    const maxLevels = this.world.getMaxLevelsInWorld(nextW);
    if (nextL > maxLevels) {
      nextW += 1;
      nextL = 1;
    }

    if (nextW > 6) {
      // Game fully completed! Back to map.
      this.changeState('map');
      return;
    }

    this.currentWorldIndex = nextW;
    this.currentLevelIndex = nextL;
    this.changeState('playing');
  }

  // --- GAME LOOP ---
  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    let deltaTime = timestamp - this.lastTime;
    this.lastTime = timestamp;

    // Cap delta time to prevent spiraling after tab inactive
    if (deltaTime > 100) deltaTime = 16.66;

    if (this.state === 'playing') {
      this.accumulator += deltaTime;
      
      // Fixed step physics updates
      while (this.accumulator >= this.physicsStep) {
        this.updatePhysics(this.physicsStep);
        this.accumulator -= this.physicsStep;
      }
      
      this.updateVisuals(deltaTime);
    } else {
      // Simple animations in menus
      this.particles.update(deltaTime);
    }

    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  updatePhysics(dt) {
    this.input.update();
    
    if (this.player) {
      this.player.update(dt);
    }

    // Update Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      enemy.update(dt);
      
      // Check collision with player
      if (enemy.active && this.player.active && !this.player.isInvulnerable()) {
        if (this.checkAABB(this.player, enemy)) {
          this.player.damage(enemy.damagePower || 1);
          this.noDamageRun = false;
        }
      }

      // Remove dead enemies after death animation finishes
      if (enemy.markedForRemoval) {
        this.enemies.splice(i, 1);
      }
    }

    // Update Boss
    if (this.activeBoss) {
      this.activeBoss.update(dt);
      
      if (this.activeBoss.active && this.player.active && !this.player.isInvulnerable()) {
        if (this.checkAABB(this.player, this.activeBoss)) {
          this.player.damage(2); // Bosses do double damage
          this.noDamageRun = false;
        }
      }

      // Check boss projectile collisions with player
      if (this.activeBoss.projectiles) {
        for (let p of this.activeBoss.projectiles) {
          if (p.active && this.checkAABB(this.player, p) && !this.player.isInvulnerable()) {
            this.player.damage(1);
            this.noDamageRun = false;
            p.active = false;
          }
        }
      }
    }

    // Update World platforms/traps
    this.world.update(dt);

    // Collisions with world collectibles
    this.world.checkItemCollisions(this.player);

    // Level time tracking
    this.levelTime += dt;
    this.ui.updateHUDTimer();
  }

  updateVisuals(dt) {
    this.camera.update(dt);
    this.particles.update(dt);
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (this.state === 'playing' || this.state === 'paused' || this.state === 'gameover' || this.state === 'victory') {
      if (this.world) {
        // 1. Draw Background layers
        this.world.drawBackground(this.ctx, this.camera);

        // 2. Translate ctx for camera follow
        this.ctx.save();
        this.ctx.translate(-this.camera.x + this.camera.shakeOffsetX, -this.camera.y + this.camera.shakeOffsetY);

        // 3. Draw World Tiles
        this.world.drawTiles(this.ctx);

        // 4. Draw Items / Portals / Hazards
        this.world.drawEntities(this.ctx);

        // 5. Draw Enemies
        for (let enemy of this.enemies) {
          enemy.draw(this.ctx);
        }

        // 6. Draw Boss
        if (this.activeBoss) {
          this.activeBoss.draw(this.ctx);
        }

        // 7. Draw Player
        if (this.player) {
          this.player.draw(this.ctx);
        }

        // 8. Draw Particles in world space
        this.particles.draw(this.ctx);

        this.ctx.restore();
      }
    } else {
      // In menus, render a beautiful abstract scrolling space particle background
      this.ctx.fillStyle = '#06070a';
      this.ctx.fillRect(0, 0, this.width, this.height);
      
      this.particles.draw(this.ctx);
    }
  }

  // --- COLLISION UTIL ---
  checkAABB(r1, r2) {
    return (
      r1.x < r2.x + r2.width &&
      r1.x + r1.width > r2.x &&
      r1.y < r2.y + r2.height &&
      r1.y + r1.height > r2.y
    );
  }

  // --- PROGRESSION & REWARDS ---
  completeLevel() {
    const shardsBase = this.levelShards;
    const timeSec = Math.floor(this.levelTime / 1000);
    
    // Grade logic: based on time and relics
    let grade = 'B';
    let bonus = 20;

    if (timeSec < this.world.speedrunTime && this.levelRelics === 3) {
      grade = 'S';
      bonus = 80;
    } else if (this.levelRelics === 3 || timeSec < this.world.speedrunTime) {
      grade = 'A';
      bonus = 40;
    } else if (this.levelRelics === 0 && timeSec > this.world.speedrunTime * 1.5) {
      grade = 'C';
      bonus = 10;
    }

    if (this.noDamageRun) {
      bonus += 20; // Perfect run bonus
    }

    const totalEarned = shardsBase + bonus;
    this.saveData.shards += totalEarned;

    // Ability unlock check on boss completion
    let unlockedAbility = null;
    const isBossArena = (this.currentLevelIndex === this.world.getMaxLevelsInWorld(this.currentWorldIndex));
    
    if (isBossArena) {
      // Unlocks mapping
      const unlocks = {
        1: 'dash',
        2: 'doublejump',
        3: 'glide',
        4: 'pound',
        5: 'airdash'
      };
      
      const skill = unlocks[this.currentWorldIndex];
      if (skill && !this.saveData.unlockedAbilities.includes(skill)) {
        this.saveData.unlockedAbilities.push(skill);
        unlockedAbility = skill;
      }
    }

    // Save level stats
    const levelKey = `w${this.currentWorldIndex}-l${this.currentLevelIndex}`;
    const prevRecord = this.saveData.completedLevels[levelKey];
    
    if (!prevRecord || prevRecord.grade !== 'S') {
      this.saveData.completedLevels[levelKey] = {
        shards: shardsBase,
        relics: this.levelRelics,
        time: timeSec,
        grade
      };
    }

    // Advance progression locks
    if (this.currentWorldIndex === this.saveData.highestUnlockedWorld && 
        this.currentLevelIndex === this.saveData.highestUnlockedLevel) {
      
      let nextW = this.currentWorldIndex;
      let nextL = this.currentLevelIndex + 1;
      const maxLevels = this.world.getMaxLevelsInWorld(this.currentWorldIndex);
      
      if (nextL > maxLevels) {
        if (nextW < 6) {
          nextW += 1;
          nextL = 1;
        }
      }
      
      this.saveData.highestUnlockedWorld = nextW;
      this.saveData.highestUnlockedLevel = nextL;
    }

    // Achievements trigger evaluation
    this.checkAchievementsTriggers();

    SaveSystem.save(this.saveData);

    // Bind to victory panel
    this.ui.showVictoryScreen(grade, shardsBase, this.levelRelics, timeSec, bonus, unlockedAbility);
    this.changeState('victory');
    this.audio.playSFX('victory');
  }

  checkAchievementsTriggers() {
    const unlock = (id) => {
      if (!this.saveData.achievements.includes(id)) {
        this.saveData.achievements.push(id);
        this.ui.triggerAchievementToast(id);
      }
    };

    // First Steps (Completed Level 1-1)
    if (this.saveData.completedLevels['w1-l1']) {
      unlock('first_steps');
    }

    // Crystal Collector (1000+ crystals)
    if (this.saveData.shards >= 1000) {
      unlock('crystal_collector');
    }

    // Speed Demon (Beat a level under speedrun target)
    for (let key in this.saveData.completedLevels) {
      const parts = key.replace('w','').replace('l','').split('-');
      const wIdx = parseInt(parts[0]);
      const record = this.saveData.completedLevels[key];
      // Quick reference: W1 speedrun = 60s, W2 = 80s, W3 = 90s, W4 = 100s, W5 = 110s, W6 = 120s
      const speedrunLimit = [0, 60, 80, 90, 100, 110, 120][wIdx] || 120;
      if (record.time < speedrunLimit) {
        unlock('speed_demon');
      }
    }

    // Secret Hunter (Gather 3 relics in a level)
    for (let key in this.saveData.completedLevels) {
      if (this.saveData.completedLevels[key].relics === 3) {
        unlock('secret_hunter');
      }
    }

    // Untouchable (Beat a level with no damage)
    if (this.noDamageRun && this.state === 'victory') {
      unlock('untouchable');
    }

    // Realm Savior (Completed World 6 Boss)
    if (this.saveData.completedLevels['w6-l3']) {
      unlock('realm_savior');
    }
  }

  // Hurt Player
  hurtPlayer(dmg) {
    if (this.player && this.player.active) {
      this.player.damage(dmg);
      this.noDamageRun = false;
    }
  }
}
