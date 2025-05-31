import requests
import os
import json
import asyncio
import uuid
from typing import Generic, TypeVar, runtime_checkable
from typing import Dict, Any
from config import DOWNLOADS_DIR
class DictSerializable:
    def to_dict(self) -> Dict[str, Any]:
        """将对象转换为字典"""
        return {
            key: value.to_dict() if hasattr(value, 'to_dict') else value
            for key, value in self.__dict__.items()
            if not key.startswith('_')
        }
T = TypeVar('T')
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
    def __init__(self, music_id: str, title: str, author: str = "", description: str = "", quality: str = "", album: str = "", tags: list = [], duration: int = 0, genre: str = "",preview_cover = "", lossless: bool = False, lyrics: str = ""):
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
        self.lossless = lossless
        self.lyrics = lyrics
        self.cover_path = None
        self.audio_path = None

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
        cover=None, # This will be treated as preview_cover URL for MusicItemData
        audio=None,  # This parameter is not directly used for an initial path in this refactoring.
        lossless: bool = False,
        lyrics: str = ""
    ):
        self.work_path = os.path.join(DOWNLOADS_DIR, str(music_id))
        os.makedirs(self.work_path, exist_ok=True)
        
        self.data = MusicItemData(
            music_id=str(music_id), # Ensure music_id is string
            title=title,
            author=author,
            description=description,
            quality=quality,
            album=album,
            tags=tags or [], # Ensure tags is a list
            duration=duration,
            genre=genre,
            preview_cover=cover if cover else "", # Ensure preview_cover is string
            lossless=lossless,
            lyrics=lyrics
        )
        
        self._cover_path = "" # Path to the actual cover file
        self._audio_path = "" # Path to the actual audio file

    @property
    def music_id(self):
        return self.data.music_id

    @property
    def title(self):
        return self.data.title
    
    @title.setter
    def title(self, value):
        self.data.title = value

    @property
    def author(self):
        return self.data.author

    @author.setter
    def author(self, value):
        self.data.author = value

    @property
    def description(self):
        return self.data.description

    @description.setter
    def description(self, value):
        self.data.description = value

    @property
    def quality(self):
        return self.data.quality

    @quality.setter
    def quality(self, value):
        self.data.quality = value

    @property
    def album(self):
        return self.data.album

    @album.setter
    def album(self, value):
        self.data.album = value

    @property
    def tags(self):
        return self.data.tags

    @tags.setter
    def tags(self, value):
        self.data.tags = value

    @property
    def duration(self):
        return self.data.duration

    @duration.setter
    def duration(self, value):
        self.data.duration = value

    @property
    def genre(self):
        return self.data.genre

    @genre.setter
    def genre(self, value):
        self.data.genre = value

    @property
    def preview_cover(self):
        return self.data.preview_cover

    @preview_cover.setter
    def preview_cover(self, value):
        self.data.preview_cover = value

    @property
    def lossless(self):
        return self.data.lossless

    @lossless.setter
    def lossless(self, value: bool):
        self.data.lossless = value

    @property
    def lyrics(self):
        return self.data.lyrics

    @lyrics.setter
    def lyrics(self, value: str):
        self.data.lyrics = value

    # Properties for actual file paths managed by MusicItem
    @property
    def cover(self): # Corresponds to self._cover_path
        return self._cover_path

    @property
    def audio(self): # Corresponds to self._audio_path
        return self._audio_path

    def set_cover(self, cover_path: str):
        self._cover_path = cover_path
        self.data.cover_path = cover_path

    def set_audio(self, audio_path: str):
        self._audio_path = audio_path
        self.data.audio_path = audio_path

    def dump_self(self):
        # Ensure data object's paths are sync'd before dumping
        self.data.cover_path = self._cover_path
        self.data.audio_path = self._audio_path
        # The work_path should be for the folder, not the file itself
        file_path = os.path.join(self.work_path, "music.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(self.data.to_dict(), f, ensure_ascii=False, indent=4) # indent=4 for readability

    @classmethod
    def load_from_json(cls, music_id: str):
        work_path = os.path.join(DOWNLOADS_DIR, str(music_id))
        json_path = os.path.join(work_path, "music.json")
        if os.path.exists(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                data_dict = json.load(f)
            
            item = cls(
                music_id=data_dict.get("music_id"),
                title=data_dict.get("title"),
                author=data_dict.get("author", ""),
                description=data_dict.get("description", ""),
                quality=data_dict.get("quality", ""),
                album=data_dict.get("album", ""),
                tags=data_dict.get("tags", []),
                duration=data_dict.get("duration", 0),
                genre=data_dict.get("genre", ""),
                cover=data_dict.get("preview_cover", ""), # preview_cover URL
                lossless=data_dict.get("lossless", False),
                lyrics=data_dict.get("lyrics", "")
            )
            # Set actual file paths if they exist in JSON
            if data_dict.get("cover_path"):
                item.set_cover(data_dict["cover_path"])
            if data_dict.get("audio_path"):
                item.set_audio(data_dict["audio_path"])
            return item
        return None

class DownloadTask:
    def __init__(
        self, task_data: Dict[str, Any], source_url: str, mode_type: str, progression: int, get_downloader_adapter, task_id: str = None
    ):
        self.source_url = source_url
        self.mode_type = mode_type
        self.progression = progression
        self.get_downloader_adapter = get_downloader_adapter
        self.task_id = task_id or str(hash(self.source_url))
        self.task_data = task_data
        # Use a directory like "./download_tasks/"
        self.file_path = f"./download_tasks/{self.task_id}.task"
        self._load_task()

    def _load_task(self):
        if os.path.exists(self.file_path):
            with open(self.file_path, "r", encoding="utf-8") as file:
                data = json.load(file)
                self.task_data = data.get("task_data", {})
                self.progression = data.get("progression", self.progression)
                self.source_url = data.get("source_url", self.source_url)
                self.mode_type = data.get("mode_type", self.mode_type)
                # task_id is part of the filename and set in __init__, usually not reloaded from content.

    def _save_task(self):
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, "w", encoding="utf-8") as file:
            data = {
                "task_id": self.task_id,
                "source_url": self.source_url,
                "mode_type": self.mode_type,
                "progression": self.progression,
                "task_data": self.task_data,
            }
            json.dump(data, file, ensure_ascii=False, indent=4)

    async def handle_task(self):
        # spider = self.get_downloader_adapter(self.mode_type)
        # tasks = spider["cal_left"](self.source_url, self.progression)
        # try:
        #     count = 0
        #     for task_item in tasks: # Renamed 'task' to 'task_item' to avoid conflict with outer scope 'task'
        #         await task_item["do_task"](self.task_data) # Assuming 'do_task' now uses task_data
        #         self.progression += 1
        #         self._save_task()
        #         count += 1
        #         if count % 5 == 0:
        #             await asyncio.sleep(10)
        # except Exception as e:
        #     print(f"Task {self.task_id} interrupted: {e}")
        #     self._save_task()
        print(f"Task {self.task_id} handling logic to be implemented.")
        await asyncio.sleep(1) # Placeholder for async work


class DownloadManager:
    def __init__(
        self,
        get_downloader_adapter_factory, # Renamed from get_spider
        progression=0, # This field's purpose in manager might need review later
        max_concurrent=5,
        file_path="./download_manager.json", # Updated file path
    ):
        self.max_concurrent = max_concurrent
        self.file_path = file_path
        self.get_downloader_adapter_factory = get_downloader_adapter_factory
        self.tasks = {} # Renamed from missions
        self.progression = progression # Purpose might be reviewed
        self._load_manager()

    def _load_manager(self):
        if os.path.exists(self.file_path):
            with open(self.file_path, "r", encoding="utf-8") as file:
                data = json.load(file)
                self.max_concurrent = data.get("max_concurrent", self.max_concurrent)
                self.progression = data.get("progression", self.progression)
                for task_json_data in data.get("tasks", []): # Renamed "missions" to "tasks"
                    task = DownloadTask(
                        task_data=task_json_data.get("task_data", {}),
                        source_url=task_json_data["source_url"],
                        mode_type=task_json_data["mode_type"],
                        progression=task_json_data["progression"],
                        get_downloader_adapter=self.get_downloader_adapter_factory, # Pass the factory
                        task_id=task_json_data["task_id"],
                    )
                    self.tasks[task.task_id] = task

    def _save_manager(self):
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
        with open(self.file_path, "w", encoding="utf-8") as file:
            data = {
                "max_concurrent": self.max_concurrent,
                "progression": self.progression,
                "tasks": [ # Renamed "missions" to "tasks"
                    {
                        "task_id": task.task_id,
                        "source_url": task.source_url,
                        "mode_type": task.mode_type,
                        "progression": task.progression,
                        "task_data": task.task_data, # Use task_data
                    }
                    for task in self.tasks.values()
                ],
            }
            json.dump(data, file, ensure_ascii=False, indent=4)

    def add_task(self, task: DownloadTask): # Renamed from add_mission, type hint updated
        if task.task_id in self.tasks:
            raise ValueError("Task with this ID already exists.")
        self.tasks[task.task_id] = task
        self._save_manager()

    def get_task(self, task_id: str) -> DownloadTask | None: # Renamed from get_mission
        return self.tasks.get(task_id)

    def remove_task(self, task_id: str): # Renamed from remove_mission
        if task_id in self.tasks:
            del self.tasks[task_id]
            self._save_manager()

    def update_task(self, task_id: str, **kwargs): # Renamed from update_mission
        task = self.get_task(task_id)
        if not task:
            raise ValueError("Task not found.")
        for key, value in kwargs.items():
            if hasattr(task, key) and key != "task_id": # task_id should not be updated this way
                setattr(task, key, value)
        task._save_task() # Save individual task changes
        self._save_manager() # Save manager state

    async def execute_all_tasks(self): # Renamed from execute_all
        semaphore = asyncio.Semaphore(self.max_concurrent)

        async def execute_single_task(task: DownloadTask): # Renamed from execute_mission
            async with semaphore:
                await task.handle_task() # Call handle_task

        # Create a list of tasks to execute to avoid issues if self.tasks changes during execution
        tasks_to_run = list(self.tasks.values())
        await asyncio.gather(*[execute_single_task(task) for task in tasks_to_run])

    def list_tasks(self): # Renamed from list_missions
        return list(self.tasks.keys())
