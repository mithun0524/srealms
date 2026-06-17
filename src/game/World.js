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

    // Generate stars for celestial backgrounds across the whole world scroll width
    this.stars = [];
    const worldWidth = this.cols * this.tileSize;
    for (let i = 0; i < 120; i++) {
      this.stars.push({
        x: Math.random() * worldWidth,
        y: Math.random() * 450,
        size: Math.random() * 1.5 + 0.8,
        phase: Math.random() * Math.PI
      });
    }

    // Generate floating background islands for sky worlds
    this.bgIslands = [];
    if (this.worldIndex === 1 || this.worldIndex === 3 || this.worldIndex === 5 || this.worldIndex === 6) {
      for (let i = 0; i < 15; i++) {
        this.bgIslands.push({
          x: Math.random() * worldWidth,
          y: 50 + Math.random() * 220,
          width: 50 + Math.random() * 100,
          height: 25 + Math.random() * 30,
          speed: 0.08 + Math.random() * 0.12,
          seed: Math.random()
        });
      }
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

    // Out of bounds check (falling off floating islands into space)
    if (player.y > this.rows * this.tileSize + 64) {
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
  drawFloatingIsland(ctx, x, y, width, height, seed) {
    ctx.save();
    
    // Choose island theme colors
    let rockColor = 'rgba(30, 41, 59, 0.22)';
    let grassColor = 'rgba(16, 185, 129, 0.22)';
    let vineColor = 'rgba(4, 120, 87, 0.12)';
    let strokeColor = 'rgba(255, 255, 255, 0.06)';

    if (this.worldIndex === 3) {
      rockColor = 'rgba(15, 23, 42, 0.25)';
      grassColor = 'rgba(234, 179, 8, 0.2)'; // Gold ruins
      strokeColor = 'rgba(251, 191, 36, 0.15)';
    } else if (this.worldIndex === 5) {
      rockColor = 'rgba(15, 23, 42, 0.2)';
      grassColor = 'rgba(255, 255, 255, 0.35)'; // Snow cap
      vineColor = 'rgba(224, 242, 254, 0.1)';
      strokeColor = 'rgba(14, 165, 233, 0.2)';
    } else if (this.worldIndex === 6) {
      rockColor = 'rgba(15, 23, 42, 0.3)';
      grassColor = 'rgba(147, 51, 234, 0.2)'; // Shadow rift grass
      strokeColor = 'rgba(217, 70, 239, 0.15)';
    }

    ctx.fillStyle = rockColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;

    // Draw jagged floating island shape
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.quadraticCurveTo(x + width * 0.8, y + height * 0.5, x + width * 0.5, y + height);
    ctx.quadraticCurveTo(x + width * 0.2, y + height * 0.4, x, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Grass/snow/gold cap on top
    ctx.fillStyle = grassColor;
    ctx.fillRect(x, y - 2, width, 4);

    // Dynamic hanging vines
    ctx.strokeStyle = vineColor;
    ctx.lineWidth = 0.8;
    for (let i = 6; i < width - 6; i += 14) {
      const vineLen = 12 + Math.floor((seed * 73 + i) % 18);
      ctx.beginPath();
      ctx.moveTo(x + i, y + height * 0.2);
      ctx.quadraticCurveTo(
        x + i - 2, 
        y + height * 0.2 + vineLen * 0.5, 
        x + i + Math.sin(this.game.levelTime * 0.0012 + i) * 3, 
        y + height * 0.2 + vineLen
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  drawBackground(ctx, camera) {
    const w = this.game.width;
    const h = this.game.height;

    ctx.save();

    // 1. Base Gradient sky
    let grad = ctx.createLinearGradient(0, 0, 0, h);
    switch (this.worldIndex) {
      case 1: // Meadows
        grad.addColorStop(0, '#020617'); // Darker top sky for planets
        grad.addColorStop(0.5, '#0369a1');
        grad.addColorStop(1, '#bae6fd');
        break;
      case 2: // Caverns
        grad.addColorStop(0, '#020108'); // deep purple cavern glow
        grad.addColorStop(0.6, '#0d0420');
        grad.addColorStop(1, '#1e0c3a');
        break;
      case 3: // Peaks
        grad.addColorStop(0, '#090b15'); // sky storm
        grad.addColorStop(0.8, '#181d2a');
        grad.addColorStop(1, '#2c3e50');
        break;
      case 4: // Depths
        grad.addColorStop(0, '#090503'); // sulfur char
        grad.addColorStop(0.8, '#270c03');
        grad.addColorStop(1, '#4e1202');
        break;
      case 5: // Expanse
        grad.addColorStop(0, '#020e17'); // dark navy winter
        grad.addColorStop(0.7, '#073247');
        grad.addColorStop(1, '#134e6b');
        break;
      case 6: // Shadows
        grad.addColorStop(0, '#020205'); // void abyss
        grad.addColorStop(0.6, '#060010');
        grad.addColorStop(1, '#140024');
        break;
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Twinkling Starfield with scroll offset
    ctx.fillStyle = '#ffffff';
    for (let star of this.stars) {
      ctx.save();
      const alpha = 0.2 + Math.sin(this.game.levelTime * 0.002 + star.phase) * 0.45;
      ctx.globalAlpha = Math.max(0.12, alpha);
      ctx.beginPath();
      // Parallax scroll wrapper for stars
      let sx = (star.x - camera.x * 0.04) % w;
      if (sx < 0) sx += w;
      ctx.arc(sx, star.y, star.size, 0, Math.PI * 2);
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
        drawNebula(w / 3, h / 2, 220, 'rgba(168, 85, 247, 0.18)'); // Violet
        drawNebula((w / 3) * 2, h / 3, 260, 'rgba(6, 182, 212, 0.18)'); // Cyan
      } else if (this.worldIndex === 4) {
        drawNebula(w / 2, h / 2, 300, 'rgba(239, 68, 68, 0.24)'); // Red lava glow
        drawNebula(w / 4, h / 3, 200, 'rgba(249, 115, 22, 0.18)'); // Orange
      } else if (this.worldIndex === 6) {
        drawNebula(w / 2, h / 2, 350, 'rgba(217, 70, 239, 0.22)'); // Pink void
      }
      ctx.restore();
    }

    // 2. GIANT CELESTIAL BACKGROUND BODIES (Out-worldly view)
    ctx.save();
    if (this.worldIndex === 1) {
      // Emerald Gas Giant planet with glowing rings
      const px = w - 160;
      const py = 110;
      // Shadow glow
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 30;
      // Body gradient
      let planetGrad = ctx.createRadialGradient(px - 15, py - 15, 5, px, py, 45);
      planetGrad.addColorStop(0, '#a7f3d0');
      planetGrad.addColorStop(0.5, '#10b981');
      planetGrad.addColorStop(1, '#064e3b');
      ctx.fillStyle = planetGrad;
      ctx.beginPath();
      ctx.arc(px, py, 45, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // reset
      
      // Ring
      ctx.strokeStyle = 'rgba(167, 243, 218, 0.45)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(px, py, 75, 10, -0.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    else if (this.worldIndex === 3) {
      // Storm planet with thunder sparks
      const px = w - 240;
      const py = 120;
      let planetGrad = ctx.createRadialGradient(px - 10, py - 10, 0, px, py, 38);
      planetGrad.addColorStop(0, '#7dd3fc');
      planetGrad.addColorStop(0.6, '#0284c7');
      planetGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = planetGrad;
      ctx.beginPath();
      ctx.arc(px, py, 38, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (this.worldIndex === 4) {
      // Molten Solar Eclipse
      const px = w / 2;
      const py = 110;
      // Sun corona glow
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 40;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(px, py, 64, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Dark Eclipsing Moon
      ctx.fillStyle = '#090503';
      ctx.beginPath();
      ctx.arc(px - 3, py - 1, 62, 0, Math.PI * 2);
      ctx.fill();
    }
    else if (this.worldIndex === 5) {
      // Shimmering Ringed Ice planet
      const px = w - 180;
      const py = 100;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 20;
      let iceGrad = ctx.createRadialGradient(px - 12, py - 12, 0, px, py, 40);
      iceGrad.addColorStop(0, '#e0f2fe');
      iceGrad.addColorStop(0.7, '#0ea5e9');
      iceGrad.addColorStop(1, '#0c4a6e');
      ctx.fillStyle = iceGrad;
      ctx.beginPath();
      ctx.arc(px, py, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Ring
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(px, py, 68, 6, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    else if (this.worldIndex === 6) {
      // Cosmic Black Hole with accretion disk
      const px = w / 2;
      const py = 120;
      // Accretion disk
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#d946ef';
      ctx.lineWidth = 14;
      ctx.shadowColor = '#d946ef';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.ellipse(px, py, 75, 12, 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Black Hole core
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(px, py, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 3. FLOATING PARALLAX ISLANDS (W1, W3, W5, W6)
    if (this.worldIndex === 1 || this.worldIndex === 3 || this.worldIndex === 5 || this.worldIndex === 6) {
      for (let island of this.bgIslands) {
        // Calculate wrapped screen X pos
        let sx = (island.x - camera.x * island.speed) % (w + island.width * 2) - island.width;
        if (sx < -island.width) sx += (w + island.width * 2);
        
        this.drawFloatingIsland(ctx, sx, island.y, island.width, island.height, island.seed);
      }
    }

    // 4. BACKGROUND WINDMILLS (Meadows only, for depth)
    if (this.worldIndex === 1) {
      ctx.fillStyle = 'rgba(4, 120, 87, 0.07)';
      const drawWindmill = (x, y, scale) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-1.5, -20);
        ctx.lineTo(1.5, -20);
        ctx.lineTo(4, 0);
        ctx.closePath();
        ctx.fill();
        
        ctx.translate(0, -20);
        ctx.rotate(this.game.levelTime * 0.0005);
        ctx.strokeStyle = 'rgba(4, 120, 87, 0.07)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -14);
          ctx.stroke();
        }
        ctx.restore();
      };
      const scrollX = -(camera.x * 0.06) % w;
      drawWindmill(scrollX + 160, h - 110, 1.2);
      drawWindmill(scrollX + w/2 + 240, h - 110, 0.85);
      drawWindmill(scrollX + w - 180, h - 110, 1.05);
    }

    // 5. AURORA BOREALIS EFFECT (Frosted Expanse specific)
    if (this.worldIndex === 5) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 18;
      
      let auroraGrad = ctx.createLinearGradient(0, 0, 0, h);
      auroraGrad.addColorStop(0, '#10b981'); // emerald glow
      auroraGrad.addColorStop(0.5, '#06b6d4'); // cyan glow
      auroraGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = auroraGrad;
      
      ctx.beginPath();
      for (let x = 0; x <= w; x += 30) {
        const wave = Math.sin(this.game.levelTime * 0.0006 + x * 0.003) * 30;
        const y = 90 + Math.cos(this.game.levelTime * 0.0003 + x * 0.0015) * 12 + wave;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 6. Storm lightning flashes (Peaks)
    if (this.worldIndex === 3) {
      if (Math.random() < 0.0035 && (!this.lightningFlash || this.lightningFlash <= 0)) {
        this.lightningFlash = 120;
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash -= 16.66;
        ctx.fillStyle = `rgba(224, 242, 254, ${Math.max(0, this.lightningFlash / 120) * 0.5})`;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // 7. Far Parallax cloud silhouettes
    const drawFarLayer = (offsetFactor, color) => {
      ctx.fillStyle = color;
      const scrollX = -(camera.x * offsetFactor) % w;
      
      ctx.beginPath();
      ctx.moveTo(scrollX, h);
      for (let x = 0; x <= w + 40; x += 40) {
        let waveY;
        if (this.worldIndex === 2) {
          waveY = 70 + Math.sin((x - scrollX) * 0.004) * 30;
          ctx.lineTo(scrollX + x, waveY);
        } else {
          waveY = h - 110 + Math.sin((x - scrollX) * 0.007) * 25;
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

      // Repeat buffer
      ctx.beginPath();
      ctx.moveTo(scrollX + w, h);
      for (let x = 0; x <= w + 40; x += 40) {
        let waveY;
        if (this.worldIndex === 2) {
          waveY = 70 + Math.sin((x - scrollX) * 0.004) * 30;
          ctx.lineTo(scrollX + w + x, waveY);
        } else {
          waveY = h - 110 + Math.sin((x - scrollX) * 0.007) * 25;
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
      drawFarLayer(0.1, 'rgba(16, 185, 129, 0.07)'); // Meadow far hills
      drawFarLayer(0.22, 'rgba(4, 120, 87, 0.12)'); 
    } 
    else if (this.worldIndex === 2) {
      drawFarLayer(0.12, 'rgba(139, 92, 246, 0.07)'); // Cavern violet rock
      drawFarLayer(0.24, 'rgba(76, 29, 149, 0.13)');
    }
    else if (this.worldIndex === 3) {
      drawFarLayer(0.15, 'rgba(255, 255, 255, 0.04)'); // Clouds
      drawFarLayer(0.3, 'rgba(255, 255, 255, 0.08)');
    }
    else if (this.worldIndex === 4) {
      drawFarLayer(0.15, 'rgba(249, 115, 22, 0.04)'); // Lava smoke
      drawFarLayer(0.3, 'rgba(239, 68, 68, 0.09)');
    }
    else if (this.worldIndex === 5) {
      drawFarLayer(0.15, 'rgba(186, 230, 253, 0.09)'); // Snowy ranges
      drawFarLayer(0.28, 'rgba(14, 165, 233, 0.14)');
    }
    else if (this.worldIndex === 6) {
      drawFarLayer(0.2, 'rgba(168, 85, 247, 0.05)'); // Void shadows
      drawFarLayer(0.35, 'rgba(147, 51, 234, 0.09)');
    }

    ctx.restore();
  }

  // --- DRAWING TILE MAP ---
  drawTiles(ctx) {
    const startCol = Math.floor(this.game.camera.x / this.tileSize);
    const endCol = Math.ceil((this.game.camera.x + this.game.width) / this.tileSize);

    // Pick base tile colors
    const colors = [
      "",
      ["#059669", "#047857", "#34d399", "#064e3b"], // W1 Meadows: Emerald Green (Base, Dark, Light, Shadow)
      ["#3b0764", "#581c87", "#c084fc", "#120024"], // W2 Caverns: Indigo Purple
      ["#f1f5f9", "#cbd5e1", "#e2e8f0", "#94a3b8"], // W3 Peaks: Sky Ivory Marble
      ["#09090b", "#18181b", "#ea580c", "#fef08a"], // W4 Depths: Basalt/Magma
      ["#38bdf8", "#0284c7", "#e0f2fe", "#075985"], // W5 Expanse: Ice Blue
      ["#090514", "#020108", "#d946ef", "#4a044e"]  // W6 Shadows: Void Dark
    ];
    const theme = colors[this.worldIndex] || ["#52525b", "#3f3f46", "#71717a", "#27272a"];

    for (let r = 0; r < this.rows; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const tile = this.getTile(c, r);
        if (!tile) continue;

        const tx = c * this.tileSize;
        const ty = r * this.tileSize;

        ctx.save();

        // --- TILE TYPE 1: SOLID GROUND ---
        if (tile.type === 1 || tile.type === 11) {
          if (this.worldIndex === 1) {
            // MEADOWS: Emerald Stone Bricks
            ctx.fillStyle = theme[0];
            ctx.fillRect(tx, ty, this.tileSize, this.tileSize);
            
            // Draw 4 sub-brick divisions
            ctx.strokeStyle = theme[1];
            ctx.lineWidth = 1;
            ctx.strokeRect(tx, ty, this.tileSize, this.tileSize);
            ctx.beginPath();
            ctx.moveTo(tx + this.tileSize / 2, ty);
            ctx.lineTo(tx + this.tileSize / 2, ty + this.tileSize);
            ctx.moveTo(tx, ty + this.tileSize / 2);
            ctx.lineTo(tx + this.tileSize, ty + this.tileSize / 2);
            ctx.stroke();

            // Light highlight bevel
            ctx.strokeStyle = theme[2];
            ctx.beginPath();
            ctx.moveTo(tx + 1, ty + this.tileSize - 1);
            ctx.lineTo(tx + 1, ty + 1);
            ctx.lineTo(tx + this.tileSize - 1, ty + 1);
            ctx.stroke();

            // Grass cap on top block
            const above = this.getTile(c, r - 1);
            if (!above) {
              // Draw top grass layer
              let grassGrad = ctx.createLinearGradient(tx, ty, tx, ty + 6);
              grassGrad.addColorStop(0, '#10b981');
              grassGrad.addColorStop(1, '#047857');
              ctx.fillStyle = grassGrad;
              ctx.fillRect(tx, ty, this.tileSize, 5);

              // Swaying grass blades
              ctx.fillStyle = '#34d399';
              const wind = Math.sin(this.game.levelTime * 0.0035 + tx * 0.1) * 3;
              ctx.beginPath();
              // blade 1
              ctx.moveTo(tx + 4, ty);
              ctx.quadraticCurveTo(tx + 2 + wind, ty - 6, tx + wind, ty - 8);
              ctx.lineTo(tx + 6, ty);
              // blade 2
              ctx.moveTo(tx + 14, ty);
              ctx.quadraticCurveTo(tx + 14 + wind, ty - 8, tx + 12 + wind, ty - 10);
              ctx.lineTo(tx + 16, ty);
              // blade 3
              ctx.moveTo(tx + 24, ty);
              ctx.quadraticCurveTo(tx + 25 + wind, ty - 5, tx + 26 + wind, ty - 7);
              ctx.lineTo(tx + 26, ty);
              ctx.fill();
            }
          }
          else if (this.worldIndex === 2) {
            // CAVERNS: Glowing Amethyst Basalt
            ctx.fillStyle = theme[3];
            ctx.fillRect(tx, ty, this.tileSize, this.tileSize);

            // Draw crystalline facets inside
            ctx.strokeStyle = theme[1];
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx, ty + 16);
            ctx.lineTo(tx + 16, ty);
            ctx.lineTo(tx + 32, ty + 16);
            ctx.lineTo(tx + 16, ty + 32);
            ctx.lineTo(tx, ty + 16);
            ctx.moveTo(tx + 16, ty);
            ctx.lineTo(tx + 16, ty + 32);
            ctx.stroke();

            // Facet neon fill
            ctx.fillStyle = 'rgba(168, 85, 247, 0.12)';
            ctx.beginPath();
            ctx.moveTo(tx + 16, ty);
            ctx.lineTo(tx + 32, ty + 16);
            ctx.lineTo(tx + 16, ty + 32);
            ctx.closePath();
            ctx.fill();

            // Glowing Crystal Spurs on top
            const above = this.getTile(c, r - 1);
            if (!above) {
              const pulse = 0.6 + Math.sin(this.game.levelTime * 0.0035 + tx * 0.5) * 0.4;
              ctx.shadowColor = '#c084fc';
              ctx.shadowBlur = 8 * pulse;
              ctx.fillStyle = `rgba(192, 132, 252, ${pulse})`;
              
              if (c % 2 === 0) {
                ctx.beginPath();
                ctx.moveTo(tx + 8, ty);
                ctx.lineTo(tx + 4, ty - 9);
                ctx.lineTo(tx + 12, ty);
                ctx.moveTo(tx + 14, ty);
                ctx.lineTo(tx + 19, ty - 12);
                ctx.lineTo(tx + 22, ty);
                ctx.closePath();
                ctx.fill();
              } else {
                ctx.beginPath();
                ctx.moveTo(tx + 10, ty);
                ctx.lineTo(tx + 14, ty - 10);
                ctx.lineTo(tx + 18, ty);
                ctx.closePath();
                ctx.fill();
              }
              ctx.shadowBlur = 0;
            }
          }
          else if (this.worldIndex === 3) {
            // PEAKS: Sky-Temple Ivory Marble
            ctx.fillStyle = theme[0];
            ctx.fillRect(tx, ty, this.tileSize, this.tileSize);

            // Diagonal gold marble veins
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(tx, ty + 8);
            ctx.lineTo(tx + 24, ty + 32);
            ctx.moveTo(tx + 8, ty);
            ctx.lineTo(tx + 32, ty + 24);
            ctx.stroke();

            // Runic square emblem in center
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1;
            const runePulse = 0.4 + Math.abs(Math.sin(this.game.levelTime * 0.002 + tx * 0.1)) * 0.6;
            ctx.shadowColor = '#22d3ee';
            ctx.shadowBlur = 6 * runePulse;
            ctx.strokeStyle = `rgba(34, 211, 238, ${runePulse})`;
            ctx.strokeRect(tx + 10, ty + 10, 12, 12);
            
            // Draw runic dot inside
            ctx.fillStyle = `rgba(34, 211, 238, ${runePulse})`;
            ctx.fillRect(tx + 14, ty + 14, 4, 4);
            ctx.shadowBlur = 0;

            // Bevel
            ctx.strokeStyle = theme[1];
            ctx.lineWidth = 1.5;
            ctx.strokeRect(tx, ty, this.tileSize, this.tileSize);
          }
          else if (this.worldIndex === 4) {
            // DEPTHS: Obsidian Rock with Magma Cracks
            ctx.fillStyle = theme[0];
            ctx.fillRect(tx, ty, this.tileSize, this.tileSize);

            // Animated magma veins
            const wave = Math.sin(this.game.levelTime * 0.003 + tx * 0.08) * 1.5;
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 6;
            ctx.strokeStyle = '#ea580c';
            ctx.lineWidth = 2 + wave;
            ctx.beginPath();
            ctx.moveTo(tx + 6, ty);
            ctx.lineTo(tx + 12, ty + 16);
            ctx.lineTo(tx + 4, ty + 32);
            ctx.moveTo(tx + 20, ty);
            ctx.lineTo(tx + 18, ty + 14);
            ctx.lineTo(tx + 28, ty + 32);
            ctx.stroke();

            // Inner hot core color
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Block borders
            ctx.strokeStyle = '#18181b';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(tx, ty, this.tileSize, this.tileSize);
          }
          else if (this.worldIndex === 5) {
            // EXPANSE: Frosted Ice Blocks
            let iceGrad = ctx.createLinearGradient(tx, ty, tx, ty + this.tileSize);
            iceGrad.addColorStop(0, theme[2]);
            iceGrad.addColorStop(0.5, theme[0]);
            iceGrad.addColorStop(1, theme[1]);
            ctx.fillStyle = iceGrad;
            ctx.fillRect(tx, ty, this.tileSize, this.tileSize);

            // Internal ice fractures
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx + 4, ty + 6);
            ctx.lineTo(tx + 20, ty + 14);
            ctx.lineTo(tx + 26, ty + 28);
            ctx.moveTo(tx + 28, ty + 4);
            ctx.lineTo(tx + 10, ty + 24);
            ctx.stroke();

            // Specular reflection shine
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.moveTo(tx + 2, ty + 2);
            ctx.lineTo(tx + 22, ty + 22);
            ctx.lineTo(tx + 16, ty + 22);
            ctx.lineTo(tx + 2, ty + 8);
            ctx.closePath();
            ctx.fill();

            // Snow Cap
            const above = this.getTile(c, r - 1);
            if (!above) {
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.roundRect(tx, ty - 3, this.tileSize, 5, 2.5);
              ctx.fill();
            }

            ctx.strokeStyle = '#e0f2fe';
            ctx.lineWidth = 1;
            ctx.strokeRect(tx, ty, this.tileSize, this.tileSize);
          }
          else if (this.worldIndex === 6) {
            // SHADOWS: Void Rift stone
            ctx.fillStyle = theme[1];
            ctx.fillRect(tx, ty, this.tileSize, this.tileSize);

            // Swirling shadow patterns
            ctx.strokeStyle = 'rgba(217, 70, 239, 0.25)';
            ctx.lineWidth = 1.2;
            const rot = this.game.levelTime * 0.0015;
            ctx.save();
            ctx.translate(tx + 16, ty + 16);
            ctx.rotate(rot + tx);
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI);
            ctx.stroke();
            ctx.restore();

            // Glowing magenta core cracks
            ctx.strokeStyle = '#d946ef';
            ctx.shadowColor = '#d946ef';
            ctx.shadowBlur = 4;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx + 16, ty);
            ctx.lineTo(tx + 16, ty + 8);
            ctx.moveTo(tx + 8, ty + 20);
            ctx.lineTo(tx + 24, ty + 20);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Block borders
            ctx.strokeStyle = '#4a044e';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(tx, ty, this.tileSize, this.tileSize);
          }
        }
        
        // --- TILE TYPE 2: HAZARD SPIKES ---
        else if (tile.type === 2) {
          if (this.worldIndex === 1) {
            // MEADOWS: Thorn Brambles
            ctx.strokeStyle = '#78350f'; // Wood vine
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(tx, ty + this.tileSize);
            ctx.quadraticCurveTo(tx + 16, ty + 12, tx + this.tileSize, ty + this.tileSize);
            ctx.stroke();

            // Sharp green/red thorns
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            // Thorn 1
            ctx.moveTo(tx + 8, ty + 20);
            ctx.lineTo(tx + 10, ty + 4); // sharp peak
            ctx.lineTo(tx + 14, ty + 22);
            // Thorn 2
            ctx.moveTo(tx + 18, ty + 22);
            ctx.lineTo(tx + 22, ty + 6); // sharp peak
            ctx.lineTo(tx + 26, ty + 20);
            ctx.fill();
            
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            // Thorn 3
            ctx.moveTo(tx + 2, ty + 24);
            ctx.lineTo(tx + 5, ty + 10);
            ctx.lineTo(tx + 8, ty + 24);
            ctx.fill();
          }
          else if (this.worldIndex === 2) {
            // CAVERNS: Glowing Amethyst Quartz Shards
            ctx.shadowColor = '#c084fc';
            ctx.shadowBlur = 6;
            
            let crystalGrad = ctx.createLinearGradient(tx, ty + this.tileSize, tx, ty);
            crystalGrad.addColorStop(0, '#581c87');
            crystalGrad.addColorStop(0.6, '#a855f7');
            crystalGrad.addColorStop(1, '#e9d5ff');
            ctx.fillStyle = crystalGrad;

            ctx.beginPath();
            // Shard 1 (main)
            ctx.moveTo(tx + 6, ty + this.tileSize);
            ctx.lineTo(tx + 16, ty + 2);
            ctx.lineTo(tx + 26, ty + this.tileSize);
            // Shard 2 (left lean)
            ctx.moveTo(tx, ty + this.tileSize);
            ctx.lineTo(tx + 8, ty + 12);
            ctx.lineTo(tx + 16, ty + this.tileSize);
            // Shard 3 (right lean)
            ctx.moveTo(tx + 16, ty + this.tileSize);
            ctx.lineTo(tx + 26, ty + 10);
            ctx.lineTo(tx + 32, ty + this.tileSize);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          else if (this.worldIndex === 3) {
            // PEAKS: Golden Lightning Rods with Cyan Sparks
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(tx + 14, ty + 8, 4, 24); // Central shaft
            ctx.fillRect(tx + 8, ty + 14, 16, 3);  // Crossbar

            // Rod tip
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.moveTo(tx + 11, ty + 8);
            ctx.lineTo(tx + 16, ty + 1);
            ctx.lineTo(tx + 21, ty + 8);
            ctx.fill();

            // Cyan electric spark arcs
            if (Math.random() < 0.25) {
              ctx.strokeStyle = '#22d3ee';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(tx + 16, ty + 1);
              ctx.lineTo(tx + 16 + (Math.random() * 16 - 8), ty - 6 + (Math.random() * 8));
              ctx.stroke();
            }
          }
          else if (this.worldIndex === 4) {
            // DEPTHS: Molten Basalt Spikes
            ctx.fillStyle = '#18181b';
            ctx.beginPath();
            ctx.moveTo(tx + 2, ty + this.tileSize);
            ctx.lineTo(tx + 16, ty + 6);
            ctx.lineTo(tx + 30, ty + this.tileSize);
            ctx.fill();

            // Dripping lava tips
            let lavaGrad = ctx.createLinearGradient(tx, ty + 12, tx, ty + 6);
            lavaGrad.addColorStop(0, '#ea580c');
            lavaGrad.addColorStop(1, '#fef08a');
            ctx.fillStyle = lavaGrad;
            ctx.beginPath();
            ctx.moveTo(tx + 10, ty + 12);
            ctx.lineTo(tx + 16, ty + 6);
            ctx.lineTo(tx + 22, ty + 12);
            ctx.closePath();
            ctx.fill();
          }
          else if (this.worldIndex === 5) {
            // EXPANSE: Frosted Icicle Spikes
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = 6;
            
            let iceGrad = ctx.createLinearGradient(tx, ty + this.tileSize, tx, ty);
            iceGrad.addColorStop(0, '#0284c7');
            iceGrad.addColorStop(0.7, '#38bdf8');
            iceGrad.addColorStop(1, '#ffffff');
            ctx.fillStyle = iceGrad;

            ctx.beginPath();
            ctx.moveTo(tx + 4, ty + this.tileSize);
            ctx.lineTo(tx + 16, ty + 3);
            ctx.lineTo(tx + 28, ty + this.tileSize);
            ctx.closePath();
            ctx.fill();
            
            // Specular sheen highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.moveTo(tx + 16, ty + 3);
            ctx.lineTo(tx + 22, ty + this.tileSize);
            ctx.lineTo(tx + 16, ty + this.tileSize);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          else if (this.worldIndex === 6) {
            // SHADOWS: Writhing Void Tendrils
            ctx.fillStyle = '#3b0764';
            ctx.strokeStyle = '#d946ef';
            ctx.lineWidth = 1.5;
            
            const sway = Math.sin(this.game.levelTime * 0.005 + tx) * 4;
            ctx.beginPath();
            // Tendril 1
            ctx.moveTo(tx + 6, ty + this.tileSize);
            ctx.quadraticCurveTo(tx + 6 + sway, ty + 16, tx + 12 + sway, ty + 4);
            ctx.quadraticCurveTo(tx + 18 + sway, ty + 16, tx + 18, ty + this.tileSize);
            ctx.fill();
            ctx.stroke();

            // Tendril 2 (shorter)
            ctx.fillStyle = '#1e1b4b';
            ctx.beginPath();
            ctx.moveTo(tx + 20, ty + this.tileSize);
            ctx.quadraticCurveTo(tx + 20 - sway, ty + 20, tx + 24 - sway, ty + 10);
            ctx.quadraticCurveTo(tx + 26 - sway, ty + 20, tx + 28, ty + this.tileSize);
            ctx.fill();
            ctx.stroke();
          }
        }
        
        // --- TILE TYPE 3: MYSTICAL BOUNCE FLOWER ---
        else if (tile.type === 3) {
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
        
        // --- TILE TYPE 10: GLOWING LAVA STREAM ---
        else if (tile.type === 10) {
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

        // --- WORLD 5 ICICLES OVERHEAD ---
        if (this.worldIndex === 5 && (tile.type === 1 || tile.type === 11)) {
          const below = this.getTile(c, r + 1);
          if (!below && c % 2 === 0) {
            ctx.fillStyle = 'rgba(224, 242, 254, 0.95)';
            ctx.shadowColor = '#e0f2fe';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.moveTo(tx + 8, ty + this.tileSize);
            ctx.lineTo(tx + 16, ty + this.tileSize);
            ctx.lineTo(tx + 12, ty + this.tileSize + 12);
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
        // Faceted spinning shard (Vibrant Gold Diamond)
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 8;
        
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
        ctx.rotate(this.game.levelTime * 0.0035);
        
        // Draw 3D faceted diamond (Left and Right halves)
        ctx.beginPath();
        ctx.moveTo(0, -item.height / 2);
        ctx.lineTo(item.width / 2, 0);
        ctx.lineTo(0, item.height / 2);
        ctx.closePath();
        ctx.fillStyle = '#fef08a';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -item.height / 2);
        ctx.lineTo(-item.width / 2, 0);
        ctx.lineTo(0, item.height / 2);
        ctx.closePath();
        ctx.fillStyle = '#d97706';
        ctx.fill();
      } 
      else if (item.type === 'relic') {
        // Translucent floating cyan crystal (Ancient Relic)
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 12;
        
        const float = Math.sin(this.game.levelTime * 0.004) * 4;
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2 + float);
        ctx.rotate(this.game.levelTime * 0.0015);
        
        // Draw double-pointed faceted crystal
        ctx.beginPath();
        ctx.moveTo(0, -item.height / 2);
        ctx.lineTo(item.width / 2, -item.height / 6);
        ctx.lineTo(item.width / 3, item.height / 6);
        ctx.lineTo(0, item.height / 2);
        ctx.closePath();
        ctx.fillStyle = '#e0f7fa';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -item.height / 2);
        ctx.lineTo(-item.width / 2, -item.height / 6);
        ctx.lineTo(-item.width / 3, item.height / 6);
        ctx.lineTo(0, item.height / 2);
        ctx.closePath();
        ctx.fillStyle = '#0891b2';
        ctx.fill();
      }
      else if (item.type === 'key') {
        // Glowing Runic Key
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 10;
        
        const float = Math.sin(this.game.levelTime * 0.005) * 3;
        ctx.translate(item.x + 8, item.y + 12 + float);
        ctx.fillStyle = '#e9d5ff';
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;

        // Key head (Runic ring)
        ctx.beginPath();
        ctx.arc(0, -6, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1e1b4b'; // inner cutout
        ctx.beginPath();
        ctx.arc(0, -6, 3, 0, Math.PI * 2);
        ctx.fill();

        // Key shaft and teeth
        ctx.fillStyle = '#e9d5ff';
        ctx.fillRect(-1.5, 1, 3, 11); // shaft
        ctx.fillRect(-1.5, 6, 6, 2.5); // tooth A
        ctx.fillRect(-1.5, 10, 6, 2.5); // tooth B
      }
      else if (item.type === 'seed') {
        // Glowing Heart Fruit
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 8;
        const float = Math.sin(this.game.levelTime * 0.0035) * 2;
        ctx.translate(item.x + 8, item.y + 8 + float);
        
        let fruitGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
        fruitGrad.addColorStop(0, '#34d399');
        fruitGrad.addColorStop(1, '#065f46');
        ctx.fillStyle = fruitGrad;

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
        // Floating cyber bubbles
        ctx.strokeStyle = '#d946ef';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#d946ef';
        ctx.shadowBlur = 10;
        
        const float = Math.sin(this.game.levelTime * 0.004) * 4;
        ctx.translate(item.x + 10, item.y + 10 + float);
        
        // Pulsing bubble outline
        const pulse = 1.0 + Math.sin(this.game.levelTime * 0.008) * 0.08;
        ctx.beginPath();
        ctx.arc(0, 0, 10 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner letter
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px var(--font-display)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.powerupType.substring(0, 2).toUpperCase(), 0, 0);
      }
      else if (item.type === 'portal') {
        // SWIRLING COSMIC PORTAL (Vortex accretion disk + black hole core)
        const isUnlocked = this.game.levelKey;
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
        
        // Orbiting accretion gas ring
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(this.game.levelTime * 0.005) * 0.25;
        ctx.strokeStyle = isUnlocked ? '#10b981' : '#475569';
        ctx.lineWidth = 3;
        ctx.shadowColor = isUnlocked ? '#34d399' : '#334155';
        ctx.shadowBlur = isUnlocked ? 20 : 6;
        ctx.rotate(this.game.levelTime * 0.001);
        ctx.beginPath();
        ctx.ellipse(0, 0, item.width * 0.8, item.height * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Spiral vortex arms
        ctx.strokeStyle = isUnlocked ? '#34d399' : '#475569';
        ctx.lineWidth = 2.2;
        ctx.save();
        ctx.rotate(-this.game.levelTime * 0.0025);
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.beginPath();
          ctx.ellipse(0, 0, item.width / 2, item.height / 2, 0.45, 0, Math.PI);
          ctx.stroke();
        }
        ctx.restore();

        // Dark Event Horizon core
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(0, 0, item.width / 3.5, item.height / 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
        
        if (isUnlocked) {
          // Inner emerald core flare
          ctx.fillStyle = 'rgba(52, 211, 153, 0.3)';
          ctx.beginPath();
          ctx.ellipse(0, 0, item.width / 5, item.height / 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    // Draw active checkpoints
    for (let cp of this.checkpoints) {
      ctx.save();
      
      // Totem design
      const isActive = cp.active;
      ctx.fillStyle = isActive ? '#10b981' : '#475569';
      ctx.shadowColor = isActive ? '#10b981' : '#000';
      ctx.shadowBlur = isActive ? 10 : 0;
      
      // Pillar base
      ctx.fillRect(cp.x + 10, cp.y - 12, 12, 12);
      // Shaft
      ctx.fillStyle = isActive ? '#059669' : '#334155';
      ctx.fillRect(cp.x + 13, cp.y - 28, 6, 16);
      
      // Floating runic top sphere
      const float = Math.sin(this.game.levelTime * 0.004 + cp.x) * 2;
      ctx.fillStyle = isActive ? '#34d399' : '#64748b';
      ctx.beginPath();
      ctx.arc(cp.x + 16, cp.y - 36 + float, 5, 0, Math.PI * 2);
      ctx.fill();
      
      if (isActive) {
        // Outer glowing ring
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cp.x + 16, cp.y - 36 + float, 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Draw moving platforms
    for (let plat of this.movingPlatforms) {
      ctx.save();
      // Ancient carved stone styling
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      
      ctx.beginPath();
      ctx.roundRect(plat.x, plat.y, plat.width, plat.height, 4);
      ctx.fill();
      ctx.stroke();

      // Carved runes on platform
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(plat.x + 4, plat.y + 3, plat.width - 8, plat.height - 6);
      
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
