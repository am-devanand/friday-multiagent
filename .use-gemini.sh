#!/bin/bash
# Flip Friday's brain to native Gemini free, then reboot voice.
# Usage: ./.use-gemini.sh <GOOGLE_API_KEY from aistudio.google.com>
set -e
cd "$(dirname "$0")"
KEY="${1:?usage: ./.use-gemini.sh <GOOGLE_API_KEY>}"
python3 - "$KEY" <<'EOF'
import re, sys
p = "/home/darkdevil/friday-multiagent/.env"
s = open(p).read()
updates = {
    "GOOGLE_API_KEY": sys.argv[1],
    "FREE_LLM_MODE": "gemini",
    "GEMINI_FREE_MODEL": "gemini-2.5-flash-lite",
}
for k, v in updates.items():
    s2 = re.sub(rf"^{k}=.*$", f"{k}={v}", s, flags=re.M)
    s = s2 if s2 != s else s + f"\n{k}={v}\n"
open(p, "w").write(s)
print("brain -> gemini free")
EOF
pkill -f "[f]riday_voice" || true
sleep 2
setsid nohup uv run friday_voice > .logs/voice.log 2>&1 < /dev/null &
sleep 25
grep -a -E "registered worker|LLM →|401|traceback" .logs/voice.log | tail -3
