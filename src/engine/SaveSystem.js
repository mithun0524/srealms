export class SaveSystem {
  static KEY = 'skybound_realms_save_v1';

  static getDefaults() {
    return {
      highestUnlockedWorld: 1,
      highestUnlockedLevel: 1,
      shards: 0,
      unlockedAbilities: ['walk', 'run', 'jump', 'wallslide', 'walljump'],
      unlockedSkins: ['default'],
      unlockedCapes: ['none'],
      unlockedTrails: ['none'],
      unlockedPets: ['none'],
      equippedSkin: 'default',
      equippedCape: 'none',
      equippedTrail: 'none',
      equippedPet: 'none',
      selectedClass: 'skyrunner',
      unlockedClasses: ['skyrunner'],
      customColors: { primary: '#1e293b', secondary: '#0ea5e9', visor: '#22d3ee', accent: '#ffffff' },
      equippedHelmet: 'default',
      equippedArmor: 'default',
      unlockedHelmets: ['default'],
      unlockedArmors: ['default'],
      equippedWeapon: 'default',
      unlockedWeapons: ['default'],
      completedLevels: {}, // Format: { "w1-l1": { shards: 120, relics: 3, time: 240, grade: 'S' } }
      achievements: [], // List of achievement ids
      musicVolume: 0.7,
      sfxVolume: 0.8
    };
  }

  static load() {
    try {
      const data = localStorage.getItem(this.KEY);
      if (!data) {
        return this.getDefaults();
      }
      
      const parsed = JSON.parse(data);
      // Merge with defaults in case we added new fields
      return { ...this.getDefaults(), ...parsed };
    } catch (e) {
      console.error("Failed to load save data", e);
      return this.getDefaults();
    }
  }

  static save(saveData) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(saveData));
    } catch (e) {
      console.error("Failed to save data to localStorage", e);
    }
  }

  static reset() {
    try {
      localStorage.removeItem(this.KEY);
      return this.getDefaults();
    } catch (e) {
      console.error("Failed to reset save data", e);
      return this.getDefaults();
    }
  }
}
