import time
from .maze import generate_valid_maze, MAZE_WIDTH, MAZE_HEIGHT

TIMER_SEQUENCE = [20, 18, 16, 14, 12, 10, 8, 7]
COUNTDOWN_SECONDS = 2

class RoomState:
    def __init__(self, room_code):
        self.room_code = room_code
        self.phase = "WAITING"
        
        self.p1_session = None
        self.p2_session = None
        self.p1_ws = None
        self.p2_ws = None
        
        self.maze = []
        self.player_a = {"x": 0, "y": 0}
        self.player_b = {"x": 0, "y": 0}
        
        self.score_a = 0
        self.score_b = 0
        
        self.bomb_holder = "A"
        self.active_player = "A"
        self.starting_player = "A"
        
        self.cycle_number = 1
        self.timer_index = 0
        self.bomb_deadline_ms = 0
        
        self.countdown_deadline_ms = 0
        
    def to_dict(self):
        return {
            "room_code": self.room_code,
            "phase": self.phase,
            "has_p1": self.p1_session is not None,
            "has_p2": self.p2_session is not None,
            "maze": self.maze,
            "player_a": self.player_a,
            "player_b": self.player_b,
            "score_a": self.score_a,
            "score_b": self.score_b,
            "bomb_holder": self.bomb_holder,
            "active_player": self.active_player,
            "cycle_number": self.cycle_number,
            "timer_duration_s": TIMER_SEQUENCE[self.timer_index],
            "bomb_deadline_ms": self.bomb_deadline_ms,
            "countdown_deadline_ms": self.countdown_deadline_ms
        }

    def start_round(self):
        self.cycle_number = 1
        self.timer_index = 0
        self.starting_player = self.bomb_holder
        
        self.maze = generate_valid_maze(TIMER_SEQUENCE[self.timer_index])
        self.player_a = {"x": 0, "y": 0}
        self.player_b = {"x": MAZE_WIDTH - 1, "y": MAZE_HEIGHT - 1}
        self.active_player = self.bomb_holder
        self.phase = "COUNTDOWN"
        self.countdown_deadline_ms = int(time.time() * 1000) + (COUNTDOWN_SECONDS * 1000)

    def transition_to_playing(self):
        self.phase = "PLAYING"
        self.bomb_deadline_ms = int(time.time() * 1000) + (TIMER_SEQUENCE[self.timer_index] * 1000)

    def handle_input(self, player_id, dx, dy):
        if self.phase != "PLAYING": return "REJECTED"
        if self.active_player != player_id: return "REJECTED"

        curr = self.player_a if player_id == "A" else self.player_b
        tx = curr["x"] + dx
        ty = curr["y"] + dy

        if tx < 0 or tx >= MAZE_WIDTH or ty < 0 or ty >= MAZE_HEIGHT: return "REJECTED"
        if self.maze[ty][tx] == 1: return "REJECTED"

        curr["x"] = tx
        curr["y"] = ty
        
        opp = self.player_b if player_id == "A" else self.player_a
        if curr["x"] == opp["x"] and curr["y"] == opp["y"]:
            self.handle_collision()
            return "COLLISION"
            
        return "MOVED"

    def handle_collision(self):
        self.bomb_holder = "B" if self.bomb_holder == "A" else "A"
        
        if self.bomb_holder == self.starting_player:
            self.cycle_number += 1
            self.timer_index = min(self.timer_index + 1, len(TIMER_SEQUENCE) - 1)
            
        next_timer = TIMER_SEQUENCE[self.timer_index]
        self.maze = generate_valid_maze(next_timer)
        self.player_a = {"x": 0, "y": 0}
        self.player_b = {"x": MAZE_WIDTH - 1, "y": MAZE_HEIGHT - 1}
        self.active_player = self.bomb_holder
        self.bomb_deadline_ms = int(time.time() * 1000) + (next_timer * 1000)

    def check_timer(self):
        now = int(time.time() * 1000)
        if self.phase == "COUNTDOWN":
            if now >= self.countdown_deadline_ms:
                self.transition_to_playing()
                return "START_PLAYING"
        elif self.phase == "PLAYING":
            if now >= self.bomb_deadline_ms:
                self.phase = "ROUND_OVER"
                if self.bomb_holder == "A":
                    self.score_b += 1
                else:
                    self.score_a += 1
                self.bomb_holder = "B" if self.bomb_holder == "A" else "A"
                return "EXPLODED"
        return "NONE"
