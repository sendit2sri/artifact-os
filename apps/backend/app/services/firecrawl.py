import os
import httpx

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")
FIRECRAWL_URL = "https://api.firecrawl.dev/v0/scrape"

def scrape_url(url: str) -> dict:
    """
    Hits Firecrawl to turn URL -> Clean Markdown.
    Raises exception if fails (Task will retry).
    """
    if not FIRECRAWL_API_KEY:
        # Fallback for dev without key (Simulated Response)
        return {
            "markdown": f"This is simulated content for {url}. The bridge collapsed in 1940 due to aeroelastic flutter.",
            "metadata": {"title": "Simulated Page", "og:site_name": "Dev Local"}
        }

    headers = {"Authorization": f"Bearer {FIRECRAWL_API_KEY}"}
    payload = {"url": url, "pageOptions": {"onlyMainContent": True}}
    
    try:
        response = httpx.post(FIRECRAWL_URL, json=payload, headers=headers, timeout=30.0)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("success"):
             raise Exception(f"Firecrawl failed: {data.get('error')}")
             
        return {
            "markdown": data["data"]["markdown"],
            "metadata": data["data"]["metadata"]
        }
    except Exception as e:
        print(f"❌ Scrape Error: {e}")
        raise e
    