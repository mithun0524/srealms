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

    // Helper random interval generator — defined FIRST before use
    this.randomInterval = (min, max) => Math.random() * (max - min) + min;

    // Ragebait surprise timers
    this.spikeTimer = this.randomInterval(3000, 7000);
    this.spikeDuration = 1200; // ms the spike stays
    this.activeSpikes = [];
    this.swarmTimer = this.randomInterval(12000, 18000);
    this.floorTrapTimer = this.randomInterval(8000, 14000);
    this.activeFloorTraps = [];
    this.hiddenPlatforms = [];
    this.platformTriggers = [];

    // Crumble platforms (fake solid)
    this.crumblePlatforms = [];

    // Boss intro state (shown on boss level entry)
    this.bossIntroShown = false;

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

    // Block portal wall
    const exitCol = this.cols - 6;
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
    // --- SHARED HELPERS ---
    const T = this.worldIndex === 5 ? 11 : 1; // ice tile in world 5
    const R = this.rows;

    const plat = (c, r, len, tile = T) => {
      for (let i = 0; i < len; i++) this.setTile(c + i, r, tile);
    };
    const crystals = (c, r, n) => {
      for (let i = 0; i < n; i++) {
        this.items.push({ type: 'crystal', x: (c+i)*32+8, y: r*32-24, width:16, height:16, collected:false });
      }
    };
    const spike = (c, r) => this.setTile(c, r, 2);
    const bounce = (c, r) => this.setTile(c, r, 3);
    const relic = (c, r, idx) => this.items.push({ type:'relic', relicIdx:idx, x:c*32+6, y:r*32-20, width:20, height:20, collected:false });
    const key = (c, r) => this.items.push({ type:'key', x:c*32+8, y:r*32-24, width:16, height:24, collected:false });
    const seed = (c, r) => this.items.push({ type:'seed', x:c*32+8, y:r*32-16, width:16, height:16, collected:false });
    const pups = ['wind','thunder','shield','time','fire'];
    const powerup = (c, r) => this.items.push({ type:'powerup', powerupType: pups[(this.worldIndex+this.levelIndex)%pups.length], x:c*32+6, y:r*32-20, width:20, height:20, collected:false });
    const portal = (c, r) => this.items.push({ type:'portal', x:c*32, y:r*32-64, width:32, height:64, collected:false });
    const movH = (c, r, len, rangeC, speed) => {
      const sx = c*32, ex = (c+rangeC)*32, sy = r*32;
      this.movingPlatforms.push({ startX:sx, startY:sy, endX:ex, endY:sy, x:sx, y:sy, width:len*32, height:12, speed, dir:1 });
    };
    const movV = (c, r1, r2, len, speed) => {
      const sx = c*32, sy = r1*32, ey = r2*32;
      this.movingPlatforms.push({ startX:sx, startY:sy, endX:sx, endY:ey, x:sx, y:sy, width:len*32, height:12, speed, dir:1 });
    };
    const crumble = (c, r, len) => {
      plat(c, r, len, T);
      this.crumblePlatforms.push({ startCol:c, row:r, len, health:1800, crumbling:false, collapsed:false });
    };

    // --- DISPATCH PER WORLD ---
    switch(this.worldIndex) {
      case 1: this._layoutMeadows(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T); break;
      case 2: this._layoutCaverns(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T); break;
      case 3: this._layoutPeaks(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T); break;
      case 4: this._layoutVolcano(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T); break;
      case 5: this._layoutExpanse(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T); break;
      case 6: this._layoutShadow(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T); break;
      default: this._layoutMeadows(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T);
    }
  }

  // ============================================================
  // WORLD 1 — EMERALD MEADOWS (Bright, gentle hills. Pits + bounce flowers)
  // ============================================================
  _layoutMeadows(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T) {
    const L = this.levelIndex;
    if (L === 1) {
      // Tutorial: wide platforms, friendly gaps
      plat(7, R-5, 5); crystals(8, R-5, 3);
      bounce(14, R-3);
      plat(16, R-7, 4); crystals(17, R-7, 2);
      plat(22, R-5, 3);
      movH(27, R-6, 2, 3, 1.0);
      plat(32, R-4, 4); crystals(33, R-4, 2);
      bounce(38, R-3);
      plat(41, R-6, 3); relic(42, R-6, 1);
      plat(47, R-5, 4); crystals(48, R-5, 2);
      movH(52, R-5, 2, 4, 1.2);
      plat(58, R-4, 5); key(60, R-5);
      plat(64, R-6, 3); relic(65, R-6, 2); seed(66, R-6);
      plat(70, R-5, 3); crystals(71, R-5, 2);
      movV(75, R-5, R-8, 2, 0.9);
      plat(79, R-7, 4); relic(81, R-7, 3);
      powerup(85, R-5); seed(90, R-4);
      for(let c of [15,36,59,93]) spike(c, R-2);
      portal(98, R-5);
    } else if (L === 2) {
      // Windmill Ridge: staircase pattern, trickier gaps
      plat(6, R-5, 3); crystals(7, R-5, 2);
      spike(10, R-2); spike(11, R-2);
      plat(12, R-6, 2);
      plat(15, R-8, 3); crystals(16, R-8, 2); bounce(18, R-9);
      plat(20, R-5, 2);
      spike(23, R-2); spike(24, R-2); spike(25, R-2);
      plat(27, R-7, 3); relic(28, R-7, 1);
      movH(32, R-5, 2, 5, 1.5);
      plat(39, R-9, 4); key(41, R-9); crystals(39, R-9, 2);
      spike(44, R-2); spike(45, R-2); spike(46, R-2); spike(47, R-2);
      plat(48, R-6, 3); relic(49, R-6, 2);
      bounce(53, R-3);
      plat(56, R-8, 4); crystals(57, R-8, 2);
      movH(62, R-5, 2, 3, 1.8);
      plat(67, R-6, 3); seed(68, R-6);
      spike(71, R-2); spike(72, R-2);
      plat(74, R-7, 4); relic(75, R-7, 3); crystals(74, R-7, 2);
      powerup(80, R-6);
      plat(84, R-5, 5); crystals(85, R-5, 3);
      for(let c of [88,89]) spike(c, R-2);
      portal(95, R-5);
    } else if (L === 3) {
      // Blossom Valley: vertical challenge, precision
      plat(5, R-5, 3); crystals(6, R-5, 2);
      spike(9, R-2); spike(10, R-2); spike(11, R-2); spike(12, R-2);
      plat(13, R-8, 3);
      bounce(17, R-3); bounce(18, R-3);
      plat(20, R-11, 3); crystals(21, R-11, 2); relic(22, R-11, 1);
      spike(24, R-2); spike(25, R-2); spike(26, R-2); spike(27, R-2); spike(28, R-2);
      movV(29, R-4, R-9, 2, 1.2);
      plat(33, R-6, 3); key(34, R-6);
      spike(37, R-2); spike(38, R-2); spike(39, R-2); spike(40, R-2);
      plat(41, R-9, 4); crystals(42, R-9, 2);
      movH(46, R-6, 2, 4, 2.0);
      crumble(52, R-5, 3); // crumble platform rage
      plat(57, R-10, 4); relic(58, R-10, 2); crystals(57, R-10, 2);
      spike(62, R-2); spike(63, R-2); spike(64, R-2); spike(65, R-2);
      plat(66, R-7, 3);
      movV(70, R-5, R-10, 2, 1.6);
      plat(74, R-8, 3); relic(75, R-8, 3); seed(75, R-9);
      powerup(80, R-6);
      plat(84, R-5, 4); crystals(85, R-5, 2);
      spike(89, R-2); spike(90, R-2); spike(91, R-2);
      portal(95, R-5);
    } else {
      // L4 or L5: harder mix
      plat(5, R-6, 3); crystals(6, R-6, 2);
      spike(9, R-2); spike(10, R-2); spike(11, R-2); spike(12, R-2); spike(13, R-2);
      movH(14, R-8, 2, 5, 2.0);
      crumble(21, R-6, 3);
      spike(25, R-2); spike(26, R-2); spike(27, R-2);
      plat(28, R-9, 4); relic(30, R-9, 1); crystals(28, R-9, 2);
      bounce(33, R-3);
      movV(35, R-5, R-10, 2, 1.8);
      plat(40, R-7, 3); key(41, R-7);
      spike(44, R-2); spike(45, R-2); spike(46, R-2); spike(47, R-2); spike(48, R-2); spike(49, R-2);
      movH(50, R-9, 2, 4, 2.2);
      crumble(56, R-6, 3);
      plat(61, R-8, 4); relic(63, R-8, 2); crystals(61, R-8, 2);
      seed(65, R-8);
      movH(67, R-5, 2, 5, 2.5);
      spike(73, R-2); spike(74, R-2); spike(75, R-2); spike(76, R-2);
      plat(77, R-9, 4); relic(79, R-9, 3); crystals(77, R-9, 2);
      powerup(83, R-7);
      plat(87, R-6, 4); crystals(88, R-6, 2);
      spike(92, R-2); spike(93, R-2); spike(94, R-2);
      portal(98, R-5);
    }
  }

  // ============================================================
  // WORLD 2 — CRYSTAL CAVERNS (Vignette dark, drips from ceiling, tight)
  // ============================================================
  _layoutCaverns(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T) {
    const L = this.levelIndex;
    // Low ceiling sections — add tiles on top rows to create cave feel
    for (let c = 0; c < this.cols; c++) {
      if (c > 5 && c < 100) {
        if (c < 30 || (c > 45 && c < 65) || c > 80) {
          this.setTile(c, 2, 1); // Low ceiling
          this.setTile(c, 3, 1);
        }
      }
    }
    if (L === 1) {
      // Cavern Path: tight crawl spaces, spitter positions
      plat(6, R-5, 4); crystals(7, R-5, 2);
      spike(11, R-2); spike(12, R-2); spike(13, R-2);
      plat(14, R-7, 3); crystals(15, R-7, 2);
      spike(18, R-2); spike(19, R-2); spike(20, R-2); spike(21, R-2);
      plat(22, R-5, 3); relic(23, R-5, 1);
      movH(26, R-5, 2, 3, 1.2);
      spike(30, R-2); spike(31, R-2); spike(32, R-2);
      plat(33, R-6, 4); key(35, R-6); crystals(33, R-6, 2);
      spike(38, R-2); spike(39, R-2); spike(40, R-2); spike(41, R-2);
      plat(42, R-8, 3); relic(43, R-8, 2);
      movV(47, R-5, R-8, 2, 1.0);
      spike(50, R-2); spike(51, R-2);
      plat(52, R-6, 4); crystals(53, R-6, 2);
      spike(57, R-2); spike(58, R-2); spike(59, R-2);
      plat(60, R-5, 3); seed(61, R-5);
      crumble(64, R-5, 3);
      spike(68, R-2); spike(69, R-2); spike(70, R-2); spike(71, R-2);
      plat(72, R-7, 4); relic(74, R-7, 3); crystals(72, R-7, 2);
      powerup(78, R-6);
      spike(81, R-2); spike(82, R-2); spike(83, R-2);
      plat(84, R-5, 5); crystals(85, R-5, 2);
      portal(95, R-5);
    } else if (L === 2) {
      // Glow Chambers: vertical shafts, dangerous
      plat(5, R-5, 3); crystals(6, R-5, 2);
      spike(9, R-2); spike(10, R-2); spike(11, R-2); spike(12, R-2);
      movV(13, R-5, R-10, 2, 1.4);
      spike(16, R-2); spike(17, R-2); spike(18, R-2);
      plat(19, R-8, 3); relic(20, R-8, 1); crystals(19, R-8, 2);
      spike(23, R-2); spike(24, R-2); spike(25, R-2); spike(26, R-2); spike(27, R-2);
      plat(28, R-6, 4); key(30, R-6);
      movH(33, R-7, 2, 5, 1.8);
      spike(39, R-2); spike(40, R-2); spike(41, R-2); spike(42, R-2);
      crumble(43, R-6, 4); // crumble trap over pit!
      spike(48, R-2); spike(49, R-2); spike(50, R-2);
      plat(51, R-9, 4); relic(53, R-9, 2); crystals(51, R-9, 2);
      movV(56, R-5, R-9, 2, 1.6);
      spike(59, R-2); spike(60, R-2); spike(61, R-2); spike(62, R-2);
      plat(63, R-7, 3); seed(64, R-7);
      spike(67, R-2); spike(68, R-2); spike(69, R-2);
      movH(70, R-9, 2, 4, 2.0);
      plat(75, R-7, 4); relic(77, R-7, 3); crystals(75, R-7, 2);
      powerup(81, R-6);
      spike(84, R-2); spike(85, R-2); spike(86, R-2); spike(87, R-2);
      plat(88, R-5, 5); crystals(89, R-5, 2);
      portal(96, R-5);
    } else {
      // Crystal Labyrinth: extremely tight, maze-like
      plat(5, R-5, 3); crystals(6, R-5, 2);
      spike(9, R-2); spike(10, R-2); spike(11, R-2); spike(12, R-2); spike(13, R-2);
      crumble(14, R-6, 3);
      spike(18, R-2); spike(19, R-2); spike(20, R-2); spike(21, R-2); spike(22, R-2);
      movV(23, R-5, R-11, 2, 1.6);
      plat(26, R-9, 4); relic(28, R-9, 1); crystals(26, R-9, 2);
      spike(31, R-2); spike(32, R-2); spike(33, R-2); spike(34, R-2); spike(35, R-2);
      crumble(36, R-7, 3);
      spike(40, R-2); spike(41, R-2); spike(42, R-2); spike(43, R-2);
      plat(44, R-9, 4); key(46, R-9);
      spike(49, R-2); spike(50, R-2); spike(51, R-2); spike(52, R-2); spike(53, R-2);
      movH(54, R-6, 2, 5, 2.4);
      crumble(60, R-8, 3);
      spike(64, R-2); spike(65, R-2); spike(66, R-2); spike(67, R-2);
      plat(68, R-10, 4); relic(70, R-10, 2); crystals(68, R-10, 2); seed(71, R-10);
      spike(73, R-2); spike(74, R-2); spike(75, R-2); spike(76, R-2); spike(77, R-2);
      movV(78, R-5, R-10, 2, 2.0);
      plat(81, R-8, 4); relic(83, R-8, 3); crystals(81, R-8, 2);
      powerup(87, R-7);
      spike(89, R-2); spike(90, R-2); spike(91, R-2); spike(92, R-2); spike(93, R-2);
      plat(94, R-5, 4); crystals(95, R-5, 2);
      portal(100, R-5);
    }
  }

  // ============================================================
  // WORLD 3 — SKYFORGE PEAKS (Tiny floating cloud platforms, wind gusts)
  // ============================================================
  _layoutPeaks(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T) {
    const L = this.levelIndex;
    // Fill floor with pits (aerial world — no ground)
    for (let c = 5; c < this.cols - 5; c++) {
      this.setTile(c, R-1, null);
      this.setTile(c, R-2, null);
    }
    if (L === 1) {
      // Stepping Stones: individual tiny platforms
      plat(4, R-4, 3, 1); crystals(5, R-4, 2);
      plat(8, R-6, 2, 1);
      plat(12, R-8, 3, 1); crystals(13, R-8, 2);
      movH(16, R-5, 2, 4, 1.4);
      plat(22, R-9, 2, 1); relic(23, R-9, 1);
      plat(26, R-7, 2, 1);
      movV(30, R-5, R-10, 2, 1.2);
      plat(34, R-8, 3, 1); key(36, R-8); crystals(34, R-8, 2);
      plat(39, R-6, 2, 1);
      movH(43, R-10, 2, 5, 1.8);
      plat(50, R-7, 3, 1); relic(51, R-7, 2); crystals(50, R-7, 2);
      plat(55, R-5, 2, 1); seed(56, R-5);
      movV(59, R-4, R-9, 2, 1.6);
      plat(63, R-8, 3, 1);
      plat(68, R-6, 2, 1); relic(69, R-6, 3);
      movH(72, R-9, 2, 4, 2.0);
      plat(78, R-7, 3, 1); crystals(79, R-7, 2);
      powerup(83, R-9);
      plat(86, R-5, 3, 1); crystals(87, R-5, 2);
      movH(90, R-7, 2, 3, 2.4);
      portal(95, R-5);
    } else if (L === 2) {
      // Gale Cliffs: frequent gaps, fast moving platforms
      plat(4, R-5, 2, 1); crystals(5, R-5, 2);
      movH(7, R-7, 2, 4, 2.0);
      plat(13, R-9, 2, 1); relic(14, R-9, 1);
      plat(17, R-6, 2, 1);
      movV(21, R-5, R-10, 2, 1.8);
      plat(25, R-8, 3, 1); key(27, R-8); crystals(25, R-8, 2);
      crumble(30, R-6, 2);
      movH(34, R-9, 2, 5, 2.4);
      plat(41, R-7, 2, 1); relic(42, R-7, 2);
      plat(45, R-5, 2, 1); seed(46, R-5);
      movV(49, R-4, R-10, 2, 2.0);
      plat(53, R-8, 2, 1);
      crumble(57, R-6, 2);
      plat(61, R-9, 2, 1); relic(62, R-9, 3); crystals(61, R-9, 2);
      movH(65, R-7, 2, 4, 2.8);
      plat(71, R-5, 2, 1);
      movV(75, R-5, R-11, 2, 2.2);
      plat(79, R-8, 3, 1); crystals(80, R-8, 2);
      powerup(84, R-7);
      crumble(88, R-6, 2);
      portal(94, R-5);
    } else {
      // Storm Roc Nest: extreme rage — all crumble, almost no static
      plat(4, R-5, 2, 1); crystals(5, R-5, 2);
      crumble(7, R-7, 2);
      movH(11, R-9, 2, 5, 2.8);
      plat(18, R-7, 2, 1); relic(19, R-7, 1);
      crumble(22, R-5, 2);
      movV(26, R-4, R-11, 2, 2.2);
      plat(30, R-9, 2, 1); key(31, R-9); crystals(30, R-9, 2);
      crumble(34, R-6, 2);
      movH(38, R-8, 2, 5, 3.2);
      plat(45, R-5, 2, 1); relic(46, R-5, 2);
      crumble(49, R-7, 2);
      movV(53, R-5, R-11, 2, 2.6);
      plat(57, R-9, 2, 1); seed(58, R-9);
      crumble(61, R-7, 2);
      movH(65, R-5, 2, 5, 3.6);
      plat(72, R-9, 2, 1); relic(73, R-9, 3); crystals(72, R-9, 2);
      crumble(77, R-6, 2);
      powerup(82, R-8);
      crumble(85, R-5, 2);
      movH(89, R-8, 2, 4, 4.0);
      portal(96, R-5);
    }
  }

  // ============================================================
  // WORLD 4 — MOLTEN DEPTHS (Lava pits, moving stone bridges)
  // ============================================================
  _layoutVolcano(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T) {
    const L = this.levelIndex;
    // All pits have lava tiles
    for (let c = 0; c < this.cols; c++) {
      if ((c>14 && c<19)||(c>34 && c<38)||(c>54 && c<59)||(c>74 && c<79)||(c>92 && c<96)) {
        this.setTile(c, R-1, 10);
        this.setTile(c, R-2, 10);
      }
    }
    if (L === 1) {
      // Volcanic Vent: lava rivers, stone bridges
      plat(6, R-5, 4, 1); crystals(7, R-5, 2);
      movH(11, R-4, 2, 3, 1.2); // Bridge over lava
      plat(16, R-5, 4, 1); relic(17, R-5, 1);
      movH(21, R-4, 2, 3, 1.4);
      plat(26, R-6, 4, 1); key(28, R-6); crystals(26, R-6, 2);
      spike(30, R-3); spike(31, R-3); // Spike rain area
      plat(32, R-5, 3, 1);
      movH(36, R-4, 2, 2, 1.6);
      plat(40, R-5, 4, 1); crystals(41, R-5, 2);
      crumble(45, R-4, 3);
      movH(49, R-6, 2, 3, 1.8);
      plat(54, R-5, 4, 1); relic(56, R-5, 2); seed(57, R-5);
      spike(59, R-3); spike(60, R-3); spike(61, R-3);
      movH(62, R-4, 2, 3, 2.0);
      plat(67, R-6, 4, 1); crystals(68, R-6, 2);
      movH(72, R-4, 2, 2, 2.2);
      plat(76, R-5, 4, 1); relic(78, R-5, 3);
      powerup(82, R-5);
      spike(85, R-3); spike(86, R-3);
      plat(87, R-5, 5, 1); crystals(88, R-5, 2);
      portal(96, R-5);
    } else if (L === 2) {
      // Magma Rivers: rising lava, intense
      this.lavaLevel = 540; // starts at bottom, will rise in boss
      plat(5, R-5, 4, 1); crystals(6, R-5, 2);
      spike(10, R-3); spike(11, R-3); spike(12, R-3);
      movH(13, R-7, 2, 4, 1.6);
      plat(19, R-8, 4, 1); relic(21, R-8, 1); crystals(19, R-8, 2);
      spike(24, R-3); spike(25, R-3); spike(26, R-3); spike(27, R-3);
      movV(28, R-5, R-9, 2, 1.4);
      plat(32, R-6, 4, 1); key(34, R-6);
      crumble(37, R-5, 3);
      spike(41, R-3); spike(42, R-3); spike(43, R-3);
      movH(44, R-8, 2, 4, 2.0);
      plat(50, R-6, 4, 1); relic(52, R-6, 2); crystals(50, R-6, 2);
      spike(55, R-3); spike(56, R-3); spike(57, R-3); spike(58, R-3);
      movV(59, R-4, R-9, 2, 1.8);
      crumble(63, R-6, 3);
      spike(67, R-3); spike(68, R-3); spike(69, R-3);
      plat(70, R-8, 4, 1); relic(72, R-8, 3); crystals(70, R-8, 2); seed(73, R-8);
      powerup(77, R-7);
      movH(79, R-6, 2, 4, 2.4);
      spike(84, R-3); spike(85, R-3); spike(86, R-3);
      plat(87, R-5, 5, 1); crystals(88, R-5, 2);
      portal(96, R-5);
    } else {
      // Inferno: narrow ledge hell
      plat(4, R-5, 2, 1); crystals(5, R-5, 2);
      for(let c=7;c<=12;c++) spike(c, R-2);
      plat(13, R-7, 2, 1); relic(14, R-7, 1);
      for(let c=16;c<=22;c++) spike(c, R-2);
      movH(23, R-9, 1, 5, 2.0);
      plat(30, R-6, 2, 1); key(31, R-6); crystals(30, R-6, 2);
      for(let c=33;c<=40;c++) spike(c, R-2);
      crumble(41, R-8, 2);
      for(let c=44;c<=50;c++) spike(c, R-2);
      movV(51, R-5, R-10, 1, 2.2);
      plat(54, R-8, 2, 1); relic(55, R-8, 2);
      for(let c=57;c<=63;c++) spike(c, R-2);
      crumble(64, R-6, 2);
      for(let c=67;c<=74;c++) spike(c, R-2);
      plat(75, R-9, 2, 1); relic(76, R-9, 3); crystals(75, R-9, 2); seed(76, R-10);
      for(let c=78;c<=83;c++) spike(c, R-2);
      powerup(85, R-8);
      movH(87, R-6, 2, 4, 2.8);
      portal(95, R-5);
    }
  }

  // ============================================================
  // WORLD 5 — FROZEN EXPANSE (Ice, slippery, burrower ambushes)
  // ============================================================
  _layoutExpanse(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T) {
    const L = this.levelIndex;
    if (L === 1) {
      // Snow Valley: wide icy flats, surprise burrowers
      plat(5, R-5, 6, 11); crystals(6, R-5, 3);
      spike(12, R-2); spike(13, R-2);
      plat(14, R-5, 5, 11); relic(16, R-5, 1);
      spike(20, R-2); spike(21, R-2); spike(22, R-2);
      plat(23, R-6, 5, 11); key(25, R-6); crystals(23, R-6, 2);
      movH(29, R-5, 3, 4, 1.2);
      plat(35, R-5, 5, 11); crystals(36, R-5, 2);
      spike(41, R-2); spike(42, R-2);
      plat(43, R-6, 5, 11); relic(45, R-6, 2); seed(46, R-6);
      spike(49, R-2); spike(50, R-2); spike(51, R-2);
      plat(52, R-5, 6, 11); crystals(53, R-5, 2);
      movH(59, R-5, 3, 3, 1.6);
      plat(64, R-6, 5, 11); crystals(65, R-6, 2);
      spike(70, R-2); spike(71, R-2); spike(72, R-2);
      plat(73, R-5, 6, 11); relic(75, R-5, 3);
      powerup(81, R-5);
      spike(84, R-2); spike(85, R-2);
      plat(86, R-5, 6, 11); crystals(87, R-5, 3);
      portal(96, R-5);
    } else if (L === 2) {
      // Ice Fortress: breakable ice bridges (crumble)
      plat(4, R-5, 3, 11); crystals(5, R-5, 2);
      crumble(8, R-5, 4);
      spike(13, R-2); spike(14, R-2); spike(15, R-2);
      plat(16, R-7, 3, 11); relic(17, R-7, 1);
      crumble(20, R-5, 4);
      spike(25, R-2); spike(26, R-2); spike(27, R-2); spike(28, R-2);
      plat(29, R-8, 3, 11); key(30, R-8); crystals(29, R-8, 2);
      crumble(33, R-6, 4);
      spike(38, R-2); spike(39, R-2); spike(40, R-2);
      movH(41, R-5, 3, 4, 1.8);
      plat(47, R-7, 3, 11); relic(48, R-7, 2); seed(49, R-7);
      crumble(51, R-5, 4);
      spike(56, R-2); spike(57, R-2); spike(58, R-2); spike(59, R-2);
      plat(60, R-8, 3, 11); crystals(61, R-8, 2);
      crumble(64, R-6, 4);
      spike(69, R-2); spike(70, R-2); spike(71, R-2);
      plat(72, R-7, 4, 11); relic(74, R-7, 3); crystals(72, R-7, 2);
      powerup(78, R-6);
      crumble(80, R-5, 4);
      spike(85, R-2); spike(86, R-2); spike(87, R-2);
      plat(88, R-5, 5, 11); crystals(89, R-5, 2);
      portal(97, R-5);
    } else {
      // Blizzard Maze: extreme cold — everything crumbles
      plat(4, R-5, 3, 11); crystals(5, R-5, 2);
      for(let c=8;c<=11;c++) spike(c, R-2);
      crumble(12, R-7, 3);
      for(let c=16;c<=21;c++) spike(c, R-2);
      plat(22, R-9, 3, 11); relic(23, R-9, 1); crystals(22, R-9, 2);
      crumble(26, R-6, 3);
      for(let c=30;c<=35;c++) spike(c, R-2);
      plat(36, R-8, 3, 11); key(37, R-8);
      crumble(40, R-6, 3);
      for(let c=44;c<=49;c++) spike(c, R-2);
      crumble(50, R-9, 3);
      for(let c=54;c<=58;c++) spike(c, R-2);
      plat(59, R-7, 3, 11); relic(60, R-7, 2); seed(61, R-7);
      crumble(63, R-5, 3);
      for(let c=67;c<=72;c++) spike(c, R-2);
      plat(73, R-9, 3, 11); relic(74, R-9, 3); crystals(73, R-9, 2);
      crumble(77, R-6, 3);
      powerup(82, R-8);
      for(let c=85;c<=89;c++) spike(c, R-2);
      plat(90, R-5, 5, 11); crystals(91, R-5, 2);
      portal(98, R-5);
    }
  }

  // ============================================================
  // WORLD 6 — SHADOW REALM (Vignette+dark, fake floors, void traps)
  // ============================================================
  _layoutShadow(plat, crystals, spike, bounce, relic, key, seed, powerup, portal, movH, movV, crumble, R, T) {
    const L = this.levelIndex;
    if (L === 1) {
      // Shadow Rift: dark with torch guideposts (crumbles + voids)
      plat(5, R-5, 4, 1); crystals(6, R-5, 2);
      spike(10, R-2); spike(11, R-2); spike(12, R-2); spike(13, R-2);
      crumble(14, R-5, 3);
      spike(18, R-2); spike(19, R-2); spike(20, R-2);
      plat(21, R-7, 4, 1); relic(23, R-7, 1); crystals(21, R-7, 2);
      spike(26, R-2); spike(27, R-2); spike(28, R-2); spike(29, R-2); spike(30, R-2);
      movH(31, R-8, 2, 5, 1.8);
      plat(38, R-6, 3, 1); key(39, R-6);
      crumble(42, R-5, 3);
      spike(46, R-2); spike(47, R-2); spike(48, R-2); spike(49, R-2);
      plat(50, R-8, 4, 1); relic(52, R-8, 2); crystals(50, R-8, 2);
      movV(55, R-5, R-10, 2, 1.6);
      crumble(58, R-7, 3);
      spike(62, R-2); spike(63, R-2); spike(64, R-2); spike(65, R-2); spike(66, R-2);
      plat(67, R-9, 4, 1); crystals(68, R-9, 2); seed(70, R-9);
      movH(72, R-6, 2, 4, 2.0);
      plat(78, R-8, 4, 1); relic(80, R-8, 3);
      powerup(84, R-7);
      spike(87, R-2); spike(88, R-2); spike(89, R-2); spike(90, R-2);
      plat(91, R-5, 5, 1); crystals(92, R-5, 2);
      portal(98, R-5);
    } else if (L === 2) {
      // Void Fields: fake everything crumbles, chaotic
      plat(4, R-5, 3, 1); crystals(5, R-5, 2);
      for(let c=8;c<=13;c++) spike(c, R-2);
      crumble(14, R-7, 4); // fake safe
      for(let c=19;c<=24;c++) spike(c, R-2);
      plat(25, R-9, 3, 1); relic(26, R-9, 1); crystals(25, R-9, 2);
      crumble(29, R-6, 3);
      for(let c=33;c<=39;c++) spike(c, R-2);
      movH(40, R-8, 2, 5, 2.4);
      plat(47, R-6, 3, 1); key(48, R-6);
      for(let c=51;c<=57;c++) spike(c, R-2);
      crumble(58, R-9, 3);
      for(let c=62;c<=67;c++) spike(c, R-2);
      plat(68, R-7, 3, 1); relic(69, R-7, 2); crystals(68, R-7, 2); seed(70, R-7);
      movV(72, R-5, R-11, 2, 2.0);
      crumble(76, R-8, 3);
      for(let c=80;c<=85;c++) spike(c, R-2);
      plat(86, R-9, 4, 1); relic(88, R-9, 3); crystals(86, R-9, 2);
      powerup(92, R-8);
      for(let c=94;c<=97;c++) spike(c, R-2);
      plat(98, R-5, 4, 1); crystals(99, R-5, 2);
      portal(104, R-5);
    } else {
      // Void King Keep: maximum rage. All crumble, fast moving, spike gauntlets
      plat(4, R-5, 2, 1); crystals(5, R-5, 2);
      for(let c=7;c<=13;c++) spike(c, R-2);
      crumble(14, R-8, 2);
      for(let c=17;c<=23;c++) spike(c, R-2);
      movH(24, R-10, 1, 6, 3.0);
      plat(32, R-7, 2, 1); relic(33, R-7, 1);
      for(let c=35;c<=42;c++) spike(c, R-2);
      crumble(43, R-9, 2);
      for(let c=46;c<=52;c++) spike(c, R-2);
      movV(53, R-5, R-11, 1, 2.8);
      plat(56, R-8, 2, 1); key(57, R-8); crystals(56, R-8, 2);
      for(let c=59;c<=65;c++) spike(c, R-2);
      crumble(66, R-7, 2);
      for(let c=69;c<=76;c++) spike(c, R-2);
      plat(77, R-9, 2, 1); relic(78, R-9, 2); seed(79, R-9);
      for(let c=81;c<=87;c++) spike(c, R-2);
      crumble(88, R-7, 2);
      powerup(92, R-9);
      for(let c=94;c<=98;c++) spike(c, R-2);
      plat(99, R-5, 4, 1); relic(101, R-5, 3); crystals(99, R-5, 2);
      portal(106, R-5);
    }
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
    // Validates the tile directly below is solid ground before spawning
    const spawnEnemy = (col, row, type) => {
      // Check tile at spawn position and below
      const tileBelow = this.getTile(col, row + 1);
      const tileAt = this.getTile(col, row);
      // Don't spawn if there's no solid ground below or if spawn is in a solid tile
      if (!tileBelow || !tileBelow.solid) return;
      if (tileAt && tileAt.solid) return;
      this.game.enemies.push(new Enemy(this.game, col * 32, row * 32, type));
    };

    // Spawn rates/types based on worlds
    if (this.worldIndex === 1) {
      // Meadows: Pufflings and Thornbacks on main floor
      spawnEnemy(18, this.rows - 4, 'puffling');
      spawnEnemy(29, this.rows - 4, 'puffling');
      spawnEnemy(41, this.rows - 5, 'thornback');
      spawnEnemy(56, this.rows - 4, 'puffling');
      spawnEnemy(68, this.rows - 4, 'thornback');
      spawnEnemy(80, this.rows - 4, 'puffling');
    } 
    else if (this.worldIndex === 2) {
      // Caverns: Spitters and Burrowers — matching cavern platforms
      spawnEnemy(15, this.rows - 4, 'spitter');
      spawnEnemy(27, this.rows - 4, 'burrower');
      spawnEnemy(38, this.rows - 7, 'spitter');
      spawnEnemy(52, this.rows - 4, 'golem');
      spawnEnemy(65, this.rows - 4, 'burrower');
      spawnEnemy(79, this.rows - 4, 'spitter');
    }
    else if (this.worldIndex === 3) {
      // Peaks: Gliders and Sky Hunters on floating platforms
      // Spawn relative to floating platform rows, not floor
      spawnEnemy(9, this.rows - 7, 'glider');
      spawnEnemy(22, this.rows - 10, 'glider');
      spawnEnemy(35, this.rows - 9, 'skyhunter');
      spawnEnemy(51, this.rows - 8, 'glider');
      spawnEnemy(69, this.rows - 7, 'skyhunter');
    }
    else if (this.worldIndex === 4) {
      // Depths: Lava Warden elites on platforms between lava rivers
      spawnEnemy(17, this.rows - 4, 'spitter');
      spawnEnemy(30, this.rows - 5, 'lavawarden');
      spawnEnemy(46, this.rows - 4, 'spitter');
      spawnEnemy(65, this.rows - 4, 'lavawarden');
      spawnEnemy(80, this.rows - 4, 'spitter');
    }
    else if (this.worldIndex === 5) {
      // Expanse: Burrowers on icy flats (wide platforms, valid rows)
      spawnEnemy(17, this.rows - 4, 'burrower');
      spawnEnemy(38, this.rows - 5, 'golem');
      spawnEnemy(55, this.rows - 4, 'burrower');
      spawnEnemy(75, this.rows - 4, 'golem');
    }
    else if (this.worldIndex === 6) {
      // Shadows: Mix of elites on shadow platforms
      spawnEnemy(22, this.rows - 6, 'skyhunter');
      spawnEnemy(40, this.rows - 4, 'lavawarden');
      spawnEnemy(55, this.rows - 7, 'golem');
      spawnEnemy(72, this.rows - 4, 'skyhunter');
      spawnEnemy(88, this.rows - 4, 'lavawarden');
    }
  }

  update(dt) {
    const player = this.game.player;

    // ====== MOVING PLATFORMS ======
    for (let plat of this.movingPlatforms) {
      if (plat.startX === plat.endX) {
        plat.y += plat.speed * plat.dir;
        if (plat.y < Math.min(plat.startY, plat.endY) || plat.y > Math.max(plat.startY, plat.endY)) {
          plat.dir = -plat.dir;
        }
      } else {
        plat.x += plat.speed * plat.dir;
        if (plat.x < Math.min(plat.startX, plat.endX) || plat.x > Math.max(plat.startX, plat.endX)) {
          plat.dir = -plat.dir;
        }
      }
    }

    // ====== CRUMBLE PLATFORMS ======
    if (player && player.active) {
      for (let cp of this.crumblePlatforms) {
        if (cp.collapsed) continue;
        // Check if player is standing on it
        const platX = cp.startCol * this.tileSize;
        const platY = cp.row * this.tileSize;
        const platW = cp.len * this.tileSize;
        const playerOnIt = (
          player.x + player.width > platX &&
          player.x < platX + platW &&
          player.y + player.height >= platY &&
          player.y + player.height <= platY + this.tileSize + 4 &&
          player.vy >= 0
        );
        if (playerOnIt && !cp.crumbling) {
          cp.crumbling = true;
          this.game.camera.shake(80, 2);
        }
        if (cp.crumbling && !cp.collapsed) {
          cp.health -= dt;
          // Visual shake effect via camera when near-collapse
          if (cp.health < 600 && Math.random() < 0.15) {
            this.game.camera.shake(50, 1);
          }
          if (cp.health <= 0) {
            cp.collapsed = true;
            // Remove tiles
            for (let c = 0; c < cp.len; c++) {
              this.setTile(cp.startCol + c, cp.row, null);
            }
            this.game.camera.shake(200, 5);
            this.game.particles.spawnExplosion(
              platX + platW/2, platY, '#475569', 10
            );
          }
        }
      }
    }

    // ====== PROJECTILES ======
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (!p.active) this.projectiles.splice(i, 1);
    }

    // ====== RAGEBAIT: SURPRISE SPIKE BURSTS ======
    const isBossLevel = this.levelIndex === this.getMaxLevelsInWorld(this.worldIndex);
    if (!isBossLevel) {
      this.spikeTimer -= dt;
      if (this.spikeTimer <= 0) {
        // Rage event: 3 spikes near player position!
        if (player && player.active) {
          const baseCol = Math.floor(player.x / this.tileSize);
          for (let offset of [-2, 1, 4]) {
            const col = Math.max(2, Math.min(this.cols - 3, baseCol + offset));
            const existingTile = this.getTile(col, this.rows - 2);
            // Only place on floor tiles (not mid-air platforms)
            if (!existingTile || existingTile.type === 1) {
              this.setTile(col, this.rows - 2, 2);
              this.activeSpikes.push({ col, expire: this.spikeDuration });
            }
          }
          // Rage flash toast
          this.game.ui.triggerToast('⚠️ DANGER!');
        }
        this.spikeTimer = this.randomInterval(4000, 9000);
      }

      // Expire old spikes
      for (let i = this.activeSpikes.length - 1; i >= 0; i--) {
        const s = this.activeSpikes[i];
        s.expire -= dt;
        if (s.expire <= 0) {
          this.setTile(s.col, this.rows - 2, null); // Remove spike cleanly
          this.activeSpikes.splice(i, 1);
        }
      }

      // ====== RAGEBAIT: ENEMY SWARMS ======
      this.swarmTimer -= dt;
      if (this.swarmTimer <= 0 && player && player.active) {
        const hf = this.hardFactor || 1;
        const extra = Math.max(1, Math.ceil(hf * 1.5));
        // World-themed swarm type
        const worldEnemyTypes = {
          1: ['puffling', 'thornback'],
          2: ['spitter', 'burrower'],
          3: ['glider', 'skyhunter'],
          4: ['spitter', 'lavawarden'],
          5: ['burrower', 'golem'],
          6: ['skyhunter', 'lavawarden']
        };
        const types = worldEnemyTypes[this.worldIndex] || ['puffling'];
        // Spawn just off screen edges — feels like an ambush
        for (let i = 0; i < extra; i++) {
          const spawnLeft = Math.random() < 0.5;
          const spawnX = spawnLeft
            ? this.game.camera.x - 64
            : this.game.camera.x + this.game.width + 64;
          const type = types[Math.floor(Math.random() * types.length)];
          this.game.enemies.push(new Enemy(this.game, spawnX, (this.rows - 3) * this.tileSize, type));
        }
        this.game.ui.triggerToast('👾 AMBUSH!');
        this.game.camera.shake(300, 6);
        this.swarmTimer = this.randomInterval(14000, 22000);
      }
    }

    // ====== WORLD-SPECIFIC EFFECTS ======
    if (player && player.active) {
      // World 3: Wind gusts
      if (this.worldIndex === 3) {
        const windPhase = Math.sin(this.game.levelTime * 0.001);
        if (windPhase > 0.4) {
          player.vx -= 0.5;
          if (Math.random() < 0.15) {
            this.game.particles.spawnGlideFeathers(player.x + 80, player.y + Math.random() * 40, 1);
          }
        }
        // Sudden gust rage (5% chance per frame)
        if (Math.random() < 0.0008 * dt) {
          player.vx -= 3.5;
          this.game.ui.triggerToast('💨 GUST!');
          this.game.camera.shake(200, 4);
        }
      }

      // World 4: Lava slowly rises in boss level
      if (this.worldIndex === 4 && isBossLevel && this.lavaLevel !== null) {
        this.lavaLevel -= dt * 0.025;
        this.lavaLevel = Math.max(80, this.lavaLevel);
      }

      // World 5: Ice blizzard slows player
      if (this.worldIndex === 5) {
        if (Math.random() < 0.08) {
          this.game.particles.spawnSnow(
            this.game.camera.x + Math.random() * this.game.width,
            this.game.camera.y
          );
        }
        // Blizzard push (occasional)
        if (Math.random() < 0.0004 * dt) {
          player.vx -= 2.0;
          this.game.ui.triggerToast('🌨️ BLIZZARD!');
        }
      }

      // World 6: Shadow bubbles + screen distortion
      if (this.worldIndex === 6) {
        if (Math.random() < 0.06) {
          this.game.particles.spawnShadow(
            this.game.camera.x + Math.random() * this.game.width,
            this.game.camera.y + Math.random() * 200
          );
        }
      }
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
        grad.addColorStop(0.5, '#0ea5e9'); // vibrant blue
        grad.addColorStop(1, '#7dd3fc');
        break;
      case 2: // Caverns
        grad.addColorStop(0, '#0b001a'); // deep purple cavern glow
        grad.addColorStop(0.6, '#2e1065');
        grad.addColorStop(1, '#4c1d95');
        break;
      case 3: // Peaks
        grad.addColorStop(0, '#0f172a'); // sky storm
        grad.addColorStop(0.8, '#1e3a8a');
        grad.addColorStop(1, '#3b82f6');
        break;
      case 4: // Depths
        grad.addColorStop(0, '#270404'); // sulfur char
        grad.addColorStop(0.8, '#7f1d1d');
        grad.addColorStop(1, '#b91c1c');
        break;
      case 5: // Expanse
        grad.addColorStop(0, '#042f2e'); // dark teal
        grad.addColorStop(0.7, '#0d9488');
        grad.addColorStop(1, '#2dd4bf');
        break;
      case 6: // Shadows
        grad.addColorStop(0, '#0a0014'); // void abyss
        grad.addColorStop(0.6, '#4c0519');
        grad.addColorStop(1, '#831843');
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
      // scrollX represents how much the camera has moved
      const scrollX = camera.x * offsetFactor;
      
      ctx.beginPath();
      if (this.worldIndex === 2) {
        ctx.moveTo(0, 0);
      } else {
        ctx.moveTo(0, h);
      }
      
      for (let x = 0; x <= w + 40; x += 40) {
        let waveY;
        // Sample the wave at world coordinate (x + scrollX)
        const worldX = x + scrollX;
        
        if (this.worldIndex === 2) {
          waveY = 70 + Math.sin(worldX * 0.004) * 30;
          ctx.lineTo(x, waveY);
        } else {
          waveY = h - 110 + Math.sin(worldX * 0.007) * 25;
          ctx.lineTo(x, waveY);
        }
      }
      
      if (this.worldIndex === 2) {
        ctx.lineTo(w + 40, 0);
        ctx.lineTo(0, 0);
      } else {
        ctx.lineTo(w + 40, h);
        ctx.lineTo(0, h);
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

    // Pick base tile colors (Highly Vibrant)
    const colors = [
      "",
      ["#10b981", "#047857", "#6ee7b7", "#064e3b"], // W1 Meadows: Vibrant Emerald
      ["#8b5cf6", "#5b21b6", "#c4b5fd", "#2e1065"], // W2 Caverns: Radiant Indigo
      ["#f8fafc", "#94a3b8", "#ffffff", "#475569"], // W3 Peaks: Brilliant Marble
      ["#f97316", "#9a3412", "#fdba74", "#431407"], // W4 Depths: Blazing Magma
      ["#0ea5e9", "#0369a1", "#7dd3fc", "#082f49"], // W5 Expanse: Neon Ice
      ["#d946ef", "#86198f", "#f0abfc", "#4a044e"]  // W6 Shadows: Neon Void
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
