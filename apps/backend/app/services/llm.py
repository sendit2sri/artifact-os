import os
import json
import time
import math
from typing import List, Any
from pydantic import BaseModel, Field, field_validator
from openai import OpenAI

# --- CONFIGURATION ---
MODEL_FAST = "gpt-4o-mini"
EMBEDDING_MODEL = "text-embedding-3-small"
MAX_RETRIES = 3

try:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
except Exception:
    client = None
    print("⚠️ OpenAI Client failed to initialize. Check API KEY.")

# --- SCHEMAS ---

class ExtractedFact(BaseModel):
    fact_text: str = Field(description="The atomic fact statement")
    quote_span: str = Field(default="", description="Verbatim quote")
    confidence: str = Field(default="MEDIUM", description="HIGH, MEDIUM, or LOW")
    section_context: str = Field(default="General", description="Header or section")
    tags: List[str] = Field(default_factory=list)
    is_key_claim: bool = Field(default=False)

    @field_validator('tags', mode='before')
    @classmethod
    def convert_null_to_list(cls, v):
        if v is None:
            return []
        return v

class ExtractionResult(BaseModel):
    facts: List[ExtractedFact]
    summary_brief: List[str]

class SynthesisSection(BaseModel):
    title: str = Field(description="Section header")
    content: str = Field(description="The synthesized narrative text for this section")
    fact_ids: List[str] = Field(description="List of exact Fact IDs used to generate this section")

class SynthesisResponse(BaseModel):
    sections: List[SynthesisSection]
    unsupported_requests: List[str] = Field(description="User questions that could not be answered by facts")

# --- MATH HELPERS ---

def get_embeddings(texts: List[str]) -> List[List[float]]:
    if not client or not texts:
        return []
    try:
        clean_texts = [t.replace("\n", " ") for t in texts]
        resp = client.embeddings.create(input=clean_texts, model=EMBEDDING_MODEL)
        return [d.embedding for d in resp.data]
    except Exception as e:
        print(f"Embedding Error: {e}")
        return []

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot_product = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot_product / (norm_a * norm_b)

def chunk_text(text: str, chunk_size: int = 12000, overlap: int = 500) -> List[str]:
    if len(text) <= chunk_size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += (chunk_size - overlap)
    return chunks

def verify_quote_integrity(content: str, quote: str) -> str:
    norm_content = " ".join(content.split())
    norm_quote = " ".join(quote.split())
    return "HIGH" if norm_quote in norm_content else "LOW"

# --- LLM WRAPPER ---

def call_llm(messages: list, response_format=None, model=MODEL_FAST) -> Any:
    if not client:
        return None
    for attempt in range(MAX_RETRIES):
        try:
            return client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.1,
                response_format=response_format
            )
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                print(f"❌ LLM Failed: {e}")
                return None
            time.sleep(1 * (2 ** attempt))

# --- CORE LOGIC ---

def cluster_facts_adaptive(facts: list[dict]) -> list[dict]:
    if not facts:
        return []
    if not client:
        return [{"label": "All Facts", "fact_ids": [f['id'] for f in facts], "facts": facts}]

    text_payloads = []
    for f in facts:
        txt = f.get('text') or f.get('fact_text') or ""
        title = f.get('title') or f.get('source_domain') or ""
        text_payloads.append(f"{title}: {txt}")

    print(f"Creating embeddings for {len(text_payloads)} facts...")
    vectors = get_embeddings(text_payloads)
    
    if len(vectors) != len(facts):
        return [{"label": "General", "fact_ids": [f['id'] for f in facts], "facts": facts}]

    SIMILARITY_THRESHOLD = 0.45 
    clusters = [] 

    for i, fact in enumerate(facts):
        fact_vec = vectors[i]
        best_idx = -1
        best_score = -1.0

        for c_idx, cluster in enumerate(clusters):
            score = cosine_similarity(fact_vec, cluster['centroid'])
            if score > best_score:
                best_score = score
                best_idx = c_idx

        if best_score > SIMILARITY_THRESHOLD:
            clusters[best_idx]['facts'].append(fact)
            n = len(clusters[best_idx]['facts'])
            prev_centroid = clusters[best_idx]['centroid']
            new_centroid = [((p * (n-1)) + n_val) / n for p, n_val in zip(prev_centroid, fact_vec)]
            clusters[best_idx]['centroid'] = new_centroid
        else:
            clusters.append({
                'centroid': fact_vec,
                'facts': [fact]
            })

    results = []
    for c in clusters:
        titles = [f.get('title', 'Unknown') for f in c['facts']]
        label = max(set(titles), key=titles.count) if titles else "General Topic"
        
        results.append({
            "label": label,
            "fact_ids": [f['id'] for f in c['facts']],
            "facts": c['facts']
        })
        
    return results

def analyze_selection(facts: list[dict]) -> list[dict]:
    return cluster_facts_adaptive(facts)

