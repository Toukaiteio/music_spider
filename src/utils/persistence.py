import json
import os
from threading import Lock

class PersistenceStore:
    def __init__(self, file_path="data/persistence.json"):
        self.file_path = file_path
        self.data = {}
        self.lock = Lock()
        self._last_mtime = 0
        self._load()

    def _load(self):
        if os.path.exists(self.file_path):
            self._last_mtime = os.path.getmtime(self.file_path)
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
            except Exception as e:
                print(f"Error loading persistence file: {e}")
                self.data = {}
        else:
            os.makedirs(os.path.dirname(self.file_path), exist_ok=True)
            self._save()
        
        # Run migration after initial load
        self._migrate_legacy()

    def _check_reload(self):
        if os.path.exists(self.file_path):
            current_mtime = os.path.getmtime(self.file_path)
            if current_mtime > self._last_mtime:
                self.reload()

    def reload(self):
        with self.lock:
            self._load()

    def _migrate_legacy(self):
        # Migration for Bilibili
        bili_legacy = "src/downloaders/cookie.json"
        if os.path.exists(bili_legacy) and "bilibili" not in self.data:
            try:
                with open(bili_legacy, "r", encoding="utf-8") as f:
                    cookies = json.load(f)
                    self.data["bilibili"] = {"cookies": cookies}
                    print(f"Migrated Bilibili cookies from {bili_legacy}")
            except Exception as e:
                print(f"Error migrating Bilibili cookies: {e}")

        # Migration for NetEase
        netease_legacy = "src/downloaders/netease_cookie.json"
        if os.path.exists(netease_legacy) and "netease" not in self.data:
            try:
                with open(netease_legacy, "r", encoding="utf-8") as f:
                    cookies = json.load(f)
                    self.data["netease"] = {"cookies": cookies}
                    print(f"Migrated NetEase cookies from {netease_legacy}")
            except Exception as e:
                print(f"Error migrating NetEase cookies: {e}")

        # Migration for Kugou (just in case)
        kugou_legacy = "src/downloaders/kugou_cookie.json"
        if os.path.exists(kugou_legacy) and "kugou" not in self.data:
            try:
                with open(kugou_legacy, "r", encoding="utf-8") as f:
                    auth_info = json.load(f)
                    self.data["kugou"] = {"auth_info": auth_info}
                    print(f"Migrated Kugou auth info from {kugou_legacy}")
            except Exception as e:
                print(f"Error migrating Kugou auth info: {e}")

        if any(os.path.exists(f) for f in [bili_legacy, netease_legacy, kugou_legacy]):
            self._save()
            # Optional: delete old files? User asked to migrate, usually implies moving.
            # I'll leave them for now or delete them if I'm sure. 
            # User said "migrate to new version", usually means move.
            # For safety, I'll just print instructions or do it. 
            # I'll rename them to .bak for safety.
            for f in [bili_legacy, netease_legacy, kugou_legacy]:
                if os.path.exists(f):
                    try:
                        os.rename(f, f + ".bak")
                    except: pass

    def _save(self):
        try:
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"Error saving persistence file: {e}")

    def _db_get_conn(self):
        import sqlite3
        conn = sqlite3.connect("data/app.db", check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def get(self, module_name, key, default=None):
        if module_name in ["playlists", "user_preferences"]:
            from core.auth import current_user
            user = current_user.get()
            if not user: return default
            conn = self._db_get_conn()
            cursor = conn.cursor()
            cursor.execute("SELECT data_json FROM user_data WHERE user_id=? AND module=? AND key=?", (user["user_id"], module_name, key))
            row = cursor.fetchone()
            conn.close()
            if row and row["data_json"]:
                return json.loads(row["data_json"])
            return default
            
        self._check_reload()
        with self.lock:
            module_data = self.data.get(module_name, {})
            return module_data.get(key, default)

    def set(self, module_name, key, value):
        if module_name in ["playlists", "user_preferences"]:
            from core.auth import current_user
            user = current_user.get()
            if not user: return
            conn = self._db_get_conn()
            cursor = conn.cursor()
            cursor.execute("INSERT INTO user_data (user_id, module, key, data_json) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, module, key) DO UPDATE SET data_json=excluded.data_json", (user["user_id"], module_name, key, json.dumps(value, ensure_ascii=False)))
            conn.commit()
            conn.close()
            return

        self._check_reload()
        with self.lock:
            if module_name not in self.data:
                self.data[module_name] = {}
            self.data[module_name][key] = value
            self._save()
            self._last_mtime = os.path.getmtime(self.file_path)

    def delete(self, module_name, key):
        if module_name in ["playlists", "user_preferences"]:
            from core.auth import current_user
            user = current_user.get()
            if not user: return
            conn = self._db_get_conn()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM user_data WHERE user_id=? AND module=? AND key=?", (user["user_id"], module_name, key))
            conn.commit()
            conn.close()
            return

        self._check_reload()
        with self.lock:
            if module_name in self.data and key in self.data[module_name]:
                del self.data[module_name][key]
                self._save()
                self._last_mtime = os.path.getmtime(self.file_path)

    def get_module_data(self, module_name):
        if module_name in ["playlists", "user_preferences"]:
            from core.auth import current_user
            user = current_user.get()
            if not user: return {}
            conn = self._db_get_conn()
            cursor = conn.cursor()
            cursor.execute("SELECT key, data_json FROM user_data WHERE user_id=? AND module=?", (user["user_id"], module_name))
            rows = cursor.fetchall()
            conn.close()
            data = {}
            for r in rows:
                data[r["key"]] = json.loads(r["data_json"])
            return data
            
        self._check_reload()
        with self.lock:
            return self.data.get(module_name, {}).copy()

    def set_module_data(self, module_name, data):
        if module_name in ["playlists", "user_preferences"]:
            from core.auth import current_user
            user = current_user.get()
            if not user: return
            conn = self._db_get_conn()
            cursor = conn.cursor()
            for key, val in data.items():
                cursor.execute("INSERT INTO user_data (user_id, module, key, data_json) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, module, key) DO UPDATE SET data_json=excluded.data_json", (user["user_id"], module_name, key, json.dumps(val, ensure_ascii=False)))
            conn.commit()
            conn.close()
            return
            
        self._check_reload()
        with self.lock:
            self.data[module_name] = data
            self._save()
            self._last_mtime = os.path.getmtime(self.file_path)

# Global instance
persistence = PersistenceStore()

