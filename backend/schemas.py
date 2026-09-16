from pydantic import BaseModel, EmailStr, Field, model_validator

class UserCreate(BaseModel):
    name : str = Field(min_length=2, max_length=100)
    email : EmailStr
    password : str = Field(min_length=8, max_length=128)
    phone : str | None = Field(default=None, max_length=30)
    seller_type : str = Field(default="private", pattern="^(private|dealer)$")

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

class UserUpdate(BaseModel):
    name : str | None = Field(default=None, min_length=2, max_length=100)
    email : EmailStr | None = None
    phone : str | None = Field(default=None, max_length=30)
    seller_type : str | None = Field(default=None, pattern="^(private|dealer)$")

class PasswordChange(BaseModel):
    current_password : str = Field(min_length=1, max_length=128)
    new_password : str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def diff_passwords(self):
        if self.current_password == self.new_password:
            raise ValueError("New password must be different from the current password")
        return self


class Token(BaseModel):
    access_token : str
    token_type : str

class TokenData(BaseModel):
    email : str | None = None