import asyncio
import logging
import re
import json
import traceback
import httpx
from typing import List, Dict, Any
from core.state import get_download_task_queue
from utils.persistence import persistence
from downloaders.kugou_downloader import create_kugou_request, load_cookie as kugou_load_cookie
from downloaders.netease_downloader import post_eapi_request

import datetime
import uuid

logger = logging.getLogger("CrawlerSystem")

class CrawlerTask:
    def __init__(self, task_type: str, source: str, target_id_or_url: str, desired_quality: str = "lossless"):
        self.id = str(uuid.uuid4())
        self.task_type = task_type  # 'playlist', 'artist', 'album'
        self.source = source        # 'netease' or 'kugou'
        self.target = target_id_or_url
        self.desired_quality = desired_quality
        self.retry_count = 0
        self.max_retries = 3
        self.status = "pending" # pending, running, paused, completed, failed
        self.error_log = []
        self.created_at = datetime.datetime.now().isoformat()
        self.results_preview = []
        self.total_tracks = 0
        self.completed_tracks = 0
        self.failed_tracks = 0
        self.pending_downloads = []
        self.dispatched_tracks = 0
        self.target_name = ""
        
    def to_dict(self):
        return {
            "id": self.id,
            "task_type": self.task_type,
            "source": self.source,
            "target": self.target,
            "status": self.status,
            "created_at": self.created_at,
            "results_count": len(self.results_preview),
            "preview": self.results_preview[:5],  # Return max 5 for preview
            "total_tracks": self.total_tracks,
            "completed_tracks": self.completed_tracks,
            "failed_tracks": self.failed_tracks
        }

