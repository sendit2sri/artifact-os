/**
 * Evidence Panel Utilities
 * Handles quote matching, highlighting, and scrolling for both Reader and Raw views
 */

import React, { type JSX } from 'react';

export interface MatchResult {
  found: boolean;
  start: number;
  end: number;
  matchType: 'exact' | 'normalized' | 'fuzzy' | 'stored' | 'none';
}

/**
 * Find quote in text using stored offsets or multiple matching strategies
 * Prefers stored offsets from backend for precision
 */
export function findQuoteInText(
  fullText: string, 
  quote: string, 
  storedStart?: number, 
  storedEnd?: number
): MatchResult {
  // Strategy 0: Use stored offsets if available (most reliable)
  if (storedStart !== undefined && storedEnd !== undefined && storedStart >= 0 && storedEnd > storedStart) {
    // Validate the offsets are within bounds
    if (storedStart < fullText.length && storedEnd <= fullText.length) {
      return {
        found: true,
        start: storedStart,
        end: storedEnd,
        matchType: 'stored'
      };
    }
  }

  if (!fullText || !quote) {
    return { found: false, start: -1, end: -1, matchType: 'none' };
  }

  // Strategy 1: Exact match (case-insensitive)
  const lowerText = fullText.toLowerCase();
  const lowerQuote = quote.toLowerCase();
  let idx = lowerText.indexOf(lowerQuote);
  
  if (idx !== -1) {
    return {
      found: true,
      start: idx,
      end: idx + quote.length,
      matchType: 'exact'
    };
  }

  // Strategy 2: Whitespace-normalized match
  const normalizeWS = (s: string) => s.replace(/\s+/g, ' ').trim();
  const normText = normalizeWS(lowerText);
  const normQuote = normalizeWS(lowerQuote);
  
  idx = normText.indexOf(normQuote);
  if (idx !== -1) {
    // Map back to original text position (approximate)
    const beforeNorm = normalizeWS(lowerText.substring(0, idx));
    const startPos = fullText.toLowerCase().indexOf(beforeNorm);
    if (startPos !== -1) {
      return {
        found: true,
        start: startPos,
        end: Math.min(startPos + quote.length + 50, fullText.length),
        matchType: 'normalized'
      };
    }
  }

  // Strategy 3: Fuzzy match (first 50 chars)
  const quoteStart = lowerQuote.substring(0, Math.min(50, lowerQuote.length));
  idx = lowerText.indexOf(quoteStart);
  
  if (idx !== -1) {
    return {
      found: true,
      start: idx,
      end: Math.min(idx + quote.length, fullText.length),
      matchType: 'fuzzy'
    };
  }

  return { found: false, start: -1, end: -1, matchType: 'none' };
}

/**
 * Parse plain text into structured paragraphs and headings
 */
export interface TextBlock {
  type: 'paragraph' | 'heading' | 'list';
  content: string | string[];
  level?: number;
}

export function parseTextToBlocks(text: string): TextBlock[] {
  const lines = text.split('\n');
  const blocks: TextBlock[] = [];
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const content = currentParagraph.join(' ').trim();
      if (content.length > 0) {
        blocks.push({ type: 'paragraph', content });
      }
      currentParagraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines (they separate paragraphs)
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Detect headings (ALL CAPS or short lines ending with colon)
    const isAllCaps = /^[A-Z\s]{3,}$/.test(trimmed) && trimmed.length < 60;
    const isHeadingLike = trimmed.length < 80 && trimmed.endsWith(':');
    
    if (isAllCaps || isHeadingLike) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        content: trimmed.replace(/:$/, ''),
        level: 2
      });
      continue;
    }

    // Detect list items
    if (/^[-•*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      flushParagraph();
      // Collect consecutive list items
      const listItems: string[] = [trimmed.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, '')];
      
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (/^[-•*]\s/.test(nextLine) || /^\d+\.\s/.test(nextLine)) {
          listItems.push(nextLine.replace(/^[-•*]\s/, '').replace(/^\d+\.\s/, ''));
          i++;
        } else {
          break;
        }
      }
      
      blocks.push({ type: 'list', content: listItems });
      continue;
    }

    // Regular line - add to current paragraph
    currentParagraph.push(line);
  }

  flushParagraph();
  return blocks;
}

