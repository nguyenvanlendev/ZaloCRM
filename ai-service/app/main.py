
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
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from qdrant_client import QdrantClient

# --- Static Knowledge ---
STATIC_KNOWLEDGE = ""
try:
    kb_path = os.path.join(os.path.dirname(__file__), "knowledge_base.md")
    if os.path.exists(kb_path):
        with open(kb_path, "r", encoding="utf-8") as f:
            STATIC_KNOWLEDGE = f.read()
except Exception as e:
    print("Could not load static knowledge:", e)


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
    final_api_key = api_key or os.getenv("OPENROUTER_AUTH_TOKEN") or "dummy-key-to-pass-validation"
    final_base_url = base_url or os.getenv("OPENROUTER_BASE_URL")
    kwargs = {"model_name": model_name, "openai_api_key": final_api_key, "temperature": 0.7}
    if final_base_url:
        kwargs["base_url"] = final_base_url
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

class AIAssistantRequest(BaseModel):
    query: str
    history: List[dict]
    orgId: str
    apiKey: str
    model: Optional[str] = "gpt-4o-mini"
    baseUrl: Optional[str] = None


class IngestRequest(BaseModel):
    text: str
    metadata: Optional[dict] = {}
    apiKey: str

# --- Graph Ingestion Task ---
def process_knowledge_file(file_path: str, org_id: str, doc_id: str, api_key: Optional[str] = None):
    try:
        print(f"[{doc_id}] 🚀 Starting knowledge processing for file: {file_path}")
        # Load Document
        print(f"[{doc_id}] 📄 Loading document...")
        if file_path.lower().endswith(".pdf"):
            loader = PyPDFLoader(file_path)
        else:
            loader = TextLoader(file_path, encoding="utf-8")
        documents = loader.load()
        print(f"[{doc_id}] ✅ Loaded {len(documents)} pages.")
        
        # Split text
        print(f"[{doc_id}] ✂️ Splitting text into chunks...")
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = text_splitter.split_documents(documents)
        for chunk in chunks:
            chunk.metadata["orgId"] = org_id
            chunk.metadata["docId"] = doc_id
        print(f"[{doc_id}] ✅ Split into {len(chunks)} chunks.")
            
        # 1. Qdrant Ingestion (Vector)
        print(f"[{doc_id}] 💾 Ingesting {len(chunks)} chunks to Qdrant (Vector DB)...")
        embeddings = get_embeddings(api_key or "")
        Qdrant.from_documents(
            chunks,
            embeddings,
            url=QDRANT_URL,
            collection_name=COLLECTION_NAME
        )
        print(f"[{doc_id}] ✅ Qdrant ingestion complete.")
        
        # 2. Neo4j Ingestion (Graph)
        NEO4J_URI = os.getenv("NEO4J_URI")
        NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
        NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
        NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")
        
        if NEO4J_URI and NEO4J_USERNAME and NEO4J_PASSWORD:
            print(f"[{doc_id}] 🕸️ Ingesting to Neo4j (Graph DB)... Connecting to {NEO4J_URI}")
            graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD, database=NEO4J_DATABASE)
            llm = get_llm(api_key or "", "openrouter/free") # Use free model for extraction or default
            llm_transformer = LLMGraphTransformer(llm=llm)
            
            # Extract graph documents
            print(f"[{doc_id}] 🤖 LLM is extracting graph entities and relationships... (This may take a while depending on token size)")
            graph_documents = llm_transformer.convert_to_graph_documents(chunks)
            print(f"[{doc_id}] 📥 Writing {len(graph_documents)} graph documents to Neo4j...")
            graph.add_graph_documents(
                graph_documents, 
                baseEntityLabel=True, 
                include_source=True
            )
            print(f"[{doc_id}] ✅ Neo4j Graph ingestion complete.")
        else:
            print(f"[{doc_id}] ⚠️ Neo4j credentials missing. Skipping Graph Ingestion.")
            
        print(f"[{doc_id}] 🎉 All processing successfully completed!")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[{doc_id}] ❌ Error processing document: {e}")
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
        # Save file temporarily keeping original extension
        ext = os.path.splitext(file.filename)[1] if file.filename else ".txt"
        fd, temp_path = tempfile.mkstemp(suffix=ext)
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
            NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")
            
            if NEO4J_URI and NEO4J_USERNAME and NEO4J_PASSWORD:
                try:
                    from langchain.chains import GraphCypherQAChain
                    graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD, database=NEO4J_DATABASE)
                    
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

