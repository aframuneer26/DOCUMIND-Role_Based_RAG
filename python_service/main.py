import os
import uuid
import json
import io
import hashlib
import re
import time
import logging
from typing import List, Optional, Dict, Any
from pathlib import Path

import numpy as np
import pdfplumber
from google import genai
from google.genai import types
import psycopg2
from psycopg2.extras import RealDictCursor

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", filename="server.log", filemode="a")
logger = logging.getLogger(__name__)

# ─── Config ──────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
INDEX_DIR = Path(os.getenv("FAISS_INDEX_DIR", "./faiss_indexes"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 800))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 100))
TOP_K = int(os.getenv("TOP_K_RESULTS", 5))
PORT = int(os.getenv("PORT", 8001))
# Gemini embedding-001 vectors are typically 3072 dims.
# Kept configurable to support future model changes.
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", 3072))

INDEX_DIR.mkdir(parents=True, exist_ok=True)

# ─── Gemini client setup ─────────────────────────────────────────────────────
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    logger.info("✅ Gemini API configured")
else:
    gemini_client = None
    logger.warning("⚠️  GEMINI_API_KEY not set — embeddings and generation will fail")

# ─── DB Connection ───────────────────────────────────────────────────────────
def get_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        dbname=os.getenv("DB_NAME", "RagAdv"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", ""),
        cursor_factory=RealDictCursor
    )

# ─── In-memory vector store ──────────────────────────────────────────────────
# Maps document_id -> {"vectors": np.ndarray (N x DIM), "faiss_ids": [0,1,2,...]}
vector_store: Dict[str, Dict] = {}

def local_embed_texts(texts: List[str]) -> List[np.ndarray]:
    vectors: List[np.ndarray] = []
    for text in texts:
        vector = np.zeros(EMBEDDING_DIM, dtype=np.float32)
        for token in re.findall(r"[A-Za-z0-9']+", text.lower()):
            digest = hashlib.sha256(token.encode('utf-8')).digest()
            index = int.from_bytes(digest[:4], 'little') % EMBEDDING_DIM
            vector[index] += 1.0 + (len(token) / 10.0)

        norm = np.linalg.norm(vector)
        if norm > 0:
            vector /= norm
        vectors.append(vector)

    return vectors

def save_index(doc_id: str, vectors: np.ndarray):
    np.save(str(INDEX_DIR / f"{doc_id}.npy"), vectors)
    logger.info(f"Saved {len(vectors)} vectors for doc {doc_id}")

def load_index(doc_id: str) -> Optional[np.ndarray]:
    path = INDEX_DIR / f"{doc_id}.npy"
    if not path.exists():
        return None
    vectors = np.load(str(path))
    vector_store[doc_id] = {"vectors": vectors}
    return vectors

def cosine_search(query_vec: np.ndarray, doc_vectors: np.ndarray, top_k: int):
    """Return top_k (index, score) pairs using cosine similarity."""
    if len(doc_vectors) == 0:
        return []
    # Handle mixed-dimension indexes gracefully (e.g., older 768-d vectors and newer 3072-d vectors).
    # We compare on the common prefix to avoid runtime crashes.
    if doc_vectors.ndim != 2:
        return []

    q_dim = int(query_vec.shape[0])
    d_dim = int(doc_vectors.shape[1])
    common_dim = min(q_dim, d_dim)
    if common_dim <= 0:
        return []

    if q_dim != d_dim:
        logger.warning(
            f"Embedding dimension mismatch (query={q_dim}, doc={d_dim}); using first {common_dim} dims"
        )

    q = query_vec[:common_dim]
    docs = doc_vectors[:, :common_dim]

    q = q / (np.linalg.norm(q) + 1e-10)
    norms = np.linalg.norm(docs, axis=1, keepdims=True) + 1e-10
    normed = docs / norms
    scores = normed @ q  # cosine similarity, higher = better
    top_indices = np.argsort(scores)[::-1][:top_k]
    return [(int(i), float(scores[i])) for i in top_indices]

