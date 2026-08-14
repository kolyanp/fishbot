from aiohttp import web
import aiohttp_cors
import logging
import os
import json
import hmac
import hashlib
from urllib.parse import parse_qsl
from sqlalchemy.future import select
from config import BOT_TOKEN
from database.engine import async_session
from database.models import User, CatchLog

logger = logging.getLogger(__name__)

def validate_secure_url(user_id: str, sig: str) -> bool:
    if not user_id or not sig:
        return False
    try:
        expected_sig = hmac.new(BOT_TOKEN.encode(), str(user_id).encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected_sig, sig)
    except Exception as e:
        logger.error(f"Validation error: {e}")
        return False

async def api_history(request):
    user_id = request.query.get('user_id', '')
    sig = request.query.get('sig', '')
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    tg_id = int(user_id)
    
    async with async_session() as session:
        result = await session.execute(select(User).filter_by(telegram_id=tg_id))
        user = result.scalar_one_or_none()
        
        if not user:
            return web.json_response([])
            
        result = await session.execute(
            select(CatchLog).filter_by(user_id=user.id).order_by(CatchLog.id.desc())
        )
        catches = result.scalars().all()
        
        data = [{
            "id": c.id,
            "species": c.fish_species,
            "weight": c.weight,
            "bait": c.bait,
            "date": c.created_at.isoformat() if c.created_at else None
        } for c in catches]
        
    return web.json_response(data)

async def api_catch(request):
    # Process multipart form data
    reader = await request.multipart()
    
    user_id_str = ""
    sig = ""
    species = ""
    weight = 0.0
    bait = ""
    photo_data = None
    
    while True:
        field = await reader.next()
        if field is None:
            break
            
        if field.name == 'user_id':
            val = await field.read(decode=True)
            user_id_str = val.decode()
        elif field.name == 'sig':
            val = await field.read(decode=True)
            sig = val.decode()
        elif field.name == 'species':
            val = await field.read(decode=True)
            species = val.decode()
        elif field.name == 'weight':
            val = await field.read(decode=True)
            weight = float(val.decode())
        elif field.name == 'bait':
            val = await field.read(decode=True)
            bait = val.decode()
        elif field.name == 'photo' and field.filename:
            photo_data = await field.read()

    if not validate_secure_url(user_id_str, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    tg_id = int(user_id_str)
    username = f"user_{tg_id}" # Fallback since we don't get username in URL
    
    # Save photo (For simplicity, we save it locally for now)
    photo_path = None
    if photo_data:
        os.makedirs("photos", exist_ok=True)
        photo_path = f"photos/{tg_id}_{len(photo_data)}.jpg"
        with open(photo_path, "wb") as f:
            f.write(photo_data)
            
    async with async_session() as session:
        result = await session.execute(select(User).filter_by(telegram_id=tg_id))
        user = result.scalar_one_or_none()
        if not user:
            user = User(telegram_id=tg_id, username=username)
            session.add(user)
            await session.commit()
            await session.refresh(user)
            
        new_log = CatchLog(
            user_id=user.id,
            fish_species=species,
            weight=weight,
            bait=bait,
            photo_id=photo_path
        )
        session.add(new_log)
        await session.commit()
        
    return web.json_response({"success": True})

async def start_web_server(port: int = 8080):
    # Set max upload size to 20MB for photos
    app = web.Application(client_max_size=1024 * 1024 * 20)
    
    # Setup CORS
    cors = aiohttp_cors.setup(app, defaults={
        "*": aiohttp_cors.ResourceOptions(
            allow_credentials=True,
            expose_headers="*",
            allow_headers="*",
        )
    })
    
    # Add API Routes
    cors.add(app.router.add_get('/api/history', api_history))
    cors.add(app.router.add_post('/api/catch', api_catch))
    
    # Path to directories
    current_dir = os.path.dirname(os.path.abspath(__file__))
    webapp_dir = os.path.join(current_dir, 'webapp')
    photos_dir = os.path.join(current_dir, 'photos')
    
    # Create photos dir if not exists
    os.makedirs(photos_dir, exist_ok=True)
    
    # Serve static files
    app.router.add_static('/photos', photos_dir, name='photos')
    app.router.add_static('/', webapp_dir, name='static', show_index=True)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    
    await site.start()
    logger.info(f"Web server started on http://0.0.0.0:{port}")
    return runner
