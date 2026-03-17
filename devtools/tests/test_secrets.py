from __future__ import annotations

import base64
import unittest

from nacl import encoding, public

from mv37_devtools.secrets import encrypt_secret


class SecretsTest(unittest.TestCase):
    def test_encrypt_secret_uses_github_public_key_format(self) -> None:
        private_key = public.PrivateKey.generate()
        public_key = base64.b64encode(bytes(private_key.public_key)).decode("utf-8")

        encrypted = encrypt_secret(public_key, "hello-world")

        sealed_box = public.SealedBox(private_key)
        decrypted = sealed_box.decrypt(
            base64.b64decode(encrypted),
            encoder=encoding.RawEncoder,
        ).decode("utf-8")
        self.assertEqual(decrypted, "hello-world")