Bạn là một nhân viên chăm sóc khách hàng (staff) đang nhắn tin với khách.
Nhiệm vụ của bạn là đọc LỊCH SỬ TRÒ CHUYỆN và viết MỘT tin nhắn phản hồi duy nhất cho khách hàng.
YÊU CẦU QUAN TRỌNG:
1. Phản hồi phải ngắn gọn, tự nhiên, thân thiện và ĐÚNG NGỮ CẢNH của cuộc trò chuyện.
2. Nếu khách hàng chỉ đang chat xã giao, cảm ơn, hoặc nói chuyện phiếm, hãy phản hồi lại một cách lịch sự bình thường (không cần cố nhét kiến thức vào).
3. Chỉ sử dụng thông tin từ KNOWLEDGE BASE và GRAPH RAG nếu nó THỰC SỰ liên quan và có thể giải đáp trực tiếp câu hỏi của khách hàng.
4. KHÔNG bao giờ in ra các thông điệp cảnh báo của hệ thống (ví dụ: "User Safety: safe", "I'm a large language model", v.v.).

=========================
THÔNG TIN KIẾN THỨC TĨNH (LUÔN ĐÚNG):
{STATIC_KNOWLEDGE}

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
            HumanMessage(content="Dựa vào lịch sử trên, hãy soạn giúp tôi nội dung tin nhắn tiếp theo để gửi cho khách hàng (chỉ trả về nội dung tin nhắn, không cần giải thích thêm).")
        ]
        
        reply = llm.invoke(messages).content
        return {"reply": reply, "retrieved_context": retrieved_context}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/chat/assistant")
def chat_assistant(req: AIAssistantRequest):
    try:
        embeddings = get_embeddings(req.apiKey)
        llm = get_llm(req.apiKey, req.model or "gpt-4o-mini", req.baseUrl)
        
        vectorstore = Qdrant(
            client=qdrant_client,
            collection_name=COLLECTION_NAME,
            embeddings=embeddings
        )
        
        retrieved_context = ""
        retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
        try:
            docs = retriever.invoke(req.query)
            retrieved_context = "\n\n".join([doc.page_content for doc in docs])
        except Exception as e:
            if "Not found: Collection" in str(e):
                pass
            else:
                print(f"Vector retrieval error: {e}")
                
        # 2. Graph Retrieval (Neo4j)
        graph_context = ""
        NEO4J_URI = os.getenv("NEO4J_URI")
        NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
        NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
        NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")
        
        if NEO4J_URI and NEO4J_USERNAME and NEO4J_PASSWORD:
            try:
                from langchain.chains import GraphCypherQAChain
                graph = Neo4jGraph(url=NEO4J_URI, username=NEO4J_USERNAME, password=NEO4J_PASSWORD, database=NEO4J_DATABASE)
                cypher_chain = GraphCypherQAChain.from_llm(
                    cypher_llm=llm,
                    qa_llm=llm,
                    graph=graph,
                    verbose=True,
                    return_direct=True,
                    top_k=5
                )
                graph_result = cypher_chain.invoke({"query": req.query})
                graph_context = str(graph_result.get("result", ""))
            except Exception as ge:
                print(f"Graph retrieval error: {ge}")
                
        # Format History
        history_text = ""
        for msg in req.history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            history_text += f"{role.capitalize()}: {content}\n"
            
        system_template = f"""Bạn là một Trợ lý AI Đào tạo (AI Training Assistant) thông minh của ZaloCRM.
Nhiệm vụ của bạn là hỗ trợ nhân viên Sale tư vấn về khóa học, sản phẩm, giá cả, và các chính sách.

Bạn PHẢI sử dụng thông tin từ KNOWLEDGE BASE dưới đây để trả lời câu hỏi của nhân viên. 
Nếu thông tin không có trong Knowledge Base, hãy nói thẳng là bạn không biết hoặc chưa được đào tạo về vấn đề này, tuyệt đối không tự bịa ra thông tin.

=========================
THÔNG TIN KIẾN THỨC TĨNH (LUÔN ĐÚNG):
{STATIC_KNOWLEDGE}

THÔNG TIN TỪ KNOWLEDGE BASE CỦA TỔ CHỨC (Vector):
{retrieved_context if retrieved_context else "(Chưa có dữ liệu liên quan)"}

THÔNG TIN QUAN HỆ TỪ GRAPH RAG (Neo4j):
{graph_context if graph_context else "(Chưa có dữ liệu liên quan)"}
=========================

LỊCH SỬ TRÒ CHUYỆN:
{history_text}
"""
        
        messages = [
            SystemMessage(content=system_template),
            HumanMessage(content=req.query)
        ]
        
        reply = llm.invoke(messages).content
        return {"reply": reply}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

