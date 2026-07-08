import secrets
from fastapi import Header, HTTPException

from app.core.config import get_settings

settings = get_settings()


def _validate_bearer_token(authorization: str | None, expected_token: str) -> None:
    if not expected_token:
        raise HTTPException(status_code=500, detail="Authentication is misconfigured on the server")

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid API token format")
        
    if not secrets.compare_digest(token, expected_token):
        raise HTTPException(status_code=401, detail="Invalid API token")


def require_api_auth(authorization: str | None = Header(default=None)) -> None:
    _validate_bearer_token(authorization, settings.api_auth_token)


def require_admin_auth(authorization: str | None = Header(default=None)) -> None:
    admin_token = settings.admin_auth_token or settings.api_auth_token
    _validate_bearer_token(authorization, admin_token)
