import { generateValidMaze } from "./src/logic/maze.ts";

try {
    console.log("Starting...");
    const m = generateValidMaze();
    console.log(m.map(row => row.join(" ")).join("\n"));
    console.log("Done.");
} catch (e) {
    console.error(e);
}
