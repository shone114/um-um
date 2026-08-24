import { generateValidMaze, evaluateMazeMetrics, MAZE_WIDTH, MAZE_HEIGHT } from './maze';
import type { Point, MazeMetrics } from './maze';

export type GamePhase = "COUNTDOWN" | "PLAYING" | "ROUND_OVER";
export type PlayerId = 'A' | 'B';

export interface TurnTelemetry {
    session_id: string;
    timestamp: string;
    event_type: 'GAMEPLAY_TURN' | 'BENCHMARK';
    turn_number: number;
    timer_duration_seconds: number;
    maze_seed: string;
    maze_width: number;
    maze_height: number;
    maze_grid: number[][]; // Full array
    optimal_path_length: number;
    optimal_path_turns: number;
    junction_count: number;
    dead_end_count: number;
    boundary_ratio: number;
    actual_moves: number;
    invalid_moves: number;
    elapsed_time_ms: number;
    actual_moves_per_second: number;
    bomb_time_remaining_ms: number;
    result: 'PASS' | 'EXPLODE';
}

export const TIMER_SEQUENCE = [20, 18, 15, 12, 10, 8, 7, 6, 5, 4, 3, 2];
export const COUNTDOWN_SECONDS = 2; // Actually give users 2s to prepare
export const ROUND_OVER_FREEZE_MS = 3000;

export class GameEngine {
    public phase: GamePhase = "COUNTDOWN";
    public maze: number[][] = [];
    public playerA: Point = { x: 0, y: 0 };
    public playerB: Point = { x: 0, y: 0 };
    
    public scoreA = 0;
    public scoreB = 0;
    
    public bombHolder: PlayerId = 'A';
    public activePlayer: PlayerId = 'A';
    
    public countdownStartsAt = 0;
    public countdownValue = COUNTDOWN_SECONDS;
    public bombExpiresAt = 0;
    public timerIndex = 0;
    
    public currentMetrics: MazeMetrics | null = null;
    public sessionLog: TurnTelemetry[] = [];
    public sessionId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    public currentEventType = 'GAMEPLAY_TURN';
    public turnNumber = 1;
    public currentTurnValidMoves = 0;
    public currentTurnInvalidMoves = 0;
    public turnStartMs = 0;
    
    constructor() {
        this.resetMatch();
    }

    public resetMatch() {
        this.scoreA = 0;
        this.scoreB = 0;
        this.bombHolder = 'A';
        this.sessionLog = [];
        this.turnNumber = 1;
        this.startRound();
    }

    public startRound() {
        this.maze = generateValidMaze();
        this.currentMetrics = evaluateMazeMetrics(this.maze);
        this.playerA = { x: 0, y: 0 };
        this.playerB = { x: MAZE_WIDTH - 1, y: MAZE_HEIGHT - 1 };
        
        this.activePlayer = this.bombHolder;
        this.phase = "COUNTDOWN";
        this.countdownStartsAt = Date.now();
        this.countdownValue = COUNTDOWN_SECONDS;
        this.timerIndex = 0;
    }

    public handleInput(player: PlayerId, dx: number, dy: number) {
        if (this.phase !== "PLAYING") return;
        if (this.activePlayer !== player) return;
        
        const currentPos = player === 'A' ? this.playerA : this.playerB;
        const targetX = currentPos.x + dx;
        const targetY = currentPos.y + dy;
        
        // Boundaries
        if (targetX < 0 || targetX >= MAZE_WIDTH || targetY < 0 || targetY >= MAZE_HEIGHT) return;
        
        // Walls
        if (this.maze[targetY][targetX] === 1) return;
        
        // Valid move
        this.currentTurnValidMoves++;
        currentPos.x = targetX;
        currentPos.y = targetY;
        
        // Check collision (same position as opponent)
        const opponent = player === 'A' ? this.playerB : this.playerA;
        if (currentPos.x === opponent.x && currentPos.y === opponent.y) {
            this.handleCollision();
        }
    }

    private finalizeTurn(result: 'PASS' | 'EXPLODE') {
        if (!this.turnStartMs || !this.currentMetrics) return;
        const completionTimeMs = Date.now() - this.turnStartMs;
        const movesPerSecond = completionTimeMs > 0 ? (this.currentTurnValidMoves / (completionTimeMs / 1000)) : 0;
        
        const logData: TurnTelemetry = {
            session_id: this.sessionId,
            timestamp: new Date().toISOString(),
            event_type: this.currentEventType as ('GAMEPLAY_TURN'|'BENCHMARK'),
            turn_number: this.turnNumber,
            timer_duration_seconds: TIMER_SEQUENCE[this.timerIndex],
            maze_seed: "math-random", // Current generation lacks hard seed logic, using placeholder
            maze_width: MAZE_WIDTH,
            maze_height: MAZE_HEIGHT,
            maze_grid: JSON.parse(JSON.stringify(this.maze)),
            optimal_path_length: this.currentMetrics.pathLength,
            optimal_path_turns: this.currentMetrics.turns,
            junction_count: this.currentMetrics.junctions,
            dead_end_count: this.currentMetrics.deadEnds,
            boundary_ratio: this.currentMetrics.boundaryRatio,
            actual_moves: this.currentTurnValidMoves,
            invalid_moves: this.currentTurnInvalidMoves,
            elapsed_time_ms: completionTimeMs,
            actual_moves_per_second: movesPerSecond,
            bomb_time_remaining_ms: Math.max(0, this.bombExpiresAt - Date.now()),
            result
        };
        
        this.sessionLog.unshift(logData);
        
        fetch('/api/telemetry', {
            method: 'POST',
            body: JSON.stringify(logData)
        }).catch(() => null);
    }

