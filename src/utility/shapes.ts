/**
 * Shape utility functions for rendering and calculating edge points
 * Used for skill tree visual editor and game rendering
 */

export type ShapeType = 'circle' | 'square' | 'triangle' | 'diamond' | 'hexagon' | 'octagon';

export interface Point {
  x: number;
  y: number;
}

/**
 * Generate SVG path for a given shape
 * @param shape - The shape type
 * @param size - The size of the shape (width and height)
 * @returns SVG path string (empty string for circle, as it uses <circle> element)
 */
export function getShapePath(shape: ShapeType, size: number): string {
  const half = size / 2;
  const center = size / 2;

  switch (shape) {
    case 'circle':
      return ''; // Use <circle> element instead

    case 'square':
      return `M 0 0 L ${size} 0 L ${size} ${size} L 0 ${size} Z`;

    case 'triangle':
      return `M ${center} 0 L ${size} ${size} L 0 ${size} Z`;

    case 'diamond':
      return `M ${center} 0 L ${size} ${center} L ${center} ${size} L 0 ${center} Z`;

    case 'hexagon': {
      // Regular hexagon (flat top)
      const h = size / 2;
      const w = h * Math.sqrt(3) / 2;
      return `M ${center} 0 L ${center + w} ${size * 0.25} L ${center + w} ${size * 0.75} L ${center} ${size} L ${center - w} ${size * 0.75} L ${center - w} ${size * 0.25} Z`;
    }

    case 'octagon': {
      const oct = size * 0.293; // ~tan(22.5°)
      return `M ${oct} 0 L ${size - oct} 0 L ${size} ${oct} L ${size} ${size - oct} L ${size - oct} ${size} L ${oct} ${size} L 0 ${size - oct} L 0 ${oct} Z`;
    }

    default:
      return `M 0 0 L ${size} 0 L ${size} ${size} L 0 ${size} Z`;
  }
}

/**
 * Get the edge point on a shape in the direction of a target point
 * Returns the middle point of the closest edge/side (never a corner/vertex)
 * @param shape - The shape type
 * @param centerX - Center X coordinate of the shape in world space
 * @param centerY - Center Y coordinate of the shape in world space
 * @param size - The size of the shape
 * @param targetX - Target X coordinate in world space
 * @param targetY - Target Y coordinate in world space
 * @returns Point on the edge of the shape closest to the target
 */
