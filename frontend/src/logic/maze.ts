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

export interface TargetRange {
    min: number;
    max: number;
}
export const TARGETS: Record<number, TargetRange> = {
    20: { min: 65, max: 80 },
    18: { min: 60, max: 75 },
    16: { min: 50, max: 65 },
    14: { min: 45, max: 55 },
    12: { min: 40, max: 48 },
    10: { min: 34, max: 42 },
    8: {  min: 30, max: 38 },
    7: {  min: 28, max: 35 },
    6: {  min: 28, max: 35 },
    5: {  min: 28, max: 35 },
    4: {  min: 28, max: 35 },
    3: {  min: 28, max: 35 },
    2: {  min: 28, max: 35 }
};

export interface ModificationCandidate {
    point: Point;
    newMetrics: MazeMetrics;
    pathReduction: number;
}

export function creates2x2Blob(grid: number[][], x: number, y: number): boolean {
    grid[y][x] = 0; // Temporarily open
    let isBlob = false;
    for (let by = y - 1; by <= y; by++) {
        for (let bx = x - 1; bx <= x; bx++) {
            if (by >= 0 && by < MAZE_HEIGHT - 1 && bx >= 0 && bx < MAZE_WIDTH - 1) {
                if (grid[by][bx] === 0 && grid[by][bx + 1] === 0 && grid[by + 1][bx] === 0 && grid[by + 1][bx + 1] === 0) {
                    isBlob = true;
                }
            }
        }
    }
    grid[y][x] = 1; // Restore
    return isBlob;
}

export function getCandidateWalls(grid: number[][]): Point[] {
    const candidates: Point[] = [];
    for (let y = 1; y < MAZE_HEIGHT - 1; y++) {
        for (let x = 1; x < MAZE_WIDTH - 1; x++) {
            if (grid[y][x] === 1) {
                let adjPaths = 0;
                if (grid[y - 1][x] === 0) adjPaths++;
                if (grid[y + 1][x] === 0) adjPaths++;
                if (grid[y][x - 1] === 0) adjPaths++;
                if (grid[y][x + 1] === 0) adjPaths++;
                if (adjPaths >= 2) {
                    if (!creates2x2Blob(grid, x, y)) {
                        candidates.push({ x, y });
                    }
                }
            }
        }
    }
    return candidates;
}

export function evaluateCandidates(grid: number[][], candidates: Point[], currentLength: number): ModificationCandidate[] {
    const results: ModificationCandidate[] = [];
    const start = { x: 0, y: 0 };
    const end = { x: MAZE_WIDTH - 1, y: MAZE_HEIGHT - 1 };
    
    for (const c of candidates) {
        grid[c.y][c.x] = 0; // Mock remove
        const path = getShortestPathCoords(grid, start, end);
        if (path) {
            const newLen = path.length;
            if (newLen < currentLength) {
                results.push({
                    point: c,
                    pathReduction: currentLength - newLen,
                    newMetrics: {
                        pathLength: newLen,
                        turns: calculateTurns(path),
                        boundaryRatio: calculateBoundaryRatio(path),
                        junctions: countJunctions(grid, path),
                        deadEnds: countDeadEnds(grid)
                    }
                });
            }
        }
        grid[c.y][c.x] = 1; // Rollback
    }
    return results;
}

export interface GenerationStats {
    timeMs: number;
    bfsCalls: number;
    wallsRemoved: number;
    strategy: string;
    targetMin: number;
    targetMax: number;
}

export const latestGenerationStats: GenerationStats = {
    timeMs: 0,
    bfsCalls: 0,
    wallsRemoved: 0,
    strategy: 'N/A',
    targetMin: 0,
    targetMax: 0
};

export function generateValidMaze(timerSeconds: number = 20): number[][] {
    const startTime = performance.now();
    let totalBfs = 0;
    const targetRange = TARGETS[timerSeconds] || { min: 28, max: 80 };
    let safetyCounter = 0;
    
    while (safetyCounter < 20) {
        safetyCounter++;
        let grid = generateRawMaze();
        let currentMetrics = evaluateMazeMetrics(grid);
        if (!currentMetrics) continue;
        
        // If already perfect
        if (currentMetrics.pathLength >= targetRange.min && currentMetrics.pathLength <= targetRange.max) {
            return grid;
        }
        
        // If naturally too short, we must generate a new one
        if (currentMetrics.pathLength < targetRange.min) {
            continue; 
        }

        // Apply Targeted Controlled Braiding
        const availableCandidates = getCandidateWalls(grid);
        const maxBudget = Math.floor(availableCandidates.length * 0.15); // Max 15% walls removed
        let wallsRemoved = 0;
        let currentLength = currentMetrics.pathLength;

        while (wallsRemoved < maxBudget && currentLength > targetRange.max) {
            const cands = getCandidateWalls(grid);
            if (cands.length === 0) break;

            const evals = evaluateCandidates(grid, cands, currentLength);
            totalBfs += cands.length;
            if (evals.length === 0) break; // no useful reductions found

            // Reject extreme overshoots (-3 lenience)
            const safeEvals = evals.filter(e => e.newMetrics.pathLength >= targetRange.min - 3);
            const validEvals = safeEvals.length > 0 ? safeEvals : evals;

            // Strategy D: Weighted (Aim for target center)
            const chosen = validEvals.reduce((prev, curr) => {
                const targetCenter = (targetRange.min + targetRange.max) / 2;
                const p1 = Math.abs(targetCenter - prev.newMetrics.pathLength);
                const p2 = Math.abs(targetCenter - curr.newMetrics.pathLength);
                return p1 < p2 ? prev : curr;
            });

            // Permanently remove
            grid[chosen.point.y][chosen.point.x] = 0;
            wallsRemoved++;
            currentLength = chosen.newMetrics.pathLength;
        }

        if (currentLength >= targetRange.min && currentLength <= targetRange.max) {
            latestGenerationStats.timeMs = performance.now() - startTime;
            latestGenerationStats.bfsCalls = totalBfs;
            latestGenerationStats.wallsRemoved = wallsRemoved;
            latestGenerationStats.strategy = 'D';
            latestGenerationStats.targetMin = targetRange.min;
            latestGenerationStats.targetMax = targetRange.max;
            return grid; // We hit the envelope perfectly inside the budget
        }
    }
    
    // Ultimate Fallback - just return standard DFS
    latestGenerationStats.timeMs = performance.now() - startTime;
    latestGenerationStats.bfsCalls = totalBfs;
    latestGenerationStats.wallsRemoved = -1;
    latestGenerationStats.strategy = 'FALLBACK';
    latestGenerationStats.targetMin = targetRange.min;
    latestGenerationStats.targetMax = targetRange.max;
    return generateRawMaze();
}
