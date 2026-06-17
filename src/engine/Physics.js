export class Physics {
  // Constant Physics Properties
  static GRAVITY = 0.28;
  static TERMINAL_VELOCITY = 10;
  static GLIDE_GRAVITY = 0.05;
  static GLIDE_TERMINAL_VELOCITY = 1.5;

  static checkAABB(r1, r2) {
    return (
      r1.x < r2.x + r2.width &&
      r1.x + r1.width > r2.x &&
      r1.y < r2.y + r2.height &&
      r1.y + r1.height > r2.y
    );
  }

  // Resolves X/Y movements against tilemaps
  static resolveCollisions(entity, world) {
    entity.onGround = false;
    entity.onWall = false;
    entity.onWallSide = null; // 'left' or 'right'

    const tileSize = world.tileSize;

    // --- Resolve X Axis ---
    entity.x += entity.vx;
    let collisionsX = this.getTileCollisions(entity, world);
    
    for (let tile of collisionsX) {
      if (tile.solid) {
        if (entity.vx > 0) {
          // Colliding right wall
          entity.x = tile.col * tileSize - entity.width;
          entity.vx = 0;
          entity.onWall = true;
          entity.onWallSide = 'right';
        } else if (entity.vx < 0) {
          // Colliding left wall
          entity.x = (tile.col + 1) * tileSize;
          entity.vx = 0;
          entity.onWall = true;
          entity.onWallSide = 'left';
        }
      }
    }

    // --- Resolve Y Axis ---
    entity.y += entity.vy;
    let collisionsY = this.getTileCollisions(entity, world);
    
    for (let tile of collisionsY) {
      if (tile.solid) {
        if (entity.vy > 0) {
          // Colliding floor
          entity.y = tile.row * tileSize - entity.height;
          entity.vy = 0;
          entity.onGround = true;
        } else if (entity.vy < 0) {
          // Colliding ceiling
          entity.y = (tile.row + 1) * tileSize;
          entity.vy = 0;
        }
      }
    }
  }

  // Get all tiles overlapping the entity
  static getTileCollisions(entity, world) {
    const tileSize = world.tileSize;
    const collisions = [];

    // Calculate grid spans
    const startCol = Math.floor(entity.x / tileSize);
    const endCol = Math.floor((entity.x + entity.width - 0.1) / tileSize);
    const startRow = Math.floor(entity.y / tileSize);
    const endRow = Math.floor((entity.y + entity.height - 0.1) / tileSize);

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const tile = world.getTile(col, row);
        if (tile && tile.solid) {
          collisions.push({ col, row, solid: true });
        }
      }
    }

    return collisions;
  }
}
