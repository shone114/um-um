import asyncio
import os
import json
import uuid
import random
import string
import time
import logging
import traceback
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn
from contextlib import asynccontextmanager
from game.engine import RoomState
import database.db as db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("server")

rooms = {} # type: dict[str, RoomState]

def generate_room_code():
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
        if code not in rooms:
            return code

async def broadcast(room, message_dict):
    msg = json.dumps(message_dict)
    if room.p1_ws:
        try:
            await room.p1_ws.send_text(msg)
        except Exception:
            pass
    if room.p2_ws:
        try:
            await room.p2_ws.send_text(msg)
        except Exception:
            pass

async def broadcast_state(room):
    await broadcast(room, {"type": "state_sync", "payload": room.to_dict()})

async def handle_create(websocket, session_id):
    code = generate_room_code()
    room = RoomState(code)
    room.p1_session = session_id
    room.p1_ws = websocket
    rooms[code] = room
    room.match_id = await db.create_match(code, session_id)
    logger.info(f"Room {code} created by session {session_id[:8]}")
    await websocket.send_text(json.dumps({"type": "room_joined", "payload": {"room_code": code, "slot": "A"}}))
    await broadcast_state(room)

async def handle_join(websocket, session_id, code):
    room = rooms.get(code)
    if not room:
        await websocket.send_text(json.dumps({"type": "error", "message": "ROOM_NOT_FOUND"}))
        return

    # Check for reconnect
    if room.p1_session == session_id:
        room.p1_ws = websocket
        await websocket.send_text(json.dumps({"type": "room_joined", "payload": {"room_code": code, "slot": "A"}}))
        await broadcast_state(room)
        return
        
    if room.p2_session == session_id:
        room.p2_ws = websocket
        await websocket.send_text(json.dumps({"type": "room_joined", "payload": {"room_code": code, "slot": "B"}}))
        await broadcast_state(room)
        return

    # New Join
    if room.p2_session is None:
        room.p2_session = session_id
        room.p2_ws = websocket
        logger.info(f"Session {session_id[:8]} joined Room {code} as Player B")
        await websocket.send_text(json.dumps({"type": "room_joined", "payload": {"room_code": code, "slot": "B"}}))
        # Both players connected!
        room.start_round()
        await broadcast_state(room)
        asyncio.create_task(db.join_match(getattr(room, 'match_id', None), session_id))
    else:
        await websocket.send_text(json.dumps({"type": "error", "message": "ROOM_FULL"}))

async def handle_move(websocket, session_id, code, payload):
    room = rooms.get(code)
    if not room: return
    
    player_id = "A" if room.p1_session == session_id else ("B" if room.p2_session == session_id else None)
    if not player_id: return
    
    direction = payload.get("direction")
    dx, dy = 0, 0
    if direction == "up": dy = -1
    elif direction == "down": dy = 1
    elif direction == "left": dx = -1
    elif direction == "right": dx = 1
    
    res = room.handle_input(player_id, dx, dy)
    if res == "MOVED" or res == "COLLISION":
        await broadcast(room, {
            "type": "player_moved", 
            "player": player_id, 
            "pos": room.player_a if player_id == "A" else room.player_b,
            "collision": (res == "COLLISION")
        })
        if res == "COLLISION":
            await broadcast_state(room)

async def handle_message(websocket, data):
    msg_type = data.get("type")
    session_id = data.get("session_id")
    if not session_id: return
    
    if msg_type == "create":
        await handle_create(websocket, session_id)
    elif msg_type == "join":
        code = data.get("room_code")
        if code: await handle_join(websocket, session_id, code.upper())
    elif msg_type == "move":
        code = data.get("room_code")
        if code: await handle_move(websocket, session_id, code, data.get("payload", {}))
    elif msg_type == "ping":
        await websocket.send_text(json.dumps({"type": "pong", "server_time": int(time.time()*1000)}))

async def game_loop_ticker():
    while True:
        for code, room in list(rooms.items()):
            res = room.check_timer()
            if res != "NONE":
                await broadcast_state(room)
                if res == "EXPLODED":
                    await asyncio.sleep(3)
                    room.start_round()
                    await broadcast_state(room)
        await asyncio.sleep(0.1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    from dotenv import load_dotenv
    load_dotenv()
    await db.init_db()
    asyncio.create_task(game_loop_ticker())
    yield

app = FastAPI(lifespan=lifespan)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_ip = websocket.client.host
    try:
        while True:
            message = await websocket.receive_text()
            try:
                data = json.loads(message)
                await handle_message(websocket, data)
            except Exception as e:
                logger.error(f"Error handling message: {e}\n{traceback.format_exc()}")
    except WebSocketDisconnect:
        logger.info(f"Client disconnected: {client_ip}")
        for code, room in rooms.items():
            if getattr(room, 'p1_ws', None) == websocket: room.p1_ws = None
            if getattr(room, 'p2_ws', None) == websocket: room.p2_ws = None

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)
