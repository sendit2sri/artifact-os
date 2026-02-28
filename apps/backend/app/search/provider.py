"""Search provider interface and implementations."""
from typing import Protocol


class SearchResult:
    """Single search result (URL + optional title/snippet)."""
    def __init__(self, url: str, title: str | None = None, snippet: str | None = None):
        self.url = url
        self.title = title
        self.snippet = snippet


class SearchProvider(Protocol):
    """Protocol for search backends (Tavily, mock, etc.)."""
    def search(self, query: str, limit: int = 5) -> list[SearchResult]:
        """Return up to `limit` search results. No network in tests."""
        ...
