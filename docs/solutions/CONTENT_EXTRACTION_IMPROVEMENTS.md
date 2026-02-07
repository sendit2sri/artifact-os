# Content Extraction Improvements

## Overview

Enhanced the ingestion pipeline to support multiple content representations (raw text, markdown, HTML) for improved Reader view rendering across different source types like Wikipedia, NIH publications, and academic papers.

## Changes Made

### 1. Database Schema Updates (`models.py`)

Added three new fields to the `SourceDoc` table:

```python
content_text_raw: Optional[str]      # Raw extracted text (whitespace preserved)
content_markdown: Optional[str]      # Clean markdown when available
content_html_clean: Optional[str]    # Cleaned HTML (main content only)
```

**Migration Required:** Run `migrations/add_content_formats.sql` to add these columns to existing databases.

### 2. Enhanced Content Extraction (`ingest_task.py`)

#### New `clean_main_content()` Function

Extracts multiple content representations using a tiered approach:

1. **Primary Method:** Uses `trafilatura` for intelligent main content extraction
   - Extracts both text and markdown formats
   - Preserves structure (headings, lists, tables)
   - Filters out navigation, ads, and boilerplate

2. **Fallback Method:** Uses `BeautifulSoup` when trafilatura is unavailable
   - Identifies main content areas (`<main>`, `<article>`, `.content`)
   - Removes unwanted elements (nav, footer, scripts)
   - Provides clean HTML and text extraction

3. **Last Resort:** Plain text extraction from entire page

#### Updated Ingestion Workflow

```
Fetch URL → Extract Multiple Formats → Save All Formats → Extract Facts
```

The ingestion task now:
- Saves content in all three formats (when available)
- Uses the best format for fact extraction
- Provides progress updates throughout the pipeline
- Includes metadata about available formats in job results

### 3. API Enhancements (`sources.py`)

Updated the `/projects/{project_id}/sources/content` endpoint to support a `mode` query parameter:

```python
@router.get("/projects/{project_id}/sources/content")
def get_source_content(
    project_id: str,
    url: str,
    mode: Literal["raw", "markdown", "html", "auto"] = "auto"
)
```

**Modes:**
- `raw`: Returns raw extracted text (for debugging)
- `markdown`: Returns markdown format (preferred for Reader view)
- `html`: Returns cleaned HTML
- `auto`: Intelligently selects best available format (markdown > html > raw)

**Response Format:**
```json
{
  "content": "...",
  "format": "markdown",
  "available_formats": {
    "raw": true,
    "markdown": true,
    "html": false
  }
}
```

### 4. Frontend Updates

#### API Client (`api.ts`)

Added type definitions and updated `fetchSourceContent()`:

```typescript
export interface SourceContent {
  content: string;
  format: "raw" | "markdown" | "html";
  available_formats: {
    raw: boolean;
    markdown: boolean;
    html: boolean;
  };
}

export async function fetchSourceContent(
  projectId: string,
  url: string,
  mode: "raw" | "markdown" | "html" | "auto" = "auto"
)
```

#### EvidenceInspector Component

Updated to use different content modes for Reader vs Raw tabs:

- **Reader Tab:** Uses `"auto"` mode (prefers markdown/HTML for clean rendering)
- **Raw Tab:** Uses `"raw"` mode (shows exact extracted text for debugging)

Both tabs maintain separate query caches for optimal performance.

## Benefits

### For Users

1. **Better Readability:** Wikipedia, NIH, and academic papers render with proper structure
2. **Preserved Formatting:** Headings, lists, and paragraphs display correctly
3. **Debugging Capability:** Raw mode still available for troubleshooting
4. **Faster Scanning:** Clean content makes it easier to find relevant information

### For Developers

1. **Multiple Fallbacks:** Robust extraction works across diverse sources
2. **Debuggable:** Raw content always preserved for comparison
3. **Flexible API:** Mode parameter allows requesting specific formats
4. **Backward Compatible:** Legacy `content_text` field still populated

## Testing

### Test Cases

1. **Wikipedia Pages:**
   - Should extract clean markdown with proper headings
   - Citations and edit links should be removed
   - Tables and lists should be preserved

2. **NIH Publications:**
   - Abstract and sections should be clearly separated
   - References section should be cleanly formatted
   - Metadata should be filtered out

3. **News Articles:**
   - Main article content should be isolated
   - Navigation, ads, and sidebars removed
   - Bylines and dates preserved

4. **Academic Papers (PDF):**
   - Text extraction should preserve paragraph structure
   - Section headings should be identified
   - References should be separated

### Manual Testing Steps

1. Ingest a Wikipedia article
2. Open Evidence Inspector
3. Switch between Reader and Raw tabs
4. Verify Reader shows clean, formatted content
5. Verify Raw shows original extracted text

## Migration Guide

### For Existing Databases

1. **Run the migration:**
   ```bash
   psql -d your_database -f apps/backend/migrations/add_content_formats.sql
   ```

2. **Re-ingest existing sources (optional):**
   - Old sources will continue working with `content_text`
   - Re-ingest to get improved markdown/HTML formats
   - Or run a background task to re-extract content

### For New Installations

- Schema changes are included in the updated models
- Run migrations automatically on first deployment

## Dependencies

- `trafilatura==1.6.0` (already in requirements.txt)
- `beautifulsoup4` (already in requirements.txt)

## Future Enhancements

1. **Firecrawl Integration:** Use Firecrawl's markdown output when available
2. **Custom Extractors:** Add specialized extractors for common domains
3. **Table Rendering:** Improve table extraction and display
4. **Image Handling:** Extract and display inline images
5. **Code Block Preservation:** Better handling of code snippets in technical docs

## Troubleshooting

### Content Not Extracting Properly

1. Check if trafilatura is installed: `pip show trafilatura`
2. Look for extraction warnings in worker logs
3. Try the URL in Raw mode to see what was extracted
4. Consider adding a custom extractor for that domain

### Database Migration Issues

- Ensure PostgreSQL user has ALTER TABLE permissions
- Check for NULL constraint violations
- Verify column names don't conflict with reserved words

### API Mode Parameter Not Working

- Clear browser cache and refetch
- Check backend logs for API errors
- Verify query parameter is being sent correctly
