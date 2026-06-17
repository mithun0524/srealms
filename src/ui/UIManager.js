import { SaveSystem } from '../engine/SaveSystem.js';

export class UIManager {
  constructor(game) {
    this.game = game;

    // Cache elements
    this.screens = {
      title: document.getElementById('title-screen'),
      map: document.getElementById('level-select-screen'),
      shop: document.getElementById('shop-screen'),
      achievements: document.getElementById('achievements-screen'),
      pause: document.getElementById('pause-screen'),
      settings: document.getElementById('settings-screen'),
      gameover: document.getElementById('game-over-screen'),
      victory: document.getElementById('victory-screen')
    };

    // HUD Cache
    this.hud = {
      overlay: document.getElementById('hud-overlay'),
      shards: document.getElementById('hud-shards-count'),
      timer: document.getElementById('hud-timer'),
      key: document.getElementById('hud-key'),
      relic1: document.getElementById('hud-relic-1'),
      relic2: document.getElementById('hud-relic-2'),
      relic3: document.getElementById('hud-relic-3'),
      energy: document.getElementById('hud-energy')
    };

    // Shop active tab
    this.activeShopTab = 'skins';

    this.initListeners();
    this.updateScreens();
  }

  // --- BUTTON CLICKS INTEGRATION ---
  initListeners() {
    // Title buttons
    document.getElementById('btn-play').addEventListener('click', () => this.game.changeState('map'));
    document.getElementById('btn-shop').addEventListener('click', () => {
      this.activeShopTab = 'skins';
      this.game.changeState('shop');
    });
    document.getElementById('btn-achievements').addEventListener('click', () => this.game.changeState('achievements'));
    document.getElementById('btn-settings').addEventListener('click', () => this.game.changeState('settings'));

    // Back buttons
    document.getElementById('btn-level-back').addEventListener('click', () => this.game.changeState('title'));
    document.getElementById('btn-shop-back').addEventListener('click', () => this.game.changeState('title'));
    document.getElementById('btn-achievements-back').addEventListener('click', () => this.game.changeState('title'));
    document.getElementById('btn-settings-back').addEventListener('click', () => {
      // Save settings
      this.game.saveData.musicVolume = parseFloat(document.getElementById('slider-music').value) / 100;
      this.game.saveData.sfxVolume = parseFloat(document.getElementById('slider-sfx').value) / 100;
      SaveSystem.save(this.game.saveData);
      
      // Update volumes
      this.game.audio.updateVolume();

      // Return to prev screen
      if (this.game.state === 'settings') {
        this.game.changeState('title');
      } else {
        // Was paused
        this.game.changeState('paused');
      }
    });

    // Pause panel
    document.getElementById('btn-resume').addEventListener('click', () => this.game.changeState('playing'));
    document.getElementById('btn-restart').addEventListener('click', () => this.game.restartLevel());
    document.getElementById('btn-pause-settings').addEventListener('click', () => {
      this.game.changeState('settings');
      // Load current slider values
      document.getElementById('slider-music').value = Math.floor(this.game.saveData.musicVolume * 100);
      document.getElementById('slider-sfx').value = Math.floor(this.game.saveData.sfxVolume * 100);
    });
    document.getElementById('btn-quit').addEventListener('click', () => this.game.changeState('map'));

    // Game Over Retry
    document.getElementById('btn-go-retry').addEventListener('click', () => this.game.restartLevel());
    document.getElementById('btn-go-map').addEventListener('click', () => this.game.changeState('map'));

    // Victory Back
    document.getElementById('btn-vic-next').addEventListener('click', () => this.game.nextLevel());
    document.getElementById('btn-vic-map').addEventListener('click', () => this.game.changeState('map'));

    // Keyboard ESC pauses game
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.game.state === 'playing') {
          this.game.changeState('paused');
        } else if (this.game.state === 'paused') {
          this.game.changeState('playing');
        }
      }
    });

    // Shop tab switching
    const tabs = document.querySelectorAll('.shop-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.activeShopTab = e.target.getAttribute('data-tab');
        this.populateShopGrid();
      });
    });

    // Sliders text update
    const setupSliderVal = (sliderId, textId) => {
      const slider = document.getElementById(sliderId);
      const text = document.getElementById(textId);
      slider.addEventListener('input', () => {
        text.innerText = `${slider.value}%`;
      });
    };
    setupSliderVal('slider-music', 'music-volume-val');
    setupSliderVal('slider-sfx', 'sfx-volume-val');

    // Fullscreen Toggle
    const btnFullscreen = document.getElementById('btn-toggle-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(err => {
            this.triggerToast("Fullscreen mode is blocked by browser policies.");
            console.error(err);
          });
        } else {
          document.exitFullscreen();
        }
      });
    }
  }

  // --- SCREEN ACTIVE STATES TOGGLE ---
  updateScreens() {
    // Hide all
    for (let key in this.screens) {
      if (this.screens[key]) this.screens[key].classList.remove('active');
    }

    // Show active screen
    const activeScreen = this.screens[this.game.state];
    if (activeScreen) {
      activeScreen.classList.add('active');
    }

    // HUD visibility
    if (this.game.state === 'playing' || this.game.state === 'paused') {
      this.hud.overlay.classList.add('active');
    } else {
      this.hud.overlay.classList.remove('active');
    }

    // Trigger lists populate
    if (this.game.state === 'map') {
      this.populateRealmsMap();
    } else if (this.game.state === 'shop') {
      this.populateShopGrid();
    } else if (this.game.state === 'achievements') {
      this.populateAchievementsList();
    } else if (this.game.state === 'settings') {
      // Load volume slider positions
      document.getElementById('slider-music').value = Math.floor(this.game.saveData.musicVolume * 100);
      document.getElementById('slider-sfx').value = Math.floor(this.game.saveData.sfxVolume * 100);
      document.getElementById('music-volume-val').innerText = `${Math.floor(this.game.saveData.musicVolume * 100)}%`;
      document.getElementById('sfx-volume-val').innerText = `${Math.floor(this.game.saveData.sfxVolume * 100)}%`;
    }
  }

  // --- HUD RE-RENDERS ---
  updateHUD() {
    if (!this.game.player) return;

    // Heart container nodes
    const healthDiv = document.getElementById('hud-health');
    healthDiv.innerHTML = '';
    
    for (let i = 1; i <= this.game.player.maxHealth; i++) {
      const heart = document.createElement('div');
      heart.className = 'heart-seed';
      if (i > this.game.player.health) {
        heart.classList.add('lost');
      } else if (this.game.player.health === 1) {
        // Low health pulsing
        heart.classList.add('pulse');
      }
      healthDiv.appendChild(heart);
    }

    // Shards Count
    this.hud.shards.innerText = this.game.levelShards;

    // Relics Collectibles
    const updateRelicNode = (node, collected) => {
      if (collected) {
        node.classList.add('collected');
      } else {
        node.classList.remove('collected');
      }
    };
    updateRelicNode(this.hud.relic1, this.game.levelRelics >= 1);
    updateRelicNode(this.hud.relic2, this.game.levelRelics >= 2);
    updateRelicNode(this.hud.relic3, this.game.levelRelics === 3);

    // Realm Key Collected state
    if (this.game.levelKey) {
      this.hud.key.classList.add('collected');
    } else {
      this.hud.key.classList.remove('collected');
    }

    // Active abilities icons highlight
    const updateAbilityIcon = (id, skill) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (this.game.saveData.unlockedAbilities.includes(skill)) {
        el.classList.add('unlocked');
      } else {
        el.classList.remove('unlocked');
      }
    };
    
    updateAbilityIcon('hud-ability-dash', 'dash');
    updateAbilityIcon('hud-ability-doublejump', 'doublejump');
    updateAbilityIcon('hud-ability-glide', 'glide');
    updateAbilityIcon('hud-ability-pound', 'pound');
    updateAbilityIcon('hud-ability-airdash', 'airdash');
  }

  updateHUDEnergy() {
    if (!this.game.player) return;
    this.hud.energy.style.width = `${(this.game.player.energy / this.game.player.maxEnergy) * 100}%`;
  }

  updateHUDTimer() {
    const totalSecs = Math.floor(this.game.levelTime / 1000);
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    this.hud.timer.innerText = `${m}:${s}`;
  }

  updateHUDPowerUps() {
    const updateIconCooldown = (id, type) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (this.game.player.powerups.has(type)) {
        el.classList.add('unlocked');
        el.classList.add('cooldown');
        const p = this.game.player.powerups.get(type);
        el.style.setProperty('--cd-time', `${p.duration / 1000}s`);
      } else {
        el.classList.remove('cooldown');
      }
    };
    updateIconCooldown('hud-ability-dash', 'wind'); // Wind feather maps to dash/glide visuals
  }

  // --- MAP SCREEN GENERATION ---
  populateRealmsMap() {
    const container = document.getElementById('realms-map-container');
    container.innerHTML = '';

    // Show shard balance
    document.getElementById('level-crystal-count').innerText = this.game.saveData.shards;

    const worldsData = [
      { id: 1, name: "Emerald Meadows", subtitle: "World 1", levels: ["Meadow Trail", "Windmill Ridge", "Blossom Valley", "Hidden Burrows", "Guardian Arena"] },
      { id: 2, name: "Crystal Caverns", subtitle: "World 2", levels: ["Cavern Path", "Glow Chambers", "Crystal Serpent"] },
      { id: 3, name: "Skyforge Peaks", subtitle: "World 3", levels: ["Peak Ascent", "Gale Cliffs", "Storm Roc Nest"] },
      { id: 4, name: "Molten Depths", subtitle: "World 4", levels: ["Volcanic Vent", "Magma Rivers", "Inferno Arena"] },
      { id: 5, name: "Frozen Expanse", subtitle: "World 5", levels: ["Snow Valley", "Ice Fortress", "Mammoth Den"] },
      { id: 6, name: "Shadow Realm", subtitle: "World 6", levels: ["Shadow Rift", "Void Fields", "Void King Keep"] }
    ];

    const save = this.game.saveData;

    worldsData.forEach(world => {
      const card = document.createElement('div');
      card.className = `glass-panel world-card w${world.id}`;
      
      const title = document.createElement('h3');
      title.className = 'world-title';
      title.innerText = world.name;

      const subtitle = document.createElement('span');
      subtitle.className = 'world-subtitle';
      subtitle.innerText = world.subtitle;

      card.appendChild(title);
      card.appendChild(subtitle);

      const list = document.createElement('div');
      list.className = 'levels-list';

      world.levels.forEach((lvlName, idx) => {
        const lvlNum = idx + 1;
        const node = document.createElement('div');
        node.className = 'level-node';

        // Check if level is locked
        let locked = false;
        if (world.id > save.highestUnlockedWorld) {
          locked = true;
        } else if (world.id === save.highestUnlockedWorld && lvlNum > save.highestUnlockedLevel) {
          locked = true;
        }

        if (locked) {
          node.classList.add('locked');
          node.innerHTML = `
            <span class="level-name">${lvlNum}. Locked</span>
            <span class="level-status">🔒</span>
          `;
        } else {
          // Check completed record
          const lvlKey = `w${world.id}-l${lvlNum}`;
          const record = save.completedLevels[lvlKey];

          let statusText = 'Play';
          if (record) {
            node.classList.add('completed');
            statusText = `Grade ${record.grade}`;
          }

          // Pulse if latest active unlocked level
          if (world.id === save.highestUnlockedWorld && lvlNum === save.highestUnlockedLevel) {
            node.classList.add('active-node');
            statusText = 'NEW';
          }

          node.innerHTML = `
            <span class="level-name">${lvlNum}. ${lvlName}</span>
            <span class="level-status">${statusText}</span>
          `;

          node.addEventListener('click', () => {
            this.game.currentWorldIndex = world.id;
            this.game.currentLevelIndex = lvlNum;
            this.game.changeState('playing');
          });
        }

        list.appendChild(node);
      });

      card.appendChild(list);
      container.appendChild(card);
    });
  }

  // --- SHOP SCREEN LISTINGS ---
  populateShopGrid() {
    const grid = document.getElementById('shop-items-grid');
    grid.innerHTML = '';

    // Shard count update
    document.getElementById('shop-crystal-count').innerText = this.game.saveData.shards;

    // Items list database
    const itemsData = {
      skins: [
        { id: 'default', name: 'Skyrunner Blue', desc: 'Standard cyan explorer tunic.', cost: 0 },
        { id: 'sky_warden', name: 'Sky Warden', desc: 'Premium deep blue sentinel uniform.', cost: 100 },
        { id: 'meadow_sprite', name: 'Meadow Sprite', desc: 'Vibrant grasslands design.', cost: 150 },
        { id: 'crimson_ember', name: 'Crimson Ember', desc: 'Fire-themed battle gear.', cost: 200 },
        { id: 'shadow_stalker', name: 'Shadow Stalker', desc: 'Corrupted void fabrics.', cost: 250 },
        { id: 'gold_explorer', name: 'Gold Explorer', desc: 'Precious solid-gold tunic.', cost: 400 }
      ],
      capes: [
        { id: 'none', name: 'No Cape', desc: 'Travel light without capes.', cost: 0 },
        { id: 'wind_cape', name: 'Wind Cape', desc: 'Translucent white tail-wind ribbon.', cost: 100 },
        { id: 'fire_trail', name: 'Fire Cape', desc: 'Scorched crimson trails.', cost: 150 },
        { id: 'crystal_wing', name: 'Crystal Wing', desc: 'Glowing turquoise crystal cape.', cost: 200 }
      ],
      trails: [
        { id: 'none', name: 'Dust Trail', desc: 'Default grey dust particles.', cost: 0 },
        { id: 'sparkle', name: 'Gold Sparkle', desc: 'Leaves gold glitter stars behind.', cost: 80 },
        { id: 'fire', name: 'Ember Fire', desc: 'Active flaming smoke trails.', cost: 120 },
        { id: 'ice', name: 'Snow Flakes', desc: 'Crisp falling icicle pixels.', cost: 120 },
        { id: 'shadow', name: 'Void Shadows', desc: 'Dark void dust trails.', cost: 150 }
      ],
      pets: [
        { id: 'none', name: 'No Pet', desc: 'Restores the realm alone.', cost: 0 },
        { id: 'puffling_pet', name: 'Puffling Companion', desc: 'Small bouncing purple critter.', cost: 180 },
        { id: 'tiny_golem', name: 'Golem Pet', desc: 'Tiny rock pet with glowing visor.', cost: 220 },
        { id: 'wisp', name: 'Glowing Wisp', desc: 'Yellow aura energy wisp.', cost: 280 }
      ]
    };

    const currentCategory = itemsData[this.activeShopTab];
    const save = this.game.saveData;

    currentCategory.forEach(item => {
      const card = document.createElement('div');
      card.className = 'glass-panel shop-item';

      // Preview circles
      const preview = document.createElement('div');
      preview.className = 'shop-item-preview';
      
      // Simple preview dot showing color representation
      const colorDot = document.createElement('div');
      colorDot.style.width = '24px';
      colorDot.style.height = '24px';
      colorDot.style.borderRadius = '50%';
      
      if (this.activeShopTab === 'skins') {
        const colors = { default: '#0ea5e9', sky_warden: '#3b82f6', meadow_sprite: '#10b981', crimson_ember: '#ef4444', shadow_stalker: '#8b5cf6', gold_explorer: '#eab308' };
        colorDot.style.backgroundColor = colors[item.id] || '#fff';
      } else if (this.activeShopTab === 'capes') {
        const colors = { none: 'transparent', wind_cape: '#fff', fire_trail: '#ef4444', crystal_wing: '#06b6d4' };
        colorDot.style.backgroundColor = colors[item.id] || '#fff';
      } else if (this.activeShopTab === 'trails') {
        const colors = { none: '#7f8c8d', sparkle: '#eab308', fire: '#f97316', ice: '#06b6d4', shadow: '#d946ef' };
        colorDot.style.backgroundColor = colors[item.id] || '#fff';
      } else {
        const colors = { none: 'transparent', puffling_pet: '#c084fc', tiny_golem: '#94a3b8', wisp: '#fef08a' };
        colorDot.style.backgroundColor = colors[item.id] || '#fff';
      }
      
      preview.appendChild(colorDot);

      const title = document.createElement('span');
      title.className = 'shop-item-name';
      title.innerText = item.name;

      const desc = document.createElement('span');
      desc.className = 'shop-item-desc';
      desc.innerText = item.desc;

      const btn = document.createElement('button');
      btn.className = 'shop-item-btn';

      // Check item ownership state
      const saveUnlocks = { skins: 'unlockedSkins', capes: 'unlockedCapes', trails: 'unlockedTrails', pets: 'unlockedPets' };
      const saveEquipped = { skins: 'equippedSkin', capes: 'equippedCape', trails: 'equippedTrail', pets: 'equippedPet' };
      
      const unlockedList = save[saveUnlocks[this.activeShopTab]];
      const equippedId = save[saveEquipped[this.activeShopTab]];

      const isOwned = unlockedList.includes(item.id);
      const isEquipped = equippedId === item.id;

      if (isEquipped) {
        btn.className += ' equipped';
        btn.innerText = 'Equipped';
      } else if (isOwned) {
        btn.className += ' equip';
        btn.innerText = 'Equip';
        btn.addEventListener('click', () => {
          save[saveEquipped[this.activeShopTab]] = item.id;
          SaveSystem.save(save);
          this.game.audio.playSFX('victory_relic');
          this.populateShopGrid();
        });
      } else {
        btn.className += ' buy';
        btn.innerText = `${item.cost} Shards`;
        btn.addEventListener('click', () => {
          if (save.shards >= item.cost) {
            save.shards -= item.cost;
            unlockedList.push(item.id);
            SaveSystem.save(save);
            this.game.audio.playSFX('victory');
            this.populateShopGrid();
          } else {
            this.triggerToast("Not enough Crystal Shards!");
          }
        });
      }

      card.appendChild(preview);
      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(btn);

      grid.appendChild(card);
    });
  }

  // --- ACHIEVEMENTS RENDER ---
  populateAchievementsList() {
    const list = document.getElementById('achievements-list');
    list.innerHTML = '';

    const listData = [
      { id: 'first_steps', title: 'First Steps', desc: 'Successfully restore the portal in Meadow Trail (Level 1-1).', badge: '🌱' },
      { id: 'crystal_collector', title: 'Crystal Collector', desc: 'Collect a lifetime total of 1,000 crystal shards.', badge: '💎' },
      { id: 'speed_demon', title: 'Speed Demon', desc: 'Complete any level faster than the speedrun target time.', badge: '⚡' },
      { id: 'secret_hunter', title: 'Secret Hunter', desc: 'Discover all 3 hidden Ancient Relics in a single level.', badge: '🏺' },
      { id: 'untouchable', title: 'Untouchable', desc: 'Finish any realm level without taking any damage.', badge: '👑' },
      { id: 'realm_savior', title: 'Realm Savior', desc: 'Defeat The Void King in the Shadow Realm and restore balance.', badge: '🌌' }
    ];

    const save = this.game.saveData;

    listData.forEach(ach => {
      const card = document.createElement('div');
      card.className = 'glass-panel achievement-card';

      const isUnlocked = save.achievements.includes(ach.id);
      if (isUnlocked) {
        card.classList.add('unlocked');
      } else {
        card.classList.add('locked');
      }

      const badge = document.createElement('div');
      badge.className = 'achievement-badge';
      badge.innerText = isUnlocked ? ach.badge : '❓';

      const info = document.createElement('div');
      info.className = 'achievement-info';
      
      const title = document.createElement('h4');
      title.className = 'achievement-title';
      title.innerText = ach.title;

      const desc = document.createElement('p');
      desc.className = 'achievement-desc';
      desc.innerText = ach.desc;

      info.appendChild(title);
      info.appendChild(desc);

      const status = document.createElement('span');
      status.className = 'achievement-status-tag';
      status.innerText = isUnlocked ? 'UNLOCKED' : 'LOCKED';

      card.appendChild(badge);
      card.appendChild(info);
      card.appendChild(status);

      list.appendChild(card);
    });
  }

  // --- VICTORY & GAME OVER DISPLAY BINDINGS ---
  showVictoryScreen(grade, shards, relics, timeSec, bonus, unlockedAbility) {
    document.getElementById('vic-grade').innerText = grade;
    document.getElementById('vic-shards').innerText = `${shards} saved`;
    document.getElementById('vic-relics').innerText = `${relics}/3 found`;
    
    const m = Math.floor(timeSec / 60).toString().padStart(2, '0');
    const s = (timeSec % 60).toString().padStart(2, '0');
    document.getElementById('vic-time').innerText = `${m}:${s}`;
    
    document.getElementById('vic-bonus').innerText = `+${bonus}`;

    const unlockBox = document.getElementById('vic-unlock-container');
    const unlockVal = document.getElementById('vic-unlock-name');
    
    if (unlockedAbility) {
      unlockBox.style.display = 'block';
      
      const labels = {
        dash: 'Air Dash (Shift)',
        doublejump: 'Double Jump (Space in air)',
        glide: 'Glide (Hold Space)',
        pound: 'Ground Pound (S in air)',
        airdash: 'Air Dash (Extra Dash)'
      };
      
      unlockVal.innerText = labels[unlockedAbility] || unlockedAbility.toUpperCase();
    } else {
      unlockBox.style.display = 'none';
    }
  }

  showGameOverScreen(shards, relics) {
    document.getElementById('go-shards').innerText = shards;
    document.getElementById('go-relics').innerText = `${relics}/3`;
  }

  // --- NOTIFICATION TOAST POPUPS ---
  triggerToast(msg) {
    const toast = document.createElement('div');
    toast.style.position = 'absolute';
    toast.style.bottom = '24px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '10px 24px';
    toast.style.borderRadius = '24px';
    toast.style.background = 'rgba(239, 68, 68, 0.9)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    toast.style.color = '#fff';
    toast.style.fontFamily = 'var(--font-display)';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '999';
    toast.style.backdropFilter = 'blur(8px)';
    toast.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    toast.innerText = msg;

    const app = document.getElementById('app');
    app.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 500);
    }, 2000);
  }

  triggerAchievementToast(id) {
    const titles = {
      first_steps: 'First Steps',
      crystal_collector: 'Crystal Collector',
      speed_demon: 'Speed Demon',
      secret_hunter: 'Secret Hunter',
      untouchable: 'Untouchable',
      realm_savior: 'Realm Savior'
    };

    const toast = document.createElement('div');
    toast.className = 'glass-panel glow-purple';
    toast.style.position = 'absolute';
    toast.style.top = '24px';
    toast.style.right = '24px';
    toast.style.padding = '14px 20px';
    toast.style.zIndex = '999';
    toast.style.display = 'flex';
    toast.style.flexDirection = 'column';
    toast.style.gap = '2px';
    toast.style.width = '240px';
    toast.style.animation = 'scaleBounce 0.4s forwards';

    toast.innerHTML = `
      <span style="font-size: 0.75rem; text-transform: uppercase; color: var(--accent-gold); font-weight: bold; letter-spacing: 0.05em;">Achievement Unlocked!</span>
      <span style="font-family: var(--font-display); font-size: 1.1rem; font-weight: bold;">${titles[id]}</span>
    `;

    const app = document.getElementById('app');
    app.appendChild(toast);
    this.game.audio.playSFX('victory');

    setTimeout(() => {
      toast.style.transition = 'opacity 0.6s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 600);
    }, 3500);
  }
}
