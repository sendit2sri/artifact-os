"""
Reader Markdown Post-Processor
Converts raw extraction dumps into structured, readable markdown with:
- Proper heading hierarchy
- Split paragraphs
- Real markdown tables
- Better section detection
"""

import re
from typing import List, Optional


def format_for_reader(text: str) -> str:
    """
    Transform raw extracted text into reader-grade markdown.
    
    Steps:
    1. Convert pseudo-tables to markdown (before heading detection)
    2. Detect and format section headings
    3. Split long paragraphs
    4. Clean up formatting artifacts
    """
    if not text:
        return ""
    
    # Step 1: Convert pseudo-tables to markdown (FIRST - prevents false heading detection)
    text = _convert_tables(text)
    
    # Step 2: Detect and mark section headings
    text = _mark_headings(text)
    
    # Step 3: Split long paragraphs
    text = _split_paragraphs(text)
    
    # Step 4: Clean up artifacts
    text = _cleanup_artifacts(text)
    
    return text.strip()


def _mark_headings(text: str) -> str:
    """
    Detect common section titles and convert to markdown headings.
    
    Patterns detected:
    - ALL CAPS titles (RECOMMENDED INTAKES)
    - Title Case with colon (Sources of Biotin:)
    - Common section names (Introduction, Methods, Results, etc.)
    - Table titles (Table 1: Title)
    """
    lines = text.split('\n')
    result = []
    
    # Common section keywords
    section_keywords = [
        'introduction', 'background', 'overview', 'summary',
        'methods', 'methodology', 'approach',
        'results', 'findings', 'data', 'analysis',
        'discussion', 'conclusion', 'recommendations',
        'sources', 'references', 'bibliography',
        'intake', 'dosage', 'requirements', 'guidelines',
        'symptoms', 'diagnosis', 'treatment', 'prevention',
        'side effects', 'interactions', 'precautions',
        'history', 'etymology', 'definition'
    ]
    
    for line in lines:
        stripped = line.strip()
        
        if not stripped:
            result.append(line)
            continue
        
        # Pattern 1: ALL CAPS (3+ words, under 80 chars)
        if (re.match(r'^[A-Z][A-Z\s\-]{2,79}$', stripped) and 
            len(stripped.split()) >= 2 and 
            len(stripped) < 80):
            result.append(f"\n## {stripped.title()}\n")
            continue
        
        # Pattern 2: Table headings (Table 1: Title, Table 1. Title)
        table_match = re.match(r'^(Table|Figure|Chart)\s+\d+[\.:]\s*(.+)', stripped, re.IGNORECASE)
        if table_match:
            result.append(f"\n### {stripped}\n")
            continue
        
        # Pattern 3: Short line ending with colon (potential heading)
        if (len(stripped) < 80 and 
            stripped.endswith(':') and 
            not re.match(r'^\d+\.', stripped)):  # Not a numbered list
            # Check if it contains section keywords
            lower_stripped = stripped.lower()
            is_section = any(keyword in lower_stripped for keyword in section_keywords)
            
            if is_section or len(stripped.split()) <= 6:
                result.append(f"\n## {stripped[:-1]}\n")  # Remove colon
                continue
        
        # Pattern 4: Common section keywords at start of line (standalone)
        lower_stripped = stripped.lower()
        if (len(stripped) < 60 and 
            any(stripped.lower().startswith(kw) for kw in section_keywords) and
            len(stripped.split()) <= 5):
            result.append(f"\n## {stripped}\n")
            continue
        
        result.append(line)
    
    return '\n'.join(result)


