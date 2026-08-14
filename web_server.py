from aiohttp import web
import aiohttp_cors
import logging
import os
import json
import hmac
import hashlib
from urllib.parse import parse_qsl
from sqlalchemy.future import select
from config import BOT_TOKEN, ADMIN_ID
from database.engine import async_session
from database.models import User, CatchLog, ChatMessage

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
            "location": c.location,
            "lat": c.lat,
            "lon": c.lon,
            "date": c.created_at.isoformat() if c.created_at else None,
            "photo_url": f"/{c.photo_id}" if c.photo_id else None
        } for c in catches]
        
    return web.json_response({
        "is_admin": tg_id == ADMIN_ID,
        "catches": data
    })

async def api_global_map(request):
    user_id = request.query.get('user_id', '')
    sig = request.query.get('sig', '')
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    async with async_session() as session:
        from sqlalchemy.orm import selectinload
        result = await session.execute(
            select(CatchLog)
            .options(selectinload(CatchLog.user))
            .filter(CatchLog.lat.is_not(None))
            .filter(CatchLog.lon.is_not(None))
            .order_by(CatchLog.id.desc())
            .limit(100)
        )
        catches = result.scalars().all()
        
        data = [{
            "id": c.id,
            "species": c.fish_species,
            "weight": c.weight,
            "location": c.location if c.location else "Без назви",
            "lat": c.lat,
            "lon": c.lon,
            "date": c.created_at.isoformat() if c.created_at else None,
            "photo_url": f"/{c.photo_id}" if c.photo_id else None,
            "username": c.user.username if c.user.username else f"Рибалка {c.user.telegram_id}"
        } for c in catches]
        
    return web.json_response({
        "is_admin": int(user_id) == ADMIN_ID if user_id.isdigit() else False,
        "catches": data
    })

async def api_catch(request):
    # Process multipart form data
    reader = await request.multipart()
    
    user_id_str = ""
    sig = ""
    species = ""
    weight = 0.0
    bait = ""
    location = ""
    lat = None
    lon = None
    photo_data = None
    catch_id = None
    
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
        elif field.name == 'location':
            val = await field.read(decode=True)
            location = val.decode()
        elif field.name == 'lat':
            val = await field.read(decode=True)
            if val: lat = float(val.decode())
        elif field.name == 'lon':
            val = await field.read(decode=True)
            if val: lon = float(val.decode())
        elif field.name == 'photo' and field.filename:
            photo_data = await field.read()
        elif field.name == 'catch_id':
            val = await field.read(decode=True)
            if val: catch_id = int(val.decode())

    if not validate_secure_url(user_id_str, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    tg_id = int(user_id_str)
    is_admin = (tg_id == ADMIN_ID)
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
            
        if catch_id:
            # Edit existing catch
            result = await session.execute(select(CatchLog).filter_by(id=catch_id))
            catch = result.scalar_one_or_none()
            if not catch:
                return web.json_response({"error": "Catch not found"}, status=404)
            
            # Check ownership or admin
            if catch.user_id != user.id and not is_admin:
                return web.json_response({"error": "Forbidden"}, status=403)
                
            catch.fish_species = species
            catch.weight = weight
            catch.bait = bait
            catch.location = location
            if lat is not None: catch.lat = lat
            if lon is not None: catch.lon = lon
            
            # Update photo only if new photo is uploaded
            if photo_path:
                if catch.photo_id and os.path.exists(catch.photo_id):
                    try:
                        os.remove(catch.photo_id)
                    except:
                        pass
                catch.photo_id = photo_path
                
        else:
            # Create new catch
            new_log = CatchLog(
                user_id=user.id,
                fish_species=species,
                weight=weight,
                bait=bait,
                location=location,
                lat=lat,
                lon=lon,
                photo_id=photo_path
            )
            session.add(new_log)
            
        await session.commit()
        
    return web.json_response({"success": True})

async def api_catch_delete(request):
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "Invalid JSON"}, status=400)
        
    user_id = data.get('user_id', '')
    sig = data.get('sig', '')
    catch_id = data.get('catch_id')
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    tg_id = int(user_id)
    is_admin = (tg_id == ADMIN_ID)
    
    async with async_session() as session:
        result = await session.execute(select(CatchLog).filter_by(id=catch_id))
        catch = result.scalar_one_or_none()
        
        if not catch:
            return web.json_response({"error": "Not found"}, status=404)
            
        result = await session.execute(select(User).filter_by(id=catch.user_id))
        owner = result.scalar_one_or_none()
        
        if owner.telegram_id != tg_id and not is_admin:
            return web.json_response({"error": "Forbidden"}, status=403)
            
        # Delete photo file if exists
        if catch.photo_id and os.path.exists(catch.photo_id):
            try:
                os.remove(catch.photo_id)
            except:
                pass
                
        await session.delete(catch)
        await session.commit()
        
    return web.json_response({"success": True})

