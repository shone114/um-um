const FLOOR_VARIANTS = 3;

function hashMaze(maze: number[][]): number {
  let hash = 2166136261;

  for (const row of maze) {
    for (const cell of row) {
      hash ^= cell + 48;
      hash = Math.imul(hash, 16777619);
    }
  }

  return hash >>> 0;
}

function hashCell(seed: number, x: number, y: number): number {
  let value = seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

/**
 * Returns one stable floor texture index for every logical maze cell.
 * Adjacent open cells are nudged away from matching their left/top neighbour,
 * which avoids obvious repeated patches while remaining deterministic per maze.
 */
export function createFloorVariantMap(maze: number[][]): number[][] {
  const seed = hashMaze(maze);
  const variants = maze.map(row => row.map(() => 0));

  for (let y = 0; y < maze.length; y++) {
    for (let x = 0; x < maze[y].length; x++) {
      if (maze[y][x] === 1) continue;

      let variant = hashCell(seed, x, y) % FLOOR_VARIANTS;
      const leftVariant = x > 0 && maze[y][x - 1] === 0 ? variants[y][x - 1] : -1;
      const aboveVariant = y > 0 && maze[y - 1][x] === 0 ? variants[y - 1][x] : -1;

      if (variant === leftVariant || variant === aboveVariant) {
        variant = (variant + 1 + (hashCell(seed ^ 0x9e3779b9, x, y) % (FLOOR_VARIANTS - 1))) % FLOOR_VARIANTS;
      }
      if (variant === leftVariant || variant === aboveVariant) {
        variant = (variant + 1) % FLOOR_VARIANTS;
      }

      variants[y][x] = variant;
    }
  }

  return variants;
}
