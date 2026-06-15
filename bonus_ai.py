#!/usr/bin/env python3
"""
bonus_ai.py — Ask ChatGPT to answer pending bonus questions.

Usage (from project root):
  # Inside Docker (recommended):
  docker compose exec backend python3 /app/bonus_ai.py

  # From host machine (requires DB port exposed locally):
  DATABASE_URL="postgresql://predictor_user:predictor_password@localhost:5432/world_cup_2026" \
  OPENAI_API_KEY="sk-..." python3 bonus_ai.py

Dependencies:
  pip install openai psycopg2-binary python-dotenv
Use --auto to skip all confirmations and save every GPT answer directly.
"""

import os
import sys
AUTO_MODE = '--auto' in sys.argv
from dotenv import load_dotenv

load_dotenv()

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("Missing dependency: pip install psycopg2-binary")

try:
    from openai import OpenAI
except ImportError:
    sys.exit("Missing dependency: pip install openai")

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://predictor_user:predictor_password@localhost:5432/world_cup_2026")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
MODEL = "gpt-4o"

if not OPENAI_API_KEY:
    print("OPENAI_API_KEY not set.")
    OPENAI_API_KEY = input("Enter your OpenAI API key: ").strip()
    if not OPENAI_API_KEY:
        sys.exit("No API key provided. Exiting.")

client = OpenAI(api_key=OPENAI_API_KEY)

# ── Database ──────────────────────────────────────────────────────────────────

# When running from the host machine, 'db' won't resolve — replace with localhost
db_url = DATABASE_URL.replace("@db:", "@localhost:")

try:
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
except Exception as e:
    sys.exit(f"Cannot connect to database: {e}\n"
             f"URL used: {db_url}\n"
             "If running from host machine, make sure the DB port is exposed in docker-compose.yml")

# ── Fetch pending questions ───────────────────────────────────────────────────

cur.execute("""
    SELECT
        bq.id          AS question_id,
        bq.type        AS question_type,
        bq.question    AS question_text,
        bq.correct_answer,
        m.id           AS match_id,
        m.home_team,
        m.away_team,
        m.home_score,
        m.away_score,
        m.kickoff_time,
        m.stage
    FROM bonus_questions bq
    JOIN matches m ON m.id = bq.match_id
    WHERE m.status = 'FINISHED'
      AND (bq.correct_answer IS NULL OR bq.correct_answer = '')
    ORDER BY m.kickoff_time ASC
""")

pending = cur.fetchall()

if not pending:
    print("✅ No pending bonus questions found.")
    sys.exit(0)

print(f"\n{'='*60}")
print(f"Found {len(pending)} pending question(s)")
print(f"{'='*60}\n")

# ── Ask ChatGPT ───────────────────────────────────────────────────────────────

def ask_gpt(question_type: str, question_text: str, match: dict) -> str:
    home = match["home_team"]
    away = match["away_team"]
    home_score = match["home_score"]
    away_score = match["away_score"]
    date = str(match["kickoff_time"])[:10]
    stage = match["stage"]

    context = (
        f"Match: {home} {home_score} – {away_score} {away}\n"
        f"Date: {date} | Stage: {stage}"
    )

    if question_type == "country":
        prompt = (
            f"{context}\n\n"
            f"Question: {question_text}\n\n"
            f"Answer ONLY with one of these three options (no explanation):\n"
            f"- 'home'  (meaning {home})\n"
            f"- 'away'  (meaning {away})\n"
            f"- 'none'  (neither team)"
        )
    else:
        prompt = (
            f"{context}\n\n"
            f"Question: {question_text}\n\n"
            f"Answer with the player's full name ONLY, no explanation. "
            f"If unsure, give your best answer."
        )

    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a football expert. Answer bonus prediction questions about World Cup 2026 matches accurately and concisely."},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
        max_tokens=50,
    )
    return resp.choices[0].message.content.strip().strip("'\"").lower() if question_type == "country" \
        else resp.choices[0].message.content.strip().strip("'\"")

# ── Process each question ─────────────────────────────────────────────────────

to_save = []

for q in pending:
    match_label = f"{q['home_team']} {q['home_score']} – {q['away_score']} {q['away_team']}"
    print(f"Match : {match_label}  ({q['stage']})")
    print(f"Type  : {q['question_type']}")
    print(f"❓ {q['question_text']}")

    try:
        answer = ask_gpt(q["question_type"], q["question_text"], q)
    except Exception as e:
        print(f"  ⚠️  GPT error: {e}\n")
        continue

    # Validate country answers
    if q["question_type"] == "country" and answer not in ("home", "away", "none"):
        print(f"  ⚠️  Unexpected GPT answer '{answer}' for country question — skipping\n")
        continue

    # Display answer with human-readable label for country type
    if q["question_type"] == "country":
        label = {"home": q["home_team"], "away": q["away_team"], "none": "Aucune équipe"}[answer]
        print(f"💡 GPT answer: {answer} → {label}")
    else:
        print(f"💡 GPT answer: {answer}")

    if AUTO_MODE:
        final_answer = answer
        print("  Auto-accepted.")
    else:
        choice = input("  Accept? [Y/n/custom] ").strip()
        if choice.lower() == "n":
            print("  Skipped.\n")
            continue
        elif choice == "" or choice.lower() == "y":
            final_answer = answer
        else:
            final_answer = choice.strip()
            if q["question_type"] == "country" and final_answer not in ("home", "away", "none"):
                print(f"  ⚠️  Invalid country answer '{final_answer}'. Must be home/away/none. Skipped.\n")
                continue
            print(f"  Using custom answer: {final_answer}")

    to_save.append({"id": q["question_id"], "answer": final_answer})
    print()

# ── Save confirmed answers ────────────────────────────────────────────────────

if not to_save:
    print("Nothing to save.")
    sys.exit(0)

print(f"\nSaving {len(to_save)} answer(s)…")
try:
    for item in to_save:
        cur.execute(
            "UPDATE bonus_questions SET correct_answer = %s WHERE id = %s",
            (item["answer"], item["id"])
        )
    conn.commit()
    print(f"✅ {len(to_save)} answer(s) saved successfully.")
except Exception as e:
    conn.rollback()
    print(f"❌ Error saving: {e}")
finally:
    cur.close()
    conn.close()
