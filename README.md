# Music Spider

一个全栈音乐下载、管理与播放平台，内置 AI 助手（Music Claw），支持多平台音乐搜索、下载、在线播放、歌单管理及自动化爬取。

> **GitHub**: [https://github.com/Toukaiteio/music_spider](https://github.com/Toukaiteio/music_spider)

## 功能特性

- **多平台音乐搜索与下载** — 支持网易云音乐、哔哩哔哩、酷狗音乐，支持 FLAC 无损及 MP3/M4A 有损格式
- **在线音乐播放** — 内置 Web Audio API 播放器，支持节拍检测、专辑封面色彩提取等可视化效果
- **本地音乐库管理** — 编辑元数据、更新封面、删除曲目、搜索本地库
- **歌单/收藏管理** — 创建、编辑、删除歌单，曲目收藏
- **AI 音乐助手 (Music Claw)** — 基于 ReAct Agent 的自然语言交互，支持搜索、播放、下载、歌单管理、自主爬取等 13 种工具
- **自主爬虫引擎** — 后台批量爬取歌单、歌手、专辑，支持重试、断点恢复、并发控制
- **响度分析** — 符合 EBU R128 标准的 LUFS 响度测量
- **用户偏好追踪** — 记录收听习惯，分析最爱艺人、收听高峰、语言偏好
- **多用户认证** — JWT 认证、验证码、速率限制、管理员面板
- **WebSocket 实时通信** — 所有操作通过 WebSocket 推送实时进度

## 技术栈

### 后端

| 类别 | 技术 |
|------|------|
| 语言 | Python 3.10+ |
| WebSocket 服务 | `websockets` (async) |
| HTTP 服务 | Flask 3.x + flask-cors |
| 数据库 | SQLite3 |
| 持久化 | JSON 文件 + SQLite 双层持久化 |
| 加密 | `pycryptodome` (AES / RSA) |
| HTTP 客户端 | `requests` / `httpx` |
| HTML 解析 | PyQuery / BeautifulSoup4 / lxml |
| 二维码 | `qrcode` + Pillow |
| 音频分析 | `pyloudnorm` / `librosa` (可选) |
| LLM 集成 | OpenAI 兼容 API (自定义 Adapter) |
| 并发模型 | multiprocessing (下载) + asyncio + threading |

### 前端

| 类别 | 技术 |
|------|------|
| 语言 | 原生 JavaScript (ES Modules) |
| 框架 | 无框架 — 自研 SPA 路由、状态管理、组件渲染 |
| 可视化 | Chart.js / Color Thief / jsmediatags |
| 字体图标 | Material Design Icons / Roboto (自托管) |
| 自定义组件 | `<dys-range>` Web Component |

## 项目结构

```
music_spider/
├── src/                          # 后端源码
│   ├── main.py                   # 应用入口
│   ├── config.py                 # 环境变量配置加载
│   ├── core/                     # 核心组件
│   │   ├── server.py             # WebSocket 服务 + Flask 服务 + 下载工作进程
│   │   ├── flask_app.py          # Flask 应用工厂
│   │   ├── state.py              # 全局状态 (连接客户端、下载队列、任务统计)
│   │   ├── auth.py               # JWT 认证、验证码、速率限制
│   │   ├── source_manager.py     # 音乐源启用/禁用管理
│   │   └── crawler.py            # 自主爬虫引擎
│   ├── handlers/                 # WebSocket 命令处理器 (35+ 命令)
│   ├── downloaders/              # 平台下载模块
│   │   ├── bilibili_downloader.py
│   │   ├── netease_downloader.py
│   │   └── kugou_downloader.py
│   ├── llm/                      # LLM / AI 集成
│   │   ├── client.py             # ReAct Agent 循环
│   │   ├── adapters/             # LLM 适配器 (OpenAI 兼容)
│   │   └── skills.py             # AI 工具实现 (13 种工具)
│   ├── lyrics_allocator/         # 歌词获取 (Genius API)
│   ├── database/                 # SQLite 数据库
│   └── utils/                    # 工具模块
├── frontend/                     # SPA 前端 (原生 JS)
│   ├── index.html                # 入口页面
│   ├── script.js                 # 应用引导
│   ├── css/                      # 样式文件 (7 个)
│   ├── modules/                  # JS 模块 (12 个)
│   ├── pages/                    # 页面组件 (10 个)
│   └── third_party/              # 第三方库 (自托管)
├── data/                         # 运行时数据 (SQLite + JSON)
├── tests/                        # 后端单元测试
├── requirements.txt              # Python 依赖
├── .env.example                  # 环境变量示例
└── start.bat                     # Windows 启动脚本
```

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/Toukaiteio/music_spider.git
cd music_spider
```

### 2. 创建虚拟环境并安装依赖

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/macOS
# source .venv/bin/activate

pip install -r requirements.txt
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，至少需要设置：

| 变量 | 说明 | 必填 |
|------|------|------|
| `AES_KEY` | 64 字符十六进制字符串 (32 字节)，用于 JWT 签名和路径加密 | 是 |
| `HOST` | 服务监听地址 | 否 (默认 `0.0.0.0`) |
| `WEBSOCKET_PORT` | WebSocket 服务端口 | 否 (默认 `8765`) |
| `FRONTEND_PORT` | HTTP 前端服务端口 | 否 (默认 `8080`) |
| `GENIUS_ACCESS_TOKEN` | Genius API Token，用于歌词获取 | 否 |
| `OPENAI_API_KEY` | LLM API Key，用于 AI 助手 | 否 |
| `OPENAI_BASE_URL` | LLM API 地址 (支持任何 OpenAI 兼容 API) | 否 |
| `OPENAI_MODEL` | 使用的模型名称 | 否 |

### 4. 启动服务

```bash
python src/main.py
```

或在 Windows 上双击 `start.bat`。

- 前端访问: `http://localhost:8080`
- WebSocket: `ws://localhost:8765`

## AI 助手 (Music Claw)

Music Claw 是内置的 AI 音乐助手，基于 ReAct (Reasoning + Acting) Agent 模式实现，支持通过自然语言完成音乐相关操作。

**核心特性:**
- 流式响应 (思考过程、文本、工具调用实时推送)
- 支持任何 OpenAI 兼容 API (可配置 Base URL、模型、API Key 轮询负载均衡)
- 敏感操作 (下载、歌单修改) 需要用户授权确认

**可用工具:**

| 工具 | 功能 |
|------|------|
| `search_at_sources` | 在音乐平台搜索 |
| `search_music` | 搜索音乐 |
| `play_song` | 播放歌曲 |
| `search_library` | 搜索本地音乐库 |
| `get_lyrics` | 获取歌词 |
| `get_playlists` | 获取歌单列表 |
| `download_song` | 下载歌曲 |
| `add_to_playlist` | 添加到歌单 |
| `remove_from_playlist` | 从歌单移除 |
| `create_playlist` | 创建歌单 |
| `update_playlist_info` | 更新歌单信息 |
| `get_user_preferences` | 获取用户偏好 |
| `autonomous_crawl_target` | 自主爬取目标 |

## 自主爬虫引擎

后台批量爬取引擎，支持爬取整个歌单、歌手主页或专辑：

- 自动重试 (最多 3 次，指数退避)
- 断点恢复 — 任务状态持久化，重启后自动恢复未完成任务
- 可配置并发数、间隔、代理池
- 自动从爬取内容创建歌单

## WebSocket API

所有客户端-服务端通信通过 JSON 格式的 WebSocket 消息进行。

**请求格式:**
```json
{
  "cmd_id": "unique_command_id",
  "command": "command_name",
  "payload": { }
}
```

**响应格式:**
```json
{
  "code": 0,
  "data": {
    "original_cmd_id": "unique_command_id"
  }
}
```

支持 35+ 命令，涵盖搜索、下载、歌单管理、认证、爬虫、AI 助手等功能。详见各 handler 源码。

## 运行测试

```bash
python -m unittest discover -s tests
```

## License

本项目仅供学习交流使用。请遵守各音乐平台的使用条款。