/**
 * Inject <mark> element at exact quote position in text
 * Returns HTML string with mark injected
 * Safeguard: Don't highlight if match is too broad (>30% of content)
 * ✅ Uses data-evidence-mark (not id) to avoid duplicate IDs in DOM
 */
export function injectEvidenceMark(
  text: string,
  quote: string,
  matchResult: MatchResult
): string {
  if (!quote || !text || !matchResult.found) {
    return text;
  }

  const { start, end } = matchResult;
  
  // Guard against highlighting too much text
  const matchLength = end - start;
  const matchPercentage = matchLength / text.length;
  
  if (matchPercentage > 0.3) {
    // Match is too broad (>30% of content) - don't highlight entire thing
    if (process.env.NODE_ENV === 'development') {
      console.warn('Evidence match too broad, skipping highlight:', {
        matchLength,
        totalLength: text.length,
        percentage: (matchPercentage * 100).toFixed(1) + '%'
      });
    }
    return text;
  }
  
  // Extract the exact quote span
  const before = text.substring(0, start);
  const quoteText = text.substring(start, end);
  const after = text.substring(end);
  
  // ✅ Use data-evidence-mark as primary identifier (not id to avoid duplicates)
  // ✅ Add data-testid for E2E test reliability
  return `${before}<mark data-evidence-mark="true" data-testid="evidence-mark" class="evidence-highlight">${quoteText}</mark>${after}`;
}

/**
 * Inject mark into React children (for components that can't use dangerouslySetInnerHTML)
 * Safeguard: Don't highlight if match is too broad (>30% of content)
 * ✅ Uses data-evidence-mark (not id) to avoid duplicate IDs in DOM
 */
export function injectMarkInReactText(
  text: string,
  quote: string,
  matchResult: MatchResult,
  isPulsing: boolean = false
): JSX.Element {
  if (!quote || !text || !matchResult.found) {
    return <>{text}</>;
  }

  const { start, end } = matchResult;
  
  // Guard against highlighting too much text
  const matchLength = end - start;
  const matchPercentage = matchLength / text.length;
  
  if (matchPercentage > 0.3) {
    // Match is too broad - return unhighlighted
    return <>{text}</>;
  }
  
  const before = text.substring(0, start);
  const quoteText = text.substring(start, end);
  const after = text.substring(end);
  
  return (
    <>
      {before}
      <mark
        data-evidence-mark="true"
        data-testid="evidence-mark"
        className={`evidence-highlight ${isPulsing ? 'evidence-pulse' : ''}`}
      >
        {quoteText}
      </mark>
      {after}
    </>
  );
}

/**
 * Scroll to evidence mark with retries and smooth animation
 * Returns true if mark was found and scrolled to, false otherwise
 */
export function scrollToEvidenceMark(
  containerRef: HTMLElement | null,
  maxAttempts: number = 10,
  delayMs: number = 50
): boolean {
  if (!containerRef) return false;

  let attempts = 0;
  let foundMark = false;
  
  const tryScroll = () => {
    attempts++;
    
    // Try multiple selectors for robustness
    const mark = containerRef.querySelector('#evidence-mark') || 
                 containerRef.querySelector('[data-evidence-mark="true"]');
    
    if (mark) {
      mark.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
      foundMark = true;
      return true;
    }
    
    return false;
  };
  
  // Try immediate scroll first
  if (tryScroll()) {
    return true;
  }
  
  // If not found, retry with interval
  const scrollInterval = setInterval(() => {
    if (tryScroll() || attempts >= maxAttempts) {
      clearInterval(scrollInterval);
    }
  }, delayMs);
  
  // Return synchronous result (false if needs retry)
  return foundMark;
}

/**
 * Check if text looks like it contains table data
 */