def synthesize_facts(facts: list[dict], mode: str = "paragraph") -> dict:
    if not client:
        return {"synthesis": "Error: OpenAI API Key missing.", "clusters": []}

    clusters = cluster_facts_adaptive(facts)
    
    context_block = ""
    # Look up map for quick access later
    fact_lookup = {f['id']: f for f in facts}

    for c in clusters:
        context_block += f"\n## Semantic Group: {c['label']}\n"
        for f in c['facts']:
            fid = f.get('id', 'unknown')
            text = f.get('text') or f.get('fact_text') or ""
            source = f.get('title', 'Unknown')
            context_block += f"[FACT id={fid}] {text} (Source: {source})\n"

    system_prompt = """You are a rigorous research assistant. 
    RULES:
    1. Use ONLY the provided facts. Do not use external knowledge.
    2. If facts are insufficient, state that in 'unsupported_requests'.
    3. You must link every section you write to the specific FACT IDs that support it.
    4. Maintain the tone of a professional researcher.
    5. Return the output as valid JSON matching the schema."""

    if mode == "outline":
        system_prompt += " Output a structured video script outline."
    elif mode == "brief":
        system_prompt += " Output a formal research brief."
    elif mode == "split":
        system_prompt += " Output as separate sections. Use markdown heading '## Section N: Title' for each section (one section per semantic group)."
    else:
        system_prompt += " Output a coherent synthesis paragraph."

    try:
        resp = call_llm(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Context:\n{context_block}\n\nTask: Synthesize this selection."}
            ],
            response_format={"type": "json_object"} 
        )
        
        if not resp:
            raise Exception("LLM returned None")
        
        data = json.loads(resp.choices[0].message.content)
        
        # --- ✅ NEW: CITATION INJECTION LOGIC ---
        final_markdown = ""
        sections = data.get("sections", [])
        
        used_facts_map = {} # {fact_id: citation_index}
        citation_counter = 1
        
        # 1. Build Sections with Markers
        for sec in sections:
            title = sec.get("title", "Section")
            content = sec.get("content", "")
            fids = sec.get("fact_ids", [])
            
            # Generate [1][2] markers
            markers = []
            for fid in fids:
                if fid not in used_facts_map:
                    used_facts_map[fid] = citation_counter
                    citation_counter += 1
                markers.append(f"[{used_facts_map[fid]}]")
            
            # Append markers to title or content end
            marker_str = " " + "".join(markers)
            
            final_markdown += f"### {title}\n{content}{marker_str}\n\n"
        
        # 2. Append Reference List
        if used_facts_map:
            final_markdown += "---\n### Sources\n"
            # Sort by citation index
            sorted_citations = sorted(used_facts_map.items(), key=lambda x: x[1])
            
            for fid, idx in sorted_citations:
                fact_data = fact_lookup.get(fid)
                if fact_data:
                    source_domain = fact_data.get('title') or fact_data.get('source_domain') or "Unknown"
                    # We use a markdown footnote style
                    final_markdown += f"**[{idx}]** {source_domain}: _{fact_data.get('text', '')[:100]}..._\n"

        # 3. Handle Unsupported
        unsupported = data.get("unsupported_requests", [])
        if unsupported:
            final_markdown += "\n> **Missing Data:**\n"
            for u in unsupported:
                final_markdown += f"> - {u}\n"

        return {
            "synthesis": final_markdown.strip(),
            "clusters": [{"label": c['label'], "count": len(c['facts'])} for c in clusters]
        }

    except Exception as e:
        print(f"Synthesis Error: {e}")
        return {"synthesis": f"Generation failed: {str(e)}", "clusters": []}

def extract_facts_from_markdown(content: str) -> ExtractionResult:
    # [Extraction logic remains unchanged from previous step]
    # Copy the extract_facts_from_markdown function from the previous turn if needed
    # Or I can provide the full file if you prefer (it is large).
    # Since I overwrote the file above, I will include the extraction logic here for completeness:
    if not client:
        return ExtractionResult(facts=[], summary_brief=["Error: Client not init"])

    chunks = chunk_text(content, chunk_size=12000)
    all_facts = []
    combined_summary = []

    system_prompt = """You are a fact extraction engine.
    Extract atomic, high-value facts. 
    If a fact has a direct quote, include it in 'quote_span' EXACTLY as it appears.
    Classify confidence: HIGH (explicit), MEDIUM (implied), LOW (ambiguous).
    
    Return the output as valid JSON matching this structure:
    {
        "facts": [
            {
                "fact_text": "The fact content",
                "quote_span": "Exact substring from text",
                "confidence": "HIGH",
                "section_context": "Introduction",
                "tags": ["tag1", "tag2"],
                "is_key_claim": true
            }
        ],
        "summary_brief": ["Summary point 1"]
    }"""

    for i, chunk in enumerate(chunks):
        try:
            print(f"📡 Processing chunk {i+1}/{len(chunks)}...")
            resp = call_llm(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Extract from part {i+1}:\n\n{chunk}"}
                ],
                response_format={"type": "json_object"}
            )
            
            if resp:
                raw_content = resp.choices[0].message.content
                try:
                    data = json.loads(raw_content)
                except json.JSONDecodeError:
                    print(f"❌ Chunk {i} returned invalid JSON")
                    continue

                raw_facts = data.get("facts", [])
                
                for f_data in raw_facts:
                    try:
                        if "quote_span" in f_data and f_data["quote_span"]:
                            integrity = verify_quote_integrity(chunk, f_data["quote_span"])
                            if integrity == "LOW":
                                f_data["confidence"] = "LOW"
                                f_data["tags"] = (f_data.get("tags") or []) + ["fuzzy-quote"]
                        
                        valid_fact = ExtractedFact(**f_data)
                        all_facts.append(valid_fact)
                    except Exception as val_e:
                        print(f"⚠️ Skipping invalid fact in chunk {i}: {val_e}")

                combined_summary.extend(data.get("summary_brief", []))

        except Exception as e:
            print(f"❌ Chunk {i} failed completely: {e}")
            continue

    unique_facts = {}
    for f in all_facts:
        key = f.fact_text.lower().strip()
        if key not in unique_facts:
            unique_facts[key] = f
    
    print(f"✅ Extracted {len(unique_facts)} unique facts.")
    return ExtractionResult(facts=list(unique_facts.values()), summary_brief=combined_summary[:5])