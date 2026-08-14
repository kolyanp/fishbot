from aiohttp import web
import logging
import os

logger = logging.getLogger(__name__)

async def start_web_server(port: int = 8080):
    app = web.Application()
    
    # Path to webapp directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    webapp_dir = os.path.join(current_dir, 'webapp')
    
    # Serve static files
    app.router.add_static('/', webapp_dir, name='static', show_index=True)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    
    await site.start()
    logger.info(f"Web server started on http://0.0.0.0:{port}")
    return runner