export function looksLikeTableData(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 3) return false;
  
  // Count lines with multiple tabs or long runs of spaces
  const tableLines = lines.filter(l => /\t{2,}|\s{4,}/.test(l));
  return tableLines.length > lines.length * 0.3;
}

/**
 * Fix inline tables (single line with multiple pipes) into multi-line format
 * Example: "| Header1 | Header2 | | --- | --- | | Row1 | Data1 |"
 * becomes proper multi-line GFM table
 */
function fixInlineTables(content: string): string {
  // Look for lines with many pipes (likely inline table)
  const lines = content.split('\n');
  const fixedLines: string[] = [];
  
  for (const line of lines) {
    const pipeCount = (line.match(/\|/g) || []).length;
    
    // If line has 6+ pipes and contains separator pattern, it's likely an inline table
    if (pipeCount >= 6 && line.includes('---')) {
      // Split by | and reconstruct as multi-line
      const parts = line.split('|').map(p => p.trim()).filter(p => p);
      
      // Find separator index (contains ---)
      const sepIndex = parts.findIndex(p => /^-+$/.test(p));
      
      if (sepIndex > 0) {
        // Cells per row
        const cellCount = sepIndex;
        
        // Build rows
        const rows: string[][] = [];
        for (let i = 0; i < parts.length; i += cellCount) {
          const row = parts.slice(i, i + cellCount);
          if (row.length === cellCount) {
            rows.push(row);
          }
        }
        
        // Convert to GFM format
        for (const row of rows) {
          fixedLines.push('| ' + row.join(' | ') + ' |');
        }
        continue;
      }
    }
    
    fixedLines.push(line);
  }
  
  return fixedLines.join('\n');
}

/**
 * Add paragraph breaks to "brick wall" text (long runs without breaks)
 * Conservative: only adds breaks when >500 chars without newlines
 */
function addParagraphBreaks(content: string): string {
  // Don't touch content that already has reasonable paragraph breaks
  const avgCharsPerParagraph = content.length / (content.split('\n\n').length || 1);
  if (avgCharsPerParagraph < 500) {
    return content; // Already well-structured
  }
  
  // Split into paragraphs
  const paragraphs = content.split('\n\n');
  const fixedParagraphs: string[] = [];
  
  for (const para of paragraphs) {
    // If paragraph is very long (>600 chars) and has no lists/headings, add breaks
    if (para.length > 600 && !/^[-•*#]|\n[-•*#]/.test(para)) {
      // Split on sentence boundaries (. ? !) followed by space and capital
      const sentences = para.split(/([.!?])\s+(?=[A-Z])/);
      
      let currentChunk = '';
      for (let i = 0; i < sentences.length; i++) {
        currentChunk += sentences[i];
        
        // If chunk is getting long and we hit a sentence boundary, break
        if (currentChunk.length > 400 && /[.!?]$/.test(currentChunk.trim())) {
          fixedParagraphs.push(currentChunk.trim());
          currentChunk = '';
        }
      }
      
      if (currentChunk.trim()) {
        fixedParagraphs.push(currentChunk.trim());
      }
    } else {
      fixedParagraphs.push(para);
    }
  }
  
  return fixedParagraphs.join('\n\n');
}

/**
 * Normalize markdown tables from inline "blob" format to proper GFM tables
 * Handles malformed tables like: | |Header1|Header2| | → | Header1 | Header2 |
 * Also fixes "brick wall" paragraphs by adding breathing room
 */
export function normalizeMarkdown(content: string): string {
  if (!content) return content;
  
  // Step 1: Fix inline tables (single-line pipe format)
  content = fixInlineTables(content);
  
  // Step 2: Fix "brick wall" text (long runs without paragraph breaks)
  content = addParagraphBreaks(content);
  
  // Step 3: Normalize multi-line tables
  // Check if content contains pipe characters and table patterns
  const hasPipes = content.includes('|');
  const hasTableSeparator = /\|\s*---/.test(content);
  const hasMultiplePipes = (content.match(/\|/g) || []).length > 3;
  
  if (!hasPipes || (!hasTableSeparator && !hasMultiplePipes)) {
    return content; // Not a table, return unchanged
  }
  
  const lines = content.split('\n');
  const normalizedLines: string[] = [];
  let inTable = false;
  let tableLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Detect table lines (start and end with |, or contain multiple |)
    const isTableLine = /^\|.*\|$/.test(trimmed) || (trimmed.match(/\|/g) || []).length >= 2;
    
    if (isTableLine) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(trimmed);
    } else {
      // End of table - process accumulated lines
      if (inTable && tableLines.length > 0) {
        normalizedLines.push(...normalizeTableBlock(tableLines));
        tableLines = [];
        inTable = false;
      }
      normalizedLines.push(line);
    }
  }
  
  // Flush any remaining table
  if (inTable && tableLines.length > 0) {
    normalizedLines.push(...normalizeTableBlock(tableLines));
  }
  
  return normalizedLines.join('\n');
}