# ─── Text Processing ──────────────────────────────────────────────────────────
def extract_text_from_pdf(file_bytes: bytes) -> str:
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text and text.strip():
                text_parts.append(f"[Page {page_num + 1}]\n{text.strip()}")
    full_text = "\n\n".join(text_parts)
    logger.info(f"Extracted {len(full_text)} chars from {len(pdf.pages) if hasattr(pdf, 'pages') else '?'} pages")
    return full_text

def chunk_text(text: str) -> List[str]:
    text = re.sub(r'\n{3,}', '\n\n', text.strip())
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        if end < len(text):
            # Try to break at sentence boundary
            for boundary in ['. ', '.\n', '\n\n', '\n']:
                pos = text.rfind(boundary, start + CHUNK_SIZE // 2, end)
                if pos > start:
                    end = pos + len(boundary)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - CHUNK_OVERLAP
    return chunks

# ─── Embeddings ───────────────────────────────────────────────────────────────
def embed_texts(texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> List[np.ndarray]:
    if gemini_client is not None:
        try:
            result = gemini_client.models.embed_content(
                model="models/gemini-embedding-001",
                contents=texts,
                config=types.EmbedContentConfig(task_type=task_type)
            )
            embeddings = [np.array(e.values, dtype=np.float32) for e in result.embeddings]
            if embeddings:
                return embeddings
        except Exception as e:
            logger.warning(f"Gemini embedding failed, using local fallback: {e}")

    return local_embed_texts(texts)

def generate_answer(prompt: str, context_chunks: List[str], question: str) -> str:
    if gemini_client is not None:
        try:
            response = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            answer = response.text.strip() if response.text else "Unable to generate an answer."
            return answer
        except Exception as e:
            logger.warning(f"Gemini generation failed, using context fallback: {e}")

    if context_chunks:
        excerpt = " ".join(context_chunks[:2]).strip()
        excerpt = re.sub(r"\s+", " ", excerpt)
        if len(excerpt) > 1200:
            excerpt = excerpt[:1200].rsplit(" ", 1)[0] + "..."
        return (
            "Gemini is unavailable right now, so here is the most relevant context I found: "
            f"{excerpt}"
        )

    return "I don't have enough information in the available documents to answer this question."

# ─── FastAPI App ──────────────────────────────────────────────────────────────
app = FastAPI(title="DocuMind RAG Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Pydantic Models ──────────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    question: str
    document_ids: List[str]
    user_id: str
    user_role: str

class QueryResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    tokens_used: Optional[int] = None

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "DocuMind RAG Service",
        "gemini_configured": bool(GEMINI_API_KEY),
        "indexes_loaded": len(vector_store)
    }

@app.post("/process-document")
def process_document(
    file: UploadFile = File(...),
    document_id: str = Form(...)
):
    """Extract PDF text → chunk → embed → store vectors + return chunk data."""
    logger.info(f"📄 Processing: {file.filename} (doc_id={document_id})")

    try:
        file_bytes = file.file.read()
        if len(file_bytes) == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        # 1. Extract text
        raw_text = extract_text_from_pdf(file_bytes)
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="No text could be extracted from this PDF")
        logger.info(f"Extracted {len(raw_text)} characters")

        # 2. Chunk text
        chunks = chunk_text(raw_text)
        logger.info(f"Created {len(chunks)} chunks")

        # 3. Embed chunks in batches of 100 to avoid Gemini RPM rate limits
        processed_chunks = []
        vectors = []
        
        # Batching function
        batch_size = 80
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            batch_embeddings = embed_texts(batch, "RETRIEVAL_DOCUMENT")
            for j, vec in enumerate(batch_embeddings):
                vectors.append(vec)
                chunk_content = batch[j]
                processed_chunks.append({
                    "content": chunk_content,
                    "faiss_id": len(vectors) - 1,
                    "token_count": len(chunk_content.split())
                })
            logger.info(f"  Embedded batch {i//batch_size + 1}: {len(batch)} chunks")

        if not processed_chunks:
            raise HTTPException(status_code=500, detail="Failed to embed any chunks")

        # 4. Save numpy vector matrix to disk
        vector_matrix = np.stack(vectors, axis=0)
        save_index(document_id, vector_matrix)
        vector_store[document_id] = {"vectors": vector_matrix}

        logger.info(f"✅ Processed {len(processed_chunks)} chunks for {document_id}")

        return {
            "document_id": document_id,
            "total_chunks": len(processed_chunks),
            "faiss_index_id": document_id,
            "chunks": processed_chunks
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", response_model=QueryResponse)
async def query_documents(req: QueryRequest):
    """Search vectors for the question and generate an answer with Gemini."""
    logger.info(f"🔍 Query: '{req.question[:80]}...' across {len(req.document_ids)} doc(s)")

    try:
        # 1. Embed the question
        query_vec = embed_texts([req.question], "RETRIEVAL_QUERY")[0]

        # 2. Search across all accessible document indexes
        all_hits = []
        for doc_id in req.document_ids:
            if doc_id not in vector_store:
                vecs = load_index(doc_id)
                if vecs is None:
                    logger.warning(f"No index found for doc {doc_id}")
                    continue

            vecs = vector_store[doc_id]["vectors"]
            k = min(TOP_K, len(vecs))
            hits = cosine_search(query_vec, vecs, k)
            for idx, score in hits:
                all_hits.append({"document_id": doc_id, "chunk_idx": idx, "score": score})

        if not all_hits:
            return QueryResponse(
                answer="I couldn't find any relevant information in the accessible documents.",
                sources=[]
            )

        # Sort by score descending (cosine: higher = more relevant)
        all_hits.sort(key=lambda x: x["score"], reverse=True)
        top_hits = all_hits[:TOP_K]

        # 3. Fetch chunk content from PostgreSQL
        db = get_db()
        context_chunks = []
        sources = []
        try:
            cur = db.cursor()
            for hit in top_hits:
                cur.execute(
                    """SELECT dc.content, dc.chunk_index, d.title
                       FROM document_chunks dc
                       JOIN documents d ON dc.document_id = d.id
                       WHERE dc.document_id = %s AND dc.faiss_vector_id = %s""",
                    (hit["document_id"], hit["chunk_idx"])
                )
                row = cur.fetchone()
                if row:
                    context_chunks.append(row["content"])
                    sources.append({
                        "document_title": row["title"],
                        "chunk_index": row["chunk_index"],
                        "relevance_score": round(float(hit["score"]), 4)
                    })
        finally:
            db.close()

        if not context_chunks:
            return QueryResponse(
                answer="Found relevant indexes but couldn't retrieve chunk content from the database.",
                sources=[]
            )

        # 4. Build prompt and generate with Gemini
        context = "\n\n---\n\n".join(context_chunks)
        prompt = f"""You are an intelligent document assistant. Answer the user's question based ONLY on the provided context.

If the answer cannot be found in the context, say: "I don't have enough information in the available documents to answer this question."

Context:
{context}

Question: {req.question}

Answer:"""

        answer = generate_answer(prompt, context_chunks, req.question)

        logger.info(f"✅ Query answered — {len(sources)} sources used")
        return QueryResponse(answer=answer, sources=sources)

    except Exception as e:
        logger.error(f"Query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/document/{document_id}")
async def delete_document(document_id: str):
    """Remove vector index for a document."""
    index_path = INDEX_DIR / f"{document_id}.npy"
    if document_id in vector_store:
        del vector_store[document_id]
    if index_path.exists():
        index_path.unlink()
        return {"message": f"Index for {document_id} deleted"}
    return {"message": f"No index found for {document_id}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, reload=False)
