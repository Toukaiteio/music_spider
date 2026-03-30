import sqlite3
import os
import hashlib
import json

DB_PATH = "data/app.db"

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    with conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS sys_config (
                key TEXT UNIQUE NOT NULL,
                value TEXT
            );
            
            CREATE TABLE IF NOT EXISTS user_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                module TEXT NOT NULL,
                key TEXT NOT NULL,
                data_json TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id),
                UNIQUE(user_id, module, key)
            );
        ''')
    
    admin_pw = hashlib.sha256("1235zxcD".encode()).hexdigest()
    with conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", ("Daiyosei",))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)", ("Daiyosei", admin_pw))
            cursor.execute("INSERT OR IGNORE INTO sys_config (key, value) VALUES (?, ?)", ("registration_enabled", "1"))
    
    conn.close()

init_db()
