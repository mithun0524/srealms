export class Input {
  constructor() {
    this.keys = {
      left: false,
      right: false,
      up: false,
      down: false,
      dash: false,
      interact: false
    };

    this.touchDevice = false;
    this.initKeyboardListeners();
    this.initTouchListeners();
    this.initGamepad();
  }

  initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
      this.handleKey(e.code, true);
    });

    window.addEventListener('keyup', (e) => {
      this.handleKey(e.code, false);
    });
  }

  handleKey(code, isPressed) {
    switch (code) {
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = isPressed;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = isPressed;
        break;
      case 'KeyW':
      case 'ArrowUp':
      case 'Space':
        this.keys.up = isPressed;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.down = isPressed;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.dash = isPressed;
        break;
      case 'KeyE':
        this.keys.interact = isPressed;
        break;
    }
  }

  initTouchListeners() {
    // Detect touch capability
    const enableTouch = () => {
      if (this.touchDevice) return;
      this.touchDevice = true;
      document.body.classList.add('touch-device');
    };

    window.addEventListener('touchstart', enableTouch, { once: true });

    // Touch controls elements
    const setupBtn = (id, keyName) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        enableTouch();
        this.keys[keyName] = true;
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.keys[keyName] = false;
      }, { passive: false });
    };

    setupBtn('ctrl-left', 'left');
    setupBtn('ctrl-right', 'right');
    setupBtn('ctrl-down', 'down');
    setupBtn('ctrl-dash', 'dash');
    setupBtn('ctrl-jump', 'up');
  }

  initGamepad() {
    // Simple Gamepad Poll
    this.gamepadIndex = null;
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
      }
    });
  }

  update() {
    // Poll Gamepad if active
    if (this.gamepadIndex !== null) {
      const gp = navigator.getGamepads()[this.gamepadIndex];
      if (gp) {
        // Left stick
        const axisX = gp.axes[0];
        const axisY = gp.axes[1];

        this.keys.left = axisX < -0.3;
        this.keys.right = axisX > 0.3;
        this.keys.down = axisY > 0.5;

        // Face buttons (A = 0, X = 2, Y = 3, B = 1)
        this.keys.up = gp.buttons[0].pressed; // A button: Jump
        this.keys.dash = gp.buttons[2].pressed; // X button: Dash
        this.keys.interact = gp.buttons[3].pressed; // Y button: Interact
      }
    }
  }

  reset() {
    for (let key in this.keys) {
      this.keys[key] = false;
    }
  }
}
