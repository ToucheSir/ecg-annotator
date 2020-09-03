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
    Form,
    File,
    UploadFile
)
from bson import ObjectId

from app.config import Settings, get_settings
from app.models import *
from app.database import DatabaseContext

from fastapi.security import HTTPBasic, HTTPBasicCredentials
from passlib.hash import bcrypt
import pandas as pd
from fastapi.responses import HTMLResponse

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


def verify_password(plain_password, hashed_password: SecretStr):
    return bcrypt.verify(plain_password, hashed_password.get_secret_value())


async def get_current_user(
    credentials: HTTPBasicCredentials = Depends(security),
    db: DatabaseContext = Depends(get_db),
) -> Annotator:
    user = await db.get_annotator(credentials.username)
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return user

@router.get("/updatecampaigns", response_class=HTMLResponse)
def form_get():
    return '''<form enctype = "multipart/form-data" method="post">
    <input type="file" name="csv_file"/>
    <input type="submit"/>
    </form>'''

@router.post("/updatecampaigns") #File must be a CSV and must have the column names User Name, Campaign and Segment Id. There must be no blank cells
async def create_upload_file(
    csv_file: UploadFile = File(...),
    db: DatabaseContext = Depends(get_db)
):
    df = pd.read_csv(csv_file.file)
    username = ''
    for ind in df.index:
        if df['User Name'][ind] == username:
            await db.append_segment(username, df['Segment Id'][ind])
        else:
            username = df['User Name'][ind]
            await db.new_segments(username, df['Campaign'][ind], df['Segment Id'][ind])
    return 'Annotator campaigns have been updated successfully'

@router.get("/resetpassword", response_class=HTMLResponse)
def form_get():
    return '''<form method="post">
    <input type="text" name="username" value="Enter Username"/>
    <input type="text" name="newpassword" value="Enter New Password"/>
    <input type="submit"/>
    </form>'''

@router.post("/resetpassword")
async def passwordreset(
    username: str = Form(...),
    newpassword: str = Form(...),
    db: DatabaseContext = Depends(get_db)
):
    encrypted = bcrypt.hash(newpassword)
    pass_reset = await db.reset_password(username, encrypted)
    if pass_reset:
        return 'Password Reset Was Successful'
    return 'Password Reset Failed. Please ensure username is correct'

@router.get("/adduser", response_class=HTMLResponse)
def form_get():
    return '''<form method="post">
    <input type="text" name="name" value="Enter First and Last Name"/>
    <input type="text" name="username" value="Enter Username"/>
    <input type="text" name="designation" value="Enter Designation"/>
    <input type="text" name="password" value="Enter New Password"/>
    <input type="submit"/>
    </form>'''

@router.post("/adduser")
async def passwordreset(
    name: str = Form(...),
    username: str = Form(...),
    designation: str = Form(...),
    password: str = Form(...),
    db: DatabaseContext = Depends(get_db)
):
    encrypted = bcrypt.hash(password)
    await db.add_user(name, username, designation, encrypted)
    return 'A new user has been added'


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
        {"value": "SR", "name": "sinus rhythm", "description": "sinus rhythm"},
        {
            "value": "AFIB",
            "name": "atrial fibrillation",
            "description": "atrial fibrillation",
        },
        {
            "value": "STACH",
            "name": "sinus tachycardia",
            "description": "sinus tachycardia",
        },
        {
            "value": "SARRH",
            "name": "sinus arrhythmia",
            "description": "sinus arrhythmia",
        },
        {
            "value": "SBRAD",
            "name": "sinus bradycardia",
            "description": "sinus bradycardia",
        },
        {
            "value": "PACE",
            "name": "normal functioning artificial pacemaker",
            "description": "normal functioning artificial pacemaker",
        },
        {
            "value": "SVARR",
            "name": "supraventricular arrhythmia",
            "description": "supraventricular arrhythmia",
        },
        {
            "value": "BIGU",
            "name": "bigeminal pattern",
            "description": "bigeminal pattern (unknown origin, SV or Ventricular)",
        },
        {"value": "AFLT", "name": "atrial flutter", "description": "atrial flutter"},
        {
            "value": "SVTAC",
            "name": "supraventricular tachycardia",
            "description": "supraventricular tachycardia",
        },
        {
            "value": "PSVT",
            "name": "paroxysmal supraventricular tachycardia",
            "description": "paroxysmal supraventricular tachycardia",
        },
        {
            "value": "TRIGU",
            "name": "trigeminal pattern",
            "description": "trigeminal pattern (unknown origin, SV or Ventricular)",
        },
        {
            "value": "ABSTAIN",
            "name": "abstain",
            "description": "unsure/none of the above",
        },
    ]
