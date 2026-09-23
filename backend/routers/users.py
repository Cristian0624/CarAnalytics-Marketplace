from fastapi import (APIRouter, Depends, HTTPException, status, Response, Request)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
import jwt
from database import get_db
from models import User, UserSession
from schemas import (UserCreate, UserResponse, UserLogin, UserUpdate, PasswordChange)
from security import (hash_password, verify_password, create_access_token, decode_access_token, create_refresh_token, hash_refresh_token, get_refresh_token_expiration)
from datetime import datetime, timezone

router = APIRouter(
    prefix="/users",
    tags=["users"],
)

Security = HTTPBearer()

ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"
COOKIE_SECURE = False # change this latter when deploing to online server and https
COOKIE_SAMESITE = "lax"

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(
    user_data: UserCreate, 
    db: Session = Depends(get_db)
):
    existing_user = db.query(User).filter(User.email == user_data.email).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )
    
    user = User(
        name = user_data.name,
        email = user_data.email,
        password = hash_password(user_data.password),
        phone = user_data.phone,
        seller_type = user_data.seller_type
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user

@router.post("/login")
def login_user(
    user_data : UserLogin,
    response : Response, 
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == user_data.email).first()

    if not user or not verify_password(user_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token()
    refresh_token_hash = hash_refresh_token(refresh_token)

    session = UserSession(user_id=user.id, refresh_token_hash=refresh_token_hash, expires_at=get_refresh_token_expiration())

    db.add(session)
    db.commit()

    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=15 * 26,
        path="/"
    )

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=7 * 24 * 60 * 60,
        path="/auth"
    )

    return {
        "message" : "Login successful",
         "access_token": access_token, # remove when it is resolved
        "token_type": "bearer"
    }


def get_current_user(
        request: Request,
        db: Session = Depends(get_db)
):
    token = request.cookies.get(ACCESS_COOKIE_NAME)

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        user_id = decode_access_token(token)
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session"
        )
    
    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    return user

@router.post("/refresh")
def refresh_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    refresh_token = request.cookies.get(
        REFRESH_COOKIE_NAME
    )

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )
    
    token_hash = hash_refresh_token(refresh_token)

    session = db.query(UserSession).filter(
        UserSession.refresh_token_hash == token_hash,
        UserSession.revoked_at.is_(None)
    ).first()

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    
    now = datetime.now(timezone.utc)

    if session.expires_at <= now:
        session.revoked_at = now
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired"
        )
    
    user = db.query(User).filter(
        User.id == session.user_id
    ).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    session.revoked_at = now
    new_refresh_token = create_access_token()

    new_session = UserSession(
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(new_refresh_token),
        expires_at=get_refresh_token_expiration()
    )

    db.add(new_session)
    new_access_token = create_access_token(user.id)
    db.commit()

    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=new_access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=15 * 26,
        path="/"
    )

    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=new_refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=7 * 24 * 60 * 60,
        path="/auth"
    )

    return {
        "message" : "Session refreshed"
    }

@router.post("/logout")
def logout_user(
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)

    if refresh_token:
        token_hash = hash_refresh_token(refresh_token)

        session = db.query(UserSession).filter(
            UserSession.refresh_token_hash == token_hash,
            UserSession.revoked_at.is_(None)
        ).first()

        if session:
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()
    
    response.delete_cookie(
        key=ACCESS_COOKIE_NAME,
        path="/"
    )

    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/auth"
    )

    return {
        "message" : "Logged out successfully"
    }
    

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user

@router.put("/me", response_model=UserResponse)
def update_current_user_profile(
    user_data : UserUpdate,
    current_user : User = Depends(get_current_user),
    db : Session = Depends(get_db)
):
    if user_data.email is not None:
        existing_user = db.query(User).filter(
            User.email == user_data.email,
            User.id == current_user.id 
        ).first()

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )
        
        current_user.email = user_data.email
    
    if user_data.name is not None:
        current_user.name = user_data.name

    if user_data.phone is not None:
        current_user.phone = user_data.phone

    if user_data.seller_type is not None:
        current_user.seller_type = user_data.seller_type
    
    db.commit()
    db.refresh(current_user)

    return current_user

@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_current_user_password(
    password_data : PasswordChange,
    response: Response,
    current_user : User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(password_data.current_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    current_user.password = hash_password(password_data.new_password)
    
    now = datetime.now(timezone.utc)

    db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.revoked_at.is_(None)
    ).update(
        {
            UserSession.revoked_at: now
        },
        synchronize_session=False
    )
    db.commit()

    response.delete_cookie(
        key=ACCESS_COOKIE_NAME,
        path="/"
    )

    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/auth"
    )

    return None