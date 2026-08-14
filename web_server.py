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
from datetime import datetime
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

async def get_user_and_check_auth(tg_id: int, session):
    result = await session.execute(select(User).filter_by(telegram_id=tg_id))
    user = result.scalar_one_or_none()
    
    if not user:
        return None, False, False, None, None, None
        
    is_admin = (tg_id == ADMIN_ID) or user.is_moderator
    return user, is_admin, user.is_banned, user.ban_reason, user.muted_until, user.mute_reason

import uuid
from google.oauth2 import id_token
from google.auth.transport import requests

async def get_user_from_auth(request, session, data=None):
    if data is None:
        data = request.query
    
    token = data.get('token')
    guest = data.get('guest')
    user_id = data.get('user_id')
    sig = data.get('sig')
    
    if token:
        result = await session.execute(select(User).filter_by(auth_token=token))
        user = result.scalar_one_or_none()
        if user:
            is_admin = user.is_admin or user.is_moderator or (user.telegram_id == ADMIN_ID)
            return user, is_admin, user.is_banned, user.ban_reason, user.muted_until, user.mute_reason, False
    elif guest:
        # Return a dummy user for guest
        class GuestUser:
            id = 0
            username = f"Гість: {guest}"
            telegram_id = 0
        return GuestUser(), False, False, None, None, None, True
    elif user_id and sig:
        if validate_secure_url(user_id, sig):
            tg_id = int(user_id) if str(user_id).isdigit() else 0
            user, is_admin, is_banned, ban_reason, muted_until, mute_reason = await get_user_and_check_auth(tg_id, session)
            return user, is_admin, is_banned, ban_reason, muted_until, mute_reason, False
            
    return None, False, False, None, None, None, False


async def api_history(request):
    user_id = request.query.get('user_id', '')
    sig = request.query.get('sig', '')
    
    async with async_session() as session:
        user, is_admin, is_banned, ban_reason, muted_until, mute_reason, is_guest = await get_user_from_auth(request, session)
        if not user:
            return web.json_response({"error": "Unauthorized"}, status=401)
        
        if not user:
            return web.json_response([])
            
        from sqlalchemy.orm import selectinload
        result = await session.execute(
            select(CatchLog)
            .options(selectinload(CatchLog.likes))
            .filter_by(user_id=user.id)
            .order_by(CatchLog.id.desc())
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
            "photo_url": f"/{c.photo_id}" if c.photo_id else None,
            "likes": len(c.likes),
            "is_liked": any(l.user_id == user.id for l in c.likes)
        } for c in catches]
        
    return web.json_response({
        "is_admin": is_admin if user else False,
        "is_banned": is_banned if user else False,
        "ban_reason": ban_reason if user else None,
        "catches": data
    })

async def api_global_map(request):
    user_id = request.query.get('user_id', '')
    sig = request.query.get('sig', '')
    
    async with async_session() as session:
        user, is_admin, is_banned, ban_reason, muted_until, mute_reason, is_guest = await get_user_from_auth(request, session)
        if not user:
            return web.json_response({"error": "Unauthorized"}, status=401)
        
        from sqlalchemy.orm import selectinload
        result = await session.execute(
            select(CatchLog)
            .options(selectinload(CatchLog.user))
            .options(selectinload(CatchLog.likes))
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
            "username": c.user.username if c.user.username else f"Рибалка {c.user.telegram_id}",
            "likes": len(c.likes),
            "is_liked": any(l.user_id == user.id for l in c.likes) if user else False
        } for c in catches]
        
    return web.json_response({
        "is_admin": is_admin if user else False,
        "is_banned": is_banned if user else False,
        "catches": data
    })

