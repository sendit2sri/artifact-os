"""
Unit tests for content_formatter.py

Tests reader-grade formatting improvements:
- Inline pipe tables → multi-line markdown
- Tab-separated tables → markdown
- Empty cells handling
- Long paragraph splitting
- Heading detection
- Mixed content end-to-end
"""

import pytest
from app.utils.content_formatter import format_for_reader


class TestInlinePipeTables:
    """Test conversion of inline pipe tables to proper markdown format."""
    
    def test_inline_pipe_table_basic(self):
        """Test basic inline || table conversion."""
        input_text = "Age ||Male ||Female\n0-6 months ||5 µg ||5 µg"
        result = format_for_reader(input_text)
        
        # Should have proper markdown table format
        assert "| Age | Male | Female |" in result
        assert "| --- | --- | --- |" in result
        assert "| 0-6 months | 5 µg | 5 µg |" in result
    
    def test_inline_pipe_table_empty_cells(self):
        """Test handling of empty cells in inline tables."""
        input_text = "Name ||Age ||City\nAlice || ||Boston\nBob ||30 ||"
        result = format_for_reader(input_text)
        
        # Empty cells should be filled with em dash
        assert "| Name | Age | City |" in result
        assert "| Alice | — | Boston |" in result
        assert "| Bob | 30 | — |" in result
    
    def test_inline_pipe_table_uneven_columns(self):
        """Test table with uneven column counts (pads with empty)."""
        input_text = "A ||B ||C\nX ||Y"
        result = format_for_reader(input_text)
        
        # Should pad short rows
        assert "| A | B | C |" in result
        assert "| X | Y | — |" in result


class TestTabSeparatedTables:
    """Test conversion of tab-separated content to markdown tables."""
    
    def test_tab_separated_basic(self):
        """Test basic tab-separated table."""
        input_text = "Header1\tHeader2\tHeader3\nData1\tData2\tData3"
        result = format_for_reader(input_text)
        
        # Should convert to markdown table
        assert "| Header1 | Header2 | Header3 |" in result
        assert "| --- | --- | --- |" in result
        assert "| Data1 | Data2 | Data3 |" in result
    
    def test_tab_separated_with_spaces(self):
        """Test tab-separated with multiple tabs treated as one delimiter."""
        input_text = "Name\tAge\tCity\nAlice\t25\tNYC"
        result = format_for_reader(input_text)
        
        # Should handle tabs
        assert "| Name | Age | City |" in result
        assert "| Alice | 25 | NYC |" in result


class TestEmptyCellHandling:
    """Test proper handling of empty/missing cells in tables."""
    
    def test_completely_empty_cell(self):
        """Test cell with no content."""
        input_text = "A ||B ||C\nX || ||Z"
        result = format_for_reader(input_text)
        
        # Empty cell should show em dash
        assert "| X | — | Z |" in result
    
    def test_whitespace_only_cell(self):
        """Test cell with only whitespace."""
        input_text = "A ||B ||C\nX ||   ||Z"
        result = format_for_reader(input_text)
        
        # Whitespace-only should be treated as empty
        assert "| X | — | Z |" in result
    
    def test_empty_header_cell(self):
        """Test empty cell in header row."""
        input_text = "Name || ||Age\nAlice ||30 ||25"
        result = format_for_reader(input_text)
        
        # Empty header should get placeholder
        assert "| Name | Column | Age |" in result


class TestLongParagraphSplitting:
    """Test splitting of 'brick wall' paragraphs."""
    
    def test_split_very_long_paragraph(self):
        """Test splitting paragraph >400 chars at sentence boundaries."""
        # Create a long paragraph (500+ chars)
        input_text = (
            "This is the first sentence that establishes context for our discussion. "
            "The second sentence provides additional detail about the topic at hand. "
            "The third sentence continues to build on the previous points made earlier. "
            "The fourth sentence introduces a new perspective on the subject matter. "
            "The fifth sentence wraps up this particular train of thought nicely. "
            "The sixth sentence starts a new idea that relates to the previous content. "
            "The seventh sentence provides supporting evidence for the claims made."
        )
        
        result = format_for_reader(input_text)
        
        # Should have multiple paragraphs separated by blank lines
        assert result.count('\n\n') >= 1, "Should have at least one paragraph break"
        
        # Each paragraph should be shorter than original
        paragraphs = [p.strip() for p in result.split('\n\n') if p.strip()]
        assert all(len(p) < len(input_text) for p in paragraphs), "Paragraphs should be shorter"
    
    def test_preserve_short_paragraphs(self):
        """Test that short paragraphs (<400 chars) are not split."""
        input_text = "This is a short paragraph. It has two sentences."
        result = format_for_reader(input_text)
        
        # Should not add extra breaks
        assert result.strip() == input_text.strip()
    
    def test_split_at_sentence_boundaries_only(self):
        """Test splitting only at proper sentence boundaries (. ! ?)."""
        input_text = (
            "First sentence here. Second sentence with Dr. Smith mentioned. "
            "Third sentence about U.S. policy! Fourth sentence asks a question? "
            "Fifth sentence continues. Sixth sentence provides more detail here. "
            "Seventh sentence with numbers like 3.14 in it. Eighth sentence ends paragraph."
        )
        
        result = format_for_reader(input_text)
        
        # Should not split at "Dr." or "U.S." or "3.14" (false sentence boundaries)
        assert "Dr." in result and "Dr.\n" not in result
        assert "U.S." in result