async def api_chat_get(request):
    user_id = request.query.get('user_id', '')
    sig = request.query.get('sig', '')
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    async with async_session() as session:
        from sqlalchemy.orm import selectinload
        # Fetch last 50 messages, ordered by oldest to newest for chat UI
        result = await session.execute(
            select(ChatMessage)
            .options(selectinload(ChatMessage.user))
            .order_by(ChatMessage.id.desc())
            .limit(50)
        )
        messages = result.scalars().all()
        messages.reverse() # We need oldest first in UI
        
        data = [{
            "id": m.id,
            "user_id": m.user.telegram_id,
            "username": m.user.username if m.user.username else f"Рибалка {m.user.telegram_id}",
            "text": m.text,
            "date": m.created_at.isoformat() if m.created_at else None
        } for m in messages]
        
    return web.json_response({
        "is_admin": int(user_id) == ADMIN_ID if user_id.isdigit() else False,
        "current_user_id": int(user_id) if user_id.isdigit() else 0,
        "messages": data
    })

async def api_chat_post(request):
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "Invalid JSON"}, status=400)
        
    user_id = data.get('user_id', '')
    sig = data.get('sig', '')
    text = data.get('text', '').strip()
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    if not text:
        return web.json_response({"error": "Empty message"}, status=400)
        
    if len(text) > 500:
        return web.json_response({"error": "Message too long"}, status=400)
        
    tg_id = int(user_id)
    
    async with async_session() as session:
        result = await session.execute(select(User).filter_by(telegram_id=tg_id))
        user = result.scalar_one_or_none()
        
        if not user:
            return web.json_response({"error": "User not found"}, status=404)
            
        new_msg = ChatMessage(user_id=user.id, text=text)
        session.add(new_msg)
        await session.commit()
        
    return web.json_response({"status": "ok"})

async def api_chat_delete(request):
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "Invalid JSON"}, status=400)
        
    user_id = data.get('user_id', '')
    sig = data.get('sig', '')
    msg_id = data.get('msg_id')
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    tg_id = int(user_id)
    is_admin = (tg_id == ADMIN_ID)
    
    async with async_session() as session:
        result = await session.execute(select(ChatMessage).filter_by(id=msg_id))
        msg = result.scalar_one_or_none()
        
        if not msg:
            return web.json_response({"error": "Not found"}, status=404)
            
        result = await session.execute(select(User).filter_by(id=msg.user_id))
        owner = result.scalar_one_or_none()
        
        if owner.telegram_id != tg_id and not is_admin:
            return web.json_response({"error": "Forbidden"}, status=403)
            
        await session.delete(msg)
        await session.commit()
        
    return web.json_response({"success": True})

async def api_chat_put(request):
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "Invalid JSON"}, status=400)
        
    user_id = data.get('user_id', '')
    sig = data.get('sig', '')
    msg_id = data.get('msg_id')
    text = data.get('text', '').strip()
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    if not text:
        return web.json_response({"error": "Empty message"}, status=400)
        
    tg_id = int(user_id)
    is_admin = (tg_id == ADMIN_ID)
    
    async with async_session() as session:
        result = await session.execute(select(ChatMessage).filter_by(id=msg_id))
        msg = result.scalar_one_or_none()
        
        if not msg:
            return web.json_response({"error": "Not found"}, status=404)
            
        result = await session.execute(select(User).filter_by(id=msg.user_id))
        owner = result.scalar_one_or_none()
        
        if owner.telegram_id != tg_id and not is_admin:
            return web.json_response({"error": "Forbidden"}, status=403)
            
        msg.text = text
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
    cors.add(app.router.add_get('/api/global_map', api_global_map))
    cors.add(app.router.add_post('/api/catch', api_catch))
    cors.add(app.router.add_delete('/api/catch', api_catch_delete))
    cors.add(app.router.add_get('/api/chat', api_chat_get))
    cors.add(app.router.add_post('/api/chat', api_chat_post))
    cors.add(app.router.add_put('/api/chat', api_chat_put))
    cors.add(app.router.add_delete('/api/chat', api_chat_delete))
    
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
