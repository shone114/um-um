import { MAZE_WIDTH, MAZE_HEIGHT, Point, MazeMetrics, generateRawMaze, getShortestPathCoords, evaluateMazeMetrics, calculateTurns, calculateBoundaryRatio, countJunctions, countDeadEnds } from './src/logic/maze';

const MAX_BUDGET_PERCENT = 0.15; // Max 15% of candidate walls can be removed

interface TargetRange {
    min: number;
    max: number;
}

const TARGETS: Record<string, TargetRange> = {
    "20s": { min: 65, max: 80 },
    "14s": { min: 45, max: 55 },
    "10s": { min: 34, max: 42 },
    "7s": { min: 28, max: 35 }
};

function creates2x2Blob(grid: number[][], x: number, y: number): boolean {
    grid[y][x] = 0;
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
    grid[y][x] = 1;
    return isBlob;
}

function getCandidateWalls(grid: number[][]): Point[] {
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

// Clone grid
function cloneGrid(grid: number[][]): number[][] {
    return grid.map(row => [...row]);
}

interface ModificationCandidate {
    point: Point;
    newMetrics: MazeMetrics;
    pathReduction: number;
}

function evaluateCandidates(grid: number[][], candidates: Point[], currentLength: number): ModificationCandidate[] {
    const results: ModificationCandidate[] = [];
    const start = { x: 0, y: 0 };
    const end = { x: MAZE_WIDTH - 1, y: MAZE_HEIGHT - 1 };

    for (const c of candidates) {
        grid[c.y][c.x] = 0; // mock removed
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
        grid[c.y][c.x] = 1; // rollback
    }
    return results;
}

function braidMaze(originalGrid: number[][], strategy: 'A' | 'B' | 'C' | 'D', targetRange: TargetRange) {
    const grid = cloneGrid(originalGrid);
    
    let currentMetrics = evaluateMazeMetrics(grid)!;
    if (currentMetrics.pathLength <= targetRange.max) {
        return { grid, wallsRemoved: 0, finalMetrics: currentMetrics, success: true, bfsCalls: 0 };
    }

    const availableCandidates = getCandidateWalls(grid);
    const maxBudget = Math.floor(availableCandidates.length * MAX_BUDGET_PERCENT);
    let wallsRemoved = 0;
    let bfsCalls = 0;

    let currentLength = currentMetrics.pathLength;

    while (wallsRemoved < maxBudget && currentLength > targetRange.max) {
        const cands = getCandidateWalls(grid);
        if (cands.length === 0) break;

        const evals = evaluateCandidates(grid, cands, currentLength);
        bfsCalls += cands.length;

        if (evals.length === 0) break; // no useful reductions

        // Filter out extreme overshoots (e.g. dropping 30 below target min)
        const safeEvals = evals.filter(e => e.newMetrics.pathLength >= targetRange.min - 5);
        
        let chosen: ModificationCandidate | null = null;
        
        const validEvals = safeEvals.length > 0 ? safeEvals : evals; // fallback to anything if target unreachable safely

        if (strategy === 'A') {
            // Max reduction
            chosen = validEvals.reduce((prev, curr) => (prev.pathReduction > curr.pathReduction) ? prev : curr);
        } else if (strategy === 'B') {
            // Min useful reduction (closest to target)
            chosen = validEvals.reduce((prev, curr) => (prev.newMetrics.pathLength >= targetRange.min && prev.pathReduction < curr.pathReduction) ? prev : curr);
        } else if (strategy === 'C') {
            // Random
            chosen = validEvals[Math.floor(Math.random() * validEvals.length)];
        } else if (strategy === 'D') {
            // Weighted (Reduction vs Turn density preservation)
            chosen = validEvals.reduce((prev, curr) => {
                // Score = Path Reduction (points to target) + Turn Density Penalty
                const p1 = Math.abs((targetRange.min + targetRange.max) / 2 - prev.newMetrics.pathLength);
                const p2 = Math.abs((targetRange.min + targetRange.max) / 2 - curr.newMetrics.pathLength);
                return p1 < p2 ? prev : curr;
            });
        }

        if (!chosen) break;

        // Apply
        grid[chosen.point.y][chosen.point.x] = 0;
        wallsRemoved++;
        currentLength = chosen.newMetrics.pathLength;
        currentMetrics = chosen.newMetrics;

        if (currentLength >= targetRange.min && currentLength <= targetRange.max) {
            break; // Target hit
        }
    }

    const success = currentLength >= targetRange.min && currentLength <= targetRange.max;
    return { grid, wallsRemoved, finalMetrics: currentMetrics, success, bfsCalls };
}

function runBenchmark() {
    console.log("Starting Targeted Braiding Benchmark...");
    const sampleSize = 50;

    for (const [timerProfile, targetRange] of Object.entries(TARGETS)) {
        console.log(`\n=== Testing Target: ${timerProfile} (${targetRange.min}-${targetRange.max}) ===`);
        
        const strategies: ('A'|'B'|'C'|'D')[] = ['A', 'B', 'C', 'D'];
        
        for (const strategy of strategies) {
            let successes = 0;
            let avgInitial = 0;
            let avgFinal = 0;
            let avgWalls = 0;
            let avgBfs = 0;

            for (let i = 0; i < sampleSize; i++) {
                let initialGrid = generateRawMaze();
                let metrics = evaluateMazeMetrics(initialGrid);
                // regenerate until we get a long one so we can actually test
                while(!metrics || metrics.pathLength < targetRange.max + 5) {
                    initialGrid = generateRawMaze();
                    metrics = evaluateMazeMetrics(initialGrid);
                }

                avgInitial += metrics.pathLength;

                const result = braidMaze(initialGrid, strategy, targetRange);
                
                if (result.success) successes++;
                avgFinal += result.finalMetrics.pathLength;
                avgWalls += result.wallsRemoved;
                avgBfs += result.bfsCalls;
            }

            console.log(`Strategy ${strategy}: ${((successes / sampleSize) * 100).toFixed(1)}% Success | InitLen: ${(avgInitial / sampleSize).toFixed(1)} -> FinLen: ${(avgFinal / sampleSize).toFixed(1)} | Walls Removed: ${(avgWalls / sampleSize).toFixed(1)} | BFS: ${(avgBfs / sampleSize).toFixed(0)}`);
        }
    }
}

runBenchmark();
