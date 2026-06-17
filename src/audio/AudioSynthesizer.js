export class AudioSynthesizer {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;

    // Music scheduling variables
    this.activeTrack = null;
    this.schedulerTimer = null;
    this.nextNoteTime = 0.0;
    this.currentBeat = 0;
    this.tempo = 110; // BPM
    this.lookahead = 25.0; // ms
    this.scheduleAheadTime = 0.1; // seconds

    // Setup interactive resume
    this.setupResumeOnInteraction();
  }

  init() {
    if (this.ctx) return;
    
    // Create AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Create Routing
    this.masterGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();

    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // Apply volumes from save
    this.updateVolume();

    // Start scheduler for music
    this.nextNoteTime = this.ctx.currentTime;
    this.schedulerTimer = setInterval(() => this.scheduler(), this.lookahead);
  }

  setupResumeOnInteraction() {
    const triggerInit = () => {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    };

    window.addEventListener('click', triggerInit);
    window.addEventListener('keydown', triggerInit);
    window.addEventListener('touchstart', triggerInit);
  }

  updateVolume() {
    if (!this.ctx) return;
    const save = this.game.saveData;
    this.musicGain.gain.value = save.musicVolume;
    this.sfxGain.gain.value = save.sfxVolume;
  }

  // --- SOUND EFFECTS SYNTHESIS ---
  playSFX(type) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const t = this.ctx.currentTime;

    switch (type) {
      case 'jump': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.exponentialRampToValueAtTime(450, t + 0.15);

        gain.gain.setValueAtTime(0.35, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.15);

        osc.start(t);
        osc.stop(t + 0.16);
        break;
      }
      case 'dash': {
        // Noise buffer for swoosh
        const bufferSize = this.ctx.sampleRate * 0.12;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, t);
        filter.frequency.exponentialRampToValueAtTime(200, t + 0.12);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.12);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        noise.start(t);
        noise.stop(t + 0.13);
        break;
      }
      case 'land': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.setValueAtTime(60, t + 0.04);

        gain.gain.setValueAtTime(0.4, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.08);

        osc.start(t);
        osc.stop(t + 0.09);
        break;
      }
      case 'shard': {
        // High crystal double chime
        const playChime = (pitch, delay) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(pitch, t + delay);
          gain.gain.setValueAtTime(0.18, t + delay);
          gain.gain.exponentialRampToValueAtTime(0.005, t + delay + 0.15);

          osc.start(t + delay);
          osc.stop(t + delay + 0.16);
        };
        playChime(880, 0); // A5
        playChime(1320, 0.04); // E6
        break;
      }
      case 'relic': {
        // Arpeggiated high melody
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t + idx * 0.06);
          gain.gain.setValueAtTime(0.2, t + idx * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.06 + 0.2);

          osc.start(t + idx * 0.06);
          osc.stop(t + idx * 0.06 + 0.22);
        });
        break;
      }
      case 'damage': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, t);
        osc.frequency.linearRampToValueAtTime(50, t + 0.2);

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.25);

        osc.start(t);
        osc.stop(t + 0.26);
        break;
      }
      case 'bounce': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.25);

        gain.gain.setValueAtTime(0.25, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.26);

        osc.start(t);
        osc.stop(t + 0.27);
        break;
      }
      case 'laser': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.3);

        gain.gain.setValueAtTime(0.15, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.35);

        osc.start(t);
        osc.stop(t + 0.36);
        break;
      }
      case 'victory': {
        // C Major upbeat chord run
        const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]; // C5, D5, E5, G5, A5, C6
        scale.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + idx * 0.08);
          gain.gain.setValueAtTime(0.15, t + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.08 + 0.25);

          osc.start(t + idx * 0.08);
          osc.stop(t + idx * 0.08 + 0.26);
        });
        break;
      }
      case 'victory_relic': {
        // Sparkly chime chord
        const scale = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
        scale.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain);
          gain.connect(this.sfxGain);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + idx * 0.04);
          gain.gain.setValueAtTime(0.12, t + idx * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.04 + 0.35);

          osc.start(t + idx * 0.04);
          osc.stop(t + idx * 0.04 + 0.36);
        });
        break;
      }
      case 'explosion': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.linearRampToValueAtTime(30, t + 0.4);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, t);

        gain.gain.setValueAtTime(0.5, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.5);

        osc.connect(filter);
        filter.connect(gain);
        
        osc.start(t);
        osc.stop(t + 0.51);
        break;
      }
    }
  }

  // --- MUSIC SEQUENCER SYSTEM ---
  playMusic(track) {
    if (this.activeTrack === track) return;
    this.activeTrack = track;
    this.currentBeat = 0;

    if (this.ctx) {
      this.nextNoteTime = this.ctx.currentTime;
    }
  }

  scheduler() {
    if (!this.ctx || !this.activeTrack || this.activeTrack === 'none') return;

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentBeat, this.nextNoteTime);
      this.advanceBeat();
    }
  }

  advanceBeat() {
    const secondsPerBeat = 60.0 / this.tempo;
    this.nextNoteTime += 0.25 * secondsPerBeat; // 16th notes
    this.currentBeat = (this.currentBeat + 1) % 16;
  }

  scheduleNote(beat, time) {
    switch (this.activeTrack) {
      case 'title':
        this.synthTitleTrack(beat, time);
        break;
      case 'map':
        this.synthMapTrack(beat, time);
        break;
      case 'w1':
        this.synthGrassTrack(beat, time);
        break;
      case 'w2':
        this.synthCaveTrack(beat, time);
        break;
      case 'w3':
        this.synthWindTrack(beat, time);
        break;
      case 'w4':
        this.synthLavaTrack(beat, time);
        break;
      case 'w5':
        this.synthIceTrack(beat, time);
        break;
      case 'w6':
        this.synthShadowTrack(beat, time);
        break;
    }
  }

  // Helper synth notes
  playMelodyNote(freq, type, duration, volume, time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.005, time + duration - 0.01);

    osc.start(time);
    osc.stop(time + duration);
  }

  // Synthesize World 1 Theme (Meadows - Cheerful Major progression)
  synthGrassTrack(beat, time) {
    // BPM 120
    const bassline = [130.81, 130.81, 146.83, 164.81, 174.61, 174.61, 196.00, 196.00]; // C3, C3, D3, E3, F3, F3, G3, G3
    const chords = [
      [261.63, 329.63, 392.00], // C Maj
      [261.63, 329.63, 392.00],
      [293.66, 349.23, 440.00], // D Min
      [329.63, 392.00, 493.88], // E Min
      [349.23, 440.00, 523.25], // F Maj
      [349.23, 440.00, 523.25],
      [392.00, 493.88, 587.33], // G Maj
      [392.00, 493.88, 587.33]
    ];
    // Bass on beats 0, 4, 8, 12
    if (beat % 4 === 0) {
      const bassNote = bassline[Math.floor(beat / 2) % bassline.length];
      this.playMelodyNote(bassNote, 'triangle', 0.25, 0.16, time);
      
      // Kick drum
      this.playMelodyNote(60, 'sine', 0.1, 0.25, time);
    }

    // Snare drum on 4, 12
    if (beat === 4 || beat === 12) {
      // Snare hiss (noise-like triangle splash)
      this.playMelodyNote(220, 'triangle', 0.08, 0.1, time);
    }

    // Arpeggio pattern
    const arpNotes = chords[Math.floor(beat / 2) % chords.length];
    const note = arpNotes[beat % arpNotes.length];
    if (beat % 2 === 0) {
      this.playMelodyNote(note, 'sine', 0.15, 0.08, time);
    }
  }

  // Synthesize World 2 Theme (Caverns - Echoey, dark ambient)
  synthCaveTrack(beat, time) {
    const scale = [220.00, 261.63, 293.66, 329.63, 392.00]; // A Minor Pentatonic
    
    // Slow bass
    if (beat === 0) {
      this.playMelodyNote(110.00, 'sine', 1.2, 0.2, time); // A2
    } else if (beat === 8) {
      this.playMelodyNote(130.81, 'sine', 1.2, 0.2, time); // C3
    }

    // Sparse melody beats
    if (beat === 2 || beat === 6 || beat === 11 || beat === 14) {
      const note = scale[(beat * 3) % scale.length];
      // Echo chime
      this.playMelodyNote(note * 2, 'sine', 0.4, 0.06, time);
      this.playMelodyNote(note * 2, 'sine', 0.3, 0.03, time + 0.15); // Echo 1
    }
  }

  // Synthesize World 3 Theme (Peaks - High-pass winds and fast arps)
  synthWindTrack(beat, time) {
    const scale = [293.66, 329.63, 349.23, 392.00, 440.00, 523.25]; // D Minor
    // Fast running 16ths
    const note = scale[(beat * 7) % scale.length];
    this.playMelodyNote(note, 'triangle', 0.08, 0.06, time);

    // Rapid kick pattern
    if (beat % 8 === 0 || beat === 6) {
      this.playMelodyNote(65, 'sine', 0.08, 0.22, time);
    }
  }

  // Synthesize World 4 Theme (Depths - Volcanic intense drums and phrygian riffs)
  synthLavaTrack(beat, time) {
    const scale = [146.83, 155.56, 185.00, 196.00, 220.00, 293.66]; // D Phrygian Dominant
    
    // Heavy bass on every 3rd step (polyrhythm)
    if (beat % 3 === 0) {
      const note = scale[Math.floor(beat / 3) % scale.length];
      this.playMelodyNote(note, 'sawtooth', 0.15, 0.12, time);
    }

    // Heavy kick and snare
    if (beat % 4 === 0) {
      this.playMelodyNote(55, 'sine', 0.12, 0.3, time); // Heavy Kick
    }
    if (beat === 4 || beat === 12) {
      this.playMelodyNote(180, 'sawtooth', 0.08, 0.1, time); // Harsh Snare
    }
  }

  // Synthesize World 5 Theme (Frozen Expanse - High bell pentatonics)
  synthIceTrack(beat, time) {
    const bells = [523.25, 587.33, 659.25, 783.99, 880.00]; // C Major pentatonic high
    
    if (beat % 4 === 0) {
      // Slow deep pad
      this.playMelodyNote(130.81, 'sine', 1.0, 0.15, time);
    }

    // High bell tones
    if (beat % 2 === 1) {
      const idx = (beat * 2) % bells.length;
      this.playMelodyNote(bells[idx] * 2, 'sine', 0.3, 0.07, time);
    }
  }

  // Synthesize World 6 Theme (Shadows - Drones and detuned synth tones)
  synthShadowTrack(beat, time) {
    // Detuned lower oscillators
    if (beat === 0) {
      this.playMelodyNote(73.42, 'sawtooth', 1.5, 0.1, time); // D2
      this.playMelodyNote(74.00, 'sawtooth', 1.5, 0.1, time); // Detuned
    } else if (beat === 8) {
      this.playMelodyNote(65.41, 'sawtooth', 1.5, 0.1, time); // C2
      this.playMelodyNote(66.00, 'sawtooth', 1.5, 0.1, time); // Detuned
    }

    // Ghost notes
    if (beat === 4 || beat === 12) {
      this.playMelodyNote(311.13, 'sine', 0.4, 0.04, time); // Eb4 (Minor 2nd feel)
    }
  }

  // Title Screen Loop
  synthTitleTrack(beat, time) {
    const chords = [
      [261.63, 329.63, 392.00, 523.25], // C Major
      [293.66, 349.23, 440.00, 587.33], // D minor
      [349.23, 440.00, 523.25, 698.46], // F Major
      [392.00, 493.88, 587.33, 783.99]  // G Major
    ];

    const chord = chords[Math.floor(beat / 4) % chords.length];
    
    // Slow bass
    if (beat % 8 === 0) {
      this.playMelodyNote(chord[0] / 2, 'sine', 1.2, 0.18, time);
    }

    // Peaceful arpeggio
    if (beat % 2 === 0) {
      const note = chord[Math.floor(beat / 2) % chord.length];
      this.playMelodyNote(note, 'sine', 0.3, 0.07, time);
    }
  }

  // Level Map loop
  synthMapTrack(beat, time) {
    const scale = [261.63, 329.63, 392.00, 523.25];
    if (beat % 4 === 0) {
      this.playMelodyNote(scale[Math.floor(beat / 4) % scale.length], 'sine', 0.5, 0.1, time);
    }
  }
}
