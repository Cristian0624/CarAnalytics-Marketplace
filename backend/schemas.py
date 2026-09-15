from pydantic import BaseModel, EmailStr, Field

class UserCreate(BaseModel):
    name : str = Field(min_length=2, max_length=100)
    email : EmailStr
    password : str = Field(min_length=8, max_length=128)
    phone : str | None = Field(default=None, max_length=30)
    seller_type : str = Field(default="private", regex="^(private|dealer)$")

class UserLogin(BaseModel):
    email : EmailStr
    password : str = Field(min_length=8, max_length=128)

class UserResponse(BaseModel):
    id : int
    name : str
    email : EmailStr
    phone : str | None
    seller_type : str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token : str
    token_type : str

class TokenData(BaseModel):
    email : str | None = None