// src/services/automation-service.js
'use strict';


class AutomationService {
constructor(client) {
if (!client) throw new Error('AutomationService requires a GalaxyClient instance');
this.client = client;
}


async listAutomations(query = {}) {
const qs = new URLSearchParams(query).toString();
return this.client.request('GET', `/automations${qs ? `?${qs}` : ''}`);
}


async createAutomation(payload) {
return this.client.request('POST', '/automations', payload);
}


async runAutomation(id, payload) {
return this.client.request('POST', `/automations/${encodeURIComponent(id)}/run`, payload);
}
}


module.exports = AutomationService;