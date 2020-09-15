import csv
import json
from io import TextIOWrapper
from collections import defaultdict
from datetime import datetime
from typing import DefaultDict, List, Optional, Set, Tuple

from fastapi import (
    APIRouter,
    Request,
    BackgroundTasks,
    Depends,
    Query,
    HTTPException,
    status,
    Form,
    File,
    UploadFile,
)
from bson import ObjectId

from app.config import Settings, get_settings
from app.models import *
from app.database import DatabaseContext

from fastapi.security import HTTPBasic, HTTPBasicCredentials
from passlib.hash import bcrypt
from fastapi.responses import HTMLResponse
import socket

security = HTTPBasic()
router = APIRouter()


async def get_db(settings: Settings = Depends(get_settings)):
    with DatabaseContext(settings) as db:
        yield db


def verify_password(plain_password, hashed_password: SecretStr):
    return bcrypt.verify(plain_password, hashed_password.get_secret_value())


async def get_current_user(
    credentials: HTTPBasicCredentials = Depends(security),
    db: DatabaseContext = Depends(get_db),
) -> Annotator:
    user = await db.get_annotator(credentials.username)
    #Get users IP address
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)
    #If user has an active session skip bcrypt validation:
    if await db.active_session(ip_address):
        return user
    #Else try to login user
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    #Create active session for newly logged in user
    await db.create_session(ip_address)
    return user


async def audit_handler(
    request: Request,
    background: BackgroundTasks,
    user: Annotator = Depends(get_current_user),
    db: DatabaseContext = Depends(get_db),
):
    body = None
    if (
        request.method in ("PUT", "POST")
        and request.headers.get("Content-Type") == "application/json"
    ):
        body = await request.json()

    audit_event = AuditEvent(
        username=user.username,
        # Ref. https://api.mongodb.com/python/current/examples/datetimes.html#basic-usage
        timestamp=datetime.utcnow(),
        route=request["endpoint"].__name__,
        url=str(request.url),
        path_params=request.path_params,
        query_params=request.query_params,
        body=body,
    )

    background.add_task(db.add_audit_event, audit_event)


@router.get("/admin/updatecampaigns", response_class=HTMLResponse)
def form_get():
    return """<form enctype="multipart/form-data" method="post">
    <input type="file" name="campaigns"/>
    <input type="submit"/>
    </form>"""


# File must be a CSV and must have the column names User Name, Campaign and Segment Id.
# There must be no blank cells
@router.post("/admin/updatecampaigns")
async def create_upload_file(
    campaigns: UploadFile = File(...), db: DatabaseContext = Depends(get_db),
):
    new_campaigns = json.load(campaigns.file)
    for (username, campaign) in new_campaigns.items():
        await db.set_campaign(
            username,
            AnnotationCampaign(
                name=campaign["name"],
                segments=list(map(ObjectId, campaign["segments"])),
            ),
        )

    return "Annotator campaigns have been updated successfully"


@router.get("/admin/resetpassword", response_class=HTMLResponse)
def form_get():
    return """<form method="post">
    <input type="text" name="username" placeholder="Username"/>
    <input type="text" name="newpassword" placeholder="New Password"/>
    <input type="submit"/>
    </form>"""


@router.post("/admin/resetpassword")
async def passwordreset(
    username: str = Form(...),
    newpassword: str = Form(...),
    db: DatabaseContext = Depends(get_db),
):
    encrypted = bcrypt.hash(newpassword)
    pass_reset = await db.reset_password(username, encrypted)
    if pass_reset:
        return "Password Reset Was Successful"
    return "Password Reset Failed. Please ensure username is correct"


@router.get("/admin/adduser", response_class=HTMLResponse)
def form_get():
    return """<form method="post">
    <input type="text" name="name" placeholder="First and Last Name"/>
    <input type="text" name="username" placeholder="Username"/>
    <input type="text" name="designation" placeholder="Designation"/>
    <input type="text" name="password" placeholder="Password"/>
    <input type="submit"/>
    </form>"""


@router.post("/admin/adduser")
async def passwordreset(
    name: str = Form(...),
    username: str = Form(...),
    designation: str = Form(...),
    password: str = Form(...),
    db: DatabaseContext = Depends(get_db),
):
    encrypted = bcrypt.hash(password)
    await db.add_user(name, username, designation, encrypted)
    return "A new user has been added"


@router.get("/annotators")
async def list_annotators(
    db: DatabaseContext = Depends(get_db), _: Annotator = Depends(get_current_user)
):
    return await db.list_annotators()


@router.get("/annotators/me")
def get_current_annotator(user: Annotator = Depends(get_current_user)):
    return user


@router.get("/segments")
async def list_segments(
    find: Optional[List[str]] = Query(None),
    limit: int = Query(10),
    db: DatabaseContext = Depends(get_db),
    _: Annotator = Depends(get_current_user),
):
    if find is not None:
        limit = len(find)
    if find is None or limit <= 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"search criteria always returns no results"
        )

    return await db.find_segments([ObjectId(id) for id in find])


@router.get("/segments/{segment_id}")
async def get_segment(
    segment_id: str,
    annotator_username: str = Query(None, alias="annotator"),
    db: DatabaseContext = Depends(get_db),
    username: str = Depends(get_current_user),
):
    segment: SegmentRecord = await db.get_segment(ObjectId(segment_id))
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
    username: str = Depends(get_current_user),
):
    try:
        await db.update_annotation(ObjectId(segment_id), annotator_username, annotation)
    except AssertionError as e:
        raise HTTPException(400, str(e))


@router.get("/classes")
def get_classes(_: str = Depends(get_current_user)):
    # TODO lookup from db and add this as seed data
    return [
        {
            "value": "SINUS",
            "name": "sinus rhythm",
            "description": "sinus rhythm (regardless of rate)",
        },
        {
            "value": "AFIB_AFLT",
            "name": "atrial fibrillation/flutter",
            "description": "atrial fibrillation/flutter (regardless of rate)",
        },
        {
            "value": "PACE",
            "name": "pacemaker",
            "description": "pacemaker (regardless of rate, A vs V)",
        },
        {"value": "BIGEM_TRIGEM", "name": "bigemeny/trigemeny", "description": ""},
        {
            "value": "VTACH_VFIB",
            "name": "vtach/vfib",
            "description": "ventricular tachycardia/ventricular fibrillation",
        },
        {
            "value": "OTHER_TACHY",
            "name": "other tachyarrhythmia",
            "description": "other tachyarrhythmia",
        },
        {
            "value": "OTHER_BRADY",
            "name": "other bradyarrhythmia",
            "description": "other bradyarrhythmia",
        },
        {
            "value": "ABSTAIN",
            "name": "abstain",
            "description": "unsure/none of the above",
        },
    ]
