/**
 * Stickman Generator
 * Generates pixel art stickman animations for character editor
 */

const CANVAS_SIZE = 128

// Stickman proportions (based on 128x128 canvas)
const HEAD_RADIUS = 8 // 16 pixels diameter = 1/8 of 128
const HEAD_CENTER_X = 64
const HEAD_CENTER_Y = 16 // Top of canvas + radius
const BODY_END_Y = 72 // Slightly below middle
const SHOULDER_Y = HEAD_CENTER_Y + HEAD_RADIUS + 2 + 4
const FOOT_Y = 120 // Near bottom

interface Color {
  r: number
  g: number
  b: number
  a: number
}

function hexToRgba(hex: string): Color {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
      a: 255,
    }
  }
  return { r: 255, g: 255, b: 255, a: 255 }
}

function setPixel(pixels: Uint8ClampedArray, x: number, y: number, color: Color): void {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE) return
  const index = (y * CANVAS_SIZE + x) * 4
  pixels[index] = color.r
  pixels[index + 1] = color.g
  pixels[index + 2] = color.b
  pixels[index + 3] = color.a
}

// Bresenham's line algorithm
function drawLine(
  pixels: Uint8ClampedArray,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Color,
  thickness: number = 2
): void {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  let x = x0
  let y = y0

  while (true) {
    // Draw with thickness
    for (let tx = -Math.floor(thickness / 2); tx <= Math.floor(thickness / 2); tx++) {
      for (let ty = -Math.floor(thickness / 2); ty <= Math.floor(thickness / 2); ty++) {
        setPixel(pixels, x + tx, y + ty, color)
      }
    }

    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

// Draw a filled circle
function drawCircle(
  pixels: Uint8ClampedArray,
  cx: number,
  cy: number,
  radius: number,
  color: Color
): void {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) {
        setPixel(pixels, cx + x, cy + y, color)
      }
    }
  }
}

// Draw the basic stickman structure
function drawStickmanBase(
  pixels: Uint8ClampedArray,
  color: Color,
  headY: number = HEAD_CENTER_Y
): void {
  // Head
  drawCircle(pixels, HEAD_CENTER_X, headY, HEAD_RADIUS, color)

  // Body (vertical line from neck to body end)
  drawLine(pixels, HEAD_CENTER_X, headY + HEAD_RADIUS + 2, HEAD_CENTER_X, BODY_END_Y, color, 2)
}

// Draw arms with optional bend
function drawArms(
  pixels: Uint8ClampedArray,
  color: Color,
  leftArmAngle: number = 45, // degrees from vertical
  rightArmAngle: number = 45,
  leftBend: number = 0, // 0 = straight, positive = bend outward
  rightBend: number = 0,
  shoulderY: number = SHOULDER_Y
): void {
  const armLength = 24

  // Left arm
  if (leftBend === 0) {
    // Straight arm
    const leftHandX = HEAD_CENTER_X - Math.sin((leftArmAngle * Math.PI) / 180) * armLength
    const leftHandY = shoulderY + Math.cos((leftArmAngle * Math.PI) / 180) * armLength
    drawLine(pixels, HEAD_CENTER_X, shoulderY, leftHandX, leftHandY, color, 2)
  } else {
    // Bent arm (2 segments)
    const elbowDist = armLength / 2
    const elbowX = HEAD_CENTER_X - Math.sin((leftArmAngle * Math.PI) / 180) * elbowDist
    const elbowY = shoulderY + Math.cos((leftArmAngle * Math.PI) / 180) * elbowDist
    drawLine(pixels, HEAD_CENTER_X, shoulderY, elbowX, elbowY, color, 2)

    const forearmAngle = leftArmAngle + leftBend
    const handX = elbowX - Math.sin((forearmAngle * Math.PI) / 180) * elbowDist
    const handY = elbowY + Math.cos((forearmAngle * Math.PI) / 180) * elbowDist
    drawLine(pixels, elbowX, elbowY, handX, handY, color, 2)
  }

  // Right arm
  if (rightBend === 0) {
    // Straight arm
    const rightHandX = HEAD_CENTER_X + Math.sin((rightArmAngle * Math.PI) / 180) * armLength
    const rightHandY = shoulderY + Math.cos((rightArmAngle * Math.PI) / 180) * armLength
    drawLine(pixels, HEAD_CENTER_X, shoulderY, rightHandX, rightHandY, color, 2)
  } else {
    // Bent arm (2 segments)
    const elbowDist = armLength / 2
    const elbowX = HEAD_CENTER_X + Math.sin((rightArmAngle * Math.PI) / 180) * elbowDist
    const elbowY = shoulderY + Math.cos((rightArmAngle * Math.PI) / 180) * elbowDist
    drawLine(pixels, HEAD_CENTER_X, shoulderY, elbowX, elbowY, color, 2)

    const forearmAngle = rightArmAngle + rightBend
    const handX = elbowX + Math.sin((forearmAngle * Math.PI) / 180) * elbowDist
    const handY = elbowY + Math.cos((forearmAngle * Math.PI) / 180) * elbowDist
    drawLine(pixels, elbowX, elbowY, handX, handY, color, 2)
  }
}

