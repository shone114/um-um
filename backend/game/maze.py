import random
import time
from collections import deque
from functools import reduce

MAZE_WIDTH = 15
MAZE_HEIGHT = 15

BRAID_PROB_INNER = 0.40
BRAID_PROB_BOUNDARY = 0.05

TARGETS = {
    20: {"min": 65, "max": 80},
    18: {"min": 60, "max": 75},
    16: {"min": 50, "max": 65},
    14: {"min": 45, "max": 55},
    12: {"min": 40, "max": 48},
    10: {"min": 34, "max": 42},
    8: {"min": 30, "max": 38},
    7: {"min": 28, "max": 35},
    6: {"min": 28, "max": 35},
    5: {"min": 28, "max": 35},
    4: {"min": 28, "max": 35},
    3: {"min": 28, "max": 35},
    2: {"min": 28, "max": 35}
}

def in_bounds(x, y):
    return 0 <= x < MAZE_WIDTH and 0 <= y < MAZE_HEIGHT

def generate_raw_maze():
    grid = [[1 for _ in range(MAZE_WIDTH)] for _ in range(MAZE_HEIGHT)]
    
    dirs = [
        {"dx": 0, "dy": -2},
        {"dx": 2, "dy": 0},
        {"dx": 0, "dy": 2},
        {"dx": -2, "dy": 0}
    ]

    def carve(cx, cy):
        grid[cy][cx] = 0
        shuffled_dirs = dirs[:]
        random.shuffle(shuffled_dirs)
        
        for d in shuffled_dirs:
            nx = cx + d["dx"]
            ny = cy + d["dy"]
            if in_bounds(nx, ny) and grid[ny][nx] == 1:
                grid[cy + d["dy"] // 2][cx + d["dx"] // 2] = 0
                carve(nx, ny)

    carve(0, 0)
    
    # Safeguard bottom right
    target_y = MAZE_HEIGHT - 1
    target_x = MAZE_WIDTH - 1
    if grid[target_y][target_x] != 0:
        grid[target_y][target_x] = 0
        if target_y > 0: grid[target_y - 1][target_x] = 0
        if target_x > 0: grid[target_y][target_x - 1] = 0

    # Selective Braiding
    for y in range(0, MAZE_HEIGHT, 2):
        for x in range(0, MAZE_WIDTH, 2):
            if grid[y][x] == 0:
                exits = 0
                if y > 0 and grid[y - 1][x] == 0: exits += 1
                if y < MAZE_HEIGHT - 1 and grid[y + 1][x] == 0: exits += 1
                if x > 0 and grid[y][x - 1] == 0: exits += 1
                if x < MAZE_WIDTH - 1 and grid[y][x + 1] == 0: exits += 1

                if exits == 1:
                    is_boundary = (x == 0 or x == MAZE_WIDTH - 1 or y == 0 or y == MAZE_HEIGHT - 1)
                    prob = BRAID_PROB_BOUNDARY if is_boundary else BRAID_PROB_INNER

                    if random.random() < prob:
                        closed = []
                        if y > 1 and grid[y - 1][x] == 1: closed.append({"x": 0, "y": -1})
                        if y < MAZE_HEIGHT - 2 and grid[y + 1][x] == 1: closed.append({"x": 0, "y": 1})
                        if x > 1 and grid[y][x - 1] == 1: closed.append({"x": -1, "y": 0})
                        if x < MAZE_WIDTH - 2 and grid[y][x + 1] == 1: closed.append({"x": 1, "y": 0})

                        if closed:
                            d = random.choice(closed)
                            grid[y + d["y"]][x + d["x"]] = 0
    return grid

def get_shortest_path_coords(grid, start, target):
    queue = deque([start])
    visited = [[False for _ in range(MAZE_WIDTH)] for _ in range(MAZE_HEIGHT)]
    parent = {}
    
    visited[start[1]][start[0]] = True
    parent[start] = None

    dirs = [(0, -1), (0, 1), (-1, 0), (1, 0)]

    while queue:
        curr = queue.popleft()
        
        if curr == target:
            path = []
            trace = curr
            while trace is not None:
                path.append(trace)
                trace = parent.get(trace)
            path.reverse()
            return path

        for dx, dy in dirs:
            nx, ny = curr[0] + dx, curr[1] + dy
            if in_bounds(nx, ny) and grid[ny][nx] == 0 and not visited[ny][nx]:
                visited[ny][nx] = True
                next_point = (nx, ny)
                parent[next_point] = curr
                queue.append(next_point)
                
    return None

def calculate_turns(path):
    if len(path) < 3: return 0
    turns = 0
    prev_dx = path[1][0] - path[0][0]
    prev_dy = path[1][1] - path[0][1]
    
    for i in range(2, len(path)):
        dx = path[i][0] - path[i-1][0]
        dy = path[i][1] - path[i-1][1]
        if dx != prev_dx or dy != prev_dy:
            turns += 1
            prev_dx = dx
            prev_dy = dy
    return turns

def calculate_boundary_ratio(path):
    if not path: return 0
    bound_count = sum(1 for p in path if p[0] == 0 or p[0] == MAZE_WIDTH - 1 or p[1] == 0 or p[1] == MAZE_HEIGHT - 1)
    return bound_count / len(path)

def count_dead_ends(grid):
    ends = 0
    for y in range(MAZE_HEIGHT):
        for x in range(MAZE_WIDTH):
            if grid[y][x] == 0:
                exits = 0
                if y > 0 and grid[y-1][x] == 0: exits += 1
                if y < MAZE_HEIGHT-1 and grid[y+1][x] == 0: exits += 1
                if x > 0 and grid[y][x-1] == 0: exits += 1
                if x < MAZE_WIDTH-1 and grid[y][x+1] == 0: exits += 1
                if exits == 1: ends += 1
    return ends

def count_junctions(grid, path):
    js = 0
    for p in path:
        x, y = p
        exits = 0
        if y > 0 and grid[y-1][x] == 0: exits += 1
        if y < MAZE_HEIGHT-1 and grid[y+1][x] == 0: exits += 1
        if x > 0 and grid[y][x-1] == 0: exits += 1
        if x < MAZE_WIDTH-1 and grid[y][x+1] == 0: exits += 1
        if exits > 2: js += 1
    return js

def evaluate_maze_metrics(grid):
    path = get_shortest_path_coords(grid, (0, 0), (MAZE_WIDTH - 1, MAZE_HEIGHT - 1))
    if not path: return None
    
    return {
        "pathLength": len(path),
        "turns": calculate_turns(path),
        "boundaryRatio": calculate_boundary_ratio(path),
        "junctions": count_junctions(grid, path),
        "deadEnds": count_dead_ends(grid)
    }

def creates_2x2_blob(grid, x, y):
    grid[y][x] = 0 # Temp open
    is_blob = False
    for by in range(y - 1, y + 1):
        for bx in range(x - 1, x + 1):
            if 0 <= by < MAZE_HEIGHT - 1 and 0 <= bx < MAZE_WIDTH - 1:
                if grid[by][bx] == 0 and grid[by][bx + 1] == 0 and grid[by + 1][bx] == 0 and grid[by + 1][bx + 1] == 0:
                    is_blob = True
    grid[y][x] = 1 # Restore
    return is_blob

def get_candidate_walls(grid):
    candidates = []
    for y in range(1, MAZE_HEIGHT - 1):
        for x in range(1, MAZE_WIDTH - 1):
            if grid[y][x] == 1:
                adj = 0
                if grid[y - 1][x] == 0: adj += 1
                if grid[y + 1][x] == 0: adj += 1
                if grid[y][x - 1] == 0: adj += 1
                if grid[y][x + 1] == 0: adj += 1
                if adj >= 2:
                    if not creates_2x2_blob(grid, x, y):
                        candidates.append((x, y))
    return candidates

def evaluate_candidates(grid, candidates, current_length):
    results = []
    start = (0, 0)
    end = (MAZE_WIDTH - 1, MAZE_HEIGHT - 1)
    
    for c in candidates:
        grid[c[1]][c[0]] = 0 # Mock remove
        path = get_shortest_path_coords(grid, start, end)
        if path:
            new_len = len(path)
            if new_len < current_length:
                results.append({
                    "point": c,
                    "pathReduction": current_length - new_len,
                    "newMetrics": {
                        "pathLength": new_len,
                        "turns": calculate_turns(path),
                        "boundaryRatio": calculate_boundary_ratio(path),
                        "junctions": count_junctions(grid, path),
                        "deadEnds": count_dead_ends(grid)
                    }
                })
        grid[c[1]][c[0]] = 1 # Rollback
    return results

def generate_valid_maze(timer_seconds=20):
    start_time = time.time()
    total_bfs = 0
    target_range = TARGETS.get(timer_seconds, {"min": 28, "max": 80})
    safety_counter = 0
    
    while safety_counter < 20:
        safety_counter += 1
        grid = generate_raw_maze()
        current_metrics = evaluate_maze_metrics(grid)
        if not current_metrics: continue
        
        # Perfect out of the box
        if target_range["min"] <= current_metrics["pathLength"] <= target_range["max"]:
            return grid
            
        # Too short naturally
        if current_metrics["pathLength"] < target_range["min"]:
            continue

        cands = get_candidate_walls(grid)
        max_budget = int(len(cands) * 0.15)
        walls_removed = 0
        current_length = current_metrics["pathLength"]

        while walls_removed < max_budget and current_length > target_range["max"]:
            cands = get_candidate_walls(grid)
            if not cands: break

            evals = evaluate_candidates(grid, cands, current_length)
            total_bfs += len(cands)
            if not evals: break

            # Reject extreme overshoots (-3)
            safe_evals = [e for e in evals if e["newMetrics"]["pathLength"] >= target_range["min"] - 3]
            valid_evals = safe_evals if safe_evals else evals

            # Strategy D -> Weighted center target
            target_center = (target_range["min"] + target_range["max"]) / 2.0
            
            def closer_to_center(prev, curr):
                p1 = abs(target_center - prev["newMetrics"]["pathLength"])
                p2 = abs(target_center - curr["newMetrics"]["pathLength"])
                return prev if p1 < p2 else curr
                
            chosen = reduce(closer_to_center, valid_evals)

            grid[chosen["point"][1]][chosen["point"][0]] = 0
            walls_removed += 1
            current_length = chosen["newMetrics"]["pathLength"]

        if target_range["min"] <= current_length <= target_range["max"]:
            return grid 
            
    # Fallback return directly
    return generate_raw_maze()
