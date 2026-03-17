"""GitHub Actions secret helpers."""

from __future__ import annotations

import base64
import hashlib

from nacl import encoding, public


def encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    """Encrypt a secret with the GitHub repository public key."""

    public_key = public.PublicKey(public_key_b64.encode("utf-8"), encoder=encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")


def secret_digest(secret_value: str) -> str:
    """Return a stable digest for local comparison or logging."""

    return hashlib.sha256(secret_value.encode("utf-8")).hexdigest()