// Draw legs with optional bend
function drawLegs(
  pixels: Uint8ClampedArray,
  color: Color,
  leftLegAngle: number = 20, // degrees from vertical
  rightLegAngle: number = 20,
  leftBend: number = 0, // 0 = straight, positive = bend forward
  rightBend: number = 0,
  hipY: number = BODY_END_Y
): void {
  const legLength = FOOT_Y - hipY

  // Left leg
  if (leftBend === 0) {
    // Straight leg
    const footX = HEAD_CENTER_X - Math.sin((leftLegAngle * Math.PI) / 180) * legLength
    const footY = hipY + Math.cos((leftLegAngle * Math.PI) / 180) * legLength
    drawLine(pixels, HEAD_CENTER_X, hipY, footX, Math.min(footY, FOOT_Y), color, 2)
  } else {
    // Bent leg (2 segments)
    const kneeDist = legLength / 2
    const kneeX = HEAD_CENTER_X - Math.sin((leftLegAngle * Math.PI) / 180) * kneeDist
    const kneeY = hipY + Math.cos((leftLegAngle * Math.PI) / 180) * kneeDist
    drawLine(pixels, HEAD_CENTER_X, hipY, kneeX, kneeY, color, 2)

    const shinAngle = leftLegAngle - leftBend
    const footX = kneeX - Math.sin((shinAngle * Math.PI) / 180) * kneeDist
    const footY = kneeY + Math.cos((shinAngle * Math.PI) / 180) * kneeDist
    drawLine(pixels, kneeX, kneeY, footX, Math.min(footY, FOOT_Y), color, 2)
  }

  // Right leg
  if (rightBend === 0) {
    // Straight leg
    const footX = HEAD_CENTER_X + Math.sin((rightLegAngle * Math.PI) / 180) * legLength
    const footY = hipY + Math.cos((rightLegAngle * Math.PI) / 180) * legLength
    drawLine(pixels, HEAD_CENTER_X, hipY, footX, Math.min(footY, FOOT_Y), color, 2)
  } else {
    // Bent leg (2 segments)
    const kneeDist = legLength / 2
    const kneeX = HEAD_CENTER_X + Math.sin((rightLegAngle * Math.PI) / 180) * kneeDist
    const kneeY = hipY + Math.cos((rightLegAngle * Math.PI) / 180) * kneeDist
    drawLine(pixels, HEAD_CENTER_X, hipY, kneeX, kneeY, color, 2)

    const shinAngle = rightLegAngle - rightBend
    const footX = kneeX + Math.sin((shinAngle * Math.PI) / 180) * kneeDist
    const footY = kneeY + Math.cos((shinAngle * Math.PI) / 180) * kneeDist
    drawLine(pixels, kneeX, kneeY, footX, Math.min(footY, FOOT_Y), color, 2)
  }
}

// Generate idle frame
function generateIdleFrame(color: Color): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4)
  drawStickmanBase(pixels, color)
  drawArms(pixels, color, 30, 30, 0, 0)
  drawLegs(pixels, color, 15, 15, 0, 0)
  return pixels
}

