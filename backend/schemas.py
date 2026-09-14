from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    name : str
    email : EmailStr
    password : str
    phone : str | None = None
    seller_type : str = "private"

class UserResponse(BaseModel):
    id : int
    name : str
    email : EmailStr
    phone : str | None = None
    seller_type : str

    class Config:
        from_attributes = True
