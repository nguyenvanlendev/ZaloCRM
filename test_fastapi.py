from fastapi import FastAPI, File, UploadFile, Form, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
import uvicorn
import asyncio

app = FastAPI()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print("VALIDATION ERROR:", exc.errors())
    return JSONResponse(status_code=422, content={"detail": "validation error"})

@app.post("/upload")
def upload(file: UploadFile = File(...), orgId: str = Form(...), docId: str = Form(...)):
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)
