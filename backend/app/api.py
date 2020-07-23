from datetime import datetime
from typing import List, Optional

from fastapi import (
    APIRouter,
    Request,
    BackgroundTasks,
    Depends,
    Query,
    HTTPException,
    status,
)
from bson import ObjectId

from app.config import Settings, get_settings
from app.models import *
from app.database import DatabaseContext

from fastapi.security import HTTPBasic, HTTPBasicCredentials
from passlib.hash import bcrypt
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
        # Ref. https://api.mongodb.com/python/current/examples/datetimes.html#basic-usage
        timestamp=datetime.utcnow(),
        route=request["endpoint"].__name__,
        url=str(request.url),
        path_params=request.path_params,
        query_params=request.query_params,
        body=body,
    )

    background.add_task(db.add_audit_event, audit_event)


def verify_password(plain_password, hashed_password):
    return bcrypt.verify(plain_password, hashed_password)


async def get_current_username(
    credentials: HTTPBasicCredentials = Depends(security),
    db: DatabaseContext = Depends(get_db),
):
    user = await db.get_annotator(credentials.username)
    if not user or not verify_password(
        credentials.password, user.hashed_password.get_secret_value()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


@router.get("/annotators")
async def list_annotators(
    db: DatabaseContext = Depends(get_db), username: str = Depends(get_current_username)
) -> List[Annotator]:
    return await db.list_annotators()


@router.get("/annotators/me")
async def get_current_annotator(
    db: DatabaseContext = Depends(get_db), username: str = Depends(get_current_username)
) -> List[Annotator]:
    return await db.get_annotator(username)


@router.get("/segments/count")
async def get_segment_count(
    start: Optional[str] = Query(None),
    db: DatabaseContext = Depends(get_db),
    username: str = Depends(get_current_username),
):
    return await db.get_segment_count(start)


@router.get("/segments")
async def list_segments(
    before: Optional[str] = Query(None),
    after: Optional[str] = Query(None),
    limit: int = Query(10),
    db: DatabaseContext = Depends(get_db),
    username: str = Depends(get_current_username),
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
    username: str = Depends(get_current_username),
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
    username: str = Depends(get_current_username),
):
    try:
        await db.update_annotation(ObjectId(segment_id), annotator_username, annotation)
    except AssertionError as e:
        raise HTTPException(400, str(e))
