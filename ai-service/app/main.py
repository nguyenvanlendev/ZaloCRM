from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid

# --- Core Setup ---
from langchain_openai import ChatOpenAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Qdrant
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from qdrant_client import QdrantClient

app = FastAPI(title="YOEDU AI Service", version="1.0.0")

# --- Environment & Services ---
QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
COLLECTION_NAME = "yoedu_knowledge"

qdrant_client = QdrantClient(url=QDRANT_URL)

# Initialize local embedding model to avoid relying on external API keys
local_embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# --- Dependency ---
def get_embeddings(api_key: str):
    # Using local embeddings for all, ignoring API key
    return local_embeddings

def get_llm(api_key: str, model_name: str = "gpt-4o-mini", base_url: Optional[str] = None):
    kwargs = {"model_name": model_name, "openai_api_key": api_key, "temperature": 0.7}
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)

# --- Models ---
class ChatContextMessage(BaseModel):
    senderType: str
    senderName: Optional[str] = None
    content: str
    sentAt: str

class ChatSuggestRequest(BaseModel):
    messages: List[ChatContextMessage]
    orgId: str
    apiKey: str
    model: Optional[str] = "gpt-4o-mini"
    systemPromptBase: Optional[str] = ""
    baseUrl: Optional[str] = None

class IngestRequest(BaseModel):
    text: str
    metadata: Optional[dict] = {}
    apiKey: str

# --- Endpoints ---

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/v1/knowledge/upload")
def upload_knowledge(req: IngestRequest):
    try:
        embeddings = get_embeddings(req.apiKey)
        vectorstore = Qdrant(
            client=qdrant_client, 
            collection_name=COLLECTION_NAME, 
            embeddings=embeddings
        )
        
        # Insert document
        doc_id = str(uuid.uuid4())
        vectorstore.add_texts(
            texts=[req.text],
            metadatas=[{"orgId": req.metadata.get("orgId", "default"), **req.metadata}],
            ids=[doc_id]
        )
        return {"status": "success", "doc_id": doc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/chat/suggest")
def suggest_reply(req: ChatSuggestRequest):
    try:
        embeddings = get_embeddings(req.apiKey)
        llm = get_llm(req.apiKey, req.model or "gpt-4o-mini", req.baseUrl)
        
        vectorstore = Qdrant(
            client=qdrant_client,
            collection_name=COLLECTION_NAME,
            embeddings=embeddings
        )
        
        # Format the chat history for context
        formatted_history = []
        for m in req.messages:
            author = "staff" if m.senderType == "self" else (m.senderName or "customer")
            formatted_history.append(f"[{m.sentAt}] {author}: {m.content or '(empty)'}")
        chat_context_text = "\n".join(formatted_history)
        
        # Get the latest user message to search the knowledge base
        latest_customer_msg = ""
        for m in reversed(req.messages):
            if m.senderType != "self" and m.content:
                latest_customer_msg = m.content
                break
                
        # Retrieve relevant context if we have a customer message
        retrieved_context = ""
        if latest_customer_msg:
            # We search based on the latest customer query
            retriever = vectorstore.as_retriever(search_kwargs={"k": 3})
            docs = retriever.invoke(latest_customer_msg)
            retrieved_context = "\n\n".join([doc.page_content for doc in docs])
            
        # Build prompt
        system_template = f"""{req.systemPromptBase}

=========================
THÔNG TIN TỪ KNOWLEDGE BASE CỦA TỔ CHỨC:
{retrieved_context if retrieved_context else "(Chưa có dữ liệu liên quan)"}
=========================

LỊCH SỬ TRÒ CHUYỆN:
{chat_context_text}
"""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_template),
            ("user", "Hãy soạn giúp tôi một tin nhắn phản hồi phù hợp nhất cho khách hàng.")
        ])
        
        chain = prompt | llm | StrOutputParser()
        
        reply = chain.invoke({})
        return {"reply": reply, "retrieved_context": retrieved_context}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
