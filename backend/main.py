from fastapi import FastAPI, Depends, Form
from app.api import router as api_router, audit_handler


app = FastAPI()
app.include_router(api_router, dependencies=[Depends(audit_handler)])

# Dev runner
if __name__ == "__main__":
    try:
        import uvicorn
        uvicorn.run("main:app", reload=True)
    except:
        print("uvicorn not found")
