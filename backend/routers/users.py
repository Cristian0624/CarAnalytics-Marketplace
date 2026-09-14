from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import UserCreate, UserResponse

router = APIRouter(
    prefix="/users",
    tags=["users"],
)

@router.post("/register", response_model=UserResponse)
def register_user(
    user_data: UserCreate, 
    db: Session = Depends(get_db)
):
    user = User(
        name = user_data.name,
        email = user_data.email,
        password = user_data.password,
        phone = user_data.phone,
        seller_type = user_data.seller_type
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user