from typing import List, Optional
from pydantic import BaseModel, Field

# --- LLM Output Schemas ---

class ExtractedFact(BaseModel):
    fact_text: str = Field(description="The atomic fact statement.")
    quote_span: str = Field(description="The exact substring from the text that supports this.")
    confidence: str = Field(description="HIGH, MEDIUM, or LOW based on explicitness.")
    section_context: str = Field(description="The section heading or context this fact belongs to.")
    tags: List[str] = Field(description="Tags: 'statistic', 'definition', 'risk', 'mechanism', 'recommendation'.")
    is_key_claim: bool = Field(description="True if this is a high-value fact.")

class ExtractionResult(BaseModel):
    # CHANGED: Now expects a List[str] for bullet points
    summary_brief: List[str] = Field(description="A list of exactly 3 executive summary bullet points.")
    facts: List[ExtractedFact]

# --- API Request/Response Schemas ---

class IngestRequest(BaseModel):
    url: str
    project_id: str
    workspace_id: str
    idempotency_key: Optional[str] = None

class JobResponse(BaseModel):
    job_id: str
    status: str
    idempotency_key: str
    message: str