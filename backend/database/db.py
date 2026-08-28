import os
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
        from psycopg_pool import AsyncConnectionPool
        pool = AsyncConnectionPool(conninfo=db_url, min_size=1, max_size=5)
        await pool.open()
        logger.info("Successfully connected to Supabase Postgres pool.")
        
        # Ensure schema
        async with pool.connection() as conn:
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
            """)
            await conn.execute("""
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
            await conn.commit()
    except Exception as e:
        logger.error(f"Failed to connect to DB: {e}")

async def create_match(room_code, p1_session):
    if not pool: return None
    try:
        async with pool.connection() as conn:
            cur = await conn.execute("""
                INSERT INTO matches (room_code, p1_session) 
                VALUES (%s, %s) RETURNING id
            """, (room_code, p1_session))
            row = await cur.fetchone()
            await conn.commit()
            return row[0] if row else None
    except Exception as e:
        logger.error(f"create_match DB error: {e}")
        return None

async def join_match(match_id, p2_session):
    if not pool or not match_id: return
    try:
        async with pool.connection() as conn:
            await conn.execute("""
                UPDATE matches SET p2_session = %s, started_at = NOW() 
                WHERE id = %s
            """, (p2_session, str(match_id)))
            await conn.commit()
    except Exception as e:
        logger.error(f"join_match DB error: {e}")

async def log_turn(match_id, cycle, active_player, timer, moves, elapsed, result):
    if not pool or not match_id: return
    try:
        async with pool.connection() as conn:
            await conn.execute("""
                INSERT INTO telemetry_turns (match_id, cycle_number, active_player, timer_duration, actual_moves, elapsed_ms, result) 
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (str(match_id), cycle, active_player, timer, moves, elapsed, result))
            await conn.commit()
    except Exception as e:
        logger.error(f"log_turn DB error: {e}")

async def finish_match(match_id, winner, score_p1, score_p2):
    if not pool or not match_id: return
    try:
        async with pool.connection() as conn:
            await conn.execute("""
                UPDATE matches SET winner = %s, score_p1 = %s, score_p2 = %s, finished_at = NOW() 
                WHERE id = %s
            """, (winner, score_p1, score_p2, str(match_id)))
            await conn.commit()
    except Exception as e:
        logger.error(f"finish_match DB error: {e}")
