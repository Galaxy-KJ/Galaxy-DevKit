// src/utils/request-handler.js
async function getFetch(client) {
if (client.fetch) return client.fetch;
if (typeof fetch !== 'undefined') return fetch;
try {
// require lazily to avoid breaking browsers
// eslint-disable-next-line global-require
const nodeFetch = require('node-fetch');
return nodeFetch;
} catch (e) {
throw new Error('Fetch API is not available. Provide a fetch implementation in client options or install node-fetch.');
}
}


async function request(client, method, path, body, opts = {}) {
const fetchImpl = await getFetch(client);
const url = `${client.baseUrl.replace(/\/+$/,'')}${path.startsWith('/') ? path : `/${path}`}`;


const headers = Object.assign({
'Content-Type': 'application/json',
'Authorization': `Bearer ${client.apiKey}`,
'Accept': 'application/json',
}, opts.headers || {});


const fetchOptions = {
method: method.toUpperCase(),
headers,
};


if (body != null) {
// allow FormData and string bodies
if (typeof FormData !== 'undefined' && body instanceof FormData) {
// let fetch set the correct content-type with boundary
delete fetchOptions.headers['Content-Type'];
fetchOptions.body = body;
} else if (typeof body === 'string') {
fetchOptions.body = body;
} else {
fetchOptions.body = JSON.stringify(body);
}
}


// timeout helper (basic)
let abortController;
if (typeof AbortController !== 'undefined') {
abortController = new AbortController();
fetchOptions.signal = abortController.signal;
setTimeout(() => {
try { abortController.abort(); } catch (e) {}
}, opts.timeout || client.timeout || 10000);
}


const res = await fetchImpl(url, fetchOptions);
if (!res.ok) {
await handleError(res);
}


// try parse json, but allow empty responses
const text = await res.text();
if (!text) return null;
try {
return JSON.parse(text);
} catch (e) {
return text; // fallback
}
}


module.exports = { request };