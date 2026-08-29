export interface WallAssetResult {
  src: string;
  transform?: string;
}

const WALL_IMG = '/assets/maze/wall.png';
const WALL_END_IMG = '/assets/maze/wall_end.png';

/**
 * Resolves which wall asset to render for the cell at (x, y) and applies standard CSS 
 * rotations to achieve 4-way modularity.
 * 
 * Assumptions for base assets (0deg rotation):
 * - wall_end.png: left-side end cap (connects to the RIGHT)
 * - wall.png: horizontal straight (connects LEFT and RIGHT)
 * - wall.png: also acts as the safe fallback for corners and junctions.
 */
export function resolveWallAsset(x: number, y: number, maze: number[][]): WallAssetResult {
  const H = maze.length;
  const W = maze[0]?.length ?? 0;

  const isWall = (cx: number, cy: number): boolean =>
    cx >= 0 && cx < W && cy >= 0 && cy < H && maze[cy][cx] === 1;

  const top = isWall(x, y - 1);
  const right = isWall(x + 1, y);
  const bottom = isWall(x, y + 1);
  const left = isWall(x - 1, y);

  const neighborsCount = (top ? 1 : 0) + (right ? 1 : 0) + (bottom ? 1 : 0) + (left ? 1 : 0);

  // Endpoints (dead ends)
  if (neighborsCount === 1) {
    if (right) return { src: WALL_END_IMG, transform: 'rotate(0deg)' };
    if (bottom) return { src: WALL_END_IMG, transform: 'rotate(90deg)' };
    if (left) return { src: WALL_END_IMG, transform: 'rotate(180deg)' };
    if (top) return { src: WALL_END_IMG, transform: 'rotate(270deg)' };
  }

  // Corridors & Corners
  if (neighborsCount === 2) {
    // Corners
    if (right && bottom) return { src: WALL_IMG, transform: 'rotate(0deg)' };
    if (bottom && left) return { src: WALL_IMG, transform: 'rotate(90deg)' };
    if (left && top) return { src: WALL_IMG, transform: 'rotate(180deg)' };
    if (top && right) return { src: WALL_IMG, transform: 'rotate(270deg)' };
    
    // Straights
    if (left && right) return { src: WALL_IMG, transform: 'rotate(0deg)' };
    if (top && bottom) return { src: WALL_IMG, transform: 'rotate(90deg)' };
  }

  // T-junctions, cross intersections, or isolated 1x1 walls
  // Fallback to horizontal wall to avoid crashing or disappearing
  return { src: WALL_IMG, transform: 'rotate(0deg)' };
}
