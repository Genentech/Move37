"""Small helpers for encrypting persisted integration credentials."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

NONCE_BYTES = 16
MAC_BYTES = 32


def encrypt_secret(value: str, *, secret: str | None = None) -> str:
    """Encrypt a string using a server-held secret."""

    key = _derive_key(secret)
    nonce = secrets.token_bytes(NONCE_BYTES)
    plaintext = value.encode("utf-8")
    keystream = _expand_keystream(key, nonce, len(plaintext))
    ciphertext = bytes(left ^ right for left, right in zip(plaintext, keystream))
    mac = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    payload = nonce + ciphertext + mac
    return base64.urlsafe_b64encode(payload).decode("ascii")


def decrypt_secret(value: str, *, secret: str | None = None) -> str:
    """Decrypt a string previously encrypted with ``encrypt_secret``."""

    key = _derive_key(secret)
    payload = base64.urlsafe_b64decode(value.encode("ascii"))
    nonce = payload[:NONCE_BYTES]
    ciphertext = payload[NONCE_BYTES:-MAC_BYTES]
    expected_mac = payload[-MAC_BYTES:]
    actual_mac = hmac.new(key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_mac, actual_mac):
        raise ValueError("Stored credential failed validation.")
    keystream = _expand_keystream(key, nonce, len(ciphertext))
    plaintext = bytes(left ^ right for left, right in zip(ciphertext, keystream))
    return plaintext.decode("utf-8")


def _derive_key(secret: str | None) -> bytes:
    source = (
        secret
        or os.environ.get("MOVE37_CREDENTIAL_SECRET")
        or os.environ.get("MOVE37_API_BEARER_TOKEN")
        or "move37-dev-credential-secret"
    )
    return hashlib.sha256(source.encode("utf-8")).digest()


def _expand_keystream(key: bytes, nonce: bytes, size: int) -> bytes:
    stream = bytearray()
    counter = 0
    while len(stream) < size:
        block = hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        stream.extend(block)
        counter += 1
    return bytes(stream[:size])
