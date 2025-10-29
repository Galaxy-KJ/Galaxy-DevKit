// src/client/galaxy-client.js
'use strict';


const { request } = require('../utils/request-handler');
const { validateString } = require('../utils/validation');


class GalaxyClient {
/**
* options: { apiKey, baseUrl, timeout, fetch }
*/
constructor(options = {}) {
this.apiKey = options.apiKey || null;
this.baseUrl = options.baseUrl || 'https://api.galaxy.example.com/v1';
this.timeout = options.timeout || 10000;
// allow fetch injection for Node or tests
this.fetch = options.fetch || null;


if (this.apiKey) validateString(this.apiKey, 'apiKey');
}


setApiKey(key) {
validateString(key, 'apiKey');
this.apiKey = key;
}


setBaseUrl(url) {
validateString(url, 'baseUrl');
this.baseUrl = url;
}


async request(method, path, body, opts = {}) {
if (!this.apiKey) throw new Error('GalaxyClient: apiKey is required. Use setApiKey() or pass it in constructor.');
return request(this, method, path, body, opts);
}
}


module.exports = GalaxyClient;