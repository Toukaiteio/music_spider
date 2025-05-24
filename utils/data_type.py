import requests
import os
import json
import asyncio
import uuid
from typing import Generic, TypeVar, runtime_checkable
from typing import Dict, Any

class DictSerializable:
    def to_dict(self) -> Dict[str, Any]:
        """将对象转换为字典"""
        return {
            key: value.to_dict() if hasattr(value, 'to_dict') else value
            for key, value in self.__dict__.items()
            if not key.startswith('_')
        }
T = TypeVar('T')
IS_LOCAL_MODE = True
SERVER_HOST = "http://127.0.0.1:8080"
class ResultBase(Generic[T]):
    def __init__(self, code: int, data: T):
        self.code = code
        self.data = data
        self._validate_type()
    
    def _validate_type(self):
        if hasattr(self, "__orig_class__"):
            expected_type = self.__orig_class__.__args__[0]
            if not isinstance(self.data, expected_type):
                raise TypeError(f"Expected {expected_type}, got {type(self.data)}")

    def get_json(self) -> dict:
        return {"code": self.code, "data": self.data}

class MusicItemData(DictSerializable):
    def __init__(self, music_id: str, title: str, author: str = "", description: str = "", quality: str = "", album: str = "", tags: list = [], duration: int = 0, genre: str = "",preview_cover = ""):
        self.music_id = music_id
        self.title = title
        self.author = author
        self.description = description
        self.quality = quality
        self.album = album
        self.tags = tags
        self.duration = duration
        self.genre = genre
        self.preview_cover = preview_cover

class MusicItem:
    def __init__(
        self,
        music_id,
        title,
        author="",
        description="",
        quality="",
        album="",
        tags=[],
        duration = 0,
        genre="",
        cover=None,
        audio=None,
    ):
        self.music_id = music_id
        # create folder at work path "./downloads/{music_id}/"
        self.work_path = os.path.join("./downloads", str(music_id))
        os.makedirs(self.work_path, exist_ok=True)
        self.title = title
        self.author = author
        self.description = description
        self.quality = quality
        self.album = album
        self.cover = cover
        self.audio = audio
        self.tags = tags
        self.genre = genre
        self.duration = duration
    def dump_self(self):
        data = {
            "music_id": self.music_id,
            "title": self.title,
            "author": self.author,
            "description": self.description,
            "quality": self.quality,
            "album": self.album,
            "cover": self.cover,
            "audio": self.audio,
            "tags": self.tags,
            "genre": self.genre,
            "duration": self.duration,
        }
        with open(
            os.path.join(self.work_path, "music.json"), "w", encoding="utf-8"
        ) as f:
            json.dump(data, f, ensure_ascii=False, indent=0)

    def set_cover(self, cover):
        self.cover = cover

    def set_audio(self, audio):
        self.audio = audio


class Mission:
    def __init__(
        self, book, source_url, mode_type, progression: int, get_spider, mission_id=None
    ):
        self.source_url = source_url
        self.mode_type = mode_type
        self.progression = progression
        self.get_spider = get_spider
        self.mission_id = mission_id or str(hash(self.source_url))
        self.book = book
        self.chapters = []
        self.file_path = f"./mission/{self.mission_id}.mission"
        self._load_mission()

    def _load_mission(self):
        if os.path.exists(self.file_path):
            with open(self.file_path, "r") as file:
                data = json.load(file)
                self.book = Book(**(data.get("book", {})))
                self.progression = data.get("progression", self.progression)

    def _save_mission(self):
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, "w") as file:
            data = {
                "book": self.book.__dict__,
                "progression": self.progression,
            }
            json.dump(data, file)

    async def handle_mission(self):
        spider = self.get_spider(self.mode_type)
        tasks = spider["cal_left"](self.source_url, self.progression)

        try:
            count = 0
            for task in tasks:
                await task["do_task"](self.book)
                self.progression += 1
                self._save_mission()
                count += 1
                if count % 5 == 0:
                    await asyncio.sleep(10)
        except Exception as e:
            print(f"Mission interrupted: {e}")
            self._save_mission()


class MissionManager:
    def __init__(
        self,
        get_spider,
        progression=0,
        max_concurrent=5,
        file_path="./mission_manager.json",
    ):
        self.max_concurrent = max_concurrent
        self.file_path = file_path
        self.get_spider = get_spider
        self.missions = {}
        self.progression = progression
        self._load_manager()

    def _load_manager(self):
        if os.path.exists(self.file_path):
            with open(self.file_path, "r") as file:
                data = json.load(file)
                self.max_concurrent = data.get("max_concurrent", self.max_concurrent)
                self.progression = data.get("progression", self.progression)
                for mission_data in data.get("missions", []):
                    mission = Mission(
                        book=Book(**mission_data["book"]),
                        source_url=mission_data["source_url"],
                        mode_type=mission_data["mode_type"],
                        progression=mission_data["progression"],
                        get_spider=self.get_spider,
                        mission_id=mission_data["mission_id"],
                    )
                    self.missions[mission.mission_id] = mission

    def _save_manager(self):
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, "w") as file:
            data = {
                "max_concurrent": self.max_concurrent,
                "progression": self.progression,
                "missions": [
                    {
                        "book": mission.book.__dict__,
                        "source_url": mission.source_url,
                        "mode_type": mission.mode_type,
                        "progression": mission.progression,
                        "mission_id": mission.mission_id,
                    }
                    for mission in self.missions.values()
                ],
            }
            json.dump(data, file)

    def add_mission(self, mission):
        if mission.mission_id in self.missions:
            raise ValueError("Mission with this ID already exists.")
        self.missions[mission.mission_id] = mission
        self._save_manager()

    def get_mission(self, mission_id):
        return self.missions.get(mission_id)

    def remove_mission(self, mission_id):
        if mission_id in self.missions:
            del self.missions[mission_id]
            self._save_manager()

    def update_mission(self, mission_id, **kwargs):
        mission = self.get_mission(mission_id)
        if not mission:
            raise ValueError("Mission not found.")
        for key, value in kwargs.items():
            if hasattr(mission, key):
                setattr(mission, key, value)
        self._save_manager()

    async def execute_all(self):
        semaphore = asyncio.Semaphore(self.max_concurrent)

        async def execute_mission(mission):
            async with semaphore:
                await mission.handle_mission()

        tasks = [execute_mission(mission) for mission in self.missions.values()]
        await asyncio.gather(*tasks)

    def list_missions(self):
        return list(self.missions.keys())
