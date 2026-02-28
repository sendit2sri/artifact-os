"""Tavily search provider (production). Uses requests; no extra dependency."""
import os
import requests
from app.search.provider import SearchResult


def _get_api_key() -> str | None:
    return os.environ.get("TAVILY_API_KEY")


class TavilySearchProvider:
    """Production search via Tavily API (POST https://api.tavily.com/search)."""
    def __init__(self, api_key: str | None = None, base_url: str = "https://api.tavily.com"):
        self.api_key = api_key or _get_api_key()
        self.base_url = base_url.rstrip("/")

    def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        if not self.api_key:
            raise ValueError("TAVILY_API_KEY is not set")
        limit = max(1, min(limit, 20))
        resp = requests.post(
            f"{self.base_url}/search",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.api_key}"},
            json={"query": query, "max_results": limit, "search_depth": "basic"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results") or []
        return [
            SearchResult(
                url=item.get("url", ""),
                title=item.get("title"),
                snippet=item.get("content"),
            )
            for item in results
            if item.get("url")
        ]
