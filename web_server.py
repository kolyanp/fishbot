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

def validate_init_data(init_data: str) -> dict | None:
    try:
        parsed = dict(parse_qsl(init_data))
        if 'hash' not in parsed:
            return None
            
        hash_val = parsed.pop('hash')
        data_check_string = '\n'.join(f"{k}={v}" for k, v in sorted(parsed.items()))
        
        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        
        if calc_hash == hash_val:
            user_str = parsed.get('user', '{}')
            return json.loads(user_str)
    except Exception as e:
        logger.error(f"Validation error: {e}")
    return None

async def api_history(request):
    init_data = request.query.get('initData', '')
    user_data = validate_init_data(init_data)
    
    if not user_data:
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    tg_id = user_data.get('id')
    
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
            "date": c.date.isoformat() if c.date else None
        } for c in catches]
        
    return web.json_response(data)

async def api_catch(request):
    # Process multipart form data
    reader = await request.multipart()
    
    init_data = None
    species = ""
    weight = 0.0
    bait = ""
    photo_data = None
    
    while True:
        field = await reader.next()
        if field is None:
            break
            
        if field.name == 'initData':
            init_data = await field.read(decode=True)
            init_data = init_data.decode()
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

    user_data = validate_init_data(init_data)
    if not user_data:
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    tg_id = user_data.get('id')
    username = user_data.get('username')
    
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
    app = web.Application()
    
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
