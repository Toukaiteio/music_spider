import os
from flask import Flask
from flask_cors import CORS

def create_flask_app():
    """创建并配置 Flask 应用实例"""
    # static_folder 指向前端目录，使 Flask 能提供静态文件
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend'))
    
    app = Flask(
        __name__,
        static_folder=frontend_dir,
        static_url_path=''
    )
    
    # 开发环境允许跨域（前后端同域时 CORS 实际上不需要，但保留方便调试）
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # 关闭调试模式下的自动重载（避免与 asyncio 事件循环冲突）
    app.config['DEBUG'] = False
    app.config['TESTING'] = False
    
    return app

# 全局 Flask 实例（供 routes 模块导入）
flask_app = create_flask_app()
