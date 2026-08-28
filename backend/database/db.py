import os
import asyncpg
import logging

logger = logging.getLogger("db")
pool = None

async def init_db():
    global pool
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        logger.warning("No DATABASE_URL provided. Postgres inserts will be NO-OP.")
        return
    try:
        pool = await asyncpg.create_pool(db_url)
        logger.info("Successfully connected to Supabase Postgres pool.")
        
        # Ensure schema lightly
        async with pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS matches (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    room_code TEXT NOT NULL,
                    p1_session TEXT NOT NULL,
                    p2_session TEXT,
                    winner TEXT,
                    score_p1 INT DEFAULT 0,
                    score_p2 INT DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    started_at TIMESTAMP WITH TIME ZONE,
                    finished_at TIMESTAMP WITH TIME ZONE
                );
                
                CREATE TABLE IF NOT EXISTS telemetry_turns (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    match_id UUID REFERENCES matches(id),
                    cycle_number INT,
                    active_player TEXT,
                    timer_duration INT,
                    maze_width INT DEFAULT 15,
                    actual_moves INT,
                    elapsed_ms INT,
                    result TEXT
                );
            """)
    except Exception as e:
        logger.error(f"Failed to connect to DB: {e}")

async def create_match(room_code, p1_session):
    if not pool: return None
    try:
        async with pool.acquire() as conn:
            return await conn.fetchval("""
                INSERT INTO matches (room_code, p1_session) 
                VALUES ($1, $2) RETURNING id
            """, room_code, p1_session)
    except Exception as e:
        logger.error(f"create_match DB error: {e}")
        return None

async def join_match(match_id, p2_session):
    if not pool or not match_id: return
    try:
        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE matches SET p2_session = $1, started_at = NOW() 
                WHERE id = $2
            """, p2_session, match_id)
    except Exception as e:
        logger.error(f"join_match DB error: {e}")

async def log_turn(match_id, cycle, active_player, timer, moves, elapsed, result):
    if not pool or not match_id: return
    try:
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO telemetry_turns (match_id, cycle_number, active_player, timer_duration, actual_moves, elapsed_ms, result) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            """, match_id, cycle, active_player, timer, moves, elapsed, result)
    except Exception as e:
        logger.error(f"log_turn DB error: {e}")

async def finish_match(match_id, winner, score_p1, score_p2):
    if not pool or not match_id: return
    try:
        async with pool.acquire() as conn:
            await conn.execute("""
                UPDATE matches SET winner = $1, score_p1 = $2, score_p2 = $3, finished_at = NOW() 
                WHERE id = $4
            """, winner, score_p1, score_p2, match_id)
    except Exception as e:
        logger.error(f"finish_match DB error: {e}")
