import json
import sqlite3
import os

DB_PATH = "data/app.db"
PERSISTENCE_PATH = "data/persistence.json"

def migrate():
    # Ensure tables exist
    from database.db import init_db
    init_db()

    if not os.path.exists(PERSISTENCE_PATH):
        print("No persistence.json. Nothing to migrate.")
        return

    with open(PERSISTENCE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE username='Daiyosei'")
    user = cursor.fetchone()
    if not user:
        print("Admin user Daiyosei not found, skipping migration.")
        return
    admin_id = user[0]

    # Migrate playlists
    if "playlists" in data:
        for key, val in data["playlists"].items():
            cursor.execute("INSERT OR IGNORE INTO user_data (user_id, module, key, data_json) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, module, key) DO UPDATE SET data_json=excluded.data_json",
                           (admin_id, "playlists", key, json.dumps(val, ensure_ascii=False)))
        del data["playlists"]

    # Migrate user_preferences
    if "user_preferences" in data:
        for key, val in data["user_preferences"].items():
            cursor.execute("INSERT OR IGNORE INTO user_data (user_id, module, key, data_json) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, module, key) DO UPDATE SET data_json=excluded.data_json",
                           (admin_id, "user_preferences", key, json.dumps(val, ensure_ascii=False)))
        del data["user_preferences"]

    conn.commit()
    conn.close()

    # Rewrite persistence.json without user specific data
    with open(PERSISTENCE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
        
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
