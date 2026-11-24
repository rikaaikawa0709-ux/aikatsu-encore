import json
import re
import urllib.request
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "card-catalog.js"
OUTPUT = ROOT / "new-card-candidates.json"

# 629001: 1弾、629002: パラレル、629901: プロモーションカード
CARD_LIST_URLS = [
    "https://dcd.aikatsu.com/encore/cardlist/?search=true&series=629001&display=1&sort=1",
    "https://dcd.aikatsu.com/encore/cardlist/?search=true&series=629002&display=1&sort=1",
    "https://dcd.aikatsu.com/encore/cardlist/?search=true&series=629901&display=1&sort=1",
]
NEWS_INDEX_URL = "https://dcd.aikatsu.com/encore/news/"

# E1-01_PR / EP-042_PR / EP-042 PR などの表記ゆれに対応
CARD_PATTERN = re.compile(
    r"(?<![A-Z0-9])((?:EP-\d{3}|E\d+-\d{2}|P\d+-\d{2}|\d+-\d{2}))\s*[_-]?\s*(ER|PR|R|N)(?![A-Z])",
    re.IGNORECASE,
)
NEWS_LINK_PATTERN = re.compile(r"href=[\"']([^\"']*/news/\d+\.php[^\"']*)[\"']", re.IGNORECASE)


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        value = " ".join(data.split())
        if value:
            self.parts.append(value)


def fetch(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; AikatsuCardListChecker/1.1)"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8", "replace")


def plain_text(html):
    parser = TextExtractor()
    parser.feed(html)
    return " ".join(parser.parts)


def normalize_card_number(match):
    prefix = match.group(1).upper()
    rarity = match.group(2).upper()
    return f"{prefix}_{rarity}"


def metadata_for(number, source, surrounding_text=""):
    rarity = number.rsplit("_", 1)[-1]
    is_promo = number.startswith("EP-")
    item = {
        "cardNumber": number,
        "rarity": rarity,
        "series": "プロモーション" if is_promo else "",
        "catalogGroup": "プロモーションカード" if is_promo else "新カード（分類確認待ち）",
        "source": source,
    }

    # 公式ニュース本文に「EP-042 PR カード名」のような記載があれば名前も候補に入れる。
    if surrounding_text:
        escaped = re.escape(number.rsplit("_", 1)[0]).replace(r"\-", r"[-‐－ー]")
        name_match = re.search(
            escaped + r"\s*[_-]?\s*" + re.escape(rarity) + r"\s+([ぁ-んァ-ヶ一-龠ーA-Za-z0-9！!・（）()ー]+)",
            surrounding_text,
        )
        if name_match:
            name = name_match.group(1).strip(" ・:：、。")
            if name and name not in {"表面", "裏面", "カード"}:
                item["name"] = name
    return item


def collect_from_page(url, source, found, errors, expect_cards=False):
    try:
        html = fetch(url)
        text = plain_text(html)
        matches = list(CARD_PATTERN.finditer(text))
        context_text = text
        if not matches:
            matches = list(CARD_PATTERN.finditer(html))
            context_text = ""
        for match in matches:
            number = normalize_card_number(match)
            start = max(0, match.start() - 80)
            end = min(len(context_text), match.end() + 140)
            candidate = metadata_for(number, source, context_text[start:end])
            found[number] = candidate
        if expect_cards and not matches:
            errors.append(f"カード番号を読み取れませんでした: {url}")
    except Exception as exc:
        errors.append(f"{url}: {exc}")


def main():
    if not CATALOG.exists():
        raise FileNotFoundError(f"カードカタログが見つかりません: {CATALOG}")

    catalog_text = CATALOG.read_text(encoding="utf-8")
    known = set(re.findall(r'"cardNumber"\s*:\s*"([^"]+)"', catalog_text))
    found = {}
    errors = []

    # 通常カード・パラレル・プロモーションの公式カードリストを確認
    for url in CARD_LIST_URLS:
        source = "公式プロモーションカードリスト" if "629901" in url else "公式カードリスト"
        collect_from_page(url, source, found, errors, expect_cards=True)

    # 公式ニュース本文にもカード番号が記載されることがあるため、最新記事も確認
    try:
        news_html = fetch(NEWS_INDEX_URL)
        news_urls = []
        for href in NEWS_LINK_PATTERN.findall(news_html):
            if href.startswith("http"):
                url = href
            else:
                url = "https://dcd.aikatsu.com" + (href if href.startswith("/") else "/" + href)
            if url not in news_urls:
                news_urls.append(url)
        for url in news_urls[:30]:
            collect_from_page(url, "公式ニュース", found, errors, expect_cards=False)
    except Exception as exc:
        errors.append(f"公式ニュース一覧を確認できませんでした: {exc}")

    # カタログに登録済みの番号は候補にしない。既存候補は登録されるまで保持する。
    candidates = {number: item for number, item in found.items() if number not in known}
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
        except Exception:
            previous = {}
        for item in previous.get("candidates", []):
            number = item.get("cardNumber")
            if number and number not in known:
                candidates.setdefault(number, item)

    result = {
        "checkedAt": datetime.now(ZoneInfo("Asia/Tokyo")).strftime("%Y-%m-%d %H:%M"),
        "source": NEWS_INDEX_URL,
        "candidates": sorted(candidates.values(), key=lambda x: x["cardNumber"]),
        "checkWarnings": errors,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"検出候補: {len(result['candidates'])}件 / 取得・検出警告: {len(errors)}件")
    if errors:
        print("警告: 一部の公式ページを確認できていません。")


if __name__ == "__main__":
    main()
