"""
迁移脚本：为 tasks 表添加 completed_date 字段，并从 completed_at 回填。

用法：
    python backend/scripts/migrate_add_completed_date.py [数据库路径]

默认数据库路径：/home/cjn/Templates/LF/lifeflow.db
"""
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

DEFAULT_DB = "/home/cjn/Templates/LF/lifeflow.db"


def migrate(db_path: str):
    db_path = Path(db_path)
    if not db_path.exists():
        print(f"数据库不存在: {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # 检查字段是否已存在
    cursor.execute("PRAGMA table_info(tasks)")
    columns = {row[1] for row in cursor.fetchall()}

    if "completed_date" in columns:
        print("completed_date 字段已存在，跳过添加。")
    else:
        print("添加 completed_date 字段...")
        cursor.execute("ALTER TABLE tasks ADD COLUMN completed_date DATE")
        conn.commit()
        print("字段添加完成。")

    # 从 completed_at 回填 completed_date
    cursor.execute(
        "SELECT id, completed_at FROM tasks WHERE status = 'completed' AND completed_at IS NOT NULL AND completed_date IS NULL"
    )
    rows = cursor.fetchall()
    updated = 0
    for task_id, completed_at in rows:
        try:
            if isinstance(completed_at, str):
                # 尝试 ISO 格式
                dt = datetime.fromisoformat(completed_at)
            else:
                continue
            completed_date = dt.date().isoformat()
            cursor.execute(
                "UPDATE tasks SET completed_date = ? WHERE id = ?",
                (completed_date, task_id)
            )
            updated += 1
        except Exception as e:
            print(f"回填任务 {task_id} 失败: {e}")

    conn.commit()
    conn.close()
    print(f"回填完成，共更新 {updated} 条记录。")


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_DB
    print(f"迁移数据库: {db_path}")
    migrate(db_path)
