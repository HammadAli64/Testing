from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from .read_extractors import extract_docx_text, extract_text_from_path, list_supported_files
from .store import clear_rag, rag_all_chunks, rag_stats, upsert_rag_chunk


def _ensure_backend_env_loaded() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    dotenv_path = backend_root / ".env"
    load_dotenv(dotenv_path=dotenv_path, override=False)


def chunk_text(text: str, *, max_chars: int = 1200, overlap: int = 150) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []

    # Normalize whitespace but keep paragraph-ish structure.
    text = re.sub(r"\r\n?", "\n", text)
    paras = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]

    chunks: list[str] = []
    cur = ""
    for p in paras:
        if not cur:
            cur = p
            continue
        if len(cur) + 2 + len(p) <= max_chars:
            cur = f"{cur}\n\n{p}"
        else:
            chunks.append(cur)
            cur = p
    if cur:
        chunks.append(cur)

    # If any chunk is still huge, hard-split.
    final: list[str] = []
    for ch in chunks:
        if len(ch) <= max_chars:
            final.append(ch)
            continue
        step = max(200, max_chars - overlap)
        for i in range(0, len(ch), step):
            final.append(ch[i : i + max_chars].strip())

    # Drop empties + de-dupe exact matches.
    out: list[str] = []
    seen: set[str] = set()
    for ch in final:
        s = ch.strip()
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _embed(client: OpenAI, texts: list[str], *, model: str) -> list[list[float]]:
    resp = client.embeddings.create(model=model, input=texts)
    return [d.embedding for d in resp.data]


def index_user_chunks(
    *,
    user_id: str,
    source: str,
    content: str,
    embedding_model: str | None = None,
) -> dict:
    """
    Chunk + embed + store without clearing existing rows (multi-source index).
    """
    _ensure_backend_env_loaded()
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")

    client = OpenAI(api_key=api_key)
    model = (embedding_model or os.environ.get("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small").strip()

    chunks = chunk_text(content)
    if not chunks:
        raise ValueError("File content is empty")

    batch_size = 32
    total = 0
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]
        embs = _embed(client, batch, model=model)
        for j, (txt, emb) in enumerate(zip(batch, embs)):
            chunk_id = f"{i+j:05d}"
            upsert_rag_chunk(
                user_id=user_id,
                source=source,
                chunk_id=chunk_id,
                content=txt,
                embedding_json=json.dumps(emb),
            )
            total += 1

    return {"ok": True, "source": source, "chunksIndexed": total, "embeddingModel": model}


def index_user_file(
    *,
    user_id: str,
    source: str,
    content: str,
    replace: bool = True,
    embedding_model: str | None = None,
) -> dict:
    """
    Chunks and embeds content, then stores in SQLite as a simple vector DB.
    """
    if replace:
        clear_rag(user_id)
    return index_user_chunks(
        user_id=user_id,
        source=source,
        content=content,
        embedding_model=embedding_model,
    )


def read_folder_path() -> Path:
    return Path(__file__).resolve().parents[1] / "read"


def ensure_rag_chunks_if_empty(user_id: str) -> None:
    """
    If the user has no RAG rows yet, index backend/read/ when possible, then fall back
    to legacy backend/ModelTrainingData.docx. Mirrors coach.views auto-ingest so the
    planner never runs with an empty corpus when files exist.
    """
    if int(rag_stats(user_id).get("chunks") or 0) > 0:
        return

    backend_root = Path(__file__).resolve().parents[1]
    read_dir = read_folder_path()
    if read_dir.is_dir():
        try:
            out = ingest_read_folder(user_id)
            if out.get("ok") and int(out.get("totalChunks") or 0) > 0:
                print(
                    f"[coach] read/ folder ingested user={user_id} "
                    f"chunks={out.get('totalChunks')} dir={read_dir}"
                )
                return
        except Exception as exc:
            print(f"[coach] read/ ingest failed user={user_id}: {exc}")

    legacy = backend_root / "ModelTrainingData.docx"
    if not legacy.is_file():
        return
    try:
        content = extract_docx_text(str(legacy))
        if not (content or "").strip():
            return
        out = index_user_file(
            user_id=user_id,
            source=legacy.name,
            content=content,
            replace=True,
        )
        print(
            f"[coach] legacy RAG doc ingested user={user_id} "
            f"source={legacy.name} chunks={out.get('chunksIndexed', 0)}"
        )
    except Exception as exc:
        print(f"[coach] legacy doc ingest failed user={user_id}: {exc}")


def ingest_read_folder(user_id: str, *, embedding_model: str | None = None) -> dict:
    """
    Clear existing vectors for this user, then index every supported file in backend/read/.
    """
    read_dir = read_folder_path()
    files = list_supported_files(read_dir)
    if not files:
        return {
            "ok": False,
            "error": "No supported files in read/ (.docx .pdf .xlsx .csv .json .txt .md)",
            "readDir": str(read_dir),
            "files": [],
        }

    clear_rag(user_id)
    indexed: list[dict] = []
    total_chunks = 0
    for path in files:
        try:
            text = extract_text_from_path(path)
        except Exception as exc:
            indexed.append({"file": path.name, "ok": False, "error": str(exc)})
            continue
        if not (text or "").strip():
            indexed.append({"file": path.name, "ok": False, "error": "empty after extract"})
            continue
        try:
            out = index_user_chunks(
                user_id=user_id,
                source=path.name,
                content=text,
                embedding_model=embedding_model,
            )
            total_chunks += int(out.get("chunksIndexed") or 0)
            indexed.append({"file": path.name, "ok": True, **out})
        except Exception as exc:
            indexed.append({"file": path.name, "ok": False, "error": str(exc)})

    stats = rag_stats(user_id)
    return {
        "ok": True,
        "readDir": str(read_dir),
        "files": indexed,
        "totalChunks": int(stats.get("chunks") or 0),
        "sources": stats.get("sources") or [],
    }


@dataclass(frozen=True)
class RetrievedChunk:
    source: str
    chunk_id: str
    content: str
    score: float


def _cosine(a: list[float], b: list[float]) -> float:
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def retrieve(
    *,
    user_id: str,
    query: str,
    k: int = 8,
    embedding_model: str | None = None,
) -> list[RetrievedChunk]:
    _ensure_backend_env_loaded()
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set")

    client = OpenAI(api_key=api_key)
    model = (embedding_model or os.environ.get("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small").strip()

    # Load all chunks for user and score locally (simple + OK for demo scale).
    rows = rag_all_chunks(user_id)
    if not rows:
        return []

    q_emb = _embed(client, [query], model=model)[0]

    scored: list[RetrievedChunk] = []
    for r in rows:
        emb = json.loads(r["embeddingJson"])
        score = _cosine(q_emb, emb)
        scored.append(
            RetrievedChunk(
                source=r["source"],
                chunk_id=r["chunkId"],
                content=r["content"],
                score=float(score),
            )
        )

    scored.sort(key=lambda x: x.score, reverse=True)
    return scored[: max(1, min(int(k), 20))]

