export type ImageSize = { width: number; height: number };
export type CropPosition = { x: number; y: number; zoom: number };
export type CropRect = { originX: number; originY: number; width: number; height: number };
export type CropTouch = { x: number; y: number };
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function centerCrop(size: ImageSize): CropPosition {
  return { x: size.width / 2, y: size.height / 2, zoom: 1 };
}
export function constrainCrop(size: ImageSize, position: CropPosition): CropPosition {
  const zoom = clamp(position.zoom, 1, 4),
    half = Math.min(size.width, size.height) / zoom / 2;
  return {
    zoom,
    x: clamp(position.x, half, size.width - half),
    y: clamp(position.y, half, size.height - half),
  };
}
export function cropGeometry(size: ImageSize, position: CropPosition, side: number) {
  const p = constrainCrop(size, position),
    edge = Math.min(size.width, size.height) / p.zoom,
    scale = side / edge;
  return {
    scale,
    left: side / 2 - p.x * scale,
    top: side / 2 - p.y * scale,
    width: size.width * scale,
    height: size.height * scale,
  };
}
/** Preserve the source point underneath the fingers as they move and pinch. */
export function moveCrop(
  size: ImageSize,
  position: CropPosition,
  side: number,
  previous: CropTouch,
  next: CropTouch,
  zoomRatio = 1
): CropPosition {
  const p = constrainCrop(size, position),
    oldScale = cropGeometry(size, p, side).scale,
    zoom = clamp(p.zoom * zoomRatio, 1, 4),
    newScale = side / (Math.min(size.width, size.height) / zoom);
  return constrainCrop(size, {
    zoom,
    x: p.x + (previous.x - side / 2) / oldScale - (next.x - side / 2) / newScale,
    y: p.y + (previous.y - side / 2) / oldScale - (next.y - side / 2) / newScale,
  });
}
export function cropRectangle(size: ImageSize, position: CropPosition): CropRect {
  const p = constrainCrop(size, position),
    edge = Math.max(1, Math.round(Math.min(size.width, size.height) / p.zoom));
  return {
    originX: clamp(Math.round(p.x - edge / 2), 0, size.width - edge),
    originY: clamp(Math.round(p.y - edge / 2), 0, size.height - edge),
    width: edge,
    height: edge,
  };
}
