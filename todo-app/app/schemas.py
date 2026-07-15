from pydantic import BaseModel, ConfigDict, Field


class TodoBase(BaseModel):
    title: str = Field(min_length=1)


class TodoCreate(TodoBase):
    pass


class TodoUpdate(BaseModel):
    completed: bool | None = None


class TodoResponse(TodoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    completed: bool
