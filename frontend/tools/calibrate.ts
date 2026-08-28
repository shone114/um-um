import { generateRawMaze, evaluateMazeMetrics, MazeMetrics } from '../src/logic/maze.ts';

const SAMPLE_SIZE = 5000;
const results: MazeMetrics[] = [];

console.log(`Generating ${SAMPLE_SIZE} mazes...`);

for (let i = 0; i < SAMPLE_SIZE; i++) {
    const grid = generateRawMaze();
    const metrics = evaluateMazeMetrics(grid);
    if (metrics) {
        results.push(metrics);
    }
}

function getStats(arr: number[]) {
    arr.sort((a,b) => a - b);
    return {
        min: arr[0],
        p20: arr[Math.floor(arr.length * 0.20)],
        median: arr[Math.floor(arr.length * 0.50)],
        p80: arr[Math.floor(arr.length * 0.80)],
        p95: arr[Math.floor(arr.length * 0.95)],
        max: arr[arr.length - 1]
    };
}

const lengths = results.map(r => r.pathLength);
const turns = results.map(r => r.turns);
const bounds = results.map(r => r.boundaryRatio);
const junctions = results.map(r => r.junctions);
const deadEnds = results.map(r => r.deadEnds);

console.log("\n--- DISTRIBUTION STATS ---");
console.log("Path Lengths:", getStats(lengths));
console.log("Turns:", getStats(turns));
console.log("Boundary Ratios:", getStats(bounds).max, "(Max)"); // Usually small
console.log("Junctions:", getStats(junctions));
console.log("Dead Ends:", getStats(deadEnds));
console.log("\nProvisional recommendation for 'Medium' difficulty bounds:");
console.log(`MIN_PATH_LENGTH: ${getStats(lengths).p20}`);
console.log(`MAX_PATH_LENGTH: ${getStats(lengths).p95}`);
console.log(`MIN_TURNS: ${getStats(turns).p20}`);
console.log(`MAX_BOUNDARY_RATIO: 0.40`);
console.log(`MAX_DEAD_ENDS: ${getStats(deadEnds).p95}`);
