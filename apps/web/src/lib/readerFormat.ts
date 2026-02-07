/**
 * Reader Format Utilities
 * Converts plain text into semantic HTML blocks (paragraphs, headings, lists)
 */

export interface TextBlock {
  type: "heading" | "paragraph" | "list";
  content: string | string[];
}

/**
 * Parse text into structured blocks for reader view
 */
export function parseTextIntoBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const lines = text.split("\n");

  let currentParagraph: string[] = [];
  let currentList: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const content = currentParagraph.join(" ").trim();
      if (content.length > 0) {
        blocks.push({ type: "paragraph", content });
      }
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push({ type: "list", content: currentList });
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === "") {
      flushParagraph();
      flushList();
      continue;
    }

    // Detect headings: ALL CAPS or ends with ":"
    const isAllCaps = /^[A-Z\s0-9]{3,}$/.test(trimmed) && trimmed.length < 100;
    const endsWithColon = trimmed.endsWith(":") && trimmed.length < 80;

    if (isAllCaps || endsWithColon) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "heading",
        content: endsWithColon ? trimmed.slice(0, -1) : trimmed
      });
      continue;
    }

    // Detect list items (-, •, *, or digit followed by . or ))
    const listMatch = trimmed.match(/^([•\-*]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      currentList.push(listMatch[2]);
      continue;
    }

    // Regular paragraph line
    flushList();
    currentParagraph.push(trimmed);
  }

  // Flush remaining
  flushParagraph();
  flushList();

  return blocks;
}

/**
 * Clean text for reader view (remove wiki markup, citations, etc.)
 */
export function cleanTextForReader(text: string): string {
  return text
    .replace(/\[\s*edit\s*\]/gi, "")                    // Remove [ edit ]
    .replace(/\[\s*\d+\s*\]/g, "")                      // Remove [ 1 ], [ 12 ], etc.
    .replace(/\^\s*[a-z]\s*[a-z]?/gi, "")               // Remove ^ a b, ^ a, etc.
    .replace(/\^/g, "")                                 // Remove stray carets
    .replace(/^PMID[\s:]+\d+/gim, "")                   // Remove PMID lines
    .replace(/^DOI[\s:]+[\S]+/gim, "")                  // Remove DOI lines
    .replace(/^ISBN[\s:]+[\d-]+/gim, "")                // Remove ISBN lines
    .replace(/^Bibcode[\s:]+[\S]+/gim, "")              // Remove Bibcode lines
    .replace(/doi\s*:\s*\S+/gi, "")                     // Remove inline DOI
    .replace(/\n{3,}/g, "\n\n")                         // Collapse 3+ newlines to 2
    .replace(/\s+/g, " ")                               // Collapse multiple spaces
    .trim();
}

/**
 * Check if a block should be skipped (metadata, navigation, etc.)
 */
export function shouldSkipBlock(content: string): boolean {
  if (content.length < 30) return true;
  if (content.startsWith("Retrieved")) return true;
  if (content.match(/^\d{4}/)) return true;
  if (content.match(/^(References|Bibliography|See also|External links)/i)) return true;
  return false;
}

/**
 * Highlight a quote within text content
 */
export function highlightQuoteInText(
  content: string,
  quote: string | undefined
): { text: string; highlighted: boolean } {
  if (!quote) return { text: content, highlighted: false };

  const normalizeForSearch = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const normalized = normalizeForSearch(content);
  const normalizedQuote = normalizeForSearch(quote);

  // Check if quote appears in content (fuzzy match with first 30 chars)
  const searchSnippet = normalizedQuote.substring(0, 30);
  const isHighlighted = normalized.includes(searchSnippet);

  return { text: content, highlighted: isHighlighted };
}
