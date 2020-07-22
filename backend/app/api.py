from datetime import datetime, timedelta
from typing import List, Optional, Any, Callable

from fastapi import (
    APIRouter,
    Request,
    Response,
    BackgroundTasks,
    Depends,
    Query,
    HTTPException,
    status,
)
from fastapi.routing import APIRoute
from bson import ObjectId

from app.config import Settings, get_settings
from app.models import *
from app.database import DatabaseContext

from fastapi.security import HTTPBasic, HTTPBasicCredentials
import hashlib
import secrets

security = HTTPBasic()
router = APIRouter()


async def get_db(settings: Settings = Depends(get_settings)):
    with DatabaseContext(settings) as db:
        yield db


async def audit_handler(
    request: Request, background: BackgroundTasks, db: DatabaseContext = Depends(get_db)
):
    body = None
    if (
        request.method in ("PUT", "POST")
        and request.headers.get("Content-Type") == "application/json"
    ):
        body = await request.json()

    audit_event = AuditEvent(
        timestamp=datetime.now(),
        route=request["endpoint"].__name__,
        url=str(request.url),
        path_params=request.path_params,
        query_params=request.query_params,
        body=body,
    )

    background.add_task(db.add_audit_event, audit_event)

async def verify_password(plain_password, hashed_password):
    return (hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password)


async def get_user(db, username: str):
    users: Users = await db.list_annotators()
    for user in users:
        print(user)
        if (username == user.username):
            return user
    return False

async def get_current_username(
    credentials: HTTPBasicCredentials = Depends(security),
    db: DatabaseContext = Depends(get_db)
):
    user: User = await get_user(db, credentials.username)
    print(user)
    password: Password = await verify_password(credentials.password, "ac") #"ac" should be user.hashed_password once field is accsessable
    print(password)
    if not user or not password:
        print("Wrong")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@router.get("/annotators")
async def list_annotators(db: DatabaseContext = Depends(get_db)) -> List[Annotator]:
    return await db.list_annotators()


@router.get("/segments/count")
async def get_segment_count(
    db: DatabaseContext = Depends(get_db),
    username: str = Depends(get_current_username)
):
    return await db.get_segment_count()


@router.get("/segments")
async def list_segments(
    before: Optional[str] = Query(None),
    after: Optional[str] = Query(None),
    limit: int = Query(10),
    db: DatabaseContext = Depends(get_db),
    username: str = Depends(get_current_username)
):
    try:
        if before:
            before = ObjectId(before)
        if after:
            after = ObjectId(after)
        return await db.list_segments(before=before, after=after, limit=limit)
    except AssertionError as e:
        raise HTTPException(400, str(e))


@router.get("/segments/{segment_id}")
async def get_segment(
    segment_id: str,
    annotator_username: str = Query(None, alias="annotator"),
    db: DatabaseContext = Depends(get_db),
    settings: Settings = Depends(get_settings),
    username: str = Depends(get_current_username)
):
    segment: AnnotatedSegment = await db.get_segment(ObjectId(segment_id))
    annotation = segment.annotations.get(annotator_username)
    return {
        "signals": segment.signals,
        "annotation": annotation.dict(exclude={"annotator"}) if annotation else None,
    }


@router.put("/segments/{segment_id}/annotations/{annotator_username}")
async def update_segment_annotations(
    segment_id: str,
    annotator_username: str,
    annotation: Annotation,
    db: DatabaseContext = Depends(get_db),
    username: str = Depends(get_current_username)
):
    try:
        await db.update_annotation(ObjectId(segment_id), annotator_username, annotation)
    except AssertionError as e:
        raise HTTPException(400, str(e))
