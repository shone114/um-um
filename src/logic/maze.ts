export const MAZE_WIDTH = 15;
export const MAZE_HEIGHT = 15;

const BRAID_PROB_INNER = 0.40;
const BRAID_PROB_BOUNDARY = 0.05; // heavily penalize braiding on edges

// Provisional Thresholds (to be calibrated)
export const DIFFICULTY_CONFIG = {
    MIN_PATH_LENGTH: 41,
    MAX_PATH_LENGTH: 89,
    MIN_TURNS: 11,
    MAX_BOUNDARY_RATIO: 0.40,
    MAX_DEAD_ENDS: 9
};

export interface Point {
    x: number;
    y: number;
}

export interface MazeMetrics {
    pathLength: number;
    turns: number;
    boundaryRatio: number;
    junctions: number;
    deadEnds: number;
}

function shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function inBounds(x: number, y: number) {
    return x >= 0 && x < MAZE_WIDTH && y >= 0 && y < MAZE_HEIGHT;
}

export function generateRawMaze(): number[][] {
    const grid: number[][] = [];
    for (let y = 0; y < MAZE_HEIGHT; y++) {
        grid.push(new Array(MAZE_WIDTH).fill(1)); // 1 = wall
    }

    const dirs = [
        { dx: 0, dy: -2 },
        { dx: 2, dy: 0 },
        { dx: 0, dy: 2 },
        { dx: -2, dy: 0 }
    ];

    function carve(cx: number, cy: number) {
        grid[cy][cx] = 0;
        const shuffledDirs = [...dirs];
        shuffleArray(shuffledDirs);
        
        for (const d of shuffledDirs) {
            const nx = cx + d.dx;
            const ny = cy + d.dy;
            if (inBounds(nx, ny) && grid[ny][nx] === 1) {
                grid[cy + d.dy / 2][cx + d.dx / 2] = 0;
                carve(nx, ny);
            }
        }
    }

    carve(0, 0);

    // Safeguard bottom right just in case
    const targetY = MAZE_HEIGHT - 1;
    const targetX = MAZE_WIDTH - 1;
    if (grid[targetY][targetX] !== 0) {
        grid[targetY][targetX] = 0;
        if (targetY > 0) grid[targetY - 1][targetX] = 0;
        if (targetX > 0) grid[targetY][targetX - 1] = 0;
    }

    // Selective Braiding
    for (let y = 0; y < MAZE_HEIGHT; y += 2) {
        for (let x = 0; x < MAZE_WIDTH; x += 2) {
            if (grid[y][x] === 0) {
                let exits = 0;
                if (y > 0 && grid[y - 1][x] === 0) exits++;
                if (y < MAZE_HEIGHT - 1 && grid[y + 1][x] === 0) exits++;
                if (x > 0 && grid[y][x - 1] === 0) exits++;
                if (x < MAZE_WIDTH - 1 && grid[y][x + 1] === 0) exits++;

                if (exits === 1) {
                    const isBoundary = (x === 0 || x === MAZE_WIDTH - 1 || y === 0 || y === MAZE_HEIGHT - 1);
                    const prob = isBoundary ? BRAID_PROB_BOUNDARY : BRAID_PROB_INNER;

                    if (Math.random() < prob) {
                        const closed: Point[] = [];
                        if (y > 1 && grid[y - 1][x] === 1) closed.push({ x: 0, y: -1 });
                        if (y < MAZE_HEIGHT - 2 && grid[y + 1][x] === 1) closed.push({ x: 0, y: 1 });
                        if (x > 1 && grid[y][x - 1] === 1) closed.push({ x: -1, y: 0 });
                        if (x < MAZE_WIDTH - 2 && grid[y][x + 1] === 1) closed.push({ x: 1, y: 0 });

                        if (closed.length > 0) {
                            const dir = closed[Math.floor(Math.random() * closed.length)];
                            grid[y + dir.y][x + dir.x] = 0;
                        }
                    }
                }
            }
        }
    }
    return grid;
}