    private handleCollision() {
        this.finalizeTurn('PASS');
        
        this.currentEventType = 'GAMEPLAY_TURN';
        this.bombHolder = this.bombHolder === 'A' ? 'B' : 'A';
        this.maze = generateValidMaze();
        this.currentMetrics = evaluateMazeMetrics(this.maze);
        this.playerA = { x: 0, y: 0 };
        this.playerB = { x: MAZE_WIDTH - 1, y: MAZE_HEIGHT - 1 };
        this.activePlayer = this.bombHolder;
        this.timerIndex = Math.min(this.timerIndex + 1, TIMER_SEQUENCE.length - 1);
        this.bombExpiresAt = Date.now() + (TIMER_SEQUENCE[this.timerIndex] * 1000);
        
        this.turnNumber++;
        this.currentTurnValidMoves = 0;
        this.currentTurnInvalidMoves = 0;
        this.turnStartMs = Date.now();
    }

    public update(now: number) {
        if (this.phase === "COUNTDOWN") {
            const elapsed = now - this.countdownStartsAt;
            if (elapsed > COUNTDOWN_SECONDS * 1000) {
                this.phase = "PLAYING";
                this.bombExpiresAt = now + (TIMER_SEQUENCE[this.timerIndex] * 1000);
                this.currentTurnValidMoves = 0;
                this.currentTurnInvalidMoves = 0;
                this.turnStartMs = now;
            } else {
                this.countdownValue = COUNTDOWN_SECONDS - Math.max(0, Math.floor(elapsed / 1000));
            }
        } 
        else if (this.phase === "PLAYING") {
            if (now >= this.bombExpiresAt) {
                this.finalizeTurn('EXPLODE');
                this.phase = "ROUND_OVER";
                if (this.bombHolder === 'A') this.scoreB++;
                else this.scoreA++;
                
                this.bombHolder = this.bombHolder === 'A' ? 'B' : 'A';
                
                setTimeout(() => {
                    this.startRound();
                }, ROUND_OVER_FREEZE_MS);
            }
        }
    }
    
    public triggerBenchmark() {
        this.currentEventType = 'BENCHMARK';
        this.maze = Array.from({length: MAZE_HEIGHT}, () => new Array(MAZE_WIDTH).fill(0));
        this.playerA = { x: 0, y: 0 };
        this.playerB = { x: MAZE_WIDTH - 1, y: MAZE_HEIGHT - 1 };
        this.currentMetrics = { pathLength: 28, turns: 1, boundaryRatio: 0, junctions: 0, deadEnds: 0 };
        
        this.currentTurnValidMoves = 0;
        this.currentTurnInvalidMoves = 0;
        this.phase = "COUNTDOWN";
        this.countdownStartsAt = Date.now();
        this.countdownValue = COUNTDOWN_SECONDS;
    }
    
    public printSessionSummary() {
        console.log(`==== SESSION SUMMARY [ID: ${this.sessionId}] ====`);
        const gameplayLogs = this.sessionLog.filter(l => l.event_type === 'GAMEPLAY_TURN');
        const passes = gameplayLogs.filter(l => l.result === 'PASS');
        const explosions = gameplayLogs.filter(l => l.result === 'EXPLODE');
        
        console.log(`Total Turns Played: ${gameplayLogs.length}`);
        console.log(`Successful Passes: ${passes.length}`);
        console.log(`Explosions: ${explosions.length}`);
        
        if (gameplayLogs.length > 0) {
            const sumMps = gameplayLogs.reduce((acc, l) => acc + l.actual_moves_per_second, 0) / gameplayLogs.length;
            const sumOpt = gameplayLogs.reduce((acc, l) => acc + l.optimal_path_length, 0) / gameplayLogs.length;
            const sumAct = gameplayLogs.reduce((acc, l) => acc + l.actual_moves, 0) / gameplayLogs.length;
            const sumTms = gameplayLogs.reduce((acc, l) => acc + l.elapsed_time_ms, 0) / gameplayLogs.length;
            console.log(`Avgs: ${sumMps.toFixed(2)} m/s | ${sumAct.toFixed(0)} moves (Optimal ~${sumOpt.toFixed(0)}) | ${(sumTms/1000).toFixed(1)}s elapsed`);
            
            // Console layout by timer
            const byTimer: Record<string, TurnTelemetry[]> = {};
            gameplayLogs.forEach(l => {
                if(!byTimer[l.timer_duration_seconds]) byTimer[l.timer_duration_seconds] = [];
                byTimer[l.timer_duration_seconds].push(l);
            });
            console.table(
                Object.keys(byTimer).map(s => {
                    const pool = byTimer[s];
                    return {
                        "Timer (s)": s,
                        "Count": pool.length,
                        "Passes": pool.filter(p=>p.result==='PASS').length,
                        "Avg Moves/sec": (pool.reduce((a,b)=>a+b.actual_moves_per_second,0)/pool.length).toFixed(2),
                        "Avg Excess Moves": (pool.reduce((a,b)=>a+(b.actual_moves-b.optimal_path_length),0)/pool.length).toFixed(1)
                    }
                })
            )
        }
        console.log("==================================================");
    }
}
