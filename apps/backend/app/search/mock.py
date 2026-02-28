"""Mock search provider (no network). Used when SCIRA_USE_MOCK_SEARCH=true or no API key."""
from app.search.provider import SearchResult

MOCK_SEARCH_URLS = [
    "https://example.com/page1",
    "https://example.com/page2",
    "https://wikipedia.org/wiki/Test",
    "https://example.org/doc",
    "https://example.com/page3",
]


class MockSearchProvider:
    """Returns a fixed list of URLs; no network calls."""

    def __init__(self, urls: list[str] | None = None):
        self.urls = urls or MOCK_SEARCH_URLS.copy()

    def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        limit = max(1, min(limit, 20))
        return [
            SearchResult(url=u, title=f"Title for {u}", snippet=f"Snippet for {u}")
            for u in self.urls[:limit]
        ]
