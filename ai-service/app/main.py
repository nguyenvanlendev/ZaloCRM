
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
import tempfile
from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form, BackgroundTasks, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# --- Core Setup ---
from langchain_openai import ChatOpenAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import Qdrant
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_community.graphs import Neo4jGraph
from langchain_experimental.graph_transformers import LLMGraphTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from qdrant_client import QdrantClient

app = FastAPI(title="YOEDU AI Service", version="1.0.0")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print("VALIDATION ERROR RAW:", exc.errors())
    # Return a safe dict to avoid jsonable_encoder crash on bytes
    safe_errors = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": safe_errors})

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

# --- Graph Ingestion Task ---
def process_knowledge_file(file_path: str, org_id: str, doc_id: str, api_key: Optional[str] = None):
    try:
        # Load PDF
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        
        # Split text
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = text_splitter.split_documents(documents)
        for chunk in chunks:
            chunk.metadata["orgId"] = org_id
            chunk.metadata["docId"] = doc_id
            
        # 1. Qdrant Ingestion (Vector)
        print("Ingesting to Qdrant...")
        embeddings = get_embeddings(api_key or "")
        Qdrant.from_documents(
            chunks,
            embeddings,
            url=QDRANT_URL,
            collection_name=COLLECTION_NAME
        )
        
        # 2. Neo4j Ingestion (Graph)
        NEO4J_URI = os.getenv("NEO4J_URI")
        NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
        NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
        
        if NEO4J_URI and NEO4J_USERNAME and NEO4J_PASSWORD:
            print("Ingesting to Neo4j...")
            graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD)
            llm = get_llm(api_key or "", "openrouter/free") # Use free model for extraction or default
            llm_transformer = LLMGraphTransformer(llm=llm)
            
            # Extract graph documents
            graph_documents = llm_transformer.convert_to_graph_documents(chunks)
            graph.add_graph_documents(
                graph_documents, 
                baseEntityLabel=True, 
                include_source=True
            )
            print("Graph ingestion complete.")
        else:
            print("Neo4j credentials missing. Skipping Graph Ingestion.")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error processing document: {e}")
    finally:
        # Cleanup temp file
        if os.path.exists(file_path):
            os.remove(file_path)

# --- Endpoints ---

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/v1/knowledge/upload")
def upload_knowledge(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    orgId: str = Form(...),
    docId: str = Form(...)
):
    try:
        # Save file temporarily
        fd, temp_path = tempfile.mkstemp(suffix=".pdf")
        with os.fdopen(fd, 'wb') as f:
            f.write(file.file.read())
            
        # Dispatch background task for processing
        background_tasks.add_task(process_knowledge_file, temp_path, orgId, docId, None)
        
        return {"status": "processing_started", "doc_id": docId}
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
            # Safe retriever that catches missing collection errors
            try:
                docs = retriever.invoke(latest_customer_msg)
                retrieved_context = "\n\n".join([doc.page_content for doc in docs])
            except Exception as e:
                if "Not found: Collection" in str(e):
                    docs = []
                else:
                    raise e
                    
            # 2. Graph Retrieval (Neo4j)
            graph_context = ""
            NEO4J_URI = os.getenv("NEO4J_URI")
            NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
            NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
            
            if NEO4J_URI and NEO4J_USERNAME and NEO4J_PASSWORD:
                try:
                    from langchain.chains import GraphCypherQAChain
                    graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD)
                    
                    cypher_chain = GraphCypherQAChain.from_llm(
                        cypher_llm=llm,
                        qa_llm=llm,
                        graph=graph,
                        verbose=True,
                        return_direct=True,
                        top_k=5
                    )
                    graph_result = cypher_chain.invoke({"query": latest_customer_msg})
                    graph_context = str(graph_result.get("result", ""))
                except Exception as ge:
                    print(f"Graph retrieval error: {ge}")
                    
        # Build prompt
        system_template = f"""{req.systemPromptBase}

=========================
THÔNG TIN TỪ KNOWLEDGE BASE CỦA TỔ CHỨC (Vector):
{retrieved_context if retrieved_context else "(Chưa có dữ liệu liên quan)"}

THÔNG TIN QUAN HỆ TỪ GRAPH RAG (Neo4j):
{graph_context if 'graph_context' in locals() and graph_context else "(Chưa có dữ liệu liên quan)"}
=========================

LỊCH SỬ TRÒ CHUYỆN:
{chat_context_text}
"""
        
        messages = [
            SystemMessage(content=system_template),
            HumanMessage(content="Hãy soạn giúp tôi một tin nhắn phản hồi phù hợp nhất cho khách hàng.")
        ]
        
        reply = llm.invoke(messages).content
        return {"reply": reply, "retrieved_context": retrieved_context}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
