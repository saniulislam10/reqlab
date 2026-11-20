"use client";
import Link from "next/link";
import React, { useState } from "react";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

type ApiResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
};

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
  const [params, setParams] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [token, setToken] = useState("");
  const [tokenType, setTokenType] = useState("Bearer"); // new state
  const [tokenKey, setTokenKey] = useState("Authorization"); // new state
  const [customTokenKey, setCustomTokenKey] = useState(""); // for custom key

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
        <div className="topbar-note">
          <span className="status-dot" />
          API testing workspace
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
                <span className="local-badge"><span className="status-dot" /> Ready</span>
              </div>

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