export function getShapeEdgePoint(
  shape: ShapeType,
  centerX: number,
  centerY: number,
  size: number,
  targetX: number,
  targetY: number
): Point {
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const angle = Math.atan2(dy, dx);
  const half = size / 2;

  if (shape === 'circle') {
    const radius = size / 2;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  }

  if (shape === 'square') {
    // Determine which side based on angle ranges
    const absAngle = Math.abs(angle);

    if (absAngle <= Math.PI / 4) {
      // Right side (middle)
      return { x: centerX + half, y: centerY };
    } else if (absAngle >= 3 * Math.PI / 4) {
      // Left side (middle)
      return { x: centerX - half, y: centerY };
    } else if (angle > 0) {
      // Bottom side (middle)
      return { x: centerX, y: centerY + half };
    } else {
      // Top side (middle)
      return { x: centerX, y: centerY - half };
    }
  }

  if (shape === 'diamond') {
    // Diamond vertices: top (center, 0), right (size, center), bottom (center, size), left (0, center)
    // Four diagonal edges with midpoints:
    // - Top-right edge: from (half, 0) to (size, half), midpoint = (3*half/2, half/2)
    //   In world coords: (centerX + half/2, centerY - half/2)
    // - Bottom-right edge: from (size, half) to (half, size), midpoint = (3*half/2, 3*half/2)
    //   In world coords: (centerX + half/2, centerY + half/2)
    // - Bottom-left edge: from (half, size) to (0, half), midpoint = (half/2, 3*half/2)
    //   In world coords: (centerX - half/2, centerY + half/2)
    // - Top-left edge: from (0, half) to (half, 0), midpoint = (half/2, half/2)
    //   In world coords: (centerX - half/2, centerY - half/2)

    if (angle >= -Math.PI / 2 && angle < 0) {
      // Top-right edge region
      return { x: centerX + half / 2, y: centerY - half / 2 };
    } else if (angle >= 0 && angle < Math.PI / 2) {
      // Bottom-right edge region
      return { x: centerX + half / 2, y: centerY + half / 2 };
    } else if (angle >= Math.PI / 2 && angle < Math.PI) {
      // Bottom-left edge region
      return { x: centerX - half / 2, y: centerY + half / 2 };
    } else {
      // Top-left edge region
      return { x: centerX - half / 2, y: centerY - half / 2 };
    }
  }

  if (shape === 'triangle') {
    // Triangle in local coords: top vertex at (half, 0), bottom-left at (0, size), bottom-right at (size, size)
    // Three edges with actual midpoints:
    // - Left edge: from (half, 0) to (0, size), midpoint = ((half+0)/2, (0+size)/2) = (half/2, half)
    //   In world coords: (centerX - half/2, centerY)
    // - Right edge: from (half, 0) to (size, size), midpoint = ((half+size)/2, (0+size)/2) = (3*half/2, half)
    //   In world coords: (centerX + half/2, centerY)
    // - Bottom edge: from (0, size) to (size, size), midpoint = (half, size)
    //   In world coords: (centerX, centerY + half)

    // Determine which edge is closest based on angle to target
    // Left edge direction from center: angle to (0, size) from (half, half) = atan2(half, -half) = 3π/4
    // Right edge direction from center: angle to (size, size) from (half, half) = atan2(half, half) = π/4
    // Bottom edge direction from center: angle to (half, size) from (half, half) = π/2

    if (angle >= -Math.PI && angle < -Math.PI / 4) {
      // Left edge region
      return { x: centerX - half / 2, y: centerY };
    } else if (angle >= -Math.PI / 4 && angle < Math.PI / 2) {
      // Right edge region
      return { x: centerX + half / 2, y: centerY };
    } else {
      // Bottom edge region
      return { x: centerX, y: centerY + half };
    }
  }

  if (shape === 'hexagon') {
    // Flat-top hexagon vertices in local coords:
    // V0: (half, 0), V1: (half + w, size*0.25), V2: (half + w, size*0.75),
    // V3: (half, size), V4: (half - w, size*0.75), V5: (half - w, size*0.25)
    const w = half * Math.sqrt(3) / 2;

    // Calculate edge midpoints:
    // Edge 0-1: from (half, 0) to (half+w, size*0.25), mid = (half+w/2, size*0.125)
    // Edge 1-2: from (half+w, size*0.25) to (half+w, size*0.75), mid = (half+w, size*0.5)
    // Edge 2-3: from (half+w, size*0.75) to (half, size), mid = (half+w/2, size*0.875)
    // Edge 3-4: from (half, size) to (half-w, size*0.75), mid = (half-w/2, size*0.875)
    // Edge 4-5: from (half-w, size*0.75) to (half-w, size*0.25), mid = (half-w, size*0.5)
    // Edge 5-0: from (half-w, size*0.25) to (half, 0), mid = (half-w/2, size*0.125)

    const angleNorm = ((angle + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const sideAngle = Math.PI / 3;
    const side = Math.floor(angleNorm / sideAngle);

    switch(side) {
      case 0: // Top-right edge (0-1)
        return { x: centerX + w / 2, y: centerY - size * 0.375 };
      case 1: // Right edge (1-2)
        return { x: centerX + w, y: centerY };
      case 2: // Bottom-right edge (2-3)
        return { x: centerX + w / 2, y: centerY + size * 0.375 };
      case 3: // Bottom-left edge (3-4)
        return { x: centerX - w / 2, y: centerY + size * 0.375 };
      case 4: // Left edge (4-5)
        return { x: centerX - w, y: centerY };
      default: // Top-left edge (5-0)
        return { x: centerX - w / 2, y: centerY - size * 0.375 };
    }
  }

  if (shape === 'octagon') {
    // Regular octagon
    const oct = size * 0.293;
    const angleNorm = ((angle + Math.PI / 8) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const sideAngle = Math.PI / 4;
    const side = Math.floor(angleNorm / sideAngle);

    switch(side) {
      case 0: // Right edge
        return { x: centerX + half, y: centerY };
      case 1: // Bottom-right edge
        return { x: centerX + half - oct / 2, y: centerY + half - oct / 2 };
      case 2: // Bottom edge
        return { x: centerX, y: centerY + half };
      case 3: // Bottom-left edge
        return { x: centerX - half + oct / 2, y: centerY + half - oct / 2 };
      case 4: // Left edge
        return { x: centerX - half, y: centerY };
      case 5: // Top-left edge
        return { x: centerX - half + oct / 2, y: centerY - half + oct / 2 };
      case 6: // Top edge
        return { x: centerX, y: centerY - half };
      default: // Top-right edge
        return { x: centerX + half - oct / 2, y: centerY - half + oct / 2 };
    }
  }

  // Default fallback
  const radius = size / 2;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius
  };
}

/**
 * Generate an SVG path for an arrowhead marker
 * @param size - Size of the arrowhead (width and height)
 * @returns SVG path string for the arrowhead
 */
export function getArrowheadPath(size: number = 6): string {
  // Create a triangle pointing right
  // The arrowhead is designed to be used as an SVG marker
  return `M0,0 L0,${size} L${size * 1.5},${size / 2} z`;
}

/**
 * Generate an SVG path for an arrow connecting two shapes
 * @param fromX - X coordinate of the source shape
 * @param fromY - Y coordinate of the source shape
 * @param fromSize - Size of the source shape
 * @param fromShape - Shape type of the source
 * @param toX - X coordinate of the target shape
 * @param toY - Y coordinate of the target shape
 * @param toSize - Size of the target shape
 * @param toShape - Shape type of the target
 * @param style - Arrow style: 'straight', 'curved', or 'dashed'
 * @returns SVG path string for the arrow
 */
export function getArrowPath(
  fromX: number,
  fromY: number,
  fromSize: number,
  fromShape: ShapeType,
  toX: number,
  toY: number,
  toSize: number,
  toShape: ShapeType,
  style: string
): string {
  const fromCenterX = fromX + fromSize / 2;
  const fromCenterY = fromY + fromSize / 2;
  const toCenterX = toX + toSize / 2;
  const toCenterY = toY + toSize / 2;

  // Get edge points based on shape type
  const startPoint = getShapeEdgePoint(fromShape, fromCenterX, fromCenterY, fromSize, toCenterX, toCenterY);
  const endPoint = getShapeEdgePoint(toShape, toCenterX, toCenterY, toSize, fromCenterX, fromCenterY);

  if (style === 'curved') {
    // Bezier curve
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;
    const controlX = midX;
    const controlY = midY - 50; // Curve upward
    return `M ${startPoint.x} ${startPoint.y} Q ${controlX} ${controlY} ${endPoint.x} ${endPoint.y}`;
  } else {
    // Straight or dashed (both use straight line, just different stroke)
    return `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`;
  }
}
