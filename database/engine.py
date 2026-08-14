import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from config import DB_URL
from database.models import Base

logger = logging.getLogger(__name__)

engine = create_async_engine(DB_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def init_db():
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Database initialized successfully.")
        
        # Safe migration: Add location column to existing catch_logs table
        try:
            from sqlalchemy import text
            await conn.execute(text("ALTER TABLE catch_logs ADD COLUMN location VARCHAR(255)"))
            logger.info("Database migration: Added 'location' column to 'catch_logs'.")
        except Exception:
            # Column already exists or table structure error, safe to ignore
            pass

async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