class TestHeadingDetection:
    """Test automatic heading detection and promotion."""
    
    def test_all_caps_heading(self):
        """Test ALL CAPS titles converted to headings."""
        input_text = "BIOTIN OVERVIEW\nThis is the intro paragraph."
        result = format_for_reader(input_text)
        
        # Should be converted to markdown heading (2+ words required)
        assert "## Biotin Overview" in result
    
    def test_title_case_with_colon(self):
        """Test Title Case: format converted to headings."""
        input_text = "Sources of Biotin:\nDetails about biotin sources here."
        result = format_for_reader(input_text)
        
        # Should be heading without colon
        assert "## Sources of Biotin" in result
    
    def test_common_section_keywords(self):
        """Test common section names promoted to headings."""
        input_text = "Methods\nWe used various methods here."
        result = format_for_reader(input_text)
        
        # Should be promoted
        assert "## Methods" in result
    
    def test_table_heading_detection(self):
        """Test Table N: format becomes heading."""
        input_text = "Table 1: Daily Recommended Intake\nAge ||Amount\n0-6 ||5 µg"
        result = format_for_reader(input_text)
        
        # Table title should be heading
        assert "### Table 1: Daily Recommended Intake" in result
    
    def test_preserve_non_headings(self):
        """Test that normal sentences are not converted to headings."""
        input_text = "This is a regular sentence: with a colon in it."
        result = format_for_reader(input_text)
        
        # Should NOT be a heading (too long, not a section keyword)
        assert "##" not in result


class TestMixedContentEndToEnd:
    """Test realistic mixed content with headings, tables, and paragraphs."""
    
    def test_article_with_all_elements(self):
        """Test end-to-end with headings, tables, and long paragraphs."""
        input_text = """BIOTIN OVERVIEW

Biotin is a water-soluble B vitamin that plays a crucial role in energy metabolism. It acts as a coenzyme for carboxylase enzymes involved in fatty acid synthesis. Most people can obtain adequate biotin from their diet without supplementation. Research has shown that biotin deficiency is rare in developed countries. The body can also produce some biotin through gut bacteria. However, certain populations may be at higher risk for deficiency including pregnant women and individuals with genetic disorders affecting biotin metabolism.

RECOMMENDED INTAKES

Age ||Male ||Female
0-6 months ||5 µg ||5 µg
7-12 months ||6 µg ||6 µg

Sources of Biotin:
Common food sources include eggs, nuts, and whole grains."""
        
        result = format_for_reader(input_text)
        
        # Check headings were detected
        assert "## Biotin Overview" in result
        assert "## Recommended Intakes" in result
        assert "## Sources of Biotin" in result
        
        # Check table was formatted
        assert "| Age | Male | Female |" in result
        assert "| --- | --- | --- |" in result
        assert "| 0-6 months | 5 µg | 5 µg |" in result
        
        # Check long paragraph was split
        biotin_section = result[result.find("Biotin is"):result.find("RECOMMENDED")]
        assert biotin_section.count('\n\n') >= 1, "Long paragraph should be split"
    
    def test_preserve_existing_structure(self):
        """Test that well-formatted content is not over-processed."""
        input_text = """## Already A Heading

Short paragraph one.

Short paragraph two.

| Name | Value |
| --- | --- |
| Test | 123 |"""
        
        result = format_for_reader(input_text)
        
        # Should preserve existing headings
        assert "## Already A Heading" in result
        
        # Should preserve existing table
        assert "| Name | Value |" in result
        assert "| Test | 123 |" in result


class TestErrorHandling:
    """Test that formatter doesn't crash on edge cases."""
    
    def test_empty_string(self):
        """Test handling of empty input."""
        result = format_for_reader("")
        assert result == ""
    
    def test_none_input(self):
        """Test handling of None input."""
        result = format_for_reader(None)
        assert result == ""
    
    def test_malformed_table(self):
        """Test that malformed tables don't crash formatter."""
        input_text = "A ||B\n||C\nD ||"
        
        # Should not raise exception
        result = format_for_reader(input_text)
        assert result is not None
    
    def test_unicode_content(self):
        """Test handling of unicode characters."""
        input_text = "Émile Müller: A Comprehensive Study\nThe café serves naïve patrons daily."
        
        result = format_for_reader(input_text)
        
        # Should preserve unicode
        assert "Émile" in result
        assert "café" in result
        assert "naïve" in result


# Run tests with: pytest tests/test_content_formatter.py -v
