function base64urlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64url(value: ArrayBuffer | null | undefined) {
  if (!value) return null;
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function preparePasskeyRequest(options: Record<string, any>): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64urlToBytes(options.challenge),
    allowCredentials: Array.isArray(options.allowCredentials)
      ? options.allowCredentials.map((item: Record<string, any>) => ({
          ...item,
          id: base64urlToBytes(item.id),
        }))
      : undefined,
  } as PublicKeyCredentialRequestOptions;
}

export function preparePasskeyCreation(options: Record<string, any>): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: base64urlToBytes(options.challenge),
    user: { ...options.user, id: base64urlToBytes(options.user.id) },
    excludeCredentials: Array.isArray(options.excludeCredentials)
      ? options.excludeCredentials.map((item: Record<string, any>) => ({
          ...item,
          id: base64urlToBytes(item.id),
        }))
      : undefined,
  } as unknown as PublicKeyCredentialCreationOptions;
}

export function serializePublicKeyCredential(credential: PublicKeyCredential) {
  // WebAuthn response shapes differ between authentication and registration.
  // Keep serialization structural here so TS/DOM lib version changes do not
  // affect the wire format we send to Supabase Auth.
  const response = credential.response as unknown as Record<string, any>;
  const serialized: Record<string, any> = {
    id: credential.id,
    rawId: bytesToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: bytesToBase64url(response.clientDataJSON as ArrayBuffer | undefined),
    },
  };

  if (response.authenticatorData) serialized.response.authenticatorData = bytesToBase64url(response.authenticatorData as ArrayBuffer);
  if (response.signature) serialized.response.signature = bytesToBase64url(response.signature as ArrayBuffer);
  if ("userHandle" in response) serialized.response.userHandle = bytesToBase64url((response.userHandle ?? null) as ArrayBuffer | null);
  if (response.attestationObject) serialized.response.attestationObject = bytesToBase64url(response.attestationObject as ArrayBuffer);
  if (typeof response.getTransports === "function") serialized.response.transports = response.getTransports();
  return serialized;
}
