"""
Reddit thread extraction: OP + top comments (id, author, score, body, permalink).
Uses Reddit's public .json endpoint (no API key).
"""
from typing import Dict, Any, List

import requests


def extract_reddit(url: str) -> Dict[str, Any]:
    """
    Fetch thread via Reddit JSON and return structured data.
    Returns: title, op_text, comments[] (id, author, score, body, permalink), thread_url.
    """
    result: Dict[str, Any] = {
        "title": "",
        "op_text": "",
        "comments": [],
        "thread_url": _normalize_reddit_url(url),
    }
    json_url = url.rstrip("/") + ".json" if "?.json" not in url else url
    if not json_url.endswith(".json"):
        json_url = json_url + ".json"

    try:
        headers = {"User-Agent": "ArtifactOS/1.0 (research)"}
        resp = requests.get(json_url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"⚠️ Reddit fetch failed: {e}")
        return result

    try:
        if not isinstance(data, list) or len(data) < 1:
            return result
        listing = data[0].get("data", {}).get("children", [])
        if not listing:
            return result
        op = listing[0].get("data", {})
        result["title"] = op.get("title", "")
        result["op_text"] = op.get("selftext", "") or ""
        result["thread_url"] = "https://www.reddit.com" + op.get("permalink", "").rstrip("/") + "/"

        # Comments: second item in list is comment tree
        if len(data) > 1:
            comment_children = data[1].get("data", {}).get("children", [])
            comments_flat = _flatten_comments(comment_children, result["thread_url"])
            # Top N by score
            comments_flat.sort(key=lambda c: c.get("score", 0), reverse=True)
            result["comments"] = comments_flat[:20]
    except Exception as e:
        print(f"⚠️ Reddit parse failed: {e}")

    return result


def _normalize_reddit_url(url: str) -> str:
    try:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = (parsed.path or "").strip("/")
        parts = path.split("/")
        if "comments" in parts:
            idx = parts.index("comments")
            if idx + 1 < len(parts):
                post_id = parts[idx + 1]
                slug = parts[idx + 2] if idx + 2 < len(parts) else ""
                sub = "reddit"
                if "r" in parts:
                    r_idx = parts.index("r")
                    if r_idx + 1 < len(parts) and r_idx < idx:
                        sub = parts[r_idx + 1]
                base = f"https://www.reddit.com/r/{sub}/comments/{post_id}"
                return f"{base}/{slug}/" if slug else f"{base}/"
    except Exception:
        pass
    return url


def _flatten_comments(children: List[Dict], thread_url: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for node in children:
        kind = node.get("kind")
        data = node.get("data", {})
        if kind == "t1" and data.get("body"):
            link = data.get("permalink", "")
            full_url = ("https://www.reddit.com" + link) if link.startswith("/") else link
            out.append({
                "id": data.get("id", ""),
                "author": data.get("author", ""),
                "score": data.get("score", 0),
                "body": (data.get("body") or "").strip(),
                "permalink": full_url or thread_url,
            })
        replies = data.get("replies")
        if isinstance(replies, dict) and "data" in replies:
            out.extend(_flatten_comments(replies["data"].get("children", []), thread_url))
        elif isinstance(replies, list):
            out.extend(_flatten_comments(replies, thread_url))
    return out
