// src/services/contract-service.js
'use strict';


class ContractService {
constructor(client) {
if (!client) throw new Error('ContractService requires a GalaxyClient instance');
this.client = client;
}


async getContract(address) {
return this.client.request('GET', `/contracts/${encodeURIComponent(address)}`);
}


async deployContract(payload) {
return this.client.request('POST', '/contracts', payload);
}


async callContract(address, payload) {
return this.client.request('POST', `/contracts/${encodeURIComponent(address)}/call`, payload);
}
}


module.exports = ContractService;