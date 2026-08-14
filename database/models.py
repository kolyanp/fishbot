from datetime import datetime
from sqlalchemy import BigInteger, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=True)
    
    # Moderation fields
    is_banned: Mapped[bool] = mapped_column(default=False)
    ban_reason: Mapped[str] = mapped_column(String(255), nullable=True)
    muted_until: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    mute_reason: Mapped[str] = mapped_column(String(255), nullable=True)
    is_moderator: Mapped[bool] = mapped_column(default=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationship to catch logs
    logs: Mapped[list["CatchLog"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(telegram_id={self.telegram_id}, username={self.username})>"


class CatchLog(Base):
    __tablename__ = 'catch_logs'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    fish_species: Mapped[str] = mapped_column(String(255), nullable=False)
    weight: Mapped[float] = mapped_column(Float, nullable=True)
    bait: Mapped[str] = mapped_column(String(255), nullable=True)
    location: Mapped[str] = mapped_column(String(255), nullable=True)
    lat: Mapped[float] = mapped_column(Float, nullable=True)
    lon: Mapped[float] = mapped_column(Float, nullable=True)
    photo_id: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationship to user
    user: Mapped["User"] = relationship(back_populates="logs")

    def __repr__(self):
        return f"<CatchLog(fish_species={self.fish_species}, weight={self.weight})>"


class ChatMessage(Base):
    __tablename__ = 'chat_messages'

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    text: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationship to user
    user: Mapped["User"] = relationship()

    def __repr__(self):
        return f"<ChatMessage(id={self.id}, text='{self.text[:20]}')>"
