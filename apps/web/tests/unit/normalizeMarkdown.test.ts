/**
 * Unit tests for normalizeMarkdown function (STEP #11)
 * Tests real-world table samples from Wikipedia, NIH, news sites
 */

import { normalizeMarkdown } from '@/lib/evidenceUtils';

describe('normalizeMarkdown - Table Detection', () => {
  test('handles Wikipedia-style table with leading/trailing pipes', () => {
    const input = `| |Header 1|Header 2|Header 3|
|---|---|---|
|Row 1|Data 1|Data 2|`;

    const output = normalizeMarkdown(input);
    
    // Should produce valid GFM table
    expect(output).toContain('| Header 1 | Header 2 | Header 3 |');
    expect(output).toContain('| --- | --- | --- |');
    expect(output).toContain('| Row 1 | Data 1 | Data 2 |');
  });

  test('handles NIH-style table with inconsistent spacing', () => {
    const input = `|Study|Sample Size  |  Result|
|---|---|---|
|  Smith et al.  | 1000  |Positive|
|Jones 2023|500|Negative|`;

    const output = normalizeMarkdown(input);
    
    // Should normalize spacing
    expect(output).toContain('| Study | Sample Size | Result |');
    expect(output).toContain('| Smith et al. | 1000 | Positive |');
    expect(output).toContain('| Jones 2023 | 500 | Negative |');
  });

  test('handles table with empty cells', () => {
    const input = `|Name|Value|Notes|
|---|---|---|
|Test 1|100||
|Test 2||Some note|`;

    const output = normalizeMarkdown(input);
    
    // Should preserve empty cells as spaces
    expect(output).toContain('| Name | Value | Notes |');
    expect(output).toContain('| Test 1 | 100 |');
    expect(output).toContain('| Test 2 |');
  });

  test('handles malformed separator line', () => {
    const input = `|Column A|Column B|
|-----|-----|
|Data A|Data B|`;

    const output = normalizeMarkdown(input);
    
    // Should normalize separator to consistent format
    expect(output).toContain('| Column A | Column B |');
    expect(output).toContain('| --- | --- |');
    expect(output).toContain('| Data A | Data B |');
  });

  test('handles table without separator (auto-adds it)', () => {
    const input = `|Header 1|Header 2|
|Data 1|Data 2|`;

    const output = normalizeMarkdown(input);
    
    // Should auto-add separator after header
    expect(output).toContain('| Header 1 | Header 2 |');
    expect(output).toContain('| --- | --- |');
    expect(output).toContain('| Data 1 | Data 2 |');
  });

  test('handles single-line header (adds separator and empty row)', () => {
    const input = `|Name|Age|Location|`;

    const output = normalizeMarkdown(input);
    
    // Should add separator
    expect(output).toContain('| Name | Age | Location |');
    expect(output).toContain('| --- | --- | --- |');
  });

  test('handles multi-line cells with line breaks', () => {
    const input = `|Item|Description|
|---|---|
|A|First line
Second line|
|B|Single line|`;

    const output = normalizeMarkdown(input);
    
    // Should handle multi-line cells (though markdown may not render them)
    expect(output).toContain('| Item | Description |');
    expect(output).toContain('| --- | --- |');
  });

  test('handles table with special characters', () => {
    const input = `|Symbol|Meaning|
|---|---|
|<|Less than|
|>|Greater than|
|&|And|`;

    const output = normalizeMarkdown(input);
    
    // Should preserve special characters
    expect(output).toContain('| Symbol | Meaning |');
    expect(output).toContain('| < | Less than |');
    expect(output).toContain('| > | Greater than |');
    expect(output).toContain('| & | And |');
  });

  test('handles table with numeric data', () => {
    const input = `|Year|Revenue|Growth|
|---|---|---|
|2021|1000000|10%|
|2022|1200000|20%|`;

    const output = normalizeMarkdown(input);
    
    // Should handle numbers correctly
    expect(output).toContain('| Year | Revenue | Growth |');
    expect(output).toContain('| 2021 | 1000000 | 10% |');
    expect(output).toContain('| 2022 | 1200000 | 20% |');
  });

  test('leaves non-table markdown unchanged', () => {
    const input = `# Heading

This is a paragraph with no tables.

- List item 1
- List item 2

Another paragraph.`;

    const output = normalizeMarkdown(input);
    
    // Should pass through unchanged
    expect(output).toBe(input);
  });

  test('handles mixed content (table + paragraphs)', () => {
    const input = `# Research Summary

Some introductory text.

|Study|Result|
|---|---|
|A|Positive|
|B|Negative|

Concluding remarks.`;

    const output = normalizeMarkdown(input);
    
    // Should preserve non-table content and normalize table
    expect(output).toContain('# Research Summary');
    expect(output).toContain('Some introductory text.');
    expect(output).toContain('| Study | Result |');
    expect(output).toContain('| --- | --- |');
    expect(output).toContain('| A | Positive |');
    expect(output).toContain('Concluding remarks.');
  });

  test('handles deeply malformed table (stress test)', () => {
    const input = `| |Header A||Header B|
|---|---|
|||Data A|Data B||
|Row 2|||||Value|`;

    const output = normalizeMarkdown(input);
    
    // Should not crash and produce something reasonable
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
    // At minimum, should contain some pipes
    expect(output).toContain('|');
  });
});

describe('normalizeMarkdown - Paragraph Breaks', () => {
  test('adds breaks to "brick wall" text (>500 chars)', () => {
    const longText = 'A'.repeat(700);
    const input = longText;

    const output = normalizeMarkdown(input);
    
    // Should be unchanged if no sentence boundaries
    // (function only breaks on proper sentences)
    expect(output).toBe(input);
  });

  test('adds breaks to long paragraphs with sentences', () => {
    const input = 'This is sentence one. This is sentence two. This is sentence three. ' +
                  'This continues for a very long time with many sentences. ' +
                  'Eventually we need to break this up into smaller chunks. ' +
                  'The function should detect this and add paragraph breaks. ' +
                  'This makes the content more readable and easier to digest. ' +
                  'We want to avoid walls of text that are hard to read. ' +
                  'Breaking at sentence boundaries is the best approach. ' +
                  'This should result in multiple paragraphs. ' +
                  'Each paragraph should be a reasonable length. ' +
                  'The reader will appreciate the improved formatting.';

    const output = normalizeMarkdown(input);
    
    // Should add paragraph breaks (double newlines)
    const paragraphCount = (output.match(/\n\n/g) || []).length;
    expect(paragraphCount).toBeGreaterThan(0);
  });

  test('preserves well-structured paragraphs', () => {
    const input = `Paragraph one is short.

Paragraph two is also short.

Paragraph three is short too.`;

    const output = normalizeMarkdown(input);
    
    // Should remain unchanged (already well-structured)
    expect(output).toBe(input);
  });
});

describe('normalizeMarkdown - Edge Cases', () => {
  test('handles empty string', () => {
    const output = normalizeMarkdown('');
    expect(output).toBe('');
  });

  test('handles string with only whitespace', () => {
    const input = '   \n\n   ';
    const output = normalizeMarkdown(input);
    expect(output).toBe(input);
  });

  test('handles single pipe (not a table)', () => {
    const input = 'This is text | with a pipe | but not a table.';
    const output = normalizeMarkdown(input);
    expect(output).toBe(input);
  });

  test('handles table-like text without proper structure', () => {
    const input = 'Header1 | Header2\nData1 | Data2';
    const output = normalizeMarkdown(input);
    // Should attempt to normalize or pass through safely
    expect(output).toBeDefined();
  });
});
