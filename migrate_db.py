"""
migrate_db.py — Converte paky3dSo.db nel formato JSON di MarketSpace v1.5.0

Uso:
    python migrate_db.py

Output:
    import_paky.json  (pronto per essere importato via ⚙️ → Importa backup)
"""

import sqlite3
import json
import hashlib
from datetime import datetime, timezone

DB_PATH = "paky3dSo.db"
OUT_PATH = "import_paky.json"
USERNAME = "default"

PRIORITY_MAP = {
    "Molto Alta": "very-high",
    "Alta": "high",
    "Normale": "normal",
    "Bassa": "low",
}

def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def js_num(v):
    """JavaScript JSON.stringify serializes 2.0 as '2', not '2.0'. Match that."""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v

def main():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # --- Movements ---
    cur.execute("SELECT * FROM movements ORDER BY id")
    movements = []
    for row in cur.fetchall():
        amount = js_num(row["amount"])
        movements.append({
            "id": row["id"],
            "username": USERNAME,
            "type": "sale" if amount >= 0 else "purchase",
            "amount": amount,
            "description": row["description"] or "",
            "itemName": "",
            "customer": "",
            "date": row["date"],
            "archived": False,
            "spoolId": None,
            "gramsUsed": 0,
            "materialCost": 0,
            "shippingCost": 0,
        })

    # --- Tasks ---
    cur.execute("SELECT * FROM tasks ORDER BY id")
    tasks = []
    for row in cur.fetchall():
        desc = row["description"] or ""
        tasks.append({
            "id": row["id"],
            "username": USERNAME,
            "title": desc[:60],
            "description": desc,
            "done": bool(row["done"]),
            "priority": PRIORITY_MAP.get(row["priority"], "normal"),
            "archived": False,
        })

    conn.close()

    payload = {
        "version": "4",
        "username": USERNAME,
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "movements": movements,
        "tasks": tasks,
        "spools": [],
    }

    # JavaScript JSON.stringify non escapa i caratteri non-ASCII (es. €),
    # quindi usiamo ensure_ascii=False per produrre lo stesso risultato.
    checksum = sha256(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))
    output = {"meta": {"checksum": checksum}, "payload": payload}

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"OK: {len(movements)} movimenti e {len(tasks)} task esportati.")
    print(f"OK: File salvato: {OUT_PATH}")
    print(f"\nOra apri l'app > Impostazioni > Importa backup > seleziona {OUT_PATH}")

if __name__ == "__main__":
    main()
