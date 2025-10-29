// src/services/wallet-service.js
'use strict';


class WalletService {
constructor(client) {
if (!client) throw new Error('WalletService requires a GalaxyClient instance');
this.client = client;
}


// Example: get wallet by address
async getWallet(address) {
return this.client.request('GET', `/wallets/${encodeURIComponent(address)}`);
}


async createWallet(payload) {
return this.client.request('POST', '/wallets', payload);
}


async listWallets(query = {}) {
const qs = new URLSearchParams(query).toString();
return this.client.request('GET', `/wallets${qs ? `?${qs}` : ''}`);
}
}


module.exports = WalletService;