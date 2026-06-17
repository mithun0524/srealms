export class Camera {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.x = 0;
    this.y = 0;
    this.target = null;
    
    // Bounds limit (level size)
    this.minX = 0;
    this.minY = 0;
    this.maxX = 0;
    this.maxY = 0;
    
    // Lerp speeds
    this.lerpSpeed = 0.08;
    
    // Screen shake variables
    this.shakeDuration = 0;
    this.shakeIntensity = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
  }

  setTarget(target) {
    this.target = target;
    if (this.target) {
      this.x = this.target.x - this.width / 2;
      this.y = this.target.y - this.height / 2;
    }
  }

  setBounds(minX, minY, maxX, maxY) {
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX - this.width;
    this.maxY = maxY - this.height;
  }

  shake(duration = 200, intensity = 4) {
    this.shakeDuration = duration;
    this.shakeIntensity = intensity;
  }

  update(deltaTime) {
    if (this.target) {
      // Find desired position (center on target)
      const targetX = this.target.x + this.target.width / 2 - this.width / 2;
      const targetY = this.target.y + this.target.height / 2 - this.height / 2;
      
      // Lerp camera coordinates
      this.x += (targetX - this.x) * this.lerpSpeed;
      this.y += (targetY - this.y) * this.lerpSpeed;
    }

    // Clamp camera within level bounds
    this.x = Math.max(this.minX, Math.min(this.maxX, this.x));
    this.y = Math.max(this.minY, Math.min(this.maxY, this.y));

    // Handle screen shake duration decrements
    if (this.shakeDuration > 0) {
      this.shakeDuration -= deltaTime;
      this.shakeOffsetX = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.shakeOffsetY = (Math.random() * 2 - 1) * this.shakeIntensity;
      
      if (this.shakeDuration <= 0) {
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
      }
    }
  }

  // Translate absolute world coordinates to screenspace coords
  toScreenX(worldX) {
    return worldX - this.x + this.shakeOffsetX;
  }

  toScreenY(worldY) {
    return worldY - this.y + this.shakeOffsetY;
  }
}