/**
 * Normalize a block of table lines into proper GFM format
 * Returns original lines if normalization fails (safeguard against crashes)
 * 
 * ✅ STEP #11: Enhanced table normalization
 * - Handles leading/trailing pipes correctly
 * - Fixes empty cells and malformed separators
 * - Handles multi-line cell content (wrapped rows)
 * - Preserves alignment and prevents runtime errors
 */
function normalizeTableBlock(lines: string[]): string[] {
  if (lines.length === 0) return [];
  
  try {
    const normalized: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // ✅ FIX 1: Handle multiple consecutive pipes (empty cells)
      // Replace ||, | |, |  | etc. with single pipe
      line = line.replace(/\|\s*\|/g, '|');
      
      // ✅ FIX 2: Ensure line starts and ends with pipe
      if (!line.startsWith('|')) line = '| ' + line;
      if (!line.endsWith('|')) line = line + ' |';
      
      // Split by pipe and clean cells
      const rawCells = line.split('|');
      
      // ✅ FIX 3: Filter empty first/last cells from split, but keep internal empty cells
      const cells = rawCells
        .map(c => c.trim())
        .filter((c, idx, arr) => {
          // Remove only if it's the very first or very last element AND it's empty
          if (idx === 0 && c === '') return false;
          if (idx === arr.length - 1 && c === '') return false;
          return true;
        });
      
      // Skip if no valid cells after filtering
      if (cells.length === 0) continue;
      
      // ✅ FIX 4: Check if this is a separator line (all cells are dashes)
      const isSeparator = cells.every(cell => /^-+$/.test(cell) || cell === '');
      
      if (isSeparator) {
        // Ensure proper separator format: | --- | --- | --- |
        const separatorCells = cells.map(() => '---');
        normalized.push('| ' + separatorCells.join(' | ') + ' |');
      } else {
        // Regular row: | Cell1 | Cell2 | Cell3 |
        // ✅ FIX 5: Handle cells with empty content (preserve structure)
        const cleanedCells = cells.map(c => c || ' ');
        normalized.push('| ' + cleanedCells.join(' | ') + ' |');
      }
    }
    
    // ✅ FIX 6: Ensure we have a separator after the header (first line)
    if (normalized.length === 0) {
      return lines; // Couldn't normalize, return original
    }
    
    if (normalized.length === 1) {
      // Only one line - assume it's a header, add separator
      const headerCellCount = normalized[0].split('|').filter(c => c.trim()).length;
      const separator = '| ' + Array(headerCellCount).fill('---').join(' | ') + ' |';
      normalized.push(separator);
    } else if (normalized.length > 1) {
      // Check if second line is already a separator
      const secondLine = normalized[1];
      const isSeparator = /^\|\s*---/.test(secondLine);
      
      if (!isSeparator) {
        // Insert separator after header
        const headerCellCount = normalized[0].split('|').filter(c => c.trim()).length;
        const separator = '| ' + Array(headerCellCount).fill('---').join(' | ') + ' |';
        normalized.splice(1, 0, separator);
      }
    }
    
    return normalized;
  } catch (error) {
    // Safeguard: if normalization fails, return original lines
    console.warn('⚠️ Table normalization failed, returning original:', error);
    return lines;
  }
}
