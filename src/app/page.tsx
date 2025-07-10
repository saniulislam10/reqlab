"use client";
import React, { useState } from "react";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

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
  const [response, setResponse] = useState<any>(null);
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
    } catch (err) {
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
    } catch (err: any) {
      setError(err.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center py-10 px-2 bg-[#18181b]">
      <div className="w-full max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-100 mb-8 text-center">API Client</h1>
        <div className="flex items-center mb-4">
          <label className="text-gray-200 font-medium mr-3">Split endpoint input</label>
          <input
            type="checkbox"
            checked={useSplitInput}
            onChange={() => setUseSplitInput(v => !v)}
            className="w-5 h-5 accent-blue-600"
          />
        </div>
        <form
          onSubmit={handleSend}
          className="bg-[#232329] border border-[#27272a] shadow rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:space-x-3 space-y-3 sm:space-y-0 items-stretch sm:items-center">
            <div className="flex-shrink-0">
              <select
                className="border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 font-semibold text-gray-100 focus:ring-2 focus:ring-blue-600 outline-none transition"
                value={method}
                onChange={e => setMethod(e.target.value)}
              >
                {HTTP_METHODS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {useSplitInput ? (
              <>
                <div className="flex-1">
                  <input
                    className="w-full border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 font-semibold placeholder-gray-500"
                    type="text"
                    placeholder="Base URL (e.g. https://api.example.com)"
                    value={baseUrl}
                    onChange={e => setBaseUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="flex-1">
                  <input
                    className="w-full border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 font-semibold placeholder-gray-500"
                    type="text"
                    placeholder="Model (e.g. v1, users)"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <input
                    className="w-full border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 font-semibold placeholder-gray-500"
                    type="text"
                    placeholder="Final path (e.g. posts/1)"
                    value={finalPath}
                    onChange={e => setFinalPath(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1">
                <input
                  className="w-full border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 font-semibold placeholder-gray-500"
                  type="text"
                  placeholder="Enter request URL"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            )}
            <div className="flex-shrink-0 flex items-center">
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-blue-700 focus:ring-2 focus:ring-blue-600 transition disabled:opacity-60 flex items-center gap-2"
                disabled={loading}
              >
                {loading && (
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                )}
                {loading ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
          {/* Params input */}
          <div>
            <label className="block font-medium text-gray-200 mb-1">Query Parameters</label>
            {params.map((p, idx) => (
              <div key={idx} className="flex space-x-2 mb-2">
                <input
                  className="w-2/5 border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 placeholder-gray-500"
                  type="text"
                  placeholder="Key"
                  value={p.key}
                  onChange={e => handleParamChange(idx, "key", e.target.value)}
                />
                <input
                  className="w-2/5 border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 placeholder-gray-500"
                  type="text"
                  placeholder="Value"
                  value={p.value}
                  onChange={e => handleParamChange(idx, "value", e.target.value)}
                />
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-red-700 text-white font-bold hover:bg-red-800 disabled:opacity-50"
                  onClick={() => handleRemoveParam(idx)}
                  disabled={params.length === 1}
                  title="Remove parameter"
                >
                  -
                </button>
                {idx === params.length - 1 && (
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-green-700 text-white font-bold hover:bg-green-800 ml-1"
                    onClick={handleAddParam}
                    title="Add parameter"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* Token input */}
          <div>
            <label className="block font-medium text-gray-200 mb-1">Token</label>
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <select
                className="border border-[#3f3f46] bg-[#18181b] rounded px-2 py-1 text-gray-100 text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                value={tokenType}
                onChange={e => setTokenType(e.target.value)}
              >
                <option value="Bearer">Bearer</option>
                <option value="Basic">Basic</option>
                <option value="Custom">Custom</option>
              </select>
              <select
                className="border border-[#3f3f46] bg-[#18181b] rounded px-2 py-1 text-gray-100 text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                value={tokenKey}
                onChange={e => setTokenKey(e.target.value)}
              >
                <option value="Authorization">Authorization</option>
                <option value="Administrator">Administrator</option>
                <option value="custom">Custom</option>
              </select>
              {tokenKey === "custom" && (
                <input
                  className="border border-[#3f3f46] bg-[#18181b] rounded px-2 py-1 text-gray-100 text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                  type="text"
                  placeholder="Custom header key"
                  value={customTokenKey}
                  onChange={e => setCustomTokenKey(e.target.value)}
                />
              )}
              <input
                className="flex-1 border border-[#3f3f46] bg-[#18181b] rounded px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 placeholder-gray-500"
                type="text"
                placeholder="Paste your token here"
                value={token}
                onChange={e => setToken(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block font-medium text-gray-200 mb-1">Headers (JSON)</label>
            <textarea
              className="w-full border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 placeholder-gray-500"
              rows={2}
              placeholder='{"Content-Type": "application/json"}'
              value={headers}
              onChange={e => setHeaders(e.target.value)}
            />
          </div>
          {!["GET", "HEAD"].includes(method) && (
            <div>
              <label className="block font-medium text-gray-200 mb-1">Body</label>
              <div className="flex items-center mb-2 gap-2">
                <span className="text-gray-400 text-sm">Type:</span>
                <select
                  className="border border-[#3f3f46] bg-[#18181b] rounded px-2 py-1 text-gray-100 text-sm focus:ring-2 focus:ring-blue-600 outline-none transition"
                  value={bodyType}
                  onChange={e => setBodyType(e.target.value)}
                >
                  <option value="json">JSON</option>
                  <option value="text">Text</option>
                  <option value="html">HTML</option>
                  <option value="xml">XML</option>
                  <option value="form">Form URL Encoded</option>
                </select>
              </div>
              <textarea
                className="w-full border border-[#3f3f46] bg-[#18181b] rounded-lg px-3 py-2 font-mono focus:ring-2 focus:ring-blue-600 outline-none transition text-gray-100 placeholder-gray-500"
                rows={4}
                placeholder="Request body (raw)"
                value={body}
                onChange={e => setBody(e.target.value)}
              />
              {bodyType === "json" && (
                <div className="text-xs text-gray-500 mt-1">Enter valid JSON. Example: {'{"key": "value"}'}</div>
              )}
              {bodyType === "form" && (
                <div className="text-xs text-gray-500 mt-1">Enter a JSON object. Example: {'{"key": "value"}'}</div>
              )}
            </div>
          )}
        </form>
        <div className="mt-8">
          {error && (
            <div className="bg-red-900/80 text-red-200 p-4 rounded-lg mb-4 border border-red-800 font-semibold shadow">
              {error}
            </div>
          )}
          {response && (
            <div className="bg-[#232329] border border-[#27272a] shadow rounded-xl p-5">
              <div className="mb-3 flex flex-wrap gap-4 items-center">
                <span className="text-base font-bold text-gray-200">Status:</span>
                <span className="text-gray-100 font-semibold">{response.status} {response.statusText}</span>
                {responseTime !== null && (
                  <span className="text-sm text-gray-400">Response time: <span className="font-bold text-gray-200">{(responseTime / 1000).toFixed(2)} s</span></span>
                )}
                {responseSize !== null && (
                  <span className="text-sm text-gray-400">Size: <span className="font-bold text-gray-200">{formatBytes(responseSize)}</span></span>
                )}
              </div>
              <div className="mb-3">
                <span className="text-base font-bold text-gray-200">Headers:</span>
                <pre className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-xs overflow-x-auto mt-1 text-gray-300">
                  {JSON.stringify(response.headers, null, 2)}
                </pre>
              </div>
              <div>
                <span className="text-base font-bold text-gray-200">Body:</span>
                <pre className="bg-[#18181b] border border-[#27272a] rounded-lg p-3 text-xs overflow-x-auto mt-1 text-gray-300">
                  {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
    </div>
    </main>
  );
}