async def api_catch(request):
    # Process multipart form data
    reader = await request.multipart()
    
    user_id_str = ""
    sig = ""
    token = ""
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
        elif field.name == 'token':
            val = await field.read(decode=True)
            token = val.decode()
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

        # Save photo (For simplicity, we save it locally for now)
    photo_path = None
    if photo_data:
        import uuid
        os.makedirs("photos", exist_ok=True)
        photo_path = f"photos/app_{uuid.uuid4().hex[:8]}.jpg"
        with open(photo_path, "wb") as f:
            f.write(photo_data)
            
    async with async_session() as session:
        # Need to reconstruct data dict from multipart
        multipart_data = {'user_id': user_id_str, 'sig': sig}
        if 'token' in request.query: multipart_data['token'] = request.query['token'] # Just in case it's in query
        if 'token' in locals(): multipart_data['token'] = token
        
        user, is_admin, is_banned, ban_reason, muted_until, mute_reason, is_guest = await get_user_from_auth(request, session, multipart_data)
        if not user or is_guest:
            return web.json_response({"error": "Unauthorized"}, status=401)

        
        if not user:
            user = User(telegram_id=tg_id, username=username)
            session.add(user)
            await session.commit()
            await session.refresh(user)
            is_admin = (tg_id == ADMIN_ID)
            is_banned = False
            ban_reason = None
            
        if is_banned:
            return web.json_response({"error": "Ви забанені. Додавання уловів заборонено.", "reason": ban_reason}, status=403)
            
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
    
    async with async_session() as session:
        user, is_admin, is_banned, ban_reason, muted_until, mute_reason, is_guest = await get_user_from_auth(request, session, data)
        if not user or is_guest:
            return web.json_response({"error": "Unauthorized"}, status=401)
        
        if is_banned:
            return web.json_response({"error": "Ви забанені."}, status=403)
            
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
    
    async with async_session() as session:
        user, is_admin, is_banned, ban_reason, muted_until, mute_reason, is_guest = await get_user_from_auth(request, session)
        if not user:
            return web.json_response({"error": "Unauthorized"}, status=401)
        
        from sqlalchemy.orm import selectinload
        # Fetch last 50 messages, ordered by oldest to newest for chat UI
        result = await session.execute(
            select(ChatMessage)
            .options(
                selectinload(ChatMessage.user),
                selectinload(ChatMessage.reply_to).selectinload(ChatMessage.user),
                selectinload(ChatMessage.attachment).selectinload(CatchLog.user)
            )
            .order_by(ChatMessage.id.desc())
            .limit(50)
        )
        messages = result.scalars().all()
        messages.reverse() # We need oldest first in UI
        
        data = []
        for m in messages:
            msg_data = {
                "id": m.id,
                "user_id": m.user.telegram_id,
                "username": m.user.username if m.user.username else f"Рибалка {m.user.telegram_id}",
                "text": m.text,
                "date": m.created_at.isoformat() if m.created_at else None
            }
            if m.reply_to:
                msg_data["reply_to"] = {
                    "id": m.reply_to.id,
                    "username": m.reply_to.user.username if m.reply_to.user.username else f"Рибалка {m.reply_to.user.telegram_id}",
                    "text": m.reply_to.text[:50] + ("..." if len(m.reply_to.text) > 50 else "")
                }
            if m.attachment:
                msg_data["attachment"] = {
                    "id": m.attachment.id,
                    "photo_url": f"/{m.attachment.photo_id}" if m.attachment.photo_id else None,
                    "species": m.attachment.fish_species,
                    "weight": m.attachment.weight,
                    "username": m.attachment.user.username if m.attachment.user.username else f"Рибалка {m.attachment.user.telegram_id}"
                }
            data.append(msg_data)
        
    return web.json_response({
        "is_admin": is_admin if user else False,
        "is_banned": is_banned if user else False,
        "ban_reason": ban_reason if user else None,
        "muted_until": muted_until.isoformat() if muted_until else None,
        "mute_reason": mute_reason if user else None,
        "current_user_id": tg_id,
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
    reply_to_id = data.get('reply_to_id')
    attachment_catch_id = data.get('attachment_catch_id')
    
    async with async_session() as session:
        user, is_admin, is_banned, ban_reason, muted_until, mute_reason, is_guest = await get_user_from_auth(request, session, data)
        if not user or is_guest:
            return web.json_response({"error": "Unauthorized"}, status=401)
        
    if not text:
        return web.json_response({"error": "Empty message"}, status=400)
        
    if len(text) > 500:
        return web.json_response({"error": "Message too long"}, status=400)
        
        if not user:
            return web.json_response({"error": "User not found"}, status=404)
            
        if is_banned:
            return web.json_response({"error": "Ви забанені. Писати заборонено.", "reason": ban_reason}, status=403)
            
        if muted_until and muted_until > datetime.utcnow():
            return web.json_response({"error": "У вас мут чату.", "reason": mute_reason}, status=403)
            
        new_msg = ChatMessage(
            user_id=user.id, 
            text=text,
            reply_to_id=reply_to_id if reply_to_id else None,
            attachment_catch_id=attachment_catch_id if attachment_catch_id else None
        )
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
    
    async with async_session() as session:
        user, is_admin, is_banned, ban_reason, muted_until, mute_reason, is_guest = await get_user_from_auth(request, session, data)
        if not user or is_guest:
            return web.json_response({"error": "Unauthorized"}, status=401)
        
        if is_banned:
            return web.json_response({"error": "Ви забанені."}, status=403)
            
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
    
    async with async_session() as session:
        user, is_admin, is_banned, ban_reason, muted_until, mute_reason = await get_user_and_check_auth(tg_id, session)
        
        if is_banned:
            return web.json_response({"error": "Ви забанені."}, status=403)
            
        if muted_until and muted_until > datetime.utcnow():
            return web.json_response({"error": "У вас мут чату."}, status=403)
            
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

async def api_moderate(request):
    try:
        data = await request.json()
    except:
        return web.json_response({"error": "Invalid JSON"}, status=400)
        
    user_id = data.get('user_id', '')
    sig = data.get('sig', '')
    target_id = data.get('target_id') # User to moderate (database ID, not telegram ID!)
    action = data.get('action')
    reason = data.get('reason', '')
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    tg_id = int(user_id)
    
    async with async_session() as session:
        user, is_admin, _, _, _, _ = await get_user_and_check_auth(tg_id, session)
        
        if not is_admin:
            return web.json_response({"error": "Forbidden"}, status=403)
            
        result = await session.execute(select(User).filter_by(id=target_id))
        target = result.scalar_one_or_none()
        
        if not target:
            return web.json_response({"error": "Target user not found"}, status=404)
            
        if action == 'ban':
            target.is_banned = True
            target.ban_reason = reason
        elif action == 'mute_1h':
            from datetime import timedelta
            target.muted_until = datetime.utcnow() + timedelta(hours=1)
            target.mute_reason = reason
        elif action == 'mute_24h':
            from datetime import timedelta
            target.muted_until = datetime.utcnow() + timedelta(hours=24)
            target.mute_reason = reason
        elif action == 'unban':
            target.is_banned = False
            target.ban_reason = None
            target.muted_until = None
            target.mute_reason = None
        else:
            return web.json_response({"error": "Invalid action"}, status=400)
            
        await session.commit()
        
    return web.json_response({"success": True})

async def api_leaderboard(request):
    user_id = request.query.get('user_id', '')
    sig = request.query.get('sig', '')
    
    if not validate_secure_url(user_id, sig):
        return web.json_response({"error": "Unauthorized"}, status=401)
        
    async with async_session() as session:
        from database.models import User, CatchLog, CatchLike
        from sqlalchemy import func, desc
        
        # Leaders by weight
        result = await session.execute(
            select(
                User,
                func.sum(CatchLog.weight).label('total_weight'),
                func.count(CatchLog.id).label('total_catches'),
                func.max(CatchLog.weight).label('max_weight')
            )
            .join(CatchLog)
            .group_by(User.id)
            .order_by(desc('total_weight'))
            .limit(20)
        )
        leaders_by_weight = []
        for u, tw, tc, mw in result.all():
            leaders_by_weight.append({
                "telegram_id": u.telegram_id,
                "username": u.username if u.username else "Без_імені",
                "total_weight": round(tw, 2) if tw else 0,
                "total_catches": tc or 0,
                "max_weight": mw or 0
            })
            
        # Top photos by likes
        from sqlalchemy.orm import selectinload
        result = await session.execute(
            select(
                CatchLog,
                func.count(CatchLike.id).label('likes_count')
            )
            .join(CatchLike, CatchLike.catch_id == CatchLog.id)
            .options(selectinload(CatchLog.user))
            .filter(CatchLog.photo_id.is_not(None))
            .group_by(CatchLog.id)
            .order_by(desc('likes_count'))
            .limit(10)
        )
        top_photos = []
        for catch, likes_count in result.all():
            top_photos.append({
                "id": catch.id,
                "species": catch.fish_species,
                "weight": catch.weight,
                "location": catch.location if catch.location else "Без назви",
                "date": catch.created_at.isoformat() if catch.created_at else None,
                "photo_url": f"/{catch.photo_id}" if catch.photo_id else None,
                "username": catch.user.username if catch.user.username else "Без_імені",
                "likes": likes_count,
                "is_liked": False
            })
            
    return web.json_response({
        "weight_leaders": leaders_by_weight,
        "top_photos": top_photos
    })

async def api_like(request):
    try:
        data = await request.json()
        user_id_str = str(data.get('user_id', ''))
        sig = data.get('sig', '')
        catch_id = data.get('catch_id')
        
        if not validate_secure_url(user_id_str, sig) or not catch_id:
            return web.json_response({"error": "Unauthorized"}, status=401)
            
        tg_id = int(user_id_str)
        
        async with async_session() as session:
            user, _, _, _, _, _ = await get_user_and_check_auth(tg_id, session)
            if not user:
                return web.json_response({"error": "User not found"}, status=404)
                
            from database.models import CatchLike
            from sqlalchemy import func
            
            result = await session.execute(
                select(CatchLike).filter_by(user_id=user.id, catch_id=int(catch_id))
            )
            like = result.scalar_one_or_none()
            
            if like:
                await session.delete(like)
                action = "unliked"
            else:
                new_like = CatchLike(user_id=user.id, catch_id=int(catch_id))
                session.add(new_like)
                action = "liked"
                
            await session.commit()
            
            result = await session.execute(
                select(func.count(CatchLike.id)).filter_by(catch_id=int(catch_id))
            )
            likes_count = result.scalar()
            
        return web.json_response({"success": True, "action": action, "likes_count": likes_count})
        
    except Exception as e:
        import logging
        logging.error(f"Error in api_like: {e}")
        return web.json_response({"error": "Server error"}, status=500)

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
    cors.add(app.router.add_post('/api/auth/google', api_auth_google))
    cors.add(app.router.add_post('/api/auth/telegram', api_auth_telegram))
    cors.add(app.router.add_get('/api/history', api_history))
    cors.add(app.router.add_get('/api/global_map', api_global_map))
    cors.add(app.router.add_post('/api/catch', api_catch))
    cors.add(app.router.add_delete('/api/catch', api_catch_delete))
    cors.add(app.router.add_get('/api/chat', api_chat_get))
    cors.add(app.router.add_post('/api/chat', api_chat_post))
    cors.add(app.router.add_put('/api/chat', api_chat_put))
    cors.add(app.router.add_delete('/api/chat', api_chat_delete))
    cors.add(app.router.add_post('/api/moderate', api_moderate))
    cors.add(app.router.add_get('/api/leaderboard', api_leaderboard))
    cors.add(app.router.add_post('/api/like', api_like))
    
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