class AutonomousCrawler:
    """
    自主查错纠错的综合爬虫引擎 (Autonomous Self-correcting Crawler Engine)
    设计用于长时间后台按歌单、歌手、专辑拉取并解析结构化数据。
    """
    def __init__(self):
        self.tasks: Dict[str, CrawlerTask] = {}
        self.is_running = False
        self._load_state()
        self._proxy_index = 0

    def _get_config(self, key, default):
        try:
            from database.db import get_db
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM sys_config WHERE key = ?", (key,))
            res = cursor.fetchone()
            if res:
                return res[0]
        except Exception as e:
            logger.error(f"[Crawler] Error reading config {key}: {e}")
        return default

    def _get_next_proxy(self):
        proxies_raw = self._get_config("crawler_proxy_pool", "[]")
        try:
            proxies = json.loads(proxies_raw)
            if not isinstance(proxies, list) or not proxies:
                return None
            proxy = proxies[self._proxy_index % len(proxies)]
            self._proxy_index += 1
            return proxy
        except:
            return None

    def _save_state(self):
        state_list = []
        for task in self.tasks.values():
            state_list.append({
                "id": task.id,
                "task_type": task.task_type,
                "source": task.source,
                "target": task.target,
                "desired_quality": getattr(task, "desired_quality", "lossless"),
                "retry_count": getattr(task, "retry_count", 0),
                "status": task.status if task.status in ["completed", "failed"] else "paused",
                "error_log": getattr(task, "error_log", []),
                "created_at": getattr(task, "created_at", datetime.datetime.now().isoformat()),
                "results_preview": getattr(task, "results_preview", []),
                "total_tracks": getattr(task, "total_tracks", 0),
                "completed_tracks": getattr(task, "completed_tracks", 0),
                "failed_tracks": getattr(task, "failed_tracks", 0),
                "target_name": getattr(task, "target_name", "")
            })
        persistence.set("crawler_engine", "tasks_state", state_list)

    def _load_state(self):
        state_list = persistence.get("crawler_engine", "tasks_state", [])
        for state in state_list:
            task = CrawlerTask(state["task_type"], state["source"], state["target"], state.get("desired_quality", "lossless"))
            task.id = state["id"]
            task.retry_count = state.get("retry_count", 0)
            task.status = state.get("status", "paused") # pause by default on interrupt
            task.error_log = state.get("error_log", [])
            task.created_at = state.get("created_at", datetime.datetime.now().isoformat())
            task.results_preview = state.get("results_preview", [])
            task.total_tracks = state.get("total_tracks", len(task.results_preview))
            task.completed_tracks = state.get("completed_tracks", 0)
            task.failed_tracks = state.get("failed_tracks", 0)
            
            # PERFECT RECOVERY: Roll back the dispatched tracks.
            # Any tasks that were queued but not confirmed completed will be re-queued.
            # The downloader is idempotent due to local file checks.
            task.dispatched_tracks = task.completed_tracks + task.failed_tracks
            
            task.target_name = state.get("target_name", "")
            self.tasks[task.id] = task
        if state_list:
            logger.info(f"[Crawler] Reloaded {len(state_list)} tasks from persistence state.")

    async def start(self):
        if self.is_running: return
        self.is_running = True
        logger.info("[Crawler] Autonomous crawler engine started.")
        asyncio.create_task(self._process_loop())
        asyncio.create_task(self._dispatch_loop())

    def add_task(self, task_type: str, source: str, target: str, quality: str = "lossless"):
        task = CrawlerTask(task_type, source, target, quality)
        self.tasks[task.id] = task
        self._save_state()
        logger.info(f"[Crawler] Task added: {source} - {task_type} - {target}")
        return task.id

    def pause_task(self, task_id: str):
        task = self.tasks.get(task_id)
        if task and task.status in ["pending", "running"]:
            task.status = "paused"
            self._save_state()

    def resume_task(self, task_id: str):
        task = self.tasks.get(task_id)
        if task and task.status == "paused":
            task.status = "pending"
            self._save_state()

    async def _process_loop(self):
        while self.is_running:
            next_task = next((t for t in self.tasks.values() if t.status == "pending"), None)
            if not next_task:
                await asyncio.sleep(1)
                continue
                
            try:
                await self._execute_task_with_correction(next_task)
            except Exception as e:
                logger.error(f"[Crawler] Task completely failed after retries: {e}")
                if next_task.status != "paused":
                    next_task.status = "failed"

    async def _execute_task_with_correction(self, task: CrawlerTask):
        """自主纠错任务机：根据报错类型动态切换解析策略并自动重试"""
        while task.retry_count < task.max_retries:
            try:
                task.status = "running"
                results = []
                # ==== Use dynamically loaded generic crawlers ====
                from core.state import DOWNLOADER_MODULES
                downloader_module = DOWNLOADER_MODULES.get(task.source)
                
                if not downloader_module or not hasattr(downloader_module, f"parse_{task.task_type}"):
                     raise Exception(f"Downloader {task.source} does not support {task.task_type} crawling.")
                     
                parser_func = getattr(downloader_module, f"parse_{task.task_type}")
                task.target_name, results = await parser_func(task.target)
                
                if task.task_type == "playlist" and task.target_name:
                    from utils.persistence import persistence
                    metadata_list = persistence.get("playlists", "metadata_list", [])
                    if not any(m["name"] == task.target_name for m in metadata_list):
                         metadata_list.append({"name": task.target_name, "category": f"Crawler ({task.source})", "description": "Auto created", "color": "#10b981"})
                         persistence.set("playlists", "metadata_list", metadata_list)
                         # Instantly add tracks for UI immediate view
                         persistence.set("playlists", f"tracks_{task.target_name}", results)
                         logger.info(f"[Crawler] Auto-created playlist '{task.target_name}' with {len(results)} tracks")
                
                if results is not None:
                    # Don't change status to completed here! Wait for downloads to finish
                    task.results_preview = results
                    task.total_tracks = len(results)
                    logger.info(f"[Crawler] Task Fetch Success! {task.task_type} parsed {len(results)} items. Preparing downloads.")
                    self._store_results(task, results)
                    return
                else:
                    raise Exception("Empty result or parsing failed internally.")

            except Exception as e:
                task.retry_count += 1
                err_msg = str(e)
                task.error_log.append(err_msg)
                logger.warning(f"[Crawler] Task warning (Retry {task.retry_count}): {err_msg}")
                
                # 纠错策略 (Self-Correction Strategies)
                if "timeout" in err_msg.lower():
                    await asyncio.sleep(2 * task.retry_count) # Linear backoff
                elif "redirect" in err_msg.lower() or "302" in err_msg.lower():
                    # 动态降级到无痕模式或尝试其他基础 URL
                    pass
                else:
                    await asyncio.sleep(1)

        if task.status != "paused" and task.status != "completed":
            task.status = "failed"
        logger.error(f"[Crawler] Task Finished resolving: {task.target}. Logs: {task.error_log}")
        self._save_state()

    def _store_results(self, task, results):
        """将爬取结果存盘持久化 / 发送给下载机制"""
        db = persistence.get("crawler_db", task.source, [])
        db.extend(results)
        # Deduplicate by ID
        unique_db = {str(item.get("id") or item.get("music_id")): item for item in db}
        persistence.set("crawler_db", task.source, list(unique_db.values()))
        
        task.completed_tracks = 0
        task.failed_tracks = 0
        task.dispatched_tracks = 0
        logger.info(f"[Crawler] Prepared {len(results)} items for batched background download queue.")
        self._save_state()

    async def _dispatch_loop(self):
        """Periodically dispatch pending downloads if task is running, maintaining a small buffer so pause is respected."""
        while self.is_running:
            from core.state import get_download_task_queue
            queue = get_download_task_queue()
            
            should_save = False
            
            # Read dynamic config from DB
            concurrency = int(self._get_config("crawler_concurrency", 8))
            interval = float(self._get_config("crawler_interval", 1.5))
            use_proxy = self._get_config("crawler_use_proxy", "0") == "1"

            for task in list(self.tasks.values()):
                if task.status == "running" and hasattr(task, 'results_preview'):
                    task.dispatched_tracks = getattr(task, 'dispatched_tracks', 0)
                    in_progress = task.dispatched_tracks - (task.completed_tracks + task.failed_tracks)
                    
                    while in_progress < concurrency and task.dispatched_tracks < len(task.results_preview):
                        item = task.results_preview[task.dispatched_tracks].copy() # Copy to avoid mod original
                        item['desired_quality'] = task.desired_quality
                        
                        payload = {
                            "source": task.source,
                            "track_data": item,
                            "original_cmd_id": f"crawler_task:{task.id}",
                            "client_id": "crawler_auto"
                        }
                        
                        if use_proxy:
                            proxy = self._get_next_proxy()
                            if proxy:
                                payload["proxy"] = proxy

                        queue.put(payload)
                        
                        task.dispatched_tracks += 1
                        in_progress += 1
                        should_save = True

            if should_save:
                self._save_state()
                        
            await asyncio.sleep(interval)

global_crawler = AutonomousCrawler()
