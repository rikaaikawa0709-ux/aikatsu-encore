
import json
import re
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "card-catalog.js"
OUTPUT = ROOT / "new-card-candidates.json"

URLS = [
    "https://dcd.aikatsu.com/encore/cardlist/",
    "https://dcd.aikatsu.com/encore/cardlist/?search=true&series=629001&display=2&sort=1",
    "https://dcd.aikatsu.com/encore/cardlist/?search=true&series=629002&display=1&sort=1",
]

PATTERN = re.compile(
    r"(?:E\d+-\d+|P\d+-\d+|\d+-\d+)_(?:ER|PR|R|N)",
    re.I
)

def fetch(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        return response.read().decode("utf-8", "replace")

def main():
    catalog_text = CATALOG.read_text(encoding="utf-8")
    known = set(
        re.findall(r'"cardNumber"\s*:\s*"([^"]+)"', catalog_text)
    )

    found = {}
    errors = []

    for url in URLS:
        try:
            html = fetch(url)
            for match in PATTERN.finditer(html):
                number = match.group(0).upper()
                if number not in known:
                    found[number] = {
                        "cardNumber": number,
                        "rarity": number.rsplit("_", 1)[-1],
                        "source": "公式カードリスト"
                    }
        except Exception as exc:
            errors.append(f"{url}: {exc}")

    previous = {}
    if OUTPUT.exists():
        try:
            previous = json.loads(
                OUTPUT.read_text(encoding="utf-8")
            )
        except Exception:
            previous = {}

    for item in previous.get("candidates", []):
        number = item.get("cardNumber")
        if number and number not in known:
            found.setdefault(number, item)

    result = {
        "checkedAt": datetime.now(
            ZoneInfo("Asia/Tokyo")
        ).strftime("%Y-%m-%d %H:%M"),
        "source": "https://dcd.aikatsu.com/encore/cardlist/",
        "candidates": sorted(
            found.values(),
            key=lambda x: x["cardNumber"]
        ),
        "checkWarnings": errors
    }

    OUTPUT.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print(f"検出候補: {len(result['candidates'])}件")
    print(f"取得エラー: {len(errors)}件")

if __name__ == "__main__":
    main()
