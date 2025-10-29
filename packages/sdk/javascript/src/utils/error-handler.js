// src/utils/error-handler.js
'use strict';


async function handleError(res) {
const status = res.status;
let payload = null;
try {
payload = await res.json();
} catch (e) {
// ignore
}


const message = (payload && (payload.message || payload.error)) || `${res.status} ${res.statusText}`;
const err = new Error(message);
err.status = status;
err.payload = payload;
throw err;
}


module.exports = { handleError };