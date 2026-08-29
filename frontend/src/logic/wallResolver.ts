export interface WallAssetResult {
  src: string;
  transform?: string;
}

const WALL_IMG = '/assets/maze/wall.png';
const WALL_END_IMG = '/assets/maze/wall_end.png';

/**
 * Resolves which wall asset to render for the cell at (x, y).
 */
export function resolveWallAsset(x: number, y: number, maze: number[][]): WallAssetResult {
  const H = maze.length;
  const W = maze[0]?.length ?? 0;

  const isWall = (cx: number, cy: number): boolean =>
    cx >= 0 && cx < W && cy >= 0 && cy < H && maze[cy][cx] === 1;

  const hasLeft = isWall(x - 1, y);
  const hasRight = isWall(x + 1, y);

  // Left-end: no wall to the left, wall continues to the right
  if (!hasLeft && hasRight) {
    return { src: WALL_END_IMG };
  }

  // Default: continuation wall
  return { src: WALL_IMG };
}
