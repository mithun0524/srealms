import './style.css';
import { Game } from './engine/Game.js';

// Initialize the game loop once DOM is ready
window.addEventListener('load', () => {
  const game = new Game();
  // Expose game instance for troubleshooting
  window.game = game;
});