export function getShortestPathCoords(grid: number[][], start: Point, target: Point): Point[] | null {
    const queue = [start];
    const visited = Array.from({ length: MAZE_HEIGHT }, () => new Array(MAZE_WIDTH).fill(false));
    
    const parent = new Map<string, Point | null>();
    const pointToKey = (p: Point) => `${p.x},${p.y}`;
    
    visited[start.y][start.x] = true;
    parent.set(pointToKey(start), null);

    const dirs = [
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
    ];

    while (queue.length > 0) {
        const curr = queue.shift()!;
        
        if (curr.x === target.x && curr.y === target.y) {
            const path: Point[] = [];
            let trace: Point | null = curr;
            while (trace !== null) {
                path.push(trace);
                trace = parent.get(pointToKey(trace)) || null;
            }
            return path.reverse();
        }

        for (const d of dirs) {
            const nx = curr.x + d.dx;
            const ny = curr.y + d.dy;
            if (inBounds(nx, ny) && grid[ny][nx] === 0 && !visited[ny][nx]) {
                visited[ny][nx] = true;
                const nextPoint = { x: nx, y: ny };
                parent.set(pointToKey(nextPoint), curr);
                queue.push(nextPoint);
            }
        }
    }
    return null;
}

export function calculateTurns(path: Point[]): number {
    if (path.length < 3) return 0;
    let turns = 0;
    let prevDx = path[1].x - path[0].x;
    let prevDy = path[1].y - path[0].y;
    
    for (let i = 2; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        if (dx !== prevDx || dy !== prevDy) {
            turns++;
            prevDx = dx;
            prevDy = dy;
        }
    }
    return turns;
}

export function calculateBoundaryRatio(path: Point[]): number {
    if (path.length === 0) return 0;
    let boundCount = 0;
    for (const p of path) {
        if (p.x === 0 || p.x === MAZE_WIDTH - 1 || p.y === 0 || p.y === MAZE_HEIGHT - 1) {
            boundCount++;
        }
    }
    return boundCount / path.length;
}

export function countDeadEnds(grid: number[][]): number {
    let ends = 0;
    for (let y = 0; y < MAZE_HEIGHT; y++) {
        for (let x = 0; x < MAZE_WIDTH; x++) {
            if (grid[y][x] === 0) {
                let exits = 0;
                if (y > 0 && grid[y-1][x] === 0) exits++;
                if (y < MAZE_HEIGHT-1 && grid[y+1][x] === 0) exits++;
                if (x > 0 && grid[y][x-1] === 0) exits++;
                if (x < MAZE_WIDTH-1 && grid[y][x+1] === 0) exits++;
                if (exits === 1) ends++;
            }
        }
    }
    return ends;
}

export function countJunctions(grid: number[][], path: Point[]): number {
    let js = 0;
    for (const p of path) {
        let exits = 0;
        if (p.y > 0 && grid[p.y-1][p.x] === 0) exits++;
        if (p.y < MAZE_HEIGHT-1 && grid[p.y+1][p.x] === 0) exits++;
        if (p.x > 0 && grid[p.y][p.x-1] === 0) exits++;
        if (p.x < MAZE_WIDTH-1 && grid[p.y][p.x+1] === 0) exits++;
        if (exits > 2) js++;
    }
    return js;
}

export function evaluateMazeMetrics(grid: number[][]): MazeMetrics | null {
    const path = getShortestPathCoords(grid, {x:0, y:0}, {x: MAZE_WIDTH-1, y: MAZE_HEIGHT-1});
    if (!path) return null;
    
    return {
        pathLength: path.length,
        turns: calculateTurns(path),
        boundaryRatio: calculateBoundaryRatio(path),
        junctions: countJunctions(grid, path),
        deadEnds: countDeadEnds(grid)
    };
}

export function generateValidMaze(): number[][] {
    while (true) {
        const maze = generateRawMaze();
        const metrics = evaluateMazeMetrics(maze);
        
        if (metrics) {
            // Apply Fair Constraints Rejection
            if (
                metrics.pathLength >= DIFFICULTY_CONFIG.MIN_PATH_LENGTH &&
                metrics.pathLength <= DIFFICULTY_CONFIG.MAX_PATH_LENGTH &&
                metrics.turns >= DIFFICULTY_CONFIG.MIN_TURNS &&
                metrics.boundaryRatio <= DIFFICULTY_CONFIG.MAX_BOUNDARY_RATIO &&
                metrics.deadEnds <= DIFFICULTY_CONFIG.MAX_DEAD_ENDS
            ) {
                return maze;
            }
        }
    }
}
