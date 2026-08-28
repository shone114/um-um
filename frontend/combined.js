const MAZE_WIDTH = 15;
const MAZE_HEIGHT = 15;
const BRAID_PROBABILITY = 0.40;

// Uses recursive backtracking (DFS) to create a perfect maze
function generateRawMaze() {
    let grid = [];
    for (let y = 0; y < MAZE_HEIGHT; y++) {
        let row = [];
        for (let x = 0; x < MAZE_WIDTH; x++) {
            row.push(1); // 1 = wall
        }
        grid.push(row);
    }
    
    const dirs = [
        {dx: 0, dy: -2},
        {dx: 2, dy: 0},
        {dx: 0, dy: 2},
        {dx: -2, dy: 0}
    ];
    
    function inBounds(x, y) {
        return x >= 0 && x < MAZE_WIDTH && y >= 0 && y < MAZE_HEIGHT;
    }
    
    // Start DFS at 0,0
    function carve(cx, cy) {
        grid[cy][cx] = 0;
        let p = [0,1,2,3].sort(() => Math.random() - 0.5);
        for(let i of p) {
            let nx = cx + dirs[i].dx;
            let ny = cy + dirs[i].dy;
            if (inBounds(nx, ny) && grid[ny][nx] === 1) {
                // Carve through the middle wall
                grid[cy + dirs[i].dy/2][cx + dirs[i].dx/2] = 0;
                carve(nx, ny);
            }
        }
    }
    
    carve(0, 0);
    
    // Ensure bottom-right corner is accessible (safeguard since W-1, H-1 might not be even)
    if (grid[MAZE_HEIGHT-1][MAZE_WIDTH-1] !== 0) {
        grid[MAZE_HEIGHT-1][MAZE_WIDTH-1] = 0;
        grid[MAZE_HEIGHT-2][MAZE_WIDTH-1] = 0;
    }
    
    // Braiding: find dead ends and open them to create loops
    for (let y = 0; y < MAZE_HEIGHT; y += 2) {
        for (let x = 0; x < MAZE_WIDTH; x += 2) {
             if (grid[y][x] === 0) {
                 let exits = 0;
                 if (y > 0 && grid[y-1][x] === 0) exits++;
                 if (y < MAZE_HEIGHT-1 && grid[y+1][x] === 0) exits++;
                 if (x > 0 && grid[y][x-1] === 0) exits++;
                 if (x < MAZE_WIDTH-1 && grid[y][x+1] === 0) exits++;
                 
                 // if dead end, sometimes open it
                 if (exits === 1 && Math.random() < BRAID_PROBABILITY) {
                     let closed = [];
                     if (y > 1 && grid[y-1][x] === 1) closed.push({x:0, y:-1});
                     if (y < MAZE_HEIGHT-2 && grid[y+1][x] === 1) closed.push({x:0, y:1});
                     if (x > 1 && grid[y][x-1] === 1) closed.push({x:-1, y:0});
                     if (x < MAZE_WIDTH-2 && grid[y][x+1] === 1) closed.push({x:1, y:0});
                     
                     if (closed.length > 0) {
                         let dir = closed[Math.floor(Math.random() * closed.length)];
                         grid[y+dir.y][x+dir.x] = 0;
                     }
                 }
             }
        }
    }
    
    return grid;
}

function getShortestPath(grid, start, target) {
    let queue = [{x: start.x, y: start.y, dist: 0}];
    let visited = Array(MAZE_HEIGHT).fill(0).map(() => Array(MAZE_WIDTH).fill(false));
    visited[start.y][start.x] = true;

    const dirs = [
        {dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}
    ];

    while (queue.length > 0) {
        let curr = queue.shift();
        
        if (curr.x === target.x && curr.y === target.y) {
            return curr.dist;
        }
        
        for (let d of dirs) {
            let nx = curr.x + d.dx;
            let ny = curr.y + d.dy;
            
            if (nx >= 0 && nx < MAZE_WIDTH && ny >= 0 && ny < MAZE_HEIGHT) {
                if (grid[ny][nx] === 0 && !visited[ny][nx]) {
                    visited[ny][nx] = true;
                    queue.push({x: nx, y: ny, dist: curr.dist + 1});
                }
            }
        }
    }
    return -1; // no path found
}

