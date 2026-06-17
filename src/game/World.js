import { Physics } from '../engine/Physics.js';
import { Enemy } from './Enemy.js';
import { Boss } from './Boss.js';

export class World {
  constructor(game, worldIndex, levelIndex) {
    this.game = game;
    this.worldIndex = worldIndex;
    this.levelIndex = levelIndex;

    this.tileSize = 32;
    this.rows = 17; // 17 * 32 = 544px height (fits canvas 540px)
    this.cols = 110; // 110 * 32 = 3520px width scrollable

    this.grid = [];
    this.spawnX = 100;
    this.spawnY = 200;
    this.latestCheckpoint = { x: 100, y: 200 };

    this.items = []; // crystals, relics, keys, seeds
    this.checkpoints = [];
    this.movingPlatforms = [];
    this.projectiles = []; // spitter bullets, boss missiles

    // Lava rising height
    this.lavaLevel = null; 

    // Level properties
    this.speedrunTime = [0, 50, 70, 80, 95, 110, 120][worldIndex] || 90; // seconds

    // Generate stars for celestial backgrounds
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({
        x: Math.random() * 960,
        y: Math.random() * 380,
        size: Math.random() * 1.5 + 0.8,
        phase: Math.random() * Math.PI
      });
    }

    this.generateLayout();
  }

  getTile(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return null;
    }
    return this.grid[row][col];
  }

  getMaxLevelsInWorld(wIdx) {
    return wIdx === 1 ? 5 : 3;
  }

  // --- GRID MAP GENERATOR ---
  generateLayout() {
    // Initialize empty grid
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      this.grid[r] = new Array(this.cols).fill(null);
    }

    const maxLevels = this.getMaxLevelsInWorld(this.worldIndex);
    const isBossLevel = (this.levelIndex === maxLevels);

    if (isBossLevel) {
      // 1. BOSS ARENA GENERATION (compact flat room)
      this.cols = 40; // Smaller arena
      this.spawnX = 120;
      this.spawnY = 320;
      this.latestCheckpoint = { x: this.spawnX, y: this.spawnY };

      // Solid floor and walls
      for (let c = 0; c < this.cols; c++) {
        this.setTile(c, this.rows - 1, 1); // Ground
        this.setTile(c, this.rows - 2, 1);
        if (c < 3 || c > this.cols - 4) {
          for (let r = 0; r < this.rows; r++) {
            this.setTile(c, r, 1); // Wall blockers
          }
        }
      }
      return;
    }

    // 2. STANDARD SCROLLING LEVEL GENERATOR
    // Build solid floor with pits
    for (let c = 0; c < this.cols; c++) {
      // Create pits at specific column locations
      let isPit = false;
      if (c > 15 && c < 19) isPit = true;
      if (c > 35 && c < 39) isPit = true;
      if (c > 55 && c < 59) isPit = true;
      if (c > 75 && c < 80) isPit = true;
      if (c > 92 && c < 96) isPit = true;

      // In World 4 (Volcano), pits have lava
      // In World 5 (Ice), floor is slippery ice
      const groundTileVal = this.worldIndex === 5 ? 11 : 1; // 11 = Ice block

      if (!isPit) {
        this.setTile(c, this.rows - 1, 1);
        this.setTile(c, this.rows - 2, groundTileVal);
      } else {
        if (this.worldIndex === 4) {
          // Fill pit with lava (Tile 10)
          this.setTile(c, this.rows - 1, 10);
          this.setTile(c, this.rows - 2, 10);
        } else {
          // Spike pits (Tile 2)
          this.setTile(c, this.rows - 1, 1);
          this.setTile(c, this.rows - 2, 2); // Spikes
        }
      }
    }

    // Spawn starting safety area
    this.spawnX = 100;
    this.spawnY = 350;
    this.latestCheckpoint = { x: this.spawnX, y: this.spawnY };

    // Set Level check points (nodes)
    this.checkpoints.push({ x: 32 * 32, y: 350, active: false });
    this.checkpoints.push({ x: 65 * 32, y: 350, active: false });

    // Place ending portal
    const exitCol = this.cols - 6;
    this.items.push({ type: 'portal', x: exitCol * 32, y: (this.rows - 5) * 32, width: 32, height: 64 });
    // Block portal wall
    for (let r = 0; r < this.rows - 2; r++) {
      this.setTile(this.cols - 3, r, 1);
    }
    this.setTile(exitCol, this.rows - 3, 1);
    this.setTile(exitCol + 1, this.rows - 3, 1);

    // Procedural level features based on World Index
    this.applyWorldThemeMechanics();
  }

  setTile(col, row, type) {
    if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
      this.grid[row][col] = type ? { type, solid: (type === 1 || type === 11) } : null;
    }
  }

  applyWorldThemeMechanics() {
    // Place stairs, floating step blocks, items, hazards, and mechanical nodes
    // Let's place platforms and collectibles
    
    // Helper to draw floating platforms
    const drawPlatform = (startCol, row, length, tileVal = 1) => {
      for (let c = 0; c < length; c++) {
        this.setTile(startCol + c, row, tileVal);
      }
    };

    // Helper to distribute crystal shards
    const distributeCrystals = (startCol, row, count) => {
      for (let i = 0; i < count; i++) {
        this.items.push({
          type: 'crystal',
          x: (startCol + i) * 32 + 8,
          y: row * 32 - 24,
          width: 16,
          height: 16,
          collected: false
        });
      }
    };

    // 1. Platforms
    drawPlatform(8, this.rows - 5, 4);
    distributeCrystals(9, this.rows - 5, 2);

    drawPlatform(21, this.rows - 6, 3);
    distributeCrystals(21, this.rows - 6, 3);

    // World specific platform modifications
    const tileType = this.worldIndex === 5 ? 11 : 1; // Ice blocks if World 5

    // Pit bridging platforms
    drawPlatform(14, this.rows - 4, 1, tileType);
    drawPlatform(19, this.rows - 5, 1, tileType);

    // Mid area structures
    drawPlatform(30, this.rows - 4, 3, tileType);
    drawPlatform(33, this.rows - 6, 2, tileType);
    drawPlatform(42, this.rows - 5, 4, tileType);
    distributeCrystals(43, this.rows - 5, 2);

    // Large floating peak section for Wind/Peak World
    if (this.worldIndex === 3) {
      // Very high floating platforms
      drawPlatform(48, this.rows - 8, 3);
      drawPlatform(53, this.rows - 10, 4);
      distributeCrystals(54, this.rows - 10, 2);
    }

    // Slippery run in World 5
    if (this.worldIndex === 5) {
      drawPlatform(60, this.rows - 5, 6, 11);
    } else {
      drawPlatform(60, this.rows - 5, 5);
    }

    // Moving platforms
    this.movingPlatforms.push({
      startX: 49 * 32,
      startY: (this.rows - 5) * 32,
      endX: 53 * 32,
      endY: (this.rows - 5) * 32,
      x: 49 * 32,
      y: (this.rows - 5) * 32,
      width: 48,
      height: 12,
      speed: 1.2,
      dir: 1
    });

    this.movingPlatforms.push({
      startX: 82 * 32,
      startY: (this.rows - 5) * 32,
      endX: 82 * 32,
      endY: (this.rows - 9) * 32,
      x: 82 * 32,
      y: (this.rows - 5) * 32,
      width: 48,
      height: 12,
      speed: 1.0,
      dir: 1
    });

    // Bounce flower (World 1 specific or general helper)
    // Represented in grid as Tile 3
    this.setTile(28, this.rows - 3, 3); // Bounce flower on floor
    this.setTile(71, this.rows - 3, 3);

    // Hidden breakable wall or secret room
    // Let's place Ancient Relics (3 per level)
    this.items.push({ type: 'relic', relicIdx: 1, x: 22 * 32, y: (this.rows - 10) * 32, width: 20, height: 20 });
    this.items.push({ type: 'relic', relicIdx: 2, x: 55 * 32, y: (this.rows - 13) * 32, width: 20, height: 20 });
    this.items.push({ type: 'relic', relicIdx: 3, x: 86 * 32, y: (this.rows - 7) * 32, width: 20, height: 20 });

    // Place Realm Key (1 per level required for portal)
    this.items.push({ type: 'key', x: 44 * 32, y: (this.rows - 8) * 32, width: 16, height: 24 });

    // Health Seeds (increases health)
    this.items.push({ type: 'seed', x: 62 * 32, y: (this.rows - 7) * 32, width: 16, height: 16 });

    // Power-Ups distribution
    const powerUpsList = ['wind', 'thunder', 'shield', 'time', 'fire'];
    const selectedPowerUp = powerUpsList[(this.worldIndex + this.levelIndex) % powerUpsList.length];
    
    // Spawn powerup item (e.g. glowing bubble)
    this.items.push({
      type: 'powerup',
      powerupType: selectedPowerUp,
      x: 31 * 32 + 8,
      y: (this.rows - 7) * 32,
      width: 20,
      height: 20,
      bobOffset: 0
    });
  }

  // --- ENTITIES SPAWN ---
  spawnEntities() {
    this.game.enemies = [];
    this.game.activeBoss = null;
    this.projectiles = [];

    const maxLevels = this.getMaxLevelsInWorld(this.worldIndex);
    const isBossArena = (this.levelIndex === maxLevels);

    if (isBossArena) {
      // Spawn Boss
      this.game.activeBoss = new Boss(this.game, 32 * 10, (this.rows - 5) * 32, this.worldIndex);
      return;
    }

    // Spawn standard enemies along scrolling map
    const spawnEnemy = (col, row, type) => {
      this.game.enemies.push(new Enemy(this.game, col * 32, row * 32, type));
    };

    // Spawn rates/types based on worlds
    if (this.worldIndex === 1) {
      // Meadows: Pufflings and Thornbacks
      spawnEnemy(12, this.rows - 3, 'puffling');
      spawnEnemy(25, this.rows - 3, 'puffling');
      spawnEnemy(32, this.rows - 3, 'thornback');
      spawnEnemy(43, this.rows - 6, 'puffling');
      spawnEnemy(64, this.rows - 3, 'thornback');
      spawnEnemy(73, this.rows - 3, 'puffling');
      spawnEnemy(88, this.rows - 3, 'thornback');
    } 
    else if (this.worldIndex === 2) {
      // Caverns: Spitters, Golem elite
      spawnEnemy(12, this.rows - 3, 'spitter');
      spawnEnemy(26, this.rows - 3, 'burrower');
      spawnEnemy(33, this.rows - 7, 'spitter');
      spawnEnemy(45, this.rows - 4, 'golem'); // Elite
      spawnEnemy(63, this.rows - 3, 'burrower');
      spawnEnemy(78, this.rows - 3, 'spitter');
    }
    else if (this.worldIndex === 3) {
      // Peaks: Gliders, Sky Hunters
      spawnEnemy(15, this.rows - 8, 'glider');
      spawnEnemy(32, this.rows - 10, 'glider');
      spawnEnemy(53, this.rows - 12, 'skyhunter'); // Elite
      spawnEnemy(68, this.rows - 9, 'glider');
      spawnEnemy(85, this.rows - 8, 'skyhunter');
    }
    else if (this.worldIndex === 4) {
      // Depths: Lava Warden elites, spitters
      spawnEnemy(15, this.rows - 3, 'spitter');
      spawnEnemy(32, this.rows - 4, 'lavawarden'); // Elite
      spawnEnemy(44, this.rows - 6, 'spitter');
      spawnEnemy(65, this.rows - 3, 'lavawarden');
      spawnEnemy(84, this.rows - 3, 'spitter');
    }
    else if (this.worldIndex === 5) {
      // Expanse: Burrower, Golems
      spawnEnemy(14, this.rows - 3, 'burrower');
      spawnEnemy(30, this.rows - 5, 'golem');
      spawnEnemy(60, this.rows - 6, 'burrower');
      spawnEnemy(78, this.rows - 3, 'golem');
    }
    else if (this.worldIndex === 6) {
      // Shadows: Mix of elites
      spawnEnemy(14, this.rows - 3, 'puffling');
      spawnEnemy(28, this.rows - 3, 'skyhunter');
      spawnEnemy(45, this.rows - 4, 'lavawarden');
      spawnEnemy(66, this.rows - 3, 'golem');
      spawnEnemy(88, this.rows - 3, 'skyhunter');
    }
  }

  update(dt) {
    // Update moving platforms
    for (let plat of this.movingPlatforms) {
      if (plat.startX === plat.endX) {
        // Vertical movement
        plat.y += plat.speed * plat.dir;
        if (plat.y < Math.min(plat.startY, plat.endY) || plat.y > Math.max(plat.startY, plat.endY)) {
          plat.dir = -plat.dir;
        }
      } else {
        // Horizontal movement
        plat.x += plat.speed * plat.dir;
        if (plat.x < Math.min(plat.startX, plat.endX) || plat.x > Math.max(plat.startX, plat.endX)) {
          plat.dir = -plat.dir;
        }
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (!p.active) {
        this.projectiles.splice(i, 1);
      }
    }

    // Wind tunnel force in World 3 Peaks
    if (this.worldIndex === 3) {
      // Periodic gust of wind pushing player left
      const player = this.game.player;
      if (player && player.active && Math.sin(this.game.levelTime * 0.001) > 0.4) {
        player.vx -= 0.6; // Wind resistance
        if (Math.random() < 0.2) {
          this.game.particles.spawnGlideFeathers(player.x + 100, player.y + Math.random()*40, 1);
        }
      }
    }

    // Ice Castle flakes in World 5 Expanse
    if (this.worldIndex === 5 && Math.random() < 0.1) {
      this.game.particles.spawnSnow(this.game.camera.x + Math.random() * this.game.width, this.game.camera.y);
    }

    // Shadow bubbles in World 6
    if (this.worldIndex === 6 && Math.random() < 0.08) {
      this.game.particles.spawnShadow(this.game.camera.x + Math.random() * this.game.width, this.game.camera.y + Math.random()*200);
    }
  }

  // --- ITEM COLLECTION OVERLAPS ---
  checkItemCollisions(player) {
    for (let item of this.items) {
      if (item.collected || !player.active) continue;

      if (Physics.checkAABB(player, item)) {
        if (item.type === 'crystal') {
          item.collected = true;
          this.game.levelShards++;
          this.game.audio.playSFX('shard');
          this.game.particles.spawnSparkles(item.x + 8, item.y + 8, '#eab308', 5);
          this.game.ui.updateHUD();
        } 
        else if (item.type === 'relic') {
          item.collected = true;
          this.game.levelRelics++;
          this.game.audio.playSFX('relic');
          this.game.particles.spawnSparkles(item.x + 10, item.y + 10, '#06b6d4', 12);
          this.game.ui.updateHUD();
        }
        else if (item.type === 'key') {
          item.collected = true;
          this.game.levelKey = true;
          this.game.audio.playSFX('victory_relic');
          this.game.particles.spawnSparkles(item.x + 8, item.y + 12, '#a855f7', 15);
          this.game.ui.updateHUD();
        }
        else if (item.type === 'seed') {
          item.collected = true;
          player.heal(1);
          this.game.particles.spawnSparkles(item.x + 8, item.y + 8, '#10b981', 12);
        }
        else if (item.type === 'powerup') {
          item.collected = true;
          player.powerups.activate(item.powerupType);
          this.game.particles.spawnExplosion(item.x + 10, item.y + 10, '#a855f7', 10);
        }
        else if (item.type === 'portal') {
          // Verify key requirement
          if (this.game.levelKey) {
            // Portal trigger victory
            player.active = false;
            this.game.completeLevel();
          } else {
            // Toast warning: Key needed
            this.game.ui.triggerToast("Collect the Realm Key first!");
          }
        }
      }
    }

    // Checkpoints overlap
    for (let cp of this.checkpoints) {
      const cpBox = { x: cp.x, y: cp.y - 32, width: 32, height: 64 };
      if (Physics.checkAABB(player, cpBox) && !cp.active) {
        cp.active = true;
        this.latestCheckpoint = { x: cp.x, y: cp.y - 12 };
        this.game.audio.playSFX('victory_relic');
        this.game.particles.spawnSparkles(cp.x + 16, cp.y, '#10b981', 8);
      }
    }

    // Check collision with platform attachments
    for (let plat of this.movingPlatforms) {
      const platTop = { x: plat.x, y: plat.y - 4, width: plat.width, height: 6 };
      if (Physics.checkAABB(player, platTop) && player.vy >= 0 && player.y + player.height <= plat.y + 2) {
        player.y = plat.y - player.height;
        player.vy = 0;
        player.onGround = true;
        // attach X delta
        if (plat.startX !== plat.endX) {
          player.x += plat.speed * plat.dir;
        }
      }
    }

    // Check collision with hazards (spikes, lava, ceiling falls)
    const currentCollisions = Physics.getTileCollisions(player, this);
    for (let tile of currentCollisions) {
      const tileObj = this.getTile(tile.col, tile.row);
      if (tileObj && tileObj.type === 2) { // Spike
        this.respawnPlayerAtCheckpoint();
        return;
      }
      if (tileObj && tileObj.type === 3 && player.vy > 0) { // Bounce Flower
        player.vy = -this.game.player.jumpHeight * 1.35;
        this.game.audio.playSFX('bounce');
        this.game.particles.spawnDust(player.x + player.width/2, player.y + player.height, 12);
      }
    }

    // Lava heights check
    if (this.lavaLevel !== null && player.y + player.height > this.lavaLevel) {
      this.respawnPlayerAtCheckpoint();
    }
  }

  respawnPlayerAtCheckpoint() {
    this.game.hurtPlayer(1);
    this.game.particles.spawnExplosion(this.game.player.x, this.game.player.y, '#ef4444', 15);
    
    if (this.game.player.health > 0) {
      this.game.player.x = this.latestCheckpoint.x;
      this.game.player.y = this.latestCheckpoint.y;
      this.game.player.vx = 0;
      this.game.player.vy = 0;
    }
  }

  // --- RENDERING PARALLAX BACKGROUND ---
  drawBackground(ctx, camera) {
    const w = this.game.width;
    const h = this.game.height;

    ctx.save();

    // 1. Base Gradient sky
    let grad = ctx.createLinearGradient(0, 0, 0, h);
    switch (this.worldIndex) {
      case 1: // Meadows
        grad.addColorStop(0, '#0ea5e9'); // sky blue
        grad.addColorStop(0.7, '#bae6fd');
        grad.addColorStop(1, '#bae6fd');
        break;
      case 2: // Caverns
        grad.addColorStop(0, '#020108'); // deep purple cavern glow
        grad.addColorStop(0.6, '#0f0524');
        grad.addColorStop(1, '#1d0e40');
        break;
      case 3: // Peaks
        grad.addColorStop(0, '#090b15'); // sky storm
        grad.addColorStop(0.8, '#1e293b');
        grad.addColorStop(1, '#334155');
        break;
      case 4: // Depths
        grad.addColorStop(0, '#090503'); // sulfur char
        grad.addColorStop(0.8, '#311005');
        grad.addColorStop(1, '#5c1903');
        break;
      case 5: // Expanse
        grad.addColorStop(0, '#021e2b'); // dark navy winter
        grad.addColorStop(0.8, '#0d4a66');
        grad.addColorStop(1, '#1e688a');
        break;
      case 6: // Shadows
        grad.addColorStop(0, '#020205'); // void abyss
        grad.addColorStop(0.7, '#0b001a');
        grad.addColorStop(1, '#1f0033');
        break;
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Twinkling Starfield
    ctx.fillStyle = '#ffffff';
    for (let star of this.stars) {
      ctx.save();
      const alpha = 0.2 + Math.sin(this.game.levelTime * 0.0025 + star.phase) * 0.5;
      ctx.globalAlpha = Math.max(0.15, alpha);
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Glowing Nebula meshes (Except World 1)
    if (this.worldIndex > 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const drawNebula = (cx, cy, r, color) => {
        const rad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        rad.addColorStop(0, color);
        rad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      };
      
      if (this.worldIndex === 2) {
        drawNebula(w / 3, h / 2, 200, 'rgba(168, 85, 247, 0.15)'); // Violet
        drawNebula((w / 3) * 2, h / 3, 240, 'rgba(6, 182, 212, 0.15)'); // Cyan
      } else if (this.worldIndex === 4) {
        drawNebula(w / 2, h / 2, 280, 'rgba(239, 68, 68, 0.22)'); // Red lava glow
        drawNebula(w / 4, h / 3, 180, 'rgba(249, 115, 22, 0.15)'); // Orange
      } else if (this.worldIndex === 6) {
        drawNebula(w / 2, h / 2, 320, 'rgba(217, 70, 239, 0.2)'); // Pink void
      }
      ctx.restore();
    }

    // 2. BACKGROUND WINDMILL DECORATIONS (World 1 specific)
    if (this.worldIndex === 1) {
      ctx.fillStyle = 'rgba(4, 120, 87, 0.08)';
      const drawWindmill = (x, y, scale) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        // Tower
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-2, -26);
        ctx.lineTo(2, -26);
        ctx.lineTo(5, 0);
        ctx.closePath();
        ctx.fill();
        // Sails/Blades
        ctx.translate(0, -26);
        ctx.rotate(this.game.levelTime * 0.0006);
        ctx.strokeStyle = 'rgba(4, 120, 87, 0.08)';
        ctx.lineWidth = 1.8;
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -18);
          ctx.stroke();
        }
        ctx.restore();
      };
      const scrollX = -(camera.x * 0.08) % w;
      drawWindmill(scrollX + 160, h - 120, 1.3);
      drawWindmill(scrollX + w/2 + 240, h - 120, 0.9);
      drawWindmill(scrollX + w - 180, h - 120, 1.1);
    }

    // 3. Storm lightning flashes (World 3 Peaks)
    if (this.worldIndex === 3) {
      if (Math.random() < 0.0035 && (!this.lightningFlash || this.lightningFlash <= 0)) {
        this.lightningFlash = 120; // 120ms flash duration
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash -= 16.66; // approx dt
        ctx.fillStyle = `rgba(224, 242, 254, ${Math.max(0, this.lightningFlash / 120) * 0.65})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // 4. Far Parallax layers (clouds/stalactites/mountains)
    const drawFarLayer = (offsetFactor, color) => {
      ctx.fillStyle = color;
      const scrollX = -(camera.x * offsetFactor) % w;
      
      // Draw wavy silhouettes
      ctx.beginPath();
      ctx.moveTo(scrollX, h);
      for (let x = 0; x <= w + 40; x += 40) {
        let waveY;
        if (this.worldIndex === 2) {
          // Cave stalactites (hang from ceiling)
          waveY = 80 + Math.sin((x - scrollX) * 0.005) * 40;
          ctx.lineTo(scrollX + x, waveY);
        } else {
          // Mountains / Hills (on floor)
          waveY = h - 120 + Math.sin((x - scrollX) * 0.008) * 30;
          ctx.lineTo(scrollX + x, waveY);
        }
      }
      if (this.worldIndex === 2) {
        ctx.lineTo(scrollX + w + 40, 0);
        ctx.lineTo(scrollX, 0);
      } else {
        ctx.lineTo(scrollX + w + 40, h);
        ctx.lineTo(scrollX, h);
      }
      ctx.closePath();
      ctx.fill();

      // Repeat buffer to prevent empty spaces on scroll wrap
      ctx.beginPath();
      ctx.moveTo(scrollX + w, h);
      for (let x = 0; x <= w + 40; x += 40) {
        let waveY;
        if (this.worldIndex === 2) {
          waveY = 80 + Math.sin((x - scrollX) * 0.005) * 40;
          ctx.lineTo(scrollX + w + x, waveY);
        } else {
          waveY = h - 120 + Math.sin((x - scrollX) * 0.008) * 30;
          ctx.lineTo(scrollX + w + x, waveY);
        }
      }
      if (this.worldIndex === 2) {
        ctx.lineTo(scrollX + w * 2 + 40, 0);
        ctx.lineTo(scrollX + w, 0);
      } else {
        ctx.lineTo(scrollX + w * 2 + 40, h);
        ctx.lineTo(scrollX + w, h);
      }
      ctx.closePath();
      ctx.fill();
    };

    if (this.worldIndex === 1) {
      drawFarLayer(0.1, 'rgba(16, 185, 129, 0.1)'); // Green far hills
      drawFarLayer(0.22, 'rgba(4, 120, 87, 0.16)'); // Mid hills
    } 
    else if (this.worldIndex === 2) {
      drawFarLayer(0.12, 'rgba(139, 92, 246, 0.08)'); // violet cavern shapes
      drawFarLayer(0.24, 'rgba(76, 29, 149, 0.15)');
    }
    else if (this.worldIndex === 3) {
      drawFarLayer(0.15, 'rgba(255, 255, 255, 0.05)'); // white far clouds
      drawFarLayer(0.3, 'rgba(255, 255, 255, 0.1)');
    }
    else if (this.worldIndex === 4) {
      drawFarLayer(0.15, 'rgba(249, 115, 22, 0.06)'); // orange lava clouds
      drawFarLayer(0.3, 'rgba(239, 68, 68, 0.12)');
    }
    else if (this.worldIndex === 5) {
      drawFarLayer(0.15, 'rgba(186, 230, 253, 0.12)'); // white ice hills
      drawFarLayer(0.28, 'rgba(14, 165, 233, 0.2)');
    }
    else if (this.worldIndex === 6) {
      drawFarLayer(0.2, 'rgba(168, 85, 247, 0.06)'); // void shapes
      drawFarLayer(0.35, 'rgba(147, 51, 234, 0.12)');
    }

    ctx.restore();
  }

  // --- DRAWING TILE MAP ---
  drawTiles(ctx) {
    const startCol = Math.floor(this.game.camera.x / this.tileSize);
    const endCol = Math.ceil((this.game.camera.x + this.game.width) / this.tileSize);

    // Pick tileset palette colors
    const colors = [
      "",
      ["#047857", "#065f46"], // W1 Meadows: Emerald Green
      ["#6d28d9", "#4c1d95"], // W2 Caverns: Indigo Purple
      ["#0369a1", "#075985"], // W3 Peaks: Sky Blue
      ["#c2410c", "#9a3412"], // W4 Depths: Lava Red
      ["#0891b2", "#155e75"], // W5 Expanse: Frost Cyan
      ["#581c87", "#3b0764"]  // W6 Shadows: Void Dark Purple
    ];
    const themeColors = colors[this.worldIndex] || ["#52525b", "#3f3f46"];

    for (let r = 0; r < this.rows; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const tile = this.getTile(c, r);
        if (!tile) continue;

        const tx = c * this.tileSize;
        const ty = r * this.tileSize;

        ctx.save();

        if (tile.type === 1) {
          // 1. Solid Ground blocks
          ctx.fillStyle = themeColors[0];
          ctx.fillRect(tx, ty, this.tileSize, this.tileSize);
          
          // Draw border/bevel outline
          ctx.strokeStyle = themeColors[1];
          ctx.lineWidth = 1;
          ctx.strokeRect(tx, ty, this.tileSize, this.tileSize);

          // DRAW GRASS TUFTS (World 1 specific)
          if (this.worldIndex === 1) {
            const above = this.getTile(c, r - 1);
            if (!above) {
              ctx.fillStyle = '#34d399'; // Swaying grass blades
              const wind = Math.sin(this.game.levelTime * 0.003 + c) * 3;
              ctx.beginPath();
              // blade 1
              ctx.moveTo(tx + 4, ty);
              ctx.quadraticCurveTo(tx + 2 + wind, ty - 6, tx + wind, ty - 8);
              ctx.lineTo(tx + 7, ty);
              // blade 2
              ctx.moveTo(tx + 14, ty);
              ctx.quadraticCurveTo(tx + 14 + wind, ty - 9, tx + 11 + wind, ty - 11);
              ctx.lineTo(tx + 17, ty);
              // blade 3
              ctx.moveTo(tx + 22, ty);
              ctx.quadraticCurveTo(tx + 24 + wind, ty - 5, tx + 25 + wind, ty - 7);
              ctx.lineTo(tx + 25, ty);
              ctx.closePath();
              ctx.fill();
            }
          }

          // DRAW GLOWING CRYSTAL SPURS (World 2 Caverns)
          if (this.worldIndex === 2 && c % 3 === 0) {
            const above = this.getTile(c, r - 1);
            if (!above) {
              ctx.fillStyle = '#c084fc';
              ctx.shadowColor = '#c084fc';
              ctx.shadowBlur = 6;
              ctx.beginPath();
              ctx.moveTo(tx + 10, ty);
              ctx.lineTo(tx + 6, ty - 10);
              ctx.lineTo(tx + 14, ty);
              ctx.moveTo(tx + 15, ty);
              ctx.lineTo(tx + 20, ty - 8);
              ctx.lineTo(tx + 22, ty);
              ctx.moveTo(tx + 16, ty);
              ctx.lineTo(tx + 22, ty - 9);
              ctx.lineTo(tx + 24, ty);
              ctx.closePath();
              ctx.fill();
              ctx.shadowBlur = 0; // reset
            }
          } else if (this.worldIndex === 4 && c % 3 === 0) {
            // Magma veins
            ctx.fillStyle = '#ef4444';
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 4;
            ctx.fillRect(tx + 6, ty + 8, 2, 16);
            ctx.fillRect(tx + 22, ty + 4, 3, 20);
            ctx.shadowBlur = 0;
          }
        } 
        else if (tile.type === 11) {
          // --- SLIPPERY ICE BLOCKS (Frosted Glass glow) ---
          let iceGrad = ctx.createLinearGradient(tx, ty, tx, ty + this.tileSize);
          iceGrad.addColorStop(0, '#e0f2fe');
          iceGrad.addColorStop(0.3, '#38bdf8');
          iceGrad.addColorStop(1, '#0369a1');

          ctx.fillStyle = iceGrad;
          ctx.fillRect(tx + 1, ty + 1, this.tileSize - 2, this.tileSize - 2);

          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(tx, ty, this.tileSize, this.tileSize);

          // Specular ice sheens (slanted reflection bands)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.beginPath();
          ctx.moveTo(tx + 4, ty + 4);
          ctx.lineTo(tx + 22, ty + 22);
          ctx.lineTo(tx + 18, ty + 22);
          ctx.lineTo(tx + 4, ty + 8);
          ctx.closePath();
          ctx.fill();
        }
        else if (tile.type === 2) {
          // --- OVERHAULED CRYSTAL SPIKES (Out-worldly thorn shards) ---
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 6;
          
          let spikeGrad = ctx.createLinearGradient(tx, ty + this.tileSize, tx, ty);
          spikeGrad.addColorStop(0, '#7f1d1d');
          spikeGrad.addColorStop(0.5, '#ef4444');
          spikeGrad.addColorStop(1, '#fca5a5');

          ctx.fillStyle = spikeGrad;

          ctx.beginPath();
          // Draw three overlapping crystalline shards
          // Shard A
          ctx.moveTo(tx + 2, ty + this.tileSize);
          ctx.lineTo(tx + this.tileSize / 2, ty + 2);
          ctx.lineTo(tx + this.tileSize - 2, ty + this.tileSize);
          // Shard B (lean left)
          ctx.moveTo(tx, ty + this.tileSize);
          ctx.lineTo(tx + 8, ty + 12);
          ctx.lineTo(tx + 18, ty + this.tileSize);
          // Shard C (lean right)
          ctx.moveTo(tx + 14, ty + this.tileSize);
          ctx.lineTo(tx + this.tileSize - 4, ty + 10);
          ctx.lineTo(tx + this.tileSize, ty + this.tileSize);

          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        else if (tile.type === 3) {
          // --- MYSTICAL BOUNCE FLOWER (Glowing Lotus) ---
          ctx.shadowColor = '#ec4899';
          ctx.shadowBlur = 8;

          ctx.fillStyle = '#f472b6';
          // Draw Outer Petals
          ctx.beginPath();
          ctx.arc(tx + this.tileSize/2 - 8, ty + this.tileSize, 12, Math.PI, 0);
          ctx.arc(tx + this.tileSize/2 + 8, ty + this.tileSize, 12, Math.PI, 0);
          ctx.fill();

          // Draw Inner Petals
          ctx.fillStyle = '#ec4899';
          ctx.beginPath();
          ctx.arc(tx + this.tileSize/2, ty + this.tileSize, 10, Math.PI, 0);
          ctx.fill();

          // Core seed center
          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.arc(tx + this.tileSize/2, ty + this.tileSize, 5, Math.PI, 0);
          ctx.fill();

          ctx.shadowBlur = 0;
        }
        else if (tile.type === 10) {
          // --- GLOWING MAGMA RIVER (World 4) ---
          let magmaGrad = ctx.createLinearGradient(tx, ty, tx, ty + this.tileSize);
          magmaGrad.addColorStop(0, '#f97316');
          magmaGrad.addColorStop(0.5, '#ea580c');
          magmaGrad.addColorStop(1, '#9a3412');

          ctx.fillStyle = magmaGrad;
          ctx.fillRect(tx, ty + 2, this.tileSize, this.tileSize - 2);

          // Lava top crust wave
          ctx.fillStyle = '#ef4444';
          const waveHeight = 3 + Math.sin(this.game.levelTime * 0.004 + c) * 1.5;
          ctx.beginPath();
          ctx.ellipse(tx + this.tileSize/2, ty + 2, this.tileSize/2, waveHeight, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // --- SNOW AND ICICLES DECORATIONS (World 5 specific) ---
        if (this.worldIndex === 5 && (tile.type === 1 || tile.type === 11)) {
          const above = this.getTile(c, r - 1);
          if (!above) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(tx, ty - 2.5, this.tileSize, 5, 2.5);
            ctx.fill();
          }
          
          const below = this.getTile(c, r + 1);
          if (!below && c % 2 === 0) {
            ctx.fillStyle = 'rgba(224, 242, 254, 0.95)';
            ctx.shadowColor = '#e0f2fe';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(tx + 6, ty + this.tileSize);
            ctx.lineTo(tx + 18, ty + this.tileSize);
            ctx.lineTo(tx + 12, ty + this.tileSize + 16);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }

        ctx.restore();
      }
    }
  }

  // --- DRAWING ITEMS & OBSTACLES ---
  drawEntities(ctx) {
    for (let item of this.items) {
      if (item.collected) continue;

      ctx.save();

      if (item.type === 'crystal') {
        // Spinning shard (gold diamond)
        ctx.fillStyle = '#eab308';
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 4;
        
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
        // Spin angle based on time
        ctx.rotate(this.game.levelTime * 0.0035);
        ctx.beginPath();
        ctx.moveTo(0, -item.height / 2);
        ctx.lineTo(item.width / 2, 0);
        ctx.lineTo(0, item.height / 2);
        ctx.lineTo(-item.width / 2, 0);
        ctx.closePath();
        ctx.fill();
      } 
      else if (item.type === 'relic') {
        // Floating cyan crystal
        ctx.fillStyle = '#22d3ee';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 8;
        
        const float = Math.sin(this.game.levelTime * 0.004) * 4;
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2 + float);
        ctx.rotate(this.game.levelTime * 0.002);
        ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
      }
      else if (item.type === 'key') {
        // Glowing key shape
        ctx.fillStyle = '#a855f7';
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 6;
        
        const float = Math.sin(this.game.levelTime * 0.005) * 3;
        ctx.translate(item.x + 8, item.y + 12 + float);
        ctx.beginPath();
        ctx.arc(0, -6, 6, 0, Math.PI * 2); // Ring
        ctx.fill();
        ctx.fillRect(-1.5, 0, 3, 10); // Shaft
        ctx.fillRect(-1.5, 6, 6, 3);  // Teeth
        ctx.fillRect(-1.5, 2, 4, 3);
      }
      else if (item.type === 'seed') {
        // Red heart fruit
        ctx.fillStyle = '#10b981';
        const float = Math.sin(this.game.levelTime * 0.003) * 2;
        ctx.translate(item.x + 8, item.y + 8 + float);
        ctx.beginPath();
        ctx.arc(-4, -2, 4, 0, Math.PI * 2);
        ctx.arc(4, -2, 4, 0, Math.PI * 2);
        ctx.moveTo(-8, -2);
        ctx.lineTo(0, 8);
        ctx.lineTo(8, -2);
        ctx.closePath();
        ctx.fill();
      }
      else if (item.type === 'powerup') {
        // Floating bubbles wrapping powerup letters
        ctx.strokeStyle = '#d946ef';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = 8;
        
        const float = Math.sin(this.game.levelTime * 0.004) * 5;
        ctx.translate(item.x + 10, item.y + 10 + float);
        
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
        
        // Render small initial inside
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.powerupType.substring(0, 2).toUpperCase(), 0, 0);
      }
      else if (item.type === 'portal') {
        // Swirling void gate
        ctx.strokeStyle = this.game.levelKey ? '#10b981' : '#475569';
        ctx.lineWidth = 3;
        ctx.shadowColor = this.game.levelKey ? '#10b981' : '#475569';
        ctx.shadowBlur = 12;
        
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
        ctx.rotate(-this.game.levelTime * 0.002);
        
        // Draw spiral portal wings
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, item.width / 2, item.height / 2, 0.4, 0, Math.PI);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // Draw active checkpoints
    for (let cp of this.checkpoints) {
      ctx.save();
      ctx.fillStyle = cp.active ? '#10b981' : '#475569'; // Green if active, grey if idle
      ctx.shadowColor = cp.active ? '#10b981' : '#000';
      ctx.shadowBlur = cp.active ? 8 : 0;
      
      // Draw stone pillar flag
      ctx.fillRect(cp.x + 12, cp.y - 32, 8, 32);
      ctx.beginPath();
      ctx.moveTo(cp.x + 20, cp.y - 32);
      ctx.lineTo(cp.x + 38, cp.y - 24);
      ctx.lineTo(cp.x + 20, cp.y - 16);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Draw moving platforms
    for (let plat of this.movingPlatforms) {
      ctx.save();
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      
      // rounded block
      ctx.beginPath();
      ctx.roundRect(plat.x, plat.y, plat.width, plat.height, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw active world projectles (seeds / lava spheres)
    for (let p of this.projectiles) {
      p.draw(ctx);
    }

    // Draw dynamic lava level rise
    if (this.lavaLevel !== null) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.fillRect(this.game.camera.x, this.lavaLevel, this.game.width, 1000);
      
      // Bubbling lava surface
      ctx.fillStyle = '#f97316';
      ctx.fillRect(this.game.camera.x, this.lavaLevel, this.game.width, 6);
      if (Math.random() < 0.15) {
        this.game.particles.spawnFlame(this.game.camera.x + Math.random()*this.game.width, this.lavaLevel, 2);
      }
    }

    // Vignette / Cavern Darkness light mask (World 2 & 6)
    if ((this.worldIndex === 2 || this.worldIndex === 6) && this.game.player) {
      ctx.save();
      // Reset translation to draw screen-space vignette overlay
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      
      // Calculate player screenspace pos
      const px = this.game.camera.toScreenX(this.game.player.x + this.game.player.width/2);
      const py = this.game.camera.toScreenY(this.game.player.y + this.game.player.height/2);
      
      const grad = ctx.createRadialGradient(px, py, 60, px, py, 260);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); // full light
      grad.addColorStop(0.5, 'rgba(0,0,0,0.5)'); // semi light
      grad.addColorStop(1, 'rgba(0,0,0,0.92)'); // dark vignette
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.game.width, this.game.height);
      ctx.restore();
    }
  }
}