def _convert_tables(text: str) -> str:
    """
    Convert pseudo-tables (pipe/space separated) to real markdown tables.
    
    Detects patterns like:
    Age ||Male ||Female
    0-6 months ||5 µg ||5 µg
    """
    lines = text.split('\n')
    result = []
    i = 0
    
    while i < len(lines):
        line = lines[i].strip()
        
        # Check if this looks like a table row (multiple || or long spaces)
        if _is_table_row(line):
            # Collect consecutive table rows
            table_lines = [line]
            i += 1
            
            while i < len(lines) and _is_table_row(lines[i].strip()):
                table_lines.append(lines[i].strip())
                i += 1
            
            # Convert to markdown table
            if len(table_lines) >= 2:  # At least header + 1 row
                md_table = _format_as_markdown_table(table_lines)
                result.append(md_table)
            else:
                result.extend(table_lines)
        else:
            result.append(line)
            i += 1
    
    return '\n'.join(result)


def _is_table_row(line: str) -> bool:
    """Check if line looks like a table row."""
    if not line:
        return False
    
    # Pattern 1: Contains || delimiters
    if '||' in line:
        return True
    
    # Pattern 2: Contains tabs (even single tab can be table)
    if '\t' in line:
        return True
    
    # Pattern 3: Contains long runs of spaces (4+ spaces)
    if len(re.findall(r'\s{4,}', line)) >= 2:
        return True
    
    # Pattern 4: Contains | pipes with content on both sides
    if line.count('|') >= 2 and not line.strip().startswith('|'):
        # Check it's not a markdown table already
        if not re.match(r'^\|.*\|$', line):
            return True
    
    return False


def _format_as_markdown_table(lines: List[str]) -> str:
    """
    Convert pseudo-table lines to proper markdown table.
    
    Input: ['Age ||Male ||Female', '0-6 months ||5 µg ||5 µg']
    Output: Markdown table with | separators and alignment row
    
    Handles:
    - || delimited (Age ||Male ||Female)
    - Tab delimited (Age\tMale\tFemale)
    - Pipe delimited without proper formatting (Age|Male|Female)
    - Space delimited (Age    Male    Female)
    - Empty cells (fills with placeholder)
    """
    if not lines:
        return ""
    
    try:
        # Split rows into cells
        rows = []
        for line in lines:
            # Try different delimiters in order of reliability
            if '||' in line:
                cells = [c.strip() for c in line.split('||')]
            elif '\t' in line:
                cells = [c.strip() for c in line.split('\t')]
            elif '|' in line and not line.strip().startswith('|'):
                # Non-markdown pipe format (e.g., "A|B|C")
                cells = [c.strip() for c in line.split('|')]
            else:
                # Split by multiple spaces (3+)
                cells = [c.strip() for c in re.split(r'\s{3,}', line)]
            
            # Keep empty cells but filter out None
            cells = [c if c else "" for c in cells]
            if cells:  # Only add non-empty rows
                rows.append(cells)
        
        if not rows:
            return ""
        
        # Determine max columns across all rows
        max_cols = max(len(row) for row in rows)
        
        # Pad rows to same length with empty strings
        for row in rows:
            while len(row) < max_cols:
                row.append("")
        
        # Build markdown table
        md_lines = []
        
        # Header row (first row)
        header = [cell if cell else "Column" for cell in rows[0]]  # Fill empty headers
        md_lines.append("| " + " | ".join(header) + " |")
        
        # Separator row (required for markdown tables)
        md_lines.append("| " + " | ".join(["---"] * max_cols) + " |")
        
        # Data rows (remaining rows)
        for row in rows[1:]:
            # Replace empty cells with em dash for readability
            formatted_row = [cell if cell else "—" for cell in row]
            md_lines.append("| " + " | ".join(formatted_row) + " |")
        
        return "\n" + "\n".join(md_lines) + "\n"
    
    except Exception as e:
        # Safety: if table formatting fails, return original lines
        print(f"⚠️ Table formatting failed: {e}")
        return "\n".join(lines)