function generateValidMaze() {
    // Generate until we get a valid maze with a sufficiently long path
    const MIN_PATH_LENGTH = 15;
    
    while (true) {
        let maze = generateRawMaze();
        let dist = getShortestPath(maze, {x: 0, y: 0}, {x: MAZE_WIDTH - 1, y: MAZE_HEIGHT - 1});
        
        if (dist >= MIN_PATH_LENGTH) {
            return maze;
        }
    }
}
const BOMB_DURATION_SECONDS = 20;
const TRANSFER_FREEZE_MS = 750;
const COUNTDOWN_SECONDS = 3;
const ROUND_OVER_FREEZE_MS = 3000;

class Game {
    constructor() {
        this.resetMatch();
    }
    
    resetMatch() {
        this.scoreA = 0;
        this.scoreB = 0;
        this.bombHolder = 'A'; // Defaults to A first
        this.startRound();
    }
    
    startRound() {
        this.maze = generateValidMaze();
        
        // Spawn positions
        this.playerA = { x: 0, y: 0 };
        this.playerB = { x: MAZE_WIDTH - 1, y: MAZE_HEIGHT - 1 };
        
        this.activePlayer = this.bombHolder;
        this.phase = "COUNTDOWN";
        this.countdownStartsAt = Date.now();
        this.countdownValue = COUNTDOWN_SECONDS;
    }
    
    handleInput(player, dx, dy) {
        if (this.phase !== "PLAYING") return;
        if (this.activePlayer !== player) return;
        
        const currentPos = player === 'A' ? this.playerA : this.playerB;
        const targetX = currentPos.x + dx;
        const targetY = currentPos.y + dy;
        
        // Boundaries check
        if (targetX < 0 || targetX >= MAZE_WIDTH || targetY < 0 || targetY >= MAZE_HEIGHT) return;
        // Wall check
        if (this.maze[targetY][targetX] === 1) return;
        
        // Valid move
        currentPos.x = targetX;
        currentPos.y = targetY;
        
        // Collision check
        if (this.playerA.x === this.playerB.x && this.playerA.y === this.playerB.y) {
            this.handleCollision();
        }
    }
    
    handleCollision() {
        this.phase = "BOMB_TRANSFER";
        this.bombHolder = this.bombHolder === 'A' ? 'B' : 'A';
        
        setTimeout(() => {
            this.maze = generateValidMaze();
            this.playerA = { x: 0, y: 0 };
            this.playerB = { x: MAZE_WIDTH - 1, y: MAZE_HEIGHT - 1 };
            this.activePlayer = this.bombHolder;
            this.phase = "PLAYING";
            // Wait, does timer reset when passing? PRD says bomb expires.
            // Usually in Hot Potato, bomb timer DOES NOT reset, it keeps ticking until explosion!
            // Let's assume the timer persists across transfers.
        }, TRANSFER_FREEZE_MS);
    }
    
    update(now) {
        if (this.phase === "COUNTDOWN") {
            let elapsed = now - this.countdownStartsAt;
            if (elapsed > COUNTDOWN_SECONDS * 1000) {
                this.phase = "PLAYING";
                // Start bomb timer only when actual play starts
                this.bombExpiresAt = now + (BOMB_DURATION_SECONDS * 1000);
            } else {
                this.countdownValue = COUNTDOWN_SECONDS - Math.floor(elapsed / 1000);
            }
        }
        else if (this.phase === "PLAYING") {
            if (now >= this.bombExpiresAt) {
                this.phase = "ROUND_OVER";
                // The person HOLDING the bomb loses
                if (this.bombHolder === 'A') this.scoreB++;
                else this.scoreA++;
                
                // Let the winner of this round start with the bomb next round (optional, let's keep it flipping)
                this.bombHolder = this.bombHolder === 'A' ? 'B' : 'A';
                
                setTimeout(() => {
                    this.startRound();
                }, ROUND_OVER_FREEZE_MS);
            }
        }
    }
}
const g = new Game(); g.update(Date.now() + 4000); g.handleInput('A', 1, 0); console.log(g.playerA); g.handleInput('A', 0, 1); console.log(g.playerA); console.log(g.maze[0][1], g.maze[1][0]);
