"use client";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { firebaseConfigured, getFirebaseServices } from "../lib/firebase";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
const SENSITIVE_FIELD_NAME = /(authorization|proxy-authorization|api[-_]?key|access[-_]?token|token|secret|password|cookie)/i;

type RequestParameter = { key: string; value: string };

type ApiResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
};

type SavedFolder = {
  id: string;
  name: string;
};

type RequestDraft = {
  method: string;
  useSplitInput: boolean;
  baseUrl: string;
  model: string;
  finalPath: string;
  url: string;
  params: RequestParameter[];
  headers: string;
  body: string;
  bodyType: string;
  tokenType: string;
  tokenKey: string;
  customTokenKey: string;
};

type SavedRequest = RequestDraft & {
  id: string;
  name: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSavedRequest(id: string, document: DocumentData): SavedRequest | null {
  const data = document as Record<string, unknown>;
  if (typeof data.name !== "string" || typeof data.method !== "string" || !HTTP_METHODS.some(method => method === data.method)) {
    return null;
  }

  const params = Array.isArray(data.params)
    ? data.params.flatMap((parameter): RequestParameter[] => {
      if (!isRecord(parameter) || typeof parameter.key !== "string" || typeof parameter.value !== "string") {
        return [];
      }
      return [{ key: parameter.key, value: parameter.value }];
    })
    : [];

  return {
    id,
    name: data.name,
    method: data.method,
    useSplitInput: data.useSplitInput === true,
    baseUrl: typeof data.baseUrl === "string" ? data.baseUrl : "",
    model: typeof data.model === "string" ? data.model : "",
    finalPath: typeof data.finalPath === "string" ? data.finalPath : "",
    url: typeof data.url === "string" ? data.url : "",
    params,
    headers: typeof data.headers === "string" ? data.headers : "{}",
    body: typeof data.body === "string" ? data.body : "",
    bodyType: typeof data.bodyType === "string" ? data.bodyType : "json",
    tokenType: typeof data.tokenType === "string" ? data.tokenType : "Bearer",
    tokenKey: typeof data.tokenKey === "string" ? data.tokenKey : "Authorization",
    customTokenKey: typeof data.customTokenKey === "string" ? data.customTokenKey : "",
  };
}

function sanitizeUrlForStorage(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_FIELD_NAME.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
}

type JsonTreeNodeProps = {
  value: unknown;
  label?: string;
  depth?: number;
  isLast?: boolean;
};

function JsonTreeNode({ value, label, depth = 0, isLast = true }: JsonTreeNodeProps) {
  const comma = isLast ? "" : ",";
  const labelElement = label !== undefined && (
    <span className="text-gray-300">{JSON.stringify(label)}: </span>
  );

  if (value !== null && typeof value === "object") {
    const isArray = Array.isArray(value);
    const entries: [string, unknown][] = isArray
      ? value.map((item, index) => [String(index), item])
      : Object.entries(value);
    const openToken = isArray ? "[" : "{";
    const closeToken = isArray ? "]" : "}";

    if (entries.length === 0) {
      return (
        <div>
          {labelElement}
          <span className="text-gray-300">{openToken}{closeToken}</span>
          {comma}
        </div>
      );
    }

    return (
      <details open={depth < 3}>
        <summary className="cursor-pointer text-gray-300">
          {labelElement}
          {openToken}
          <span className="json-tree-collapsed text-gray-500">
            {" "}... {entries.length} {entries.length === 1 ? "item" : "items"} {closeToken}{comma}
          </span>
        </summary>
        <div className="ml-4 border-l border-[#3f3f46] pl-3">
          {entries.map(([key, child], index) => (
            <JsonTreeNode
              key={`${depth}-${key}`}
              value={child}
              label={isArray ? undefined : key}
              depth={depth + 1}
              isLast={index === entries.length - 1}
            />
          ))}
        </div>
        <div className="text-gray-300">{closeToken}{comma}</div>
      </details>
    );
  }

  const valueClassName = value === null
    ? "text-gray-400"
    : typeof value === "string"
      ? "text-green-400"
      : typeof value === "number"
        ? "text-sky-400"
        : "text-purple-400";

  return (
    <div>
      {labelElement}
      <span className={valueClassName}>{JSON.stringify(value) ?? "null"}</span>
      {comma}
    </div>
  );
}

// Add a helper to format bytes
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function buildQueryString(params: { key: string; value: string }[]) {
  const esc = encodeURIComponent;
  return params
    .filter(p => p.key)
    .map(p => `${esc(p.key)}=${esc(p.value)}`)
    .join("&");
}

export default function Home() {
  const [useSplitInput, setUseSplitInput] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [finalPath, setFinalPath] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [headers, setHeaders] = useState("{}");
  const [body, setBody] = useState("");
  const [bodyType, setBodyType] = useState("json"); // new state
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [responseSize, setResponseSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // New state for params and token
  const [params, setParams] = useState<RequestParameter[]>([{ key: "", value: "" }]);
  const [token, setToken] = useState("");
  const [tokenType, setTokenType] = useState("Bearer"); // new state
  const [tokenKey, setTokenKey] = useState("Authorization"); // new state
  const [customTokenKey, setCustomTokenKey] = useState(""); // for custom key
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [firebaseError, setFirebaseError] = useState("");
  const [folders, setFolders] = useState<SavedFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [saveRequestOpen, setSaveRequestOpen] = useState(false);
  const [saveRequestName, setSaveRequestName] = useState("");

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthLoading(false);
      return;
    }

    try {
      const { auth } = getFirebaseServices();
      return onAuthStateChanged(
        auth,
        user => {
          setFirebaseUser(user);
          setAuthLoading(false);
          setFirebaseError("");
          if (!user) {
            setFolders([]);
            setSavedRequests([]);
            setSelectedFolderId("");
          }
        },
        error => {
          setFirebaseError(`Could not check your sign-in status: ${error.message}`);
          setAuthLoading(false);
        },
      );
    } catch (error) {
      setFirebaseError(error instanceof Error ? error.message : "Could not initialize Firebase.");
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!firebaseUser || !firebaseConfigured) {
      setFolders([]);
      setSelectedFolderId("");
      setFolderLoading(false);
      return;
    }

    setFolderLoading(true);
    try {
      const { db } = getFirebaseServices();
      const foldersQuery = query(
        collection(db, "users", firebaseUser.uid, "folders"),
        orderBy("createdAt", "asc"),
      );
      return onSnapshot(
        foldersQuery,
        snapshot => {
          const nextFolders: SavedFolder[] = [];
          let foundInvalidFolder = false;
          snapshot.forEach(folder => {
            const data = folder.data();
            if (typeof data.name === "string") {
              nextFolders.push({ id: folder.id, name: data.name });
            } else {
              foundInvalidFolder = true;
            }
          });
          setFolders(nextFolders);
          setSelectedFolderId(current =>
            nextFolders.some(folder => folder.id === current)
              ? current
              : nextFolders[0]?.id ?? "",
          );
          setFolderLoading(false);
          if (foundInvalidFolder) setFirebaseError("A saved folder has invalid data and could not be displayed.");
        },
        error => {
          setFirebaseError(`Could not load folders: ${error.message}`);
          setFolderLoading(false);
        },
      );
    } catch (error) {
      setFirebaseError(error instanceof Error ? error.message : "Could not load folders.");
      setFolderLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!firebaseUser || !selectedFolderId || !firebaseConfigured) {
      setSavedRequests([]);
      setRequestsLoading(false);
      return;
    }

    setRequestsLoading(true);
    try {
      const { db } = getFirebaseServices();
      const requestsQuery = query(
        collection(db, "users", firebaseUser.uid, "folders", selectedFolderId, "requests"),
        orderBy("updatedAt", "desc"),
      );
      return onSnapshot(
        requestsQuery,
        snapshot => {
          const loadedRequests = snapshot.docs.map(request =>
            normalizeSavedRequest(request.id, request.data()),
          );
          if (loadedRequests.some(request => request === null)) {
            setFirebaseError("A saved request has invalid data and could not be displayed.");
          }
          setSavedRequests(loadedRequests.filter((request): request is SavedRequest => request !== null));
          setRequestsLoading(false);
        },
        error => {
          setFirebaseError(`Could not load saved requests: ${error.message}`);
          setRequestsLoading(false);
        },
      );
    } catch (error) {
      setFirebaseError(error instanceof Error ? error.message : "Could not load saved requests.");
      setRequestsLoading(false);
    }
  }, [firebaseUser, selectedFolderId]);

  // Compose the full URL if using split input
  let composedUrl = useSplitInput
    ? [baseUrl, model, finalPath].map(s => s.replace(/(^\/|\/$)/g, "")).filter(Boolean).join("/")
    : url;
  // Add params if any
  const queryString = buildQueryString(params);
  if (queryString) {
    composedUrl += (composedUrl.includes("?") ? "&" : "?") + queryString;
  }

  const handleParamChange = (idx: number, field: "key" | "value", value: string) => {
    setParams(prev => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };
  const handleAddParam = () => setParams(prev => [...prev, { key: "", value: "" }]);
  const handleRemoveParam = (idx: number) => setParams(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  const handleSignIn = async () => {
    if (!firebaseConfigured) return;
    setAuthBusy(true);
    setFirebaseError("");
    try {
      const { auth } = getFirebaseServices();
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      setFirebaseError(`Google sign-in failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    setFirebaseError("");
    try {
      const { auth } = getFirebaseServices();
      await signOut(auth);
    } catch (error) {
      setFirebaseError(`Could not sign out: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCreateFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!firebaseUser || !name) {
      setFirebaseError("Enter a folder name before creating it.");
      return;
    }

    setLibraryBusy(true);
    setFirebaseError("");
    try {
      const { db } = getFirebaseServices();
      const folder = await addDoc(
        collection(db, "users", firebaseUser.uid, "folders"),
        { name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      );
      setSelectedFolderId(folder.id);
      setNewFolderName("");
      setNewFolderOpen(false);
    } catch (error) {
      setFirebaseError(`Could not create folder: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLibraryBusy(false);
    }
  };

  const handleSaveRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = saveRequestName.trim();
    if (!firebaseUser || !selectedFolderId) {
      setFirebaseError("Sign in and choose a folder before saving a request.");
      return;
    }
    if (!name) {
      setFirebaseError("Enter a name for this request.");
      return;
    }

    let parsedHeaders: unknown;
    try {
      parsedHeaders = JSON.parse(headers || "{}");
    } catch {
      setFirebaseError("Request headers must be valid JSON before this request can be saved.");
      return;
    }
    if (!isRecord(parsedHeaders)) {
      setFirebaseError("Request headers must be a JSON object before this request can be saved.");
      return;
    }

    const safeHeaders = Object.fromEntries(
      Object.entries(parsedHeaders).filter(([key]) => !SENSITIVE_FIELD_NAME.test(key)),
    );
    const safeParams = params.filter(
      parameter => parameter.key.trim() && !SENSITIVE_FIELD_NAME.test(parameter.key),
    );
    const request: RequestDraft = {
      method,
      useSplitInput,
      baseUrl: sanitizeUrlForStorage(baseUrl),
      model,
      finalPath,
      url: sanitizeUrlForStorage(url),
      params: safeParams,
      headers: JSON.stringify(safeHeaders, null, 2),
      body,
      bodyType,
      tokenType,
      tokenKey,
      customTokenKey,
    };

    setLibraryBusy(true);
    setFirebaseError("");
    try {
      const { db } = getFirebaseServices();
      await addDoc(
        collection(db, "users", firebaseUser.uid, "folders", selectedFolderId, "requests"),
        {
          name,
          ...request,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      );
      setSaveRequestName("");
      setSaveRequestOpen(false);
    } catch (error) {
      setFirebaseError(`Could not save request: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLibraryBusy(false);
    }
  };

  const handleLoadSavedRequest = (savedRequest: SavedRequest) => {
    setMethod(savedRequest.method);
    setUseSplitInput(savedRequest.useSplitInput);
    setBaseUrl(savedRequest.baseUrl);
    setModel(savedRequest.model);
    setFinalPath(savedRequest.finalPath);
    setUrl(savedRequest.url);
    setParams(savedRequest.params.length ? savedRequest.params : [{ key: "", value: "" }]);
    setHeaders(savedRequest.headers);
    setBody(savedRequest.body);
    setBodyType(savedRequest.bodyType);
    setTokenType(savedRequest.tokenType);
    setTokenKey(savedRequest.tokenKey);
    setCustomTokenKey(savedRequest.customTokenKey);
    setToken("");
    setError("");
    setResponse(null);
    setFirebaseError("");
  };

  const handleDeleteSavedRequest = async (savedRequest: SavedRequest) => {
    if (!firebaseUser || !window.confirm(`Delete "${savedRequest.name}"?`)) return;
    setLibraryBusy(true);
    setFirebaseError("");
    try {
      const { db } = getFirebaseServices();
      await deleteDoc(
        doc(db, "users", firebaseUser.uid, "folders", selectedFolderId, "requests", savedRequest.id),
      );
    } catch (error) {
      setFirebaseError(`Could not delete request: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLibraryBusy(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResponse(null);
    setResponseTime(null);
    setResponseSize(null);
    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = headers ? JSON.parse(headers) : {};
    } catch {
      setError("Invalid JSON in headers");
      setLoading(false);
      return;
    }
    // Add token to headers if present
    if (token) {
      let headerKey = tokenKey === "custom" ? customTokenKey : tokenKey;
      if (!headerKey) headerKey = "Authorization";
      let value = token;
      if (tokenType === "Bearer") value = `Bearer ${token}`;
      else if (tokenType === "Basic") value = `Basic ${token}`;
      // Custom type: just use the token as is
      parsedHeaders = { ...parsedHeaders, [headerKey]: value };
    }
    // Set Content-Type if not already set and body is present
    if (body && !parsedHeaders["Content-Type"]) {
      if (bodyType === "json") parsedHeaders["Content-Type"] = "application/json";
      else if (bodyType === "text") parsedHeaders["Content-Type"] = "text/plain";
      else if (bodyType === "html") parsedHeaders["Content-Type"] = "text/html";
      else if (bodyType === "xml") parsedHeaders["Content-Type"] = "application/xml";
      else if (bodyType === "form") parsedHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    }
    let sendBody = body;
    if (body && bodyType === "json") {
      try {
        sendBody = JSON.stringify(JSON.parse(body));
      } catch {
        setError("Invalid JSON body");
        setLoading(false);
        return;
      }
    } else if (body && bodyType === "form") {
      // Parse body as key=value&key2=value2
      try {
        const obj = JSON.parse(body);
        sendBody = Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`).join("&");
      } catch {
        setError("For form type, body must be a valid JSON object");
        setLoading(false);
        return;
      }
    }
    try {
      const start = performance.now();
      const res = await fetch(composedUrl, {
        method,
        headers: parsedHeaders,
        body: ["GET", "HEAD"].includes(method) ? undefined : sendBody,
      });
      const end = performance.now();
      setResponseTime(Math.round(end - start));
      const contentType = res.headers.get("content-type") || "";
      let data;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      // Calculate response size in bytes
      let size = 0;
      if (typeof data === "string") {
        size = new TextEncoder().encode(data).length;
      } else {
        const str = JSON.stringify(data);
        size = new TextEncoder().encode(str).length;
      }
      setResponseSize(size);
      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        body: data,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="ReqLab home">
          <span className="brand-mark" aria-hidden="true">&lt;/&gt;</span>
          <span>Req<span className="brand-accent">Lab</span></span>
        </Link>
        <div className="topbar-actions">
          <div className="topbar-note">
            <span className="status-dot" />
            API testing workspace
          </div>
          {authLoading ? (
            <span className="auth-loading-label">Checking account…</span>
          ) : firebaseUser ? (
            <>
              <span className="account-name">{firebaseUser.displayName || firebaseUser.email}</span>
              <button type="button" className="quiet-button" onClick={handleSignOut} disabled={authBusy}>
                {authBusy ? "Signing out…" : "Sign out"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="google-button"
              onClick={handleSignIn}
              disabled={!firebaseConfigured || authBusy}
              title={!firebaseConfigured ? "Add Firebase configuration to enable Google sign-in" : undefined}
            >
              <span className="google-mark" aria-hidden="true">G</span>
              {authBusy ? "Connecting…" : "Continue with Google"}
            </button>
          )}
        </div>
      </header>

      <main className="page-content">
        <section className="intro">
          <div className="eyebrow"><span className="eyebrow-line" /> A focused workspace for your APIs</div>
          <h1>Build, send, and inspect<br className="desktop-break" /> every request.</h1>
          <p>Make HTTP requests, add the details your endpoint needs, and explore the response in one clear workspace.</p>
        </section>

        <div className="workspace-grid">
          <div className="primary-column">
            <section className="panel request-panel" aria-labelledby="request-heading">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">REQUEST</span>
                  <h2 id="request-heading">Configure a request</h2>
                </div>
                <div className="request-heading-actions">
                  <span className="local-badge"><span className="status-dot" /> Ready</span>
                  <button
                    type="button"
                    className="save-request-button"
                    onClick={() => {
                      if (firebaseUser) {
                        setSaveRequestOpen(value => !value);
                      } else {
                        void handleSignIn();
                      }
                    }}
                    disabled={authLoading || authBusy || (!firebaseConfigured && !firebaseUser)}
                  >
                    {firebaseUser ? "Save request" : "Sign in to save"}
                  </button>
                </div>
              </div>

              {saveRequestOpen && firebaseUser && (
                <form className="save-request-form" onSubmit={handleSaveRequest}>
                  <label>
                    <span>Request name</span>
                    <input
                      className="form-control"
                      type="text"
                      maxLength={120}
                      placeholder="Name this request"
                      value={saveRequestName}
                      onChange={event => setSaveRequestName(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>Save in folder</span>
                    <select
                      className="form-control"
                      value={selectedFolderId}
                      onChange={event => setSelectedFolderId(event.target.value)}
                      required
                    >
                      <option value="">Choose a folder</option>
                      {folders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="save-form-actions">
                    <button type="button" className="quiet-button" onClick={() => setSaveRequestOpen(false)}>Cancel</button>
                    <button type="submit" className="save-request-button" disabled={libraryBusy || !selectedFolderId}>
                      {libraryBusy ? "Saving…" : "Save"}
                    </button>
                  </div>
                  <p className="field-note save-privacy-note">
                    The authorization token is never saved. Credential-like headers and query parameters are omitted; review the request body before saving.
                  </p>
                </form>
              )}

              <form onSubmit={handleSend} className="request-form">
                <div className="request-bar">
                  <label className="sr-only" htmlFor="http-method">HTTP method</label>
                  <select
                    id="http-method"
                    className={`method-select method-${method.toLowerCase()}`}
                    value={method}
                    onChange={e => setMethod(e.target.value)}
                  >
                    {HTTP_METHODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  {useSplitInput ? (
                    <div className="split-fields">
                      <input
                        className="form-control"
                        type="text"
                        aria-label="Base URL"
                        placeholder="Base URL"
                        value={baseUrl}
                        onChange={e => setBaseUrl(e.target.value)}
                        required
                      />
                      <input
                        className="form-control"
                        type="text"
                        aria-label="Path prefix"
                        placeholder="Path prefix"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                      />
                      <input
                        className="form-control"
                        type="text"
                        aria-label="Resource path"
                        placeholder="Resource path"
                        value={finalPath}
                        onChange={e => setFinalPath(e.target.value)}
                      />
                    </div>
                  ) : (
                    <input
                      id="request-url"
                      className="form-control url-control"
                      type="url"
                      placeholder="Enter request URL"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      required
                    />
                  )}
                  <button type="submit" className="send-button" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="loading-spinner" aria-hidden="true" />
                        Sending
                      </>
                    ) : (
                      <>
                        Send request
                        <span aria-hidden="true">↗</span>
                      </>
                    )}
                  </button>
                </div>

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={useSplitInput}
                    onChange={() => setUseSplitInput(v => !v)}
                  />
                  <span className="toggle-track" aria-hidden="true"><span /></span>
                  <span>
                    <strong>Split endpoint input</strong>
                    <small>Build a URL from a base address and path segments</small>
                  </span>
                </label>

                <div className="request-options">
                  <section className="option-section" aria-labelledby="params-heading">
                    <div className="option-heading">
                      <div>
                        <h3 id="params-heading">Query parameters</h3>
                        <p>Append key-value pairs to your request URL.</p>
                      </div>
                      <button type="button" className="text-button" onClick={handleAddParam}>+ Add parameter</button>
                    </div>
                    <div className="parameter-list">
                      {params.map((p, idx) => (
                        <div key={idx} className="parameter-row">
                          <input
                            className="form-control"
                            type="text"
                            aria-label={`Parameter ${idx + 1} key`}
                            placeholder="Key"
                            value={p.key}
                            onChange={e => handleParamChange(idx, "key", e.target.value)}
                          />
                          <input
                            className="form-control"
                            type="text"
                            aria-label={`Parameter ${idx + 1} value`}
                            placeholder="Value"
                            value={p.value}
                            onChange={e => handleParamChange(idx, "value", e.target.value)}
                          />
                          <button
                            type="button"
                            className="icon-button remove-button"
                            onClick={() => handleRemoveParam(idx)}
                            disabled={params.length === 1}
                            aria-label={`Remove parameter ${idx + 1}`}
                            title="Remove parameter"
                          >
                            −
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="option-section" aria-labelledby="auth-heading">
                    <div className="option-heading">
                      <div>
                        <h3 id="auth-heading">Authorization</h3>
                        <p>Add a token to the selected request header.</p>
                      </div>
                    </div>
                    <div className="auth-row">
                      <label className="sr-only" htmlFor="token-type">Token format</label>
                      <select id="token-type" className="form-control compact-control" value={tokenType} onChange={e => setTokenType(e.target.value)}>
                        <option value="Bearer">Bearer</option>
                        <option value="Basic">Basic</option>
                        <option value="Custom">Custom</option>
                      </select>
                      <label className="sr-only" htmlFor="token-key">Authorization header</label>
                      <select id="token-key" className="form-control compact-control" value={tokenKey} onChange={e => setTokenKey(e.target.value)}>
                        <option value="Authorization">Authorization</option>
                        <option value="Administrator">Administrator</option>
                        <option value="custom">Custom header</option>
                      </select>
                      {tokenKey === "custom" && (
                        <input
                          className="form-control"
                          type="text"
                          aria-label="Custom authorization header name"
                          placeholder="Header name"
                          value={customTokenKey}
                          onChange={e => setCustomTokenKey(e.target.value)}
                        />
                      )}
                      <input
                        className="form-control token-control"
                        type="password"
                        autoComplete="off"
                        aria-label="Authorization token"
                        placeholder="Paste token"
                        value={token}
                        onChange={e => setToken(e.target.value)}
                      />
                    </div>
                    <p className="field-note">Token is used for this request only and is not saved.</p>
                  </section>

                  <section className="option-section" aria-labelledby="headers-heading">
                    <div className="option-heading">
                      <div>
                        <h3 id="headers-heading">Request headers</h3>
                        <p>Enter headers as a JSON object.</p>
                      </div>
                    </div>
                    <textarea
                      className="form-control code-input"
                      rows={3}
                      aria-label="Request headers in JSON"
                      spellCheck={false}
                      placeholder="{}"
                      value={headers}
                      onChange={e => setHeaders(e.target.value)}
                    />
                  </section>

                  {!["GET", "HEAD"].includes(method) && (
                    <section className="option-section" aria-labelledby="body-heading">
                      <div className="option-heading body-heading">
                        <div>
                          <h3 id="body-heading">Request body</h3>
                          <p>Choose a format and enter the payload to send.</p>
                        </div>
                        <label className="sr-only" htmlFor="body-type">Request body format</label>
                        <select id="body-type" className="form-control compact-control" value={bodyType} onChange={e => setBodyType(e.target.value)}>
                          <option value="json">JSON</option>
                          <option value="text">Text</option>
                          <option value="html">HTML</option>
                          <option value="xml">XML</option>
                          <option value="form">Form URL encoded</option>
                        </select>
                      </div>
                      <textarea
                        className="form-control code-input"
                        rows={6}
                        aria-label="Request body"
                        spellCheck={false}
                        placeholder="Enter request body"
                        value={body}
                        onChange={e => setBody(e.target.value)}
                      />
                      {bodyType === "json" && <p className="field-note">The body must be valid JSON.</p>}
                      {bodyType === "form" && <p className="field-note">Enter a JSON object; its fields are sent as URL-encoded form data.</p>}
                    </section>
                  )}
                </div>
              </form>
            </section>

            {error && (
              <div className="error-banner" role="alert">
                <span className="error-icon" aria-hidden="true">!</span>
                <div><strong>Request failed</strong><p>{error}</p></div>
              </div>
            )}

            {response && (
              <section className="panel response-panel" aria-labelledby="response-heading" aria-live="polite">
                <div className="panel-heading response-heading">
                  <div>
                    <span className="section-kicker">RESULT</span>
                    <h2 id="response-heading">Response</h2>
                  </div>
                  <div className="response-metrics">
                    <span className={`status-badge ${response.status >= 200 && response.status < 400 ? "status-success" : "status-error"}`}>
                      <span className="status-dot" />{response.status} {response.statusText}
                    </span>
                    {responseTime !== null && <span className="metric-chip">{(responseTime / 1000).toFixed(2)} s</span>}
                    {responseSize !== null && <span className="metric-chip">{formatBytes(responseSize)}</span>}
                  </div>
                </div>
                <details open className="response-disclosure">
                  <summary>Response headers</summary>
                  <pre className="response-code">{JSON.stringify(response.headers, null, 2)}</pre>
                </details>
                <details open className="response-disclosure">
                  <summary>Response body</summary>
                  <div className="response-code response-body">
                    {typeof response.body === "object" && response.body !== null ? (
                      <div className="json-tree">
                        <JsonTreeNode value={response.body} />
                      </div>
                    ) : (
                      <pre>{typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}</pre>
                    )}
                  </div>
                </details>
              </section>
            )}
          </div>

          <div className="sidebar-column">
            <aside className="panel library-panel" aria-labelledby="library-heading">
              <div className="library-header">
                <div>
                  <span className="section-kicker">LIBRARY</span>
                  <h2 id="library-heading">Saved requests</h2>
                </div>
                {firebaseUser && firebaseConfigured && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setNewFolderOpen(value => !value)}
                  >
                    + New folder
                  </button>
                )}
              </div>

              {!firebaseConfigured ? (
                <div className="library-empty">
                  <strong>Connect Firebase to get started</strong>
                  <p>Add the Firebase web app settings to <code>.env.local</code>, enable Google sign-in, and create a Firestore database.</p>
                </div>
              ) : authLoading ? (
                <div className="library-empty"><p>Checking your account…</p></div>
              ) : !firebaseUser ? (
                <div className="library-empty">
                  <strong>Your requests, organized</strong>
                  <p>Sign in with Google to create folders and save requests to your account.</p>
                  <button type="button" className="google-button library-google-button" onClick={handleSignIn} disabled={authBusy}>
                    <span className="google-mark" aria-hidden="true">G</span>
                    {authBusy ? "Connecting…" : "Continue with Google"}
                  </button>
                </div>
              ) : (
                <>
                  <label className="folder-select-label" htmlFor="saved-folder">Folder</label>
                  <select
                    id="saved-folder"
                    className="form-control folder-select"
                    value={selectedFolderId}
                    onChange={event => setSelectedFolderId(event.target.value)}
                    disabled={folderLoading || folders.length === 0}
                  >
                    {folders.length === 0 ? (
                      <option value="">No folders yet</option>
                    ) : (
                      folders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))
                    )}
                  </select>

                  {newFolderOpen && (
                    <form className="new-folder-form" onSubmit={handleCreateFolder}>
                      <label className="sr-only" htmlFor="new-folder-name">New folder name</label>
                      <input
                        id="new-folder-name"
                        className="form-control"
                        type="text"
                        maxLength={80}
                        placeholder="Folder name"
                        value={newFolderName}
                        onChange={event => setNewFolderName(event.target.value)}
                        required
                      />
                      <button type="submit" className="save-request-button" disabled={libraryBusy}>
                        {libraryBusy ? "Creating…" : "Create"}
                      </button>
                    </form>
                  )}

                  {folderLoading ? (
                    <div className="library-empty"><p>Loading folders…</p></div>
                  ) : folders.length === 0 ? (
                    <div className="library-empty">
                      <p>Create a folder to organize your saved requests.</p>
                    </div>
                  ) : requestsLoading ? (
                    <div className="library-empty"><p>Loading requests…</p></div>
                  ) : savedRequests.length === 0 ? (
                    <div className="library-empty">
                      <p>This folder is empty. Configure a request and choose <strong>Save request</strong> to add one.</p>
                    </div>
                  ) : (
                    <ul className="saved-request-list">
                      {savedRequests.map(savedRequest => (
                        <li key={savedRequest.id} className="saved-request-item">
                          <button
                            type="button"
                            className="saved-request-load"
                            onClick={() => handleLoadSavedRequest(savedRequest)}
                            title={`Load ${savedRequest.name}`}
                          >
                            <span className={`saved-method method-${savedRequest.method.toLowerCase()}`}>{savedRequest.method}</span>
                            <span className="saved-request-name">{savedRequest.name}</span>
                          </button>
                          <button
                            type="button"
                            className="saved-request-delete"
                            onClick={() => void handleDeleteSavedRequest(savedRequest)}
                            disabled={libraryBusy}
                            aria-label={`Delete ${savedRequest.name}`}
                            title="Delete request"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}

              {firebaseError && <p className="firebase-error" role="alert">{firebaseError}</p>}
            </aside>

            <aside className="panel guide-panel" aria-labelledby="guide-heading">
              <div className="guide-icon" aria-hidden="true">✦</div>
              <span className="section-kicker">QUICK START</span>
              <h2 id="guide-heading">Your first request</h2>
              <p className="guide-intro">Everything you need to make and inspect an API call.</p>
              <ol className="guide-steps">
                <li><span>01</span><div><strong>Choose a method</strong><p>Select GET, POST, PUT, DELETE, or PATCH.</p></div></li>
                <li><span>02</span><div><strong>Enter an endpoint</strong><p>Paste a URL, or turn on split input to build one from parts.</p></div></li>
                <li><span>03</span><div><strong>Add request details</strong><p>Set query parameters, authorization, headers, and a body when needed.</p></div></li>
                <li><span>04</span><div><strong>Send and inspect</strong><p>Review the status, timing, headers, and expandable response data.</p></div></li>
              </ol>
              <div className="guide-tip">
                <span aria-hidden="true">i</span>
                <p>Requests run from your browser. The target API must allow cross-origin requests (CORS).</p>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-credit">
            <span className="footer-mark" aria-hidden="true">&lt;/&gt;</span>
            <p><strong>ReqLab</strong><span>Built by Saniul Islam · Full Stack Developer</span></p>
          </div>
          <nav className="footer-links" aria-label="Developer links">
            <a href="https://saniulislam.com" target="_blank" rel="noreferrer">Website <span aria-hidden="true">↗</span></a>
            <a href="https://github.com/saniulislam10" target="_blank" rel="noreferrer">GitHub <span aria-hidden="true">↗</span></a>
            <a href="https://www.linkedin.com/in/sani10/" target="_blank" rel="noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
