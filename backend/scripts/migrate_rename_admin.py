#!/usr/bin/env python3
"""
一次性迁移脚本：将 admin 账户重命名为 chenrs12138 并设置新密码。

说明：
- 只修改 users 表的 username 和 hashed_password 字段，user_id 不变；
- habit/task/project/goal/review 等所有关联数据因外键是 user_id，所以自动保留；
- 密码通过 getpass 交互输入，不会进入 shell history；
- 运行前请务必备份 lifeflow.db。

用法：
    cd /opt/LifeFlow/backend
    python scripts/migrate_rename_admin.py --db /opt/LifeFlow/docker/data/lifeflow.db

如果服务器宿主没有安装 passlib，可以在 backend 容器里执行：
    docker compose exec backend python scripts/migrate_rename_admin.py \
        --db /app/lifeflow.db
"""
import argparse
import getpass
import sqlite3
import sys

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

OLD_USERNAME = "admin"
NEW_USERNAME = "chenrs12138"


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def main() -> int:
    parser = argparse.ArgumentParser(description="重命名 admin 账户并更新密码")
    parser.add_argument(
        "--db",
        required=True,
        help="lifeflow.db 的绝对路径，例如 /opt/LifeFlow/docker/data/lifeflow.db",
    )
    args = parser.parse_args()

    db_path = args.db

    # 读取新密码（交互式，不显示输入）
    password = getpass.getpass(f"请输入 {NEW_USERNAME} 的新密码: ")
    if not password:
        print("错误：密码不能为空", file=sys.stderr)
        return 1

    confirm = getpass.getpass("请再次输入新密码确认: ")
    if password != confirm:
        print("错误：两次输入的密码不一致", file=sys.stderr)
        return 1

    hashed_password = get_password_hash(password)

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()

        # 检查目标账户是否已存在
        cursor.execute(
            "SELECT id FROM users WHERE username = ?", (NEW_USERNAME,)
        )
        if cursor.fetchone():
            print(f"错误：目标用户名 {NEW_USERNAME} 已存在", file=sys.stderr)
            return 1

        # 查找 admin 账户
        cursor.execute("SELECT id FROM users WHERE username = ?", (OLD_USERNAME,))
        row = cursor.fetchone()
        if not row:
            print(f"错误：未找到 {OLD_USERNAME} 用户", file=sys.stderr)
            return 1

        user_id = row[0]

        # 更新 username 和 password_hash
        cursor.execute(
            "UPDATE users SET username = ?, hashed_password = ? WHERE id = ?",
            (NEW_USERNAME, hashed_password, user_id),
        )
        conn.commit()

        print(f"成功：用户 {OLD_USERNAME} (id={user_id}) 已重命名为 {NEW_USERNAME}")
        print("关联数据（habits/tasks/projects/goals/reviews 等）均已保留")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
