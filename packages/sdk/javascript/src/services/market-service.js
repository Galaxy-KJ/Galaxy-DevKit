// src/services/market-service.js
'use strict';


class MarketService {
constructor(client) {
if (!client) throw new Error('MarketService requires a GalaxyClient instance');
this.client = client;
}


async listItems(query = {}) {
const qs = new URLSearchParams(query).toString();
return this.client.request('GET', `/market/items${qs ? `?${qs}` : ''}`);
}


async getItem(id) {
return this.client.request('GET', `/market/items/${encodeURIComponent(id)}`);
}


async purchaseItem(id, payload) {
return this.client.request('POST', `/market/items/${encodeURIComponent(id)}/purchase`, payload);
}
}


module.exports = MarketService;