// Generate walk frames (4 frames for a walk cycle)
function generateWalkFrames(color: Color, direction: "down" | "up" | "left" | "right"): Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = []

  // 4-frame walk cycle
  const walkCycle = [
    { leftLeg: 25, rightLeg: -10, leftArm: -20, rightArm: 40, leftLegBend: 15, rightLegBend: 0, leftArmBend: 20, rightArmBend: 0 },
    { leftLeg: 10, rightLeg: 10, leftArm: 10, rightArm: 10, leftLegBend: 0, rightLegBend: 0, leftArmBend: 0, rightArmBend: 0 },
    { leftLeg: -10, rightLeg: 25, leftArm: 40, rightArm: -20, leftLegBend: 0, rightLegBend: 15, leftArmBend: 0, rightArmBend: 20 },
    { leftLeg: 10, rightLeg: 10, leftArm: 10, rightArm: 10, leftLegBend: 0, rightLegBend: 0, leftArmBend: 0, rightArmBend: 0 },
  ]

  for (const pose of walkCycle) {
    const pixels = new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4)

    // Adjust based on direction
    let headY = HEAD_CENTER_Y
    if (direction === "up") {
      headY = HEAD_CENTER_Y + 2 // Slight bob
    } else if (direction === "down") {
      headY = HEAD_CENTER_Y - 2
    }

    drawStickmanBase(pixels, color, headY)

    // For left/right, we might want to show side view (simplified for now)
    if (direction === "left" || direction === "right") {
      // Side view - arms and legs appear more aligned
      const mirror = direction === "left" ? -1 : 1
      drawArms(pixels, color, 30 * mirror + pose.leftArm, 30 * mirror + pose.rightArm, pose.leftArmBend, pose.rightArmBend)
      drawLegs(pixels, color, 10 + pose.leftLeg, 10 + pose.rightLeg, pose.leftLegBend, pose.rightLegBend)
    } else {
      drawArms(pixels, color, 30 + pose.leftArm, 30 + pose.rightArm, pose.leftArmBend, pose.rightArmBend)
      drawLegs(pixels, color, 15 + pose.leftLeg, 15 + pose.rightLeg, pose.leftLegBend, pose.rightLegBend)
    }

    frames.push(pixels)
  }

  return frames
}

// Generate attack frames (3 frames)
function generateAttackFrames(color: Color): Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = []

  // Wind up
  const windUp = new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4)
  drawStickmanBase(windUp, color)
  drawArms(windUp, color, -30, 60, 45, 0) // Left arm back, right arm ready
  drawLegs(windUp, color, 20, 10, 0, 0)
  frames.push(windUp)

  // Strike
  const strike = new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4)
  drawStickmanBase(strike, color)
  drawArms(strike, color, 60, -10, 0, 30) // Left arm forward (punch)
  drawLegs(strike, color, 25, 5, 10, 0)
  frames.push(strike)

  // Follow through
  const followThrough = new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4)
  drawStickmanBase(followThrough, color)
  drawArms(followThrough, color, 45, 30, 0, 0)
  drawLegs(followThrough, color, 15, 15, 0, 0)
  frames.push(followThrough)

  return frames
}

// Generate build animation frames (2 frames - hammering motion)
function generateBuildFrames(color: Color): Uint8ClampedArray[] {
  const frames: Uint8ClampedArray[] = []

  // Arm up
  const armUp = new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4)
  drawStickmanBase(armUp, color)
  drawArms(armUp, color, 30, -60, 0, 60) // Right arm raised
  drawLegs(armUp, color, 15, 15, 0, 0)
  frames.push(armUp)

  // Arm down (hammering)
  const armDown = new Uint8ClampedArray(CANVAS_SIZE * CANVAS_SIZE * 4)
  drawStickmanBase(armDown, color)
  drawArms(armDown, color, 30, 70, 0, 30) // Right arm down
  drawLegs(armDown, color, 15, 15, 0, 0)
  frames.push(armDown)

  return frames
}

export interface StickmanAnimationData {
  idle: Uint8ClampedArray[]
  walk_down: Uint8ClampedArray[]
  walk_up: Uint8ClampedArray[]
  walk_left: Uint8ClampedArray[]
  walk_right: Uint8ClampedArray[]
  action_attack: Uint8ClampedArray[]
  action_build: Uint8ClampedArray[]
}

/**
 * Generate all stickman animation frames for a given color
 */
export function generateStickmanAnimations(hexColor: string): StickmanAnimationData {
  const color = hexToRgba(hexColor)

  return {
    idle: [generateIdleFrame(color)],
    walk_down: generateWalkFrames(color, "down"),
    walk_up: generateWalkFrames(color, "up"),
    walk_left: generateWalkFrames(color, "left"),
    walk_right: generateWalkFrames(color, "right"),
    action_attack: generateAttackFrames(color),
    action_build: generateBuildFrames(color),
  }
}
