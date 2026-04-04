"""Azure AD ID token validation for FastAPI."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, Request


# ── Configuration ────────────────────────────────────────


def _get_client_id() -> str:
    val = os.getenv("MSAL_CLIENT_ID", "")
    if not val.strip():
        raise RuntimeError("MSAL_CLIENT_ID environment variable is not set")
    return val.strip()


def _get_tenant_id() -> str:
    val = os.getenv("MSAL_TENANT_ID", "")
    if not val.strip():
        raise RuntimeError("MSAL_TENANT_ID environment variable is not set")
    return val.strip()


def _get_issuer() -> str:
    return f"https://login.microsoftonline.com/{_get_tenant_id()}/v2.0"


def _get_jwks_url() -> str:
    return f"https://login.microsoftonline.com/{_get_tenant_id()}/discovery/v2.0/keys"


# ── JWKS cache ───────────────────────────────────────────

_jwks_cache: dict[str, Any] = {}
_jwks_cache_time: float = 0.0
_JWKS_CACHE_TTL_SECONDS: float = 86400  # 24 hours


async def _fetch_jwks() -> dict[str, Any]:
    """Fetch JWKS from Azure AD, keyed by kid."""
    global _jwks_cache, _jwks_cache_time

    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < _JWKS_CACHE_TTL_SECONDS:
        return _jwks_cache

    jwks_url = _get_jwks_url()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(jwks_url)
        resp.raise_for_status()
        jwks_data = resp.json()

    keys_by_kid: dict[str, Any] = {}
    for key in jwks_data.get("keys", []):
        kid = key.get("kid")
        if kid:
            keys_by_kid[kid] = key

    _jwks_cache = keys_by_kid
    _jwks_cache_time = now
    return _jwks_cache


async def _get_signing_key(kid: str) -> Any:
    """Get the RSA public key for a given kid."""
    keys = await _fetch_jwks()
    key_data = keys.get(kid)
    if not key_data:
        # Force refresh in case keys were rotated
        global _jwks_cache_time
        _jwks_cache_time = 0.0
        keys = await _fetch_jwks()
        key_data = keys.get(kid)
    if not key_data:
        raise HTTPException(status_code=401, detail="Token signing key not found")
    return jwt.algorithms.RSAAlgorithm.from_jwk(key_data)


# ── Token validation ─────────────────────────────────────


@dataclass
class AuthenticatedUser:
    """Validated user from an Azure AD ID token."""
    oid: str
    email: str
    name: str
    tenant_id: str
    raw_claims: dict


async def validate_id_token(token: str) -> AuthenticatedUser:
    """Validate an Azure AD ID token (signature, audience, issuer, expiry)."""
    client_id = _get_client_id()
    issuer = _get_issuer()

    try:
        unverified_header = jwt.get_unverified_header(token)
    except jwt.exceptions.DecodeError:
        raise HTTPException(status_code=401, detail="Invalid token format")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Token missing kid header")

    signing_key = await _get_signing_key(kid)

    try:
        claims = jwt.decode(
            token,
            key=signing_key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=issuer,
            options={
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
                "require": ["exp", "iss", "aud", "sub"],
            },
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid token audience")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Invalid token issuer")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    return AuthenticatedUser(
        oid=claims.get("oid", claims.get("sub", "")),
        email=claims.get("preferred_username", claims.get("email", "")),
        name=claims.get("name", ""),
        tenant_id=claims.get("tid", ""),
        raw_claims=claims,
    )


# ── FastAPI dependency ────────────────────────────────────


def _is_auth_enabled() -> bool:
    """Check if MSAL auth is configured."""
    return bool(os.getenv("MSAL_CLIENT_ID", "").strip())


async def get_current_user(request: Request) -> AuthenticatedUser | None:
    """
    FastAPI dependency: validates Bearer token.
    Returns None if auth is not configured (dev mode fallback).
    Raises 401 if auth is configured but token is missing/invalid.
    """
    if not _is_auth_enabled():
        return None

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth_header[len("Bearer "):]
    return await validate_id_token(token)