def _split_paragraphs(text: str) -> str:
    """
    Split very long paragraphs into smaller, more readable chunks.
    
    Rules:
    - Split at sentence boundaries (. ! ?) followed by space + capital letter
    - Target ~3-4 sentences per paragraph (max 400 chars)
    - Preserve existing paragraph breaks
    - Don't split if already well-structured (<400 chars between breaks)
    """
    lines = text.split('\n')
    result = []
    
    for line in lines:
        stripped = line.strip()
        
        # Skip headings, tables, lists, or empty lines
        if (not stripped or 
            stripped.startswith('#') or 
            stripped.startswith('|') or 
            stripped.startswith('-') or 
            stripped.startswith('*') or 
            re.match(r'^\d+\.', stripped)):
            result.append(line)
            continue
        
        # Only split if paragraph is very long (400+ chars)
        if len(stripped) < 400:
            result.append(line)
            continue
        
        # Split into sentences (at . ! ? followed by space + capital)
        # Keep the delimiter attached to preceding sentence
        sentence_pattern = r'([.!?]+)\s+(?=[A-Z])'
        parts = re.split(sentence_pattern, stripped)
        
        # Reconstruct sentences (text + delimiter)
        sentences = []
        for i in range(0, len(parts) - 1, 2):
            text_part = parts[i]
            delimiter = parts[i + 1] if i + 1 < len(parts) else ""
            sentences.append(text_part + delimiter)
        
        # Add final part if exists
        if len(parts) % 2 == 1 and parts[-1].strip():
            sentences.append(parts[-1])
        
        if not sentences:
            result.append(line)
            continue
        
        # Recombine into ~3-4 sentence chunks (max 400 chars)
        current_chunk = []
        current_length = 0
        
        for sentence in sentences:
            current_chunk.append(sentence.strip())
            current_length += len(sentence)
            
            # Start new paragraph after 3-4 sentences OR 350+ chars
            if len(current_chunk) >= 4 or current_length >= 350:
                result.append(" ".join(current_chunk))
                result.append("")  # Blank line between paragraphs
                current_chunk = []
                current_length = 0
        
        # Add remaining sentences
        if current_chunk:
            result.append(" ".join(current_chunk))
    
    return '\n'.join(result)


def _cleanup_artifacts(text: str) -> str:
    """
    Remove common extraction artifacts and clean up formatting.
    """
    # Remove multiple consecutive blank lines (keep max 2)
    text = re.sub(r'\n{4,}', '\n\n\n', text)
    
    # Clean up spaces before punctuation
    text = re.sub(r'\s+([.,;:!?])', r'\1', text)
    
    # Fix spacing around markdown headings
    text = re.sub(r'\n(#{1,6}\s+.+)\n{1}', r'\n\n\1\n\n', text)
    
    # Remove trailing spaces from lines
    lines = [line.rstrip() for line in text.split('\n')]
    text = '\n'.join(lines)
    
    return text


def inject_evidence_mark(
    text: str, 
    quote: str, 
    start_offset: Optional[int] = None,
    end_offset: Optional[int] = None
) -> str:
    """
    Inject <mark> tag at exact quote location for precise highlighting.
    
    Args:
        text: Full text content
        quote: Quote to highlight
        start_offset: Exact start position (if known)
        end_offset: Exact end position (if known)
    
    Returns:
        Text with <mark id="evidence-mark" data-evidence-mark="true">quote</mark> injected
    """
    if not quote or not text:
        return text
    
    # Use stored offsets if available (most reliable)
    if start_offset is not None and end_offset is not None:
        if 0 <= start_offset < end_offset <= len(text):
            before = text[:start_offset]
            quote_text = text[start_offset:end_offset]
            after = text[end_offset:]
            return f'{before}<mark id="evidence-mark" data-evidence-mark="true">{quote_text}</mark>{after}'
    
    # Fallback: Find quote in text (case-insensitive)
    lower_text = text.lower()
    lower_quote = quote.lower()
    
    # Try exact match
    idx = lower_text.find(lower_quote)
    if idx != -1:
        before = text[:idx]
        quote_text = text[idx:idx + len(quote)]
        after = text[idx + len(quote):]
        return f'{before}<mark id="evidence-mark" data-evidence-mark="true">{quote_text}</mark>{after}'
    
    # No match found - return original
    return text
