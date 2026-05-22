from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ---- MongoDB ----
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ---- Password utils ----
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---- JWT ----
def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


# ---- Models ----
class RegisterInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str = Field(min_length=5, max_length=20)
    address: str = Field(min_length=1, max_length=500)
    password: str = Field(min_length=6, max_length=128)


class LoginInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    address: str
    role: str = "customer"
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserOut
    access_token: str
    token_type: str = "bearer"


# ---- Auth helpers ----
async def get_current_user(request: Request) -> dict:
    token: Optional[str] = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _user_doc_to_out(doc: dict) -> UserOut:
    created = doc.get("created_at")
    if isinstance(created, str):
        created = datetime.fromisoformat(created)
    # FIX: ensure created_at is always timezone-aware
    if created and created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return UserOut(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        phone=doc["phone"],
        address=doc["address"],
        role=doc.get("role", "customer"),
        created_at=created,
    )


# ---- Brute force ----
async def _check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if rec and rec.get("count", 0) >= MAX_LOGIN_ATTEMPTS:
        locked_until = rec.get("locked_until")
        if locked_until:
            if isinstance(locked_until, str):
                locked_until = datetime.fromisoformat(locked_until)
            # FIX: always ensure timezone-aware comparison to avoid TypeError
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) < locked_until:
                raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")


async def _record_failed(identifier: str):
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"identifier": identifier})
    count = (rec.get("count", 0) if rec else 0) + 1
    update = {"count": count, "last_attempt": now.isoformat()}
    if count >= MAX_LOGIN_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$set": update},
        upsert=True,
    )


async def _clear_failed(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


# ---- Startup / Shutdown (FIX: replaced deprecated @app.on_event with lifespan) ----
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier", unique=True)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@gardencafe.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@1234")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "name": "Admin",
                "email": admin_email,
                "phone": "0000000000",
                "address": "HQ",
                "password_hash": hash_password(admin_password),
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info(f"Admin password updated: {admin_email}")

    yield

    # Shutdown
    client.close()


# ---- App ----
app = FastAPI(title="Garden Cafe API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Routes ----
@api_router.get("/")
async def root():
    return {"message": "Garden Cafe API"}


@api_router.post("/auth/register", response_model=AuthResponse)
async def register(payload: RegisterInput):
    email = payload.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    doc = {
        "id": user_id,
        "name": payload.name,
        "email": email,
        "phone": payload.phone,
        "address": payload.address,
        "password_hash": hash_password(payload.password),
        "role": "customer",
        "created_at": now.isoformat(),
    }
    await db.users.insert_one(doc)

    token = create_access_token(user_id, email)
    return AuthResponse(user=_user_doc_to_out(doc), access_token=token)


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginInput, request: Request):
    email = payload.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    await _check_lockout(identifier)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        await _record_failed(identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await _clear_failed(identifier)
    token = create_access_token(user["id"], email)
    return AuthResponse(user=_user_doc_to_out(user), access_token=token)


@api_router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return _user_doc_to_out(user)


@api_router.post("/auth/logout")
async def logout():
    # With bearer tokens, logout is handled client-side by discarding the token.
    return {"success": True}


# ---- Include router ----
app.include_router(api_router)
