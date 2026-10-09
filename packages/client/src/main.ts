interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  token_type: string;
}

const issuer = import.meta.env.VITE_OIDC_ISSUER;
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID;
const scope = import.meta.env.VITE_OIDC_SCOPE ?? "openid profile";
const gatewayUrl = (
  import.meta.env.VITE_GATEWAY_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const callbackUrl = `${window.location.origin}/auth/callback`;
const storageKey = "secure-api.oidc.transaction";

let accessToken: string | undefined;

function required<T>(value: T | null, selector: string): T {
  if (!value) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return value;
}

const signedOut = required(
  document.querySelector<HTMLElement>("#signed-out"),
  "#signed-out",
);
const signedIn = required(
  document.querySelector<HTMLElement>("#signed-in"),
  "#signed-in",
);
const configurationError = required(
  document.querySelector<HTMLElement>("#configuration-error"),
  "#configuration-error",
);
const signedInMessage = required(
  document.querySelector<HTMLElement>("#signed-in-message"),
  "#signed-in-message",
);
const result = required(
  document.querySelector<HTMLElement>("#result"),
  "#result",
);
const signInButton = required(
  document.querySelector<HTMLButtonElement>("#sign-in"),
  "#sign-in",
);
const callUsersButton = required(
  document.querySelector<HTMLButtonElement>("#call-users"),
  "#call-users",
);
const signOutButton = required(
  document.querySelector<HTMLButtonElement>("#sign-out"),
  "#sign-out",
);

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function randomValue(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(value: string): Promise<string> {
  return base64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}

async function discoverIssuer(): Promise<OidcMetadata> {
  const response = await fetch(
    `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
  );
  if (!response.ok) throw new Error("Unable to load OIDC discovery metadata.");
  return (await response.json()) as OidcMetadata;
}

async function signIn(): Promise<void> {
  if (!issuer || !clientId) return;

  const verifier = randomValue();
  const state = randomValue();
  sessionStorage.setItem(storageKey, JSON.stringify({ verifier, state }));

  const metadata = await discoverIssuer();
  const params = new URLSearchParams({
    client_id: clientId,
    code_challenge: await sha256(verifier),
    code_challenge_method: "S256",
    redirect_uri: callbackUrl,
    response_type: "code",
    scope,
    state,
  });
  window.location.assign(`${metadata.authorization_endpoint}?${params}`);
}

async function handleCallback(): Promise<void> {
  const parameters = new URLSearchParams(window.location.search);
  const code = parameters.get("code");
  const callbackState = parameters.get("state");
  const transaction = sessionStorage.getItem(storageKey);

  if (!code || !callbackState || !transaction || !issuer || !clientId) {
    throw new Error(
      "The OIDC sign-in callback is missing required parameters.",
    );
  }

  const { verifier, state } = JSON.parse(transaction) as {
    verifier: string;
    state: string;
  };
  if (state !== callbackState) throw new Error("OIDC state validation failed.");

  const metadata = await discoverIssuer();
  const response = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl,
    }),
  });
  sessionStorage.removeItem(storageKey);
  if (!response.ok) throw new Error("OIDC token exchange failed.");

  const token = (await response.json()) as TokenResponse;
  if (!token.access_token || token.token_type.toLowerCase() !== "bearer") {
    throw new Error("OIDC provider did not return a bearer access token.");
  }

  accessToken = token.access_token;
  window.history.replaceState({}, document.title, "/");
}

async function callUsers(): Promise<void> {
  if (!accessToken) return;

  result.textContent = "Calling gateway…";
  const response = await fetch(`${gatewayUrl}/api/users`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.text();
  result.textContent = `${response.status} ${response.statusText}\n${body}`;
}

function showError(error: unknown): void {
  configurationError.hidden = false;
  configurationError.textContent =
    error instanceof Error ? error.message : "Unexpected error.";
}

function render(): void {
  const isSignedIn = Boolean(accessToken);
  signedOut.hidden = isSignedIn;
  signedIn.hidden = !isSignedIn;
  signedInMessage.textContent = isSignedIn
    ? `Ready to call ${gatewayUrl}/api/users.`
    : "";
}

void (async () => {
  try {
    if (!issuer || !clientId) {
      throw new Error(
        "Set VITE_OIDC_ISSUER and VITE_OIDC_CLIENT_ID before signing in.",
      );
    }
    if (window.location.pathname === "/auth/callback") await handleCallback();
  } catch (error) {
    showError(error);
  }
  render();
})();

signInButton.addEventListener("click", () => void signIn().catch(showError));
callUsersButton.addEventListener(
  "click",
  () => void callUsers().catch(showError),
);
signOutButton.addEventListener("click", () => {
  accessToken = undefined;
  sessionStorage.removeItem(storageKey);
  result.textContent = "";
  render();
});